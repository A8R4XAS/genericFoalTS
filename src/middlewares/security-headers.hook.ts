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

const helmet = require('helmet') as typeof import('helmet').default;

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
    const req = ctx.request as Record<string, unknown>;
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
      const url = typeof req['originalUrl'] === 'string' ? req['originalUrl'] : req['url'];
      if (host && typeof url === 'string') {
        return new HttpResponseMovedPermanently(`https://${host}${url}`);
      }
    }

    if (isCspReportRequest(req, cspReportUri)) {
      logger.warn(`CSP violation report: ${JSON.stringify(req['body'] ?? null)}`);
    }

    const cspSelf = '\u0027self\u0027';
    const cspNone = '\u0027none\u0027';
    const cspUnsafeInline = '\u0027unsafe-inline\u0027';

    const helmetMiddleware = helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: [cspSelf],
          baseUri: [cspSelf],
          frameAncestors: [cspNone],
          objectSrc: [cspNone],
          scriptSrc: [cspSelf, cspUnsafeInline],
          styleSrc: [cspSelf, cspUnsafeInline],
          imgSrc: [cspSelf, 'data:'],
          upgradeInsecureRequests: null,
          reportUri: [cspReportUri],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: {
        // Stored in config so we can tighten/relax policy without touching code.
        policy: referrerPolicy as any,
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
        return;
      }

      for (const [name, value] of capturedHeaders.entries()) {
        response.setHeader(name, value as any);
      }
    };
  });
}

function getRequestHeader(req: Record<string, unknown>, headerName: string): string | undefined {
  if (typeof req['get'] === 'function') {
    return (req as any).get(headerName) as string | undefined;
  }
  const headers = req['headers'];
  if (headers && typeof headers === 'object') {
    const raw = (headers as Record<string, unknown>)[headerName.toLowerCase()];
    if (Array.isArray(raw)) return raw[0] as string | undefined;
    if (typeof raw === 'string') return raw;
  }
  return undefined;
}

function isHttpsRequest(req: Record<string, unknown>): boolean {
  if (req['secure'] === true) {
    return true;
  }

  const forwardedProto = getRequestHeader(req, 'x-forwarded-proto');
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  return false;
}

function isCspReportRequest(req: Record<string, unknown>, cspReportUri: string): boolean {
  const method = typeof req['method'] === 'string' ? req['method'].toUpperCase() : '';
  if (method !== 'POST') return false;

  const rawUrl =
    typeof req['originalUrl'] === 'string'
      ? req['originalUrl']
      : typeof req['url'] === 'string'
        ? req['url']
        : '';
  const requestPath = rawUrl.split('?')[0];
  return requestPath === cspReportUri;
}
