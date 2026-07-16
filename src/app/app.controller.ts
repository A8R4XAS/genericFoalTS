import {
  Context,
  controller,
  Get,
  HttpResponseNoContent,
  HttpResponseNotFound,
  IAppController,
  Post,
} from '@foal/core';

import { ApiController, AuthController, HealthController } from './controllers';
import { Cors, RequestLogger, SecurityHeaders } from '../middlewares';
import { RateLimit } from './hooks';

@SecurityHeaders()
@Cors()
@RequestLogger()
export class AppController implements IAppController {
  subControllers = [
    controller('/api', ApiController),
    controller('/api/auth', AuthController),
    controller('/health', HealthController),
  ];

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
    console.warn(`CSP violation report: ${serializeCspReportForLog((ctx.request as any).body)}`);
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
