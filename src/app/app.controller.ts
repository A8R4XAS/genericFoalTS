import {
  Config,
  Context,
  HttpResponse,
  HttpResponseBadRequest,
  HttpResponseClientError,
  HttpResponseConflict,
  HttpResponseForbidden,
  HttpResponseInternalServerError,
  HttpResponseNotFound,
  HttpResponseUnauthorized,
  IAppController,
  Logger,
  controller,
  dependency,
} from '@foal/core';
import { ZodError } from 'zod';

import { ApiController, AuthController } from './controllers';
import { AppError, ValidationError } from './errors';

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

export class AppController implements IAppController {
  @dependency
  logger: Logger;

  subControllers = [controller('/api', ApiController), controller('/api/auth', AuthController)];

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
}
