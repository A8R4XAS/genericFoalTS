// 3p
import {
  Config,
  Context,
  Hook,
  HookDecorator,
  HttpResponse,
  HttpResponseMovedPermanently,
  Logger,
  ServiceManager,
} from '@foal/core';
import helmet from 'helmet';

type ReferrerPolicyValue =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'same-origin'
  | 'origin'
  | 'strict-origin'
  | 'origin-when-cross-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url'
  | '';

type RequestLike = {
  method?: string;
  url?: string;
  originalUrl?: string;
  secure?: boolean;
  body?: unknown;
  headers?: Record<string, unknown>;
  get?: (headerName: string) => string | undefined;
};

/**
 * SecurityHeaders middleware based on Helmet.js.
 *
 * For teammates new to Helmet:
 * - Helmet is a small library that adds defensive HTTP headers automatically.
 * - Browsers read these headers and block common attack vectors (XSS, clickjacking, MIME-sniffing).
 * - We still keep the logic in a FoalTS hook so it fits the same middleware style used in this repo.
 */
export function SecurityHeaders(): HookDecorator {
  return Hook((ctx: Context, services: ServiceManager) => {
    const req = ctx.request as RequestLike;
    const logger = services.get(Logger);

    const enabled = Config.get('security.helmet.enabled', 'boolean', true);
    if (!enabled) {
      return;
    }

    const cspReportUri = Config.get(
      'security.helmet.csp.reportUri',
      'string',
      '/csp-violation-report'
    );
    const referrerPolicy = Config.get('security.helmet.referrerPolicy', 'string', 'no-referrer');
    const enforceHttpsInProduction = Config.get(
      'security.helmet.enforceHttpsInProduction',
      'boolean',
      true
    );

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && enforceHttpsInProduction && !isHttpsRequest(req)) {
      const host = getRequestHeader(req, 'host');
      const url = typeof req.originalUrl === 'string' ? req.originalUrl : req.url;
      if (host && typeof url === 'string') {
        return new HttpResponseMovedPermanently(`https://${host}${url}`);
      }
    }

    // eslint-disable-next-line @typescript-eslint/quotes
    const cspSelf = "'self'";
    // eslint-disable-next-line @typescript-eslint/quotes
    const cspNone = "'none'";
    // In Helmet CSP config, [] enables valueless directives like upgrade-insecure-requests.
    // We only enable it in production to avoid forcing HTTPS upgrades in local dev.
    const cspUpgradeInsecureRequests = isProduction ? [] : null;

    const helmetMiddleware = helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: [cspSelf],
          baseUri: [cspSelf],
          frameAncestors: [cspNone],
          objectSrc: [cspNone],
          scriptSrc: [cspSelf],
          styleSrc: [cspSelf],
          imgSrc: [cspSelf, 'data:'],
          upgradeInsecureRequests: cspUpgradeInsecureRequests,
          reportUri: [cspReportUri],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: {
        // Stored in config so we can tighten/relax policy without touching code.
        policy: referrerPolicy as ReferrerPolicyValue,
      },
    });

    return (response: HttpResponse) => {
      const capturedHeaders = new Map<string, number | string | string[]>();
      let middlewareError: unknown;

      const fakeResponse = {
        setHeader: (name: string, value: number | string | string[]) => {
          capturedHeaders.set(name, value);
          return fakeResponse;
        },
        getHeader: (name: string) => capturedHeaders.get(name),
        removeHeader: (name: string) => {
          capturedHeaders.delete(name);
        },
      };

      // Helmet is implemented for Express response objects.
      // We run it against a tiny in-memory response object and then mirror the
      // produced headers onto FoalTS' HttpResponse.
      helmetMiddleware(req as any, fakeResponse as any, (err?: unknown) => {
        middlewareError = err;
      });

      if (middlewareError) {
        logger.error(`Helmet middleware failed: ${String(middlewareError)}`);
        applyFallbackSecurityHeaders(response, cspReportUri, referrerPolicy);
        return;
      }

      for (const [name, value] of capturedHeaders.entries()) {
        response.setHeader(name, normalizeHeaderValue(value));
      }
    };
  });
}

function getRequestHeader(req: RequestLike, headerName: string): string | undefined {
  if (typeof req.get === 'function') {
    return req.get(headerName);
  }
  const headers = req.headers;
  if (headers && typeof headers === 'object') {
    const raw = headers[headerName.toLowerCase()];
    if (Array.isArray(raw)) return typeof raw[0] === 'string' ? raw[0] : undefined;
    if (typeof raw === 'string') return raw;
  }
  return undefined;
}

function isHttpsRequest(req: RequestLike): boolean {
  if (req.secure === true) {
    return true;
  }

  const forwardedProto = getRequestHeader(req, 'x-forwarded-proto');
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  return false;
}

function normalizeHeaderValue(value: number | string | string[]): string {
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

function applyFallbackSecurityHeaders(
  response: HttpResponse,
  cspReportUri: string,
  referrerPolicy: string
): void {
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', referrerPolicy);
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; frame-ancestors 'none'; object-src 'none'; report-uri ${cspReportUri}`
  );
}
