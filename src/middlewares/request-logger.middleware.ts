// std
// 3p
import { Config, Context, Hook, HookDecorator, HttpResponse } from '@foal/core';

// App
import { User } from '../app/entities';

/** Fields that are always redacted from logged request bodies. */
const SENSITIVE_FIELDS = ['password', 'passwordConfirm', 'currentPassword', 'newPassword'];

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
 * Request-Logger middleware (FoalTS Hook).
 *
 * Logs every incoming request together with the corresponding response.
 * Logged fields:
 *  - timestamp
 *  - HTTP method
 *  - URL / path
 *  - status code
 *  - response time (ms)
 *  - userId (when an authenticated user is present on `ctx.user`)
 *  - requestBody (sanitised – password fields replaced with "[REDACTED]")
 *
 * The output format is controlled by the config key `logger.requestLogger.format`:
 *  - `"json"` (default) – one JSON object per line (structured / machine-readable)
 *  - `"text"` – human-readable single-line string
 */
export function RequestLogger(): HookDecorator {
  return Hook((ctx: Context) => {
    const startTime = Date.now();

    return (response: HttpResponse) => {
      const duration = Date.now() - startTime;
      const format = Config.get('logger.requestLogger.format', 'string', 'json');

      const req = ctx.request as Record<string, unknown>;
      const method: string = (req['method'] as string | undefined) ?? 'UNKNOWN';
      const url: string =
        (req['url'] as string | undefined) ?? (req['path'] as string | undefined) ?? 'UNKNOWN';
      const statusCode: number = response.statusCode;
      const userId: number | string | undefined = ctx.user ? (ctx.user as User).id : undefined;
      const requestBody = sanitizeBody(req['body']);

      if (format === 'text') {
        const userPart = userId !== undefined ? ` userId=${userId}` : '';
        const bodyPart =
          requestBody !== undefined && requestBody !== null
            ? ` body=${JSON.stringify(requestBody)}`
            : '';
        console.log(
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
        console.log(JSON.stringify(entry));
      }
    };
  });
}
