// std
import { ok, strictEqual } from 'assert';

// 3p
import {
  Config,
  Context,
  getHookFunction,
  HttpResponseOK,
  Logger,
  ServiceManager,
} from '@foal/core';

// App
import { SecurityHeaders } from './security-headers.hook';

function makeContext(overrides: Record<string, unknown> = {}): Context {
  const request = {
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    secure: false,
    headers: {
      host: 'api.example.com',
    },
    get: (header: string) => {
      const normalized = header.toLowerCase();
      return (request.headers as Record<string, string | undefined>)[normalized];
    },
    ...overrides,
  };
  return new Context(request as any);
}

describe('SecurityHeaders hook', () => {
  let originalGet: typeof Config.get;
  let originalNodeEnv: string | undefined;

  function mockConfig(overrides: Record<string, unknown>): void {
    Config.get = (key: string, type?: any, defaultValue?: any) => {
      if (key in overrides) return overrides[key];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (originalGet as (...args: unknown[]) => unknown).call(Config, key, type, defaultValue);
    };
  }

  function makeServices(): ServiceManager {
    const services = new ServiceManager();
    services.set(Logger, {
      info: (_msg: string) => {},
      debug: (_msg: string) => {},
      warn: (_msg: string) => {},
      error: (_msg: string) => {},
      log: (_msg: string) => {},
    } as any);
    return services;
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalGet = Config.get;
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    Config.get = originalGet;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should apply security headers including CSP, frameguard, noSniff and referrer policy.', () => {
    mockConfig({});

    const hookFn = getHookFunction(SecurityHeaders());
    const postHook = hookFn(makeContext(), makeServices()) as (response: HttpResponseOK) => void;
    const response = new HttpResponseOK();
    postHook(response);

    strictEqual(response.getHeader('X-Frame-Options'), 'DENY');
    strictEqual(response.getHeader('X-Content-Type-Options'), 'nosniff');
    strictEqual(response.getHeader('Referrer-Policy'), 'no-referrer');
    strictEqual(response.getHeader('X-XSS-Protection'), '0');
    strictEqual(response.getHeader('X-Download-Options'), 'noopen');
    strictEqual(
      response.getHeader('Permissions-Policy'),
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );
    strictEqual(response.getHeader('Strict-Transport-Security'), undefined);
    strictEqual(response.getHeader('Expect-CT'), undefined);
    ok(
      String(response.getHeader('Content-Security-Policy')).includes(
        'report-uri /csp-violation-report'
      )
    );
    // img-src is configured only in the Helmet path, not in applyFallbackSecurityHeaders.
    // This assertion verifies Helmet integration ran successfully.
    ok(String(response.getHeader('Content-Security-Policy')).includes('img-src'));
  });

  it('should add HSTS and Expect-CT in production for HTTPS requests.', () => {
    process.env.NODE_ENV = 'production';
    mockConfig({});

    const hookFn = getHookFunction(SecurityHeaders());
    const postHook = hookFn(
      makeContext({
        secure: true,
      }),
      makeServices()
    ) as (response: HttpResponseOK) => void;
    const response = new HttpResponseOK();
    postHook(response);

    strictEqual(
      response.getHeader('Strict-Transport-Security'),
      'max-age=31536000; includeSubDomains; preload'
    );
    strictEqual(response.getHeader('Expect-CT'), 'max-age=86400, enforce');
    ok(String(response.getHeader('Content-Security-Policy')).includes('upgrade-insecure-requests'));
  });

  it('should enforce HTTPS in production via 308 redirect.', () => {
    process.env.NODE_ENV = 'production';
    mockConfig({
      'security.helmet.enforceHttpsInProduction': true,
      'app.baseUrl': 'https://api.example.com',
    });

    const hookFn = getHookFunction(SecurityHeaders());
    const response = hookFn(
      makeContext({
        secure: false,
        url: '/api/profile?tab=security',
        originalUrl: '/api/profile?tab=security',
      }),
      makeServices()
    ) as any;

    strictEqual(response.statusCode, 308);
    strictEqual(response.path, 'https://api.example.com/api/profile?tab=security');
  });

  it('should not redirect in production when request is already HTTPS via x-forwarded-proto.', () => {
    process.env.NODE_ENV = 'production';
    mockConfig({
      'security.helmet.enforceHttpsInProduction': true,
      'security.helmet.trustProxy': true,
      'app.baseUrl': 'https://api.example.com',
    });

    const hookFn = getHookFunction(SecurityHeaders());
    const result = hookFn(
      makeContext({
        headers: {
          host: 'api.example.com',
          'x-forwarded-proto': 'https',
        },
      }),
      makeServices()
    );

    strictEqual(typeof result, 'function');
  });

  it('should not redirect in production when URL is not an origin-form path.', () => {
    process.env.NODE_ENV = 'production';
    mockConfig({
      'security.helmet.enforceHttpsInProduction': true,
      'app.baseUrl': 'https://api.example.com',
    });

    const hookFn = getHookFunction(SecurityHeaders());
    // scheme-relative URL that could produce an open redirect
    const result = hookFn(
      makeContext({
        secure: false,
        url: '//evil.com/path',
        originalUrl: '//evil.com/path',
      }),
      makeServices()
    );

    // Should fall through to the post-hook function, not return a redirect.
    strictEqual(typeof result, 'function');
  });
});
