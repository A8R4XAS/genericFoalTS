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
 *                              Avoid using `*` in production. A wildcard origin (`*`) allows _any_ website to call this
 *                              API.
 *                              When `cors.allowCredentials` is `true` and `cors.allowedOrigins` contains `*`, the hook
 *                              reflects the request `Origin` header (equivalent to allowing any origin) so browsers
 *                              accept credentialed requests.
 *                              In production, prefer an explicit allowlist when credentials are enabled.
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
    const requestOrigin =
      typeof req['get'] === 'function'
        ? ((req as any).get('Origin') as string | undefined)
        : undefined;

    /**
     * Determines the `Access-Control-Allow-Origin` value for the given request
     * origin and writes the relevant CORS headers onto the response.
     */
    function writeCorsHeaders(response: HttpResponse): void {
      let allowOriginValue: string | undefined;

      if (allowedOrigins.includes('*') && !allowCredentials) {
        // Wildcard is only valid when credentials are disabled.
        allowOriginValue = '*';
      } else if (
        requestOrigin &&
        (allowedOrigins.includes(requestOrigin) || allowedOrigins.includes('*'))
      ) {
        // Echo back the specific origin so the browser accepts the response.
        // When allowedOrigins is '*' but credentials are required, the wildcard
        // cannot be used (browsers reject it), so we reflect the request Origin.
        allowOriginValue = requestOrigin;
        // When reflecting a specific origin the response must vary on `Origin`
        // so intermediate caches do not serve it to requests from other origins.
        // Append rather than overwrite so existing Vary values are preserved,
        // and avoid adding a duplicate if 'Origin' is already listed.
        const existingVary = response.getHeader('Vary');
        const varyTokens = existingVary
          ? existingVary.split(',').map(v => v.trim().toLowerCase())
          : [];
        if (!varyTokens.includes('origin')) {
          response.setHeader('Vary', existingVary ? `${existingVary}, Origin` : 'Origin');
        }
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
      if (preflightResponse.getHeader('Access-Control-Allow-Origin')) {
        preflightResponse.setHeader('Access-Control-Allow-Methods', allowedMethods);
        preflightResponse.setHeader('Access-Control-Allow-Headers', allowedHeaders);
        preflightResponse.setHeader('Access-Control-Max-Age', String(maxAge));
      }
      return preflightResponse;
    }

    // For all other requests, attach CORS headers after the controller runs.
    return (response: HttpResponse) => {
      writeCorsHeaders(response);
    };
  });
}
