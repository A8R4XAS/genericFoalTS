// 3p
import {
  Config,
  Context,
  Hook,
  HookDecorator,
  HttpResponse,
  HttpResponseNoContent,
} from '@foal/core';

/**
 * CORS middleware (FoalTS Hook).
 *
 * Sets Cross-Origin Resource Sharing headers on every response and handles
 * OPTIONS pre-flight requests by returning 204 No Content immediately.
 *
 * Configuration keys (all under the `cors` namespace):
 *  - `cors.allowedOrigins`   – Comma-separated list of allowed origins.
 *                              **Fallback chain** (first match wins):
 *                              1. `CORS_ALLOWED_ORIGINS` env var (via `cors.allowedOrigins` config key)
 *                              2. `app.frontendBaseUrl` config value (`APP_FRONTEND_BASE_URL` env var)
 *                              3. Hardcoded development default `http://localhost:3000`
 *                              Use `*` only when `cors.allowCredentials` is `false`.
 *                              **Warning**: a wildcard origin (`*`) allows _any_ website to call this
 *                              API. In production, always list explicit origins instead of using `*`.
 *  - `cors.allowedMethods`   – Comma-separated HTTP methods (default: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS).
 *  - `cors.allowedHeaders`   – Comma-separated request headers (default: Content-Type,Authorization).
 *  - `cors.exposeHeaders`    – Comma-separated response headers exposed to the browser (default: none).
 *  - `cors.allowCredentials` – Send `Access-Control-Allow-Credentials: true` (default: true).
 *                              Note: credentials cannot be combined with a wildcard origin; the hook
 *                              ignores `*` and falls back to the reflected `Origin` header automatically.
 *  - `cors.maxAge`           – Pre-flight cache duration in seconds (default: 86400).
 *  - `cors.enabled`          – Set to `false` to disable CORS entirely (default: true).
 */
export function Cors(): HookDecorator {
  return Hook((ctx: Context) => {
    const enabled = Config.get('cors.enabled', 'boolean', true);
    if (!enabled) {
      return;
    }

    const frontendBaseUrl = Config.get('app.frontendBaseUrl', 'string', 'http://localhost:3000');
    const originsRaw = Config.get('cors.allowedOrigins', 'string', frontendBaseUrl);
    const allowedOrigins = originsRaw
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const allowedMethods = Config.get(
      'cors.allowedMethods',
      'string',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS'
    );
    const allowedHeaders = Config.get(
      'cors.allowedHeaders',
      'string',
      'Content-Type,Authorization'
    );
    const exposeHeaders = Config.get('cors.exposeHeaders', 'string', '');
    const allowCredentials = Config.get('cors.allowCredentials', 'boolean', true);
    const maxAge = Config.get('cors.maxAge', 'number', 86400);

    const req = ctx.request as Record<string, unknown>;
    const method = (req['method'] as string | undefined) ?? '';
    const getHeader = req['get'] as ((h: string) => string | undefined) | undefined;
    const requestOrigin = getHeader?.('Origin');

    /**
     * Determines the `Access-Control-Allow-Origin` value for the given request
     * origin and writes the relevant CORS headers onto the response.
     */
    function writeCorsHeaders(response: HttpResponse): void {
      let allowOriginValue: string | undefined;

      if (allowedOrigins.includes('*') && !allowCredentials) {
        // Wildcard is only valid when credentials are disabled.
        allowOriginValue = '*';
      } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
        // Echo back the specific origin so the browser accepts the response.
        allowOriginValue = requestOrigin;
        // When reflecting a specific origin the response must vary on `Origin`
        // so intermediate caches do not serve it to requests from other origins.
        response.setHeader('Vary', 'Origin');
      }

      if (!allowOriginValue) {
        return;
      }

      response.setHeader('Access-Control-Allow-Origin', allowOriginValue);

      if (allowCredentials) {
        response.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      if (exposeHeaders) {
        response.setHeader('Access-Control-Expose-Headers', exposeHeaders);
      }
    }

    // Handle OPTIONS pre-flight: return 204 without invoking the controller.
    if (method === 'OPTIONS') {
      const preflightResponse = new HttpResponseNoContent();
      writeCorsHeaders(preflightResponse);
      preflightResponse.setHeader('Access-Control-Allow-Methods', allowedMethods);
      preflightResponse.setHeader('Access-Control-Allow-Headers', allowedHeaders);
      preflightResponse.setHeader('Access-Control-Max-Age', String(maxAge));
      return preflightResponse;
    }

    // For all other requests, attach CORS headers after the controller runs.
    return (response: HttpResponse) => {
      writeCorsHeaders(response);
    };
  });
}
