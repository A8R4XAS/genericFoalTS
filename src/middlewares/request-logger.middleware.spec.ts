// std
import { strictEqual, ok, match } from 'assert';

// 3p
import {
  Config,
  Context,
  getHookFunction,
  HttpResponse,
  HttpResponseOK,
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
  let originalLog: typeof console.log;

  beforeEach(() => {
    logOutput = [];
    originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should not block the request (hook returns a post-hook function, not an HttpResponse).', () => {
    const hookFn = getHookFunction(RequestLogger());
    const ctx = makeContext();

    const result = hookFn(ctx, new ServiceManager());

    ok(typeof result === 'function', 'Hook should return a post-hook function');
  });

  describe('JSON format (default)', () => {
    it('should log method, url, statusCode, and responseTime.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'POST', url: '/api/auth/login' });
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.userId, 42);
    });

    it('should omit userId when ctx.user is not set.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext();
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      ok(!('requestBody' in entry), 'requestBody should not be present for null body');
    });

    it('should redact sensitive fields nested inside objects.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({
        method: 'POST',
        url: '/api/auth/change-password',
        body: { user: { email: 'a@b.com', password: 'nested-secret' } },
      });
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      const entry = JSON.parse(logOutput[0]);
      strictEqual(entry.requestBody.user.email, 'a@b.com');
      strictEqual(entry.requestBody.user.password, '[REDACTED]');
    });
  });

  describe('text format', () => {
    let originalConfigGet: typeof Config.get;

    beforeEach(() => {
      originalConfigGet = Config.get.bind(Config);
      Config.get = (key: string, type?: any, defaultValue?: any) => {
        if (key === 'logger.requestLogger.format') return 'text';
        return originalConfigGet(key, type, defaultValue);
      };
    });

    afterEach(() => {
      Config.get = originalConfigGet;
    });

    it('should log a human-readable line in text format.', () => {
      const hookFn = getHookFunction(RequestLogger());
      const ctx = makeContext({ method: 'GET', url: '/api/', body: null });
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

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
      const postHook = hookFn(ctx, new ServiceManager()) as (r: HttpResponse) => void;

      postHook(new HttpResponseOK());

      match(logOutput[0], /\[REDACTED\]/);
      ok(!logOutput[0].includes('secret'), 'Raw password must not appear in log');
    });
  });
});
