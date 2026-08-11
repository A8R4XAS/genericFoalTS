import {
  Config,
  Context,
  controller,
  dependency,
  Get,
  HttpResponse,
  HttpResponseBadRequest,
  HttpResponseClientError,
  HttpResponseConflict,
  HttpResponseForbidden,
  HttpResponseInternalServerError,
  HttpResponseNoContent,
  HttpResponseNotFound,
  HttpResponseUnauthorized,
  IAppController,
  Logger,
  Post,
} from '@foal/core';

import { Cors, CsrfProtection, RequestLogger, SecurityHeaders } from '../middlewares';
import { AdminController, ApiController, AuthController, HealthController } from './controllers';
import { AppError, ValidationError } from './errors';
import { RateLimit } from './hooks';
import { ZodError } from 'zod';

/**
 * Concrete HttpResponse subclass for client-error status codes that do not
 * have a dedicated FoalTS response class (e.g. 418, 422, 429…).
 * The `statusCode` must be provided via the constructor.
 */
class DynamicClientErrorResponse extends HttpResponseClientError {
  readonly statusCode: number;
  readonly statusMessage: string = 'Error';

  constructor(body: unknown, code: number) {
    super(body);
    this.statusCode = code;
  }
}

@SecurityHeaders()
@Cors()
@CsrfProtection()
@RequestLogger()
export class AppController implements IAppController {
  @dependency
  logger: Logger;
  subControllers = [
    controller('/api', ApiController),
    controller('/api/auth', AuthController),
    controller('/api/admin', AdminController),
    controller('/health', HealthController),
  ];

  /**
   * Global error handler – invoked whenever a controller or hook throws an unhandled error.
   *
   * Behavior:
   * - ZodError          → 400 with a structured `details` array
   * - AppError          → the error's own `statusCode`, message, and optional details
   * - Everything else   → 500 (only the safe "Internal Server Error" label is sent to the client)
   *
   * Stack traces are included in the response body only when `settings.debug` is `true`
   * (i.e. in the development environment).
   */
  async handleError(error: Error, ctx: Context): Promise<HttpResponse> {
    const isDev = Config.get('settings.debug', 'boolean', false);

    // ── Zod validation errors ────────────────────────────────────────────────
    if (error instanceof ZodError) {
      this.logger.warn('Validation error', {
        path: ctx.request.path,
        issues: error.errors,
      });

      const body: Record<string, unknown> = {
        error: 'Validation failed',
        details: error.errors.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      };

      if (isDev) {
        body['stack'] = error.stack;
      }

      return new HttpResponseBadRequest(body);
    }

    // ── Known operational errors (AppError subclasses) ───────────────────────
    // Only treat as operational when the status code is a client error (< 500).
    // AppErrors with statusCode >= 500 fall through to the unexpected-error path
    // so their messages are never leaked to clients.
    if (error instanceof AppError && error.isOperational && error.statusCode < 500) {
      this.logger.warn(error.message, {
        errorName: error.name,
        statusCode: error.statusCode,
        path: ctx.request.path,
      });

      const body: Record<string, unknown> = { error: error.message };

      if (error instanceof ValidationError && error.details) {
        body['details'] = error.details;
      }

      if (isDev) {
        body['stack'] = error.stack;
      }

      return this.toHttpResponse(error.statusCode, body);
    }

    // ── Unexpected / programmer errors ───────────────────────────────────────
    this.logger.error('Unexpected error', {
      errorName: error.name,
      message: error.message,
      stack: error.stack,
      path: ctx.request.path,
    });

    const body: Record<string, unknown> = { error: 'Internal Server Error' };

    if (isDev) {
      body['message'] = error.message;
      body['stack'] = error.stack;
    }

    return new HttpResponseInternalServerError(body);
  }

  /** Maps a numeric HTTP status code to the matching FoalTS response class. */
  private toHttpResponse(statusCode: number, body: unknown): HttpResponse {
    switch (statusCode) {
      case 400:
        return new HttpResponseBadRequest(body);
      case 401:
        return new HttpResponseUnauthorized(body);
      case 403:
        return new HttpResponseForbidden(body);
      case 404:
        return new HttpResponseNotFound(body);
      case 409:
        return new HttpResponseConflict(body);
      default:
        return new DynamicClientErrorResponse(body, statusCode);
    }
  }

  /**
   * Block the dev-only test harness in production.
   * In non-production environments the request falls through to the Express
   * static-file middleware which serves public/test.html as normal.
   */
  @Get('/test.html')
  blockTestHtmlInProd(): HttpResponseNotFound | void {
    if (process.env.NODE_ENV === 'production') {
      return new HttpResponseNotFound();
    }
  }

  /**
   * Browser can send CSP violation reports to this endpoint.
   * We return 204 intentionally: reporting clients only need an ACK.
   * We log a sanitized subset of the report fields for diagnostics.
   */
  @RateLimit('default')
  @Post('/csp-violation-report')
  receiveCspViolationReport(ctx: Context): HttpResponseNoContent {
    this.logger.warn(
      `CSP violation report: ${serializeCspReportForLog((ctx.request as any).body)}`
    );
    return new HttpResponseNoContent();
  }
}

function serializeCspReportForLog(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '{}';
  }

  const reportEnvelope = payload as Record<string, unknown>;
  const report =
    typeof reportEnvelope['csp-report'] === 'object' && reportEnvelope['csp-report'] !== null
      ? (reportEnvelope['csp-report'] as Record<string, unknown>)
      : reportEnvelope;

  // These hyphenated keys are defined by the CSP report specification.
  const safeReport: Record<string, string> = {};
  for (const key of ['blocked-uri', 'violated-directive', 'effective-directive', 'document-uri']) {
    const value = report[key];
    if (typeof value === 'string') {
      // Strip query string and fragment from document-uri to avoid logging tokens/PII.
      const sanitized = key === 'document-uri' ? sanitizeDocumentUri(value) : value;
      // Strip ASCII control characters (including \n and \r) to prevent log injection.
      // eslint-disable-next-line no-control-regex
      safeReport[key] = sanitized.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 300);
    }
  }

  return JSON.stringify(safeReport);
}

function sanitizeDocumentUri(value: string): string {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    // Not a valid absolute URL; strip query string and fragment manually.
    return value.replace(/[?#].*$/, '');
  }
}
