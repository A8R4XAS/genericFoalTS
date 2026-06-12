import { strictEqual, ok } from 'assert';
import {
  Context,
  getHookFunction,
  isHttpResponseTooManyRequests,
  ServiceManager,
} from '@foal/core';

import { RateLimit } from './rate-limit.hook';

function createContext(controllerName: string, controllerMethodName: string, ip = '127.0.0.1') {
  const headers: Record<string, string> = {};
  const ctx = new Context(
    {
      ip,
      headers: {},
      res: {
        setHeader(name: string, value: string) {
          headers[name] = value;
        },
      },
    },
    controllerName,
    controllerMethodName
  );

  return { ctx, headers };
}

describe('RateLimit hook', () => {
  it('should set rate-limit headers on successful requests.', async () => {
    const hookFn = getHookFunction(
      RateLimit('auth', {
        auth: { points: 2, duration: 60 },
      })
    );

    const { ctx, headers } = createContext('AuthController', 'login', '10.0.0.1');
    const response = await hookFn(ctx, new ServiceManager());

    strictEqual(response, undefined);
    strictEqual(headers['X-RateLimit-Limit'], '2');
    strictEqual(headers['RateLimit-Limit'], '2');
    strictEqual(headers['X-RateLimit-Remaining'], '1');
    ok(Number(headers['RateLimit-Reset']) >= 1);
  });

  it('should return 429 when the configured limit is exceeded.', async () => {
    const hookFn = getHookFunction(
      RateLimit('auth', {
        auth: { points: 2, duration: 60 },
      })
    );

    const first = createContext('AuthController', 'login', '10.0.0.2').ctx;
    const second = createContext('AuthController', 'login', '10.0.0.2').ctx;
    const third = createContext('AuthController', 'login', '10.0.0.2').ctx;

    await hookFn(first, new ServiceManager());
    await hookFn(second, new ServiceManager());
    const response = await hookFn(third, new ServiceManager());

    ok(isHttpResponseTooManyRequests(response), 'Expected HttpResponseTooManyRequests');
    strictEqual(response.getHeader('X-RateLimit-Limit'), '2');
    strictEqual(response.getHeader('X-RateLimit-Remaining'), '0');
    ok(Number(response.getHeader('Retry-After')) >= 1);
  });

  it('should support endpoint-specific overrides.', async () => {
    const hookFn = getHookFunction(
      RateLimit('auth', {
        auth: { points: 5, duration: 60 },
        endpoints: {
          'AuthController.login': { points: 1, duration: 60 },
        },
      })
    );

    const first = createContext('AuthController', 'login', '10.0.0.3').ctx;
    const second = createContext('AuthController', 'login', '10.0.0.3').ctx;

    await hookFn(first, new ServiceManager());
    const response = await hookFn(second, new ServiceManager());

    ok(isHttpResponseTooManyRequests(response), 'Expected endpoint override limit to be enforced');
    strictEqual(response.getHeader('X-RateLimit-Limit'), '1');
  });
});
