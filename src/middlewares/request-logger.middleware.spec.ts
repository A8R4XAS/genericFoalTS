// std
import { strictEqual, ok, match } from 'assert';

// 3p
import {
  Config,
  Context,
  getHookFunction,
  HttpResponse,
  HttpResponseOK,
  Logger,
  ServiceManager,
} from '@foal/core';

// App
import { RequestLogger } from './request-logger.middleware';
import { User, UserRole } from '../app/entities';

/**
 * Build a minimal Context that mimics what FoalTS/Express sets up.
 * `overrides` are merged onto the fake `request` object.
 */
function makeContext(overrides: Record<string, unknown> = {}): Context {
  const request = {
    method: 'GET',
    url: '/test',
    path: '/test',
    body: null,
    get: (_: string) => undefined,
    ...overrides,
  };
  return new Context(request as any);
}

describe('RequestLogger middleware', () => {
  let logOutput: string[];
  let services: ServiceManager;

  beforeEach(() => {
    logOutput = [];
    services = new ServiceManager();
    services.set(Logger, {
      info: (msg: string) => {
        logOutput.push(msg);
      },
      debug: (_msg: string) => {},
      warn: (_msg: string) => {},
      error: (_msg: string) => {},
      log: (_level: string, _msg: string) => {},
    });
  });

  it('should not block the request (hook returns a post-hook function, not an HttpResponse).', () => {
    const hookFn = getHookFunction(RequestLogger());
    const ctx = makeContext();

    const result = hookFn(ctx, services);

    ok(typeof result === 'function', 'Hook should return a post-hook function');
  });

  describe('JSON format (default)', () => {
    it('should log method, url, statusCode, and responseTime.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'POST', url: '/api/auth/login' });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      strictEqual(logOutput.length, 1);
      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.method, 'POST');
      strictEqual(entry.url, '/api/auth/login');
      strictEqual(entry.statusCode, 200);
      ok(typeof entry.responseTime === 'number', 'responseTime should be a number');
      ok(typeof entry.timestamp === 'string', 'timestamp should be a string');
    });

    it('should include userId when ctx.user is set.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext();
      const user = new User();
      user.id = 42;
      user.role = UserRole.USER;
      ctx.user = user;
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.userId, 42);
    });

    it('should omit userId when ctx.user is not set.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext();
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!('userId' in entry), 'userId should not be present');
    });

    it('should log request body with password redacted.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'POST',
        url: '/api/auth/login',
        body: { email: 'test@example.com', password: 'secret123' },
      });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.requestBody.email, 'test@example.com');
      strictEqual(entry.requestBody.password, '[REDACTED]');
    });

    it('should redact all known sensitive fields.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'PUT',
        url: '/api/profile',
        body: {
          currentPassword: 'old',
          newPassword: 'new',
          passwordConfirm: 'new',
          firstName: 'Alice',
        },
      });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.requestBody.currentPassword, '[REDACTED]');
      strictEqual(entry.requestBody.newPassword, '[REDACTED]');
      strictEqual(entry.requestBody.passwordConfirm, '[REDACTED]');
      strictEqual(entry.requestBody.firstName, 'Alice');
    });

    it('should omit requestBody when body is null.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ body: null });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!('requestBody' in entry), 'requestBody should not be present for null body');
    });

    it('should redact refreshToken in the request body.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'POST',
        url: '/api/auth/refresh',
        body: { refreshToken: 'eyJhbGciOiJIUzI1NiJ9.payload.signature' },
      });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.requestBody.refreshToken, '[REDACTED]');
    });

    it('should mask a hex verification/reset token in the URL path.', () => {
      const token = 'a'.repeat(64);
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: `/api/auth/verify/${token}` });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!entry.url.includes(token), 'Raw token must not appear in logged URL');
      ok(entry.url.includes('[REDACTED]'), 'URL should contain [REDACTED]');
    });

    it('should mask a JWT-like segment in the URL path.', () => {
      const segment = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOjF9.SomeSignature';
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'POST', url: `/api/auth/reset-password/${segment}` });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!entry.url.includes(segment), 'JWT token must not appear in logged URL');
      ok(entry.url.includes('[REDACTED]'), 'URL should contain [REDACTED]');
    });

    it('should redact query strings from the URL.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: '/api/search?q=secret&token=abc123' });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!entry.url.includes('secret'), 'Query params must not appear in logged URL');
      ok(!entry.url.includes('abc123'), 'Query params must not appear in logged URL');
      ok(entry.url.includes('?[REDACTED]'), 'URL should show ?[REDACTED]');
    });

    it('should not mask short non-token path segments.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: '/api/auth/profile' });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.url, '/api/auth/profile');
    });

    it('should redact sensitive fields nested inside objects.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'POST',
        url: '/api/auth/change-password',
        body: { user: { email: 'a@b.com', password: 'nested-secret' } },
      });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.requestBody.user.email, 'a@b.com');
      strictEqual(entry.requestBody.user.password, '[REDACTED]');
    });

    it('should not log when logger.requestLogger.enabled is false.', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGet = Config.get;
      Config.get = (key: string, type?: any, defaultValue?: any) => {
        if (key === 'logger.requestLogger.enabled') return false;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (originalGet as (...args: unknown[]) => unknown).call(
          Config,
          key,
          type,
          defaultValue
        );
      };
      try {
        const hookFn = getHookFunction(RequestLogger());
        const ctx = makeContext();
        const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;
        postHook(new HttpResponseOK());
        strictEqual(logOutput.length, 0, 'Nothing should be logged when disabled');
      } finally {
        Config.get = originalGet;
      }
    });

    it('should not log when settings.logger.logHttpRequests is false.', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGet = Config.get;
      Config.get = (key: string, type?: any, defaultValue?: any) => {
        if (key === 'settings.logger.logHttpRequests') return false;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (originalGet as (...args: unknown[]) => unknown).call(
          Config,
          key,
          type,
          defaultValue
        );
      };
      try {
        const hookFn = getHookFunction(RequestLogger());
        const ctx = makeContext();
        const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;
        postHook(new HttpResponseOK());
        strictEqual(logOutput.length, 0, 'Nothing should be logged when logHttpRequests is false');
      } finally {
        Config.get = originalGet;
      }
    });

    it('should not log when request path is in logger.requestLogger.skipPaths.', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalGet = Config.get;
      Config.get = (key: string, type?: any, defaultValue?: any) => {
        if (key === 'logger.requestLogger.skipPaths') return ['/health', '/health/live'];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (originalGet as (...args: unknown[]) => unknown).call(
          Config,
          key,
          type,
          defaultValue
        );
      };
      try {
        const hookFn = getHookFunction(RequestLogger());
        const ctx = makeContext({ method: 'GET', url: '/health/live' });
        const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;
        postHook(new HttpResponseOK());
        strictEqual(logOutput.length, 0, 'Nothing should be logged for skipped paths');
      } finally {
        Config.get = originalGet;
      }
    });
  });

  describe('text format', () => {
    let originalConfigGet: typeof Config.get;

    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      originalConfigGet = Config.get;
      Config.get = (key: string, type?: any, defaultValue?: any) => {
        if (key === 'logger.requestLogger.format') return 'text';
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return (originalConfigGet as (...args: unknown[]) => unknown).call(
          Config,
          key,
          type,
          defaultValue
        );
      };
    });

    afterEach(() => {
      Config.get = originalConfigGet;
    });

    it('should log a human-readable line in text format.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: '/api/', body: null });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      strictEqual(logOutput.length, 1);
      match(logOutput[0], /GET \/api\/ 200 \d+ms/);
    });

    it('should include userId in text format when user is set.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: '/api/profile', body: null });
      const user = new User();
      user.id = 7;
      user.role = UserRole.ADMIN;
      ctx.user = user;
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      match(logOutput[0], /userId=7/);
    });

    it('should redact passwords in text format.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'POST',
        url: '/api/auth/login',
        body: { email: 'a@b.com', password: 'secret' },
      });
      const postHook = hookFn(ctx, services) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      match(logOutput[0], /\[REDACTED\]/);
      ok(!logOutput[0].includes('secret'), 'Raw password must not appear in log');
    });
  });
});
