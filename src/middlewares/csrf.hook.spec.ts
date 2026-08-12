// std
import { ok, strictEqual } from 'assert';

// 3p
import { Config, Context, getHookFunction, HttpResponseOK, HttpResponseUnauthorized, ServiceManager } from '@foal/core';

// App
import { CsrfProtection } from './csrf.hook';

function makeContext(overrides: Record<string, unknown> = {}): Context {
  const request = {
    method: 'GET',
    path: '/health',
    headers: {} as Record<string, string | undefined>,
    get: (header: string) => {
      return request.headers[header.toLowerCase()];
    },
    ...overrides,
  };
  return new Context(request as any);
}

function extractCsrfTokenFromCookieHeader(setCookieHeader: unknown): string {
  const firstCookie = Array.isArray(setCookieHeader)
    ? String(setCookieHeader[0])
    : String(setCookieHeader);
  return firstCookie.split(';')[0].split('=')[1];
}

describe('CsrfProtection hook', () => {
  let originalGet: typeof Config.get;

  function mockConfig(overrides: Record<string, unknown>): void {
    Config.get = (key: string, type?: any, defaultValue?: any) => {
      if (key in overrides) return overrides[key];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (originalGet as (...args: unknown[]) => unknown).call(Config, key, type, defaultValue);
    };
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalGet = Config.get;
  });

  afterEach(() => {
    Config.get = originalGet;
  });

  it('should generate a CSRF cookie and response header on safe requests.', () => {
    mockConfig({});

    const hookFn = getHookFunction(CsrfProtection());
    const postHook = hookFn(
      makeContext({ method: 'GET', path: '/health' }),
      new ServiceManager()
    ) as (response: HttpResponseOK) => void;
    const response = new HttpResponseOK();
    postHook(response);

    ok(response.getHeader('Set-Cookie'), 'Expected Set-Cookie header');
    ok(response.getHeader('X-CSRF-Token'), 'Expected X-CSRF-Token header');
    ok(!String(response.getHeader('Set-Cookie')).includes('HttpOnly'));
  });

  it('should reject state-changing requests with missing token and issue a bootstrap token.', () => {
    mockConfig({});

    const hookFn = getHookFunction(CsrfProtection());
    const response = hookFn(
      makeContext({ method: 'POST', path: '/api/auth/register' }),
      new ServiceManager()
    ) as any;

    strictEqual(response.statusCode, 403);
    strictEqual(response.body.error, 'Invalid CSRF token');
    ok(response.getHeader('Set-Cookie'), 'Expected Set-Cookie header for retry');
    ok(response.getHeader('X-CSRF-Token'), 'Expected X-CSRF-Token header for retry');
  });

  it('should allow state-changing requests when header and cookie tokens match.', () => {
    mockConfig({});

    const token = 'abc123token';
    const hookFn = getHookFunction(CsrfProtection());
    const result = hookFn(
      makeContext({
        method: 'POST',
        path: '/api/auth/register',
        headers: {
          cookie: `csrf_token=${token}`,
          'x-csrf-token': token,
        },
      }),
      new ServiceManager()
    );

    strictEqual(typeof result, 'function');
  });

  it('should skip CSRF validation when a JWT bearer token is provided.', () => {
    mockConfig({});

    const hookFn = getHookFunction(CsrfProtection());
    const authHeader = ['Bearer', 'token'].join(' ');
    const result = hookFn(
      makeContext({
        method: 'POST',
        path: '/api/resource',
        headers: {
          authorization: authHeader,
        },
      }),
      new ServiceManager()
    );

    strictEqual(typeof result, 'function');
  });

  it('should skip CSRF validation when a lowercase bearer token is provided.', () => {
    mockConfig({});

    const hookFn = getHookFunction(CsrfProtection());
    const result = hookFn(
      makeContext({
        method: 'POST',
        path: '/api/resource',
        headers: {
          authorization: 'bearer token',
        },
      }),
      new ServiceManager()
    );

    strictEqual(typeof result, 'function');
  });

  it('should rotate the CSRF token after a successful login response.', () => {
    mockConfig({});

    const initialToken = 'initial-token';
    const hookFn = getHookFunction(CsrfProtection());
    const postHook = hookFn(
      makeContext({
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          cookie: `csrf_token=${initialToken}`,
          'x-csrf-token': initialToken,
        },
      }),
      new ServiceManager()
    ) as (response: HttpResponseOK) => void;

    const response = new HttpResponseOK();
    postHook(response);

    const rotatedToken = String(response.getHeader('X-CSRF-Token'));
    const cookieToken = extractCsrfTokenFromCookieHeader(response.getHeader('Set-Cookie'));
    strictEqual(rotatedToken === initialToken, false);
    strictEqual(cookieToken, rotatedToken);
  });

  it('should not rotate the CSRF token when the login response is not 2xx.', () => {
    mockConfig({});

    const initialToken = 'initial-token';
    const hookFn = getHookFunction(CsrfProtection());
    const postHook = hookFn(
      makeContext({
        method: 'POST',
        path: '/api/auth/login',
        headers: {
          cookie: `csrf_token=${initialToken}`,
          'x-csrf-token': initialToken,
        },
      }),
      new ServiceManager()
    ) as (response: HttpResponseUnauthorized) => void;

    const response = new HttpResponseUnauthorized();
    postHook(response);

    const tokenAfter = String(response.getHeader('X-CSRF-Token'));
    strictEqual(tokenAfter, initialToken);
  });

  it('should honor a custom login rotation method from config.', () => {
    mockConfig({ 'csrf.rotateOnLoginMethod': 'PUT' });

    const initialToken = 'initial-token';
    const hookFn = getHookFunction(CsrfProtection());
    const postHook = hookFn(
      makeContext({
        method: 'PUT',
        path: '/api/auth/login',
        headers: {
          cookie: `csrf_token=${initialToken}`,
          'x-csrf-token': initialToken,
        },
      }),
      new ServiceManager()
    ) as (response: HttpResponseOK) => void;

    const response = new HttpResponseOK();
    postHook(response);

    const rotatedToken = String(response.getHeader('X-CSRF-Token'));
    strictEqual(rotatedToken === initialToken, false);
  });
});
