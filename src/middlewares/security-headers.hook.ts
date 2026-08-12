// 3p
import {
  Config,
  Context,
  Hook,
  HookDecorator,
  HttpResponse,
  HttpResponseRedirection,
  Logger,
  ServiceManager,
} from '@foal/core';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const helmet = require('helmet') as typeof import('helmet').default;

/**
 * 308 Permanent Redirect: like 301 but preserves the HTTP method and body.
 * This prevents POST/PUT requests (e.g., CSP reports) from being downgraded
 * to GET when the browser follows the HTTPS redirect.
 */
class HttpResponsePermanentRedirect extends HttpResponseRedirection {
  readonly statusCode = 308;
  readonly statusMessage = 'Permanent Redirect';
  constructor(public path: string) {
    super();
  }
}

type ReferrerPolicyValue =
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'same-origin'
  | 'origin'
  | 'strict-origin'
  | 'origin-when-cross-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

type RequestLike = {
  method?: string;
  url?: string;
  originalUrl?: string;
  secure?: boolean;
  body?: unknown;
  headers?: Record<string, unknown>;
  get?: (headerName: string) => string | undefined;
};

type HeaderEntry = readonly [string, string];

const HSTS_MAX_AGE_SECONDS = 31536000;
const EXPECT_CT_MAX_AGE_SECONDS = 86400;
const DEFAULT_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
].join(', ');

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

    const rawCspReportUri = Config.get(
      'security.helmet.csp.reportUri',
      'string',
      '/csp-violation-report'
    );
    const cspReportUri = sanitizeCspReportUri(rawCspReportUri);
    const rawReferrerPolicy = Config.get('security.helmet.referrerPolicy', 'string', 'no-referrer');
    const referrerPolicy = validateReferrerPolicy(rawReferrerPolicy);
    const enforceHttpsInProduction = Config.get(
      'security.helmet.enforceHttpsInProduction',
      'boolean',
      true
    );

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && enforceHttpsInProduction && !isHttpsRequest(req)) {
      const url = typeof req.originalUrl === 'string' ? req.originalUrl : req.url;
      // Only redirect when url is an origin-form path (starts with '/' but not '//').
      // Absolute-form or authority-form request targets are not safe to concatenate.
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
        const trustedHost = getTrustedHost(req);
        if (trustedHost) {
          return new HttpResponsePermanentRedirect(`https://${trustedHost}${url}`);
        }
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
      hsts: isProduction
        ? {
            maxAge: HSTS_MAX_AGE_SECONDS,
            includeSubDomains: true,
            preload: true,
          }
        : false,
      noSniff: true,
      referrerPolicy: {
        // Stored in config so we can tighten/relax policy without touching code.
        policy: referrerPolicy,
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
      try {
        helmetMiddleware(req as any, fakeResponse as any, (err?: unknown) => {
          middlewareError = err;
        });
      } catch (err) {
        middlewareError = err;
      }

      if (middlewareError) {
        logger.error(`Helmet middleware failed: ${String(middlewareError)}`);
        applyFallbackSecurityHeaders(response, cspReportUri, referrerPolicy, isProduction);
        return;
      }

      for (const [name, value] of capturedHeaders.entries()) {
        response.setHeader(name, normalizeHeaderValue(value));
      }

      applyManualSecurityHeaders(response, isProduction);
    };
  });
}

function getTrustedHost(_req: RequestLike): string | undefined {
  // Only use a server-configured, trusted host. Never fall back to the
  // client-supplied Host header — that would enable open-redirect/phishing.
  const appBaseUrl = Config.get('app.baseUrl', 'string', '');
  if (appBaseUrl) {
    try {
      return new URL(appBaseUrl).host;
    } catch {
      // baseUrl is malformed — skip redirect
    }
  }

  return undefined;
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

  const trustProxy = Config.get('security.helmet.trustProxy', 'boolean', false);
  if (trustProxy) {
    const forwardedProto = getRequestHeader(req, 'x-forwarded-proto');
    if (typeof forwardedProto === 'string') {
      return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
    }
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
  referrerPolicy: ReferrerPolicyValue,
  isProduction: boolean
): void {
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', referrerPolicy);
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; frame-ancestors 'none'; object-src 'none'; report-uri ${cspReportUri}`
  );

  if (isProduction) {
    response.setHeader(
      'Strict-Transport-Security',
      `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`
    );
  }

  applyManualSecurityHeaders(response, isProduction);
}

const VALID_REFERRER_POLICIES: ReferrerPolicyValue[] = [
  'no-referrer',
  'no-referrer-when-downgrade',
  'same-origin',
  'origin',
  'strict-origin',
  'origin-when-cross-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
];

function validateReferrerPolicy(value: string): ReferrerPolicyValue {
  if ((VALID_REFERRER_POLICIES as string[]).includes(value)) {
    return value as ReferrerPolicyValue;
  }
  return 'no-referrer';
}

function sanitizeCspReportUri(value: string): string {
  // Only accept URI paths starting with '/' and containing safe path characters.
  // Rejects whitespace, semicolons, scheme-relative URLs (//) and other characters
  // that could break or inject extra directives into the CSP header value.
  if (/^\/(?!\/)[a-zA-Z0-9/_\-.~%]*$/.test(value)) {
    return value;
  }
  return '/csp-violation-report';
}

function applyManualSecurityHeaders(response: HttpResponse, isProduction: boolean): void {
  for (const [name, value] of getManualSecurityHeaders(isProduction)) {
    response.setHeader(name, value);
  }
}

function getManualSecurityHeaders(isProduction: boolean): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    ['Permissions-Policy', DEFAULT_PERMISSIONS_POLICY],
    [
      // Legacy browser XSS filters were buggy and could introduce surprising behavior.
      // Setting the header to "0" keeps the header explicit for scanners while making it
      // clear that Content-Security-Policy is our real XSS mitigation in modern browsers.
      'X-XSS-Protection',
      '0',
    ],
    [
      // Older IE/Edge variants honor this response header for downloaded HTML files and
      // avoid opening them in the site's own security context.
      'X-Download-Options',
      'noopen',
    ],
  ];

  if (isProduction) {
    headers.push([
      // Expect-CT is largely historical today because public CAs already participate in
      // Certificate Transparency by default. We still emit it in production because the
      // issue explicitly asks for it and some scanners continue to reward its presence.
      'Expect-CT',
      `max-age=${EXPECT_CT_MAX_AGE_SECONDS}, enforce`,
    ]);
  }

  return headers;
}
