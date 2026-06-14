// std
// 3p
import {
  Config,
  Context,
  Hook,
  HookDecorator,
  HttpResponse,
  Logger,
  ServiceManager,
} from '@foal/core';

// App
import { User } from '../app/entities';

/** Fields that are always redacted from logged request bodies. */
const SENSITIVE_FIELDS = [
  'password',
  'passwordConfirm',
  'currentPassword',
  'newPassword',
  'refreshToken',
];

/**
 * Recursively remove sensitive fields (e.g. passwords) from a request-body object.
 * Returns a deep copy with sensitive keys replaced by `"[REDACTED]"`.
 * Arrays are traversed element-by-element; non-object bodies are returned as-is.
 */
function sanitizeBody(body: unknown): unknown {
  if (body === null || typeof body !== 'object') {
    return body;
  }

  if (Array.isArray(body)) {
    return (body as unknown[]).map(sanitizeBody);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_FIELDS.includes(key) ? '[REDACTED]' : sanitizeBody(value);
  }
  return sanitized;
}

/**
 * Sanitize a URL before logging:
 *  - Replaces the query string with `?[REDACTED]` to prevent leaking sensitive query params.
 *  - Masks path segments that look like one-time tokens:
 *    - Long hex strings (≥ 32 hex characters, e.g. email-verification / password-reset tokens)
 *    - JWT-like segments (three base64url parts separated by dots)
 */
function sanitizeUrl(url: string): string {
  const qIndex = url.indexOf('?');
  const path = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const queryPart = qIndex >= 0 ? '?[REDACTED]' : '';

  const maskedPath = path
    .split('/')
    .map(segment => {
      if (/^[0-9a-f]{32,}$/i.test(segment)) return '[REDACTED]';
      if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(segment)) return '[REDACTED]';
      return segment;
    })
    .join('/');

  return maskedPath + queryPart;
}

/**
 * Request-Logger middleware (FoalTS Hook).
 *
 * Logs every incoming request together with the corresponding response.
 * Logged fields:
 *  - timestamp
 *  - HTTP method
 *  - URL / path (sanitized – token-bearing segments and query strings redacted)
 *  - status code
 *  - response time (ms)
 *  - userId (when an authenticated user is present on `ctx.user`)
 *  - requestBody (sanitized – password and token fields replaced with "[REDACTED]")
 *
 * The output format is controlled by the config key `logger.requestLogger.format`:
 *  - `"json"` (default) – one JSON object per line (structured / machine-readable)
 *  - `"text"` – human-readable single-line string
 *
 * Enabling/disabling:
 *  - `logger.requestLogger.enabled` (default `true`) – set to `false` to disable this middleware
 *  - `logger.requestLogger.skipPaths` (default in this repo:
 *    `["/health", "/health/live", "/health/ready", "/health/db"]`) – exact request paths to skip
 *    logging
 *  - `settings.logger.logHttpRequests` (default `true`) – when `false`, logging is also suppressed
 *    (honoured so environments like e2e that disable FoalTS HTTP logging stay quiet)
 */
export function RequestLogger(): HookDecorator {
  return Hook((ctx: Context, services: ServiceManager) => {
    const startTime = Date.now();
    const logger = services.get(Logger);

    return (response: HttpResponse) => {
      const enabled = Config.get('logger.requestLogger.enabled', 'boolean', true);
      const logHttpRequests = Config.get('settings.logger.logHttpRequests', 'boolean', true);
      if (!enabled || !logHttpRequests) return;

      const req = ctx.request as Record<string, unknown>;
      const rawUrl: string =
        (req['url'] as string | undefined) ?? (req['path'] as string | undefined) ?? 'UNKNOWN';
      const pathOnly = rawUrl.split('?')[0];
      const configuredSkipPaths = Config.get('logger.requestLogger.skipPaths', 'any', []);
      const skipPaths = Array.isArray(configuredSkipPaths)
        ? configuredSkipPaths.filter((value): value is string => typeof value === 'string')
        : [];
      if (skipPaths.includes(pathOnly)) return;

      const duration = Date.now() - startTime;
      const format = Config.get('logger.requestLogger.format', 'string', 'json');

      const method: string = (req['method'] as string | undefined) ?? 'UNKNOWN';
      const url = sanitizeUrl(rawUrl);
      const statusCode: number = response.statusCode;
      const userId: number | string | undefined = ctx.user ? (ctx.user as User).id : undefined;
      const requestBody = sanitizeBody(req['body']);

      if (format === 'text') {
        const userPart = userId !== undefined ? ` userId=${userId}` : '';
        const bodyPart =
          requestBody !== undefined && requestBody !== null
            ? ` body=${JSON.stringify(requestBody)}`
            : '';
        logger.info(
          `[${new Date().toISOString()}] ${method} ${url} ${statusCode} ${duration}ms${userPart}${bodyPart}`
        );
      } else {
        const entry: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
          method,
          url,
          statusCode,
          responseTime: duration,
        };
        if (userId !== undefined) {
          entry.userId = userId;
        }
        if (requestBody !== undefined && requestBody !== null) {
          entry.requestBody = requestBody;
        }
        logger.info(JSON.stringify(entry));
      }
    };
  });
}
