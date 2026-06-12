// std
import { strictEqual, ok } from 'assert';

// 3p
import { Config, Context, getHookFunction, HttpResponseOK, ServiceManager } from '@foal/core';

// App
import { Cors } from './cors.hook';

/**
 * Build a minimal Context that mimics what FoalTS/Express sets up.
 * `overrides` are merged onto the fake `request` object.
 */
function makeContext(overrides: Record<string, unknown> = {}, originHeader?: string): Context {
  const request = {
    method: 'GET',
    url: '/test',
    path: '/test',
    body: null,
    get: (header: string) => {
      if (header === 'Origin') return originHeader;
      return undefined;
    },
    ...overrides,
  };
  return new Context(request as any);
}

describe('Cors hook', () => {
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

  describe('when cors.enabled is false', () => {
    it('should not set any CORS headers.', () => {
      mockConfig({ 'cors.enabled': false });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({}, 'http://localhost:3000');
      const result = hookFn(ctx, new ServiceManager());

      // Hook should not return a pre-flight response or a post-hook.
      ok(result === undefined, 'Hook should return undefined when disabled');
    });
  });

  describe('preflight OPTIONS request', () => {
    it('should return 204 No Content for a matching origin.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const result = hookFn(ctx, new ServiceManager());

      ok(
        result && typeof result === 'object' && 'statusCode' in result,
        'Should return an HttpResponse'
      );
      strictEqual((result as any).statusCode, 204);
    });

    it('should set Access-Control-Allow-Origin to the matching origin.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const response = hookFn(ctx, new ServiceManager()) as any;

      strictEqual(response.getHeader('Access-Control-Allow-Origin'), 'http://localhost:3000');
    });

    it('should set Access-Control-Allow-Credentials when credentials are enabled.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const response = hookFn(ctx, new ServiceManager()) as any;

      strictEqual(response.getHeader('Access-Control-Allow-Credentials'), 'true');
    });

    it('should set Access-Control-Allow-Methods.', () => {
      mockConfig({
        'cors.allowedOrigins': 'http://localhost:3000',
        'cors.allowedMethods': 'GET,POST',
      });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const response = hookFn(ctx, new ServiceManager()) as any;

      strictEqual(response.getHeader('Access-Control-Allow-Methods'), 'GET,POST');
    });

    it('should set Access-Control-Allow-Headers.', () => {
      mockConfig({
        'cors.allowedOrigins': 'http://localhost:3000',
        'cors.allowedHeaders': 'Content-Type,X-Custom',
      });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const response = hookFn(ctx, new ServiceManager()) as any;

      strictEqual(response.getHeader('Access-Control-Allow-Headers'), 'Content-Type,X-Custom');
    });

    it('should set Access-Control-Max-Age.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.maxAge': 3600 });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://localhost:3000');
      const response = hookFn(ctx, new ServiceManager()) as any;

      strictEqual(response.getHeader('Access-Control-Max-Age'), '3600');
    });

    it('should not set CORS headers when the request origin is not in the allowed list.', () => {
      mockConfig({ 'cors.allowedOrigins': 'https://example.com' });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'OPTIONS' }, 'http://evil.com');
      const response = hookFn(ctx, new ServiceManager()) as any;

      ok(
        !response.getHeader('Access-Control-Allow-Origin'),
        'Should not set Allow-Origin for disallowed origin'
      );
    });
  });

  describe('regular (non-preflight) requests', () => {
    it('should return a post-hook function (not an HttpResponse).', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000' });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://localhost:3000');
      const result = hookFn(ctx, new ServiceManager());

      ok(
        typeof result === 'function',
        'Hook should return a post-hook function for regular requests'
      );
    });

    it('should set Access-Control-Allow-Origin on the response for a matching origin.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://localhost:3000');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(response.getHeader('Access-Control-Allow-Origin'), 'http://localhost:3000');
    });

    it('should set Vary: Origin when echoing back a specific origin.', () => {
      mockConfig({ 'cors.allowedOrigins': 'http://localhost:3000', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://localhost:3000');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(response.getHeader('Vary'), 'Origin');
    });

    it('should set Access-Control-Allow-Origin to * when wildcard is configured and credentials disabled.', () => {
      mockConfig({ 'cors.allowedOrigins': '*', 'cors.allowCredentials': false });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://any-origin.com');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(response.getHeader('Access-Control-Allow-Origin'), '*');
    });

    it('should reflect the request Origin (not *) and set Vary: Origin when wildcard is configured but credentials are enabled.', () => {
      mockConfig({ 'cors.allowedOrigins': '*', 'cors.allowCredentials': true });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://any-origin.com');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(response.getHeader('Access-Control-Allow-Origin'), 'http://any-origin.com');
      strictEqual(response.getHeader('Vary'), 'Origin');
    });

    it('should not set Access-Control-Allow-Origin for a disallowed origin.', () => {
      mockConfig({ 'cors.allowedOrigins': 'https://example.com' });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://evil.com');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      ok(
        !response.getHeader('Access-Control-Allow-Origin'),
        'Should not expose CORS headers for disallowed origins'
      );
    });

    it('should support multiple allowed origins.', () => {
      mockConfig({
        'cors.allowedOrigins': 'https://app.example.com,https://admin.example.com',
        'cors.allowCredentials': true,
      });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'https://admin.example.com');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(response.getHeader('Access-Control-Allow-Origin'), 'https://admin.example.com');
    });

    it('should set Access-Control-Expose-Headers when exposeHeaders is configured.', () => {
      mockConfig({
        'cors.allowedOrigins': 'http://localhost:3000',
        'cors.exposeHeaders': 'X-RateLimit-Limit,X-RateLimit-Remaining',
        'cors.allowCredentials': true,
      });

      const hookFn = getHookFunction(Cors());
      const ctx = makeContext({ method: 'GET' }, 'http://localhost:3000');
      const postHook = hookFn(ctx, new ServiceManager()) as (r: any) => void;

      const response = new HttpResponseOK();
      postHook(response);

      strictEqual(
        response.getHeader('Access-Control-Expose-Headers'),
        'X-RateLimit-Limit,X-RateLimit-Remaining'
      );
    });
  });
});
