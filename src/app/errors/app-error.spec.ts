// std
import { strictEqual, ok, deepStrictEqual } from 'assert';

// 3p
import {
  Config,
  Context,
  isHttpResponseBadRequest,
  isHttpResponseConflict,
  isHttpResponseForbidden,
  isHttpResponseInternalServerError,
  isHttpResponseNotFound,
  isHttpResponseUnauthorized,
  Logger,
  ServiceManager,
} from '@foal/core';
import { ZodError, ZodIssueCode } from 'zod';

// App
import { AppController } from '../app.controller';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './app-error';

// ---------------------------------------------------------------------------
// Helper – build a minimal Context with a request path
// ---------------------------------------------------------------------------
function makeCtx(path = '/test'): Context {
  return new Context({ path, get: () => undefined });
}

// ---------------------------------------------------------------------------
// Helper – build an AppController instance with a no-op Logger injected
// ---------------------------------------------------------------------------
function makeController(): AppController {
  const controller = new AppController();
  const sm = new ServiceManager();
  controller.logger = sm.get(Logger);
  return controller;
}

// ---------------------------------------------------------------------------
// Custom error classes
// ---------------------------------------------------------------------------
describe('AppError', () => {
  it('should set statusCode and message.', () => {
    const err = new AppError(418, "I'm a teapot"); // eslint-disable-line @typescript-eslint/quotes
    strictEqual(err.statusCode, 418);
    strictEqual(err.message, "I'm a teapot"); // eslint-disable-line @typescript-eslint/quotes
  });

  it('should default isOperational to true.', () => {
    const err = new AppError(500, 'oops');
    strictEqual(err.isOperational, true);
  });

  it('should allow setting isOperational to false.', () => {
    const err = new AppError(500, 'programmer error', false);
    strictEqual(err.isOperational, false);
  });

  it('should set name to the subclass name.', () => {
    const err = new ValidationError();
    strictEqual(err.name, 'ValidationError');
  });

  it('should pass instanceof checks after subclassing.', () => {
    const err = new NotFoundError();
    ok(err instanceof AppError, 'should be instanceof AppError');
    ok(err instanceof NotFoundError, 'should be instanceof NotFoundError');
    ok(err instanceof Error, 'should be instanceof Error');
  });
});

describe('ValidationError', () => {
  it('should default to statusCode 400.', () => {
    strictEqual(new ValidationError().statusCode, 400);
  });

  it('should use default message when none provided.', () => {
    strictEqual(new ValidationError().message, 'Validation failed');
  });

  it('should accept a custom message.', () => {
    strictEqual(new ValidationError('Bad input').message, 'Bad input');
  });

  it('should store optional details array.', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    deepStrictEqual(new ValidationError('err', details).details, details);
  });
});

describe('NotFoundError', () => {
  it('should default to statusCode 404.', () => {
    strictEqual(new NotFoundError().statusCode, 404);
  });

  it('should accept a custom message.', () => {
    strictEqual(new NotFoundError('User not found').message, 'User not found');
  });
});

describe('UnauthorizedError', () => {
  it('should default to statusCode 401.', () => {
    strictEqual(new UnauthorizedError().statusCode, 401);
  });
});

describe('ForbiddenError', () => {
  it('should default to statusCode 403.', () => {
    strictEqual(new ForbiddenError().statusCode, 403);
  });
});

describe('ConflictError', () => {
  it('should default to statusCode 409.', () => {
    strictEqual(new ConflictError().statusCode, 409);
  });
});

// ---------------------------------------------------------------------------
// AppController.handleError – global error handler
// ---------------------------------------------------------------------------
describe('AppController.handleError', () => {
  let controller: AppController;

  beforeEach(() => {
    controller = makeController();
    // Ensure debug mode is off by default so stack traces are hidden
    process.env['NODE_ENV'] = 'test';
  });

  // ── ZodError ──────────────────────────────────────────────────────────────
  it('should return 400 for a ZodError.', async () => {
    const zodErr = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        path: ['email'],
        message: 'Invalid email',
        expected: 'string',
        received: 'number',
      },
    ]);

    const response = await controller.handleError(zodErr, makeCtx());

    ok(isHttpResponseBadRequest(response), 'Expected HttpResponseBadRequest');
  });

  it('should include structured details for a ZodError.', async () => {
    const zodErr = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        path: ['email'],
        message: 'Required',
        expected: 'string',
        received: 'undefined',
      },
    ]);

    const response = await controller.handleError(zodErr, makeCtx());
    const body = response.body as Record<string, unknown>;

    strictEqual(body['error'], 'Validation failed');
    ok(Array.isArray(body['details']), 'Expected details array');
    deepStrictEqual((body['details'] as { field: string; message: string }[])[0], {
      field: 'email',
      message: 'Required',
    });
  });

  // ── ValidationError ───────────────────────────────────────────────────────
  it('should return 400 for a ValidationError.', async () => {
    const err = new ValidationError('Bad input');
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseBadRequest(response), 'Expected HttpResponseBadRequest');
  });

  it('should include details in response body when ValidationError has details.', async () => {
    const details = [{ field: 'name', message: 'Too short' }];
    const err = new ValidationError('Bad input', details);
    const response = await controller.handleError(err, makeCtx());
    const body = response.body as Record<string, unknown>;
    deepStrictEqual(body['details'], details);
  });

  // ── NotFoundError ─────────────────────────────────────────────────────────
  it('should return 404 for a NotFoundError.', async () => {
    const err = new NotFoundError('User not found');
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseNotFound(response), 'Expected HttpResponseNotFound');
    const body = response.body as Record<string, unknown>;
    strictEqual(body['error'], 'User not found');
  });

  // ── UnauthorizedError ─────────────────────────────────────────────────────
  it('should return 401 for an UnauthorizedError.', async () => {
    const err = new UnauthorizedError();
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  // ── ForbiddenError ────────────────────────────────────────────────────────
  it('should return 403 for a ForbiddenError.', async () => {
    const err = new ForbiddenError();
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseForbidden(response), 'Expected HttpResponseForbidden');
  });

  // ── ConflictError ─────────────────────────────────────────────────────────
  it('should return 409 for a ConflictError.', async () => {
    const err = new ConflictError();
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseConflict(response), 'Expected HttpResponseConflict');
  });

  // ── Non-operational AppError ──────────────────────────────────────────────
  it('should return 500 for a non-operational AppError.', async () => {
    const err = new AppError(500, 'programmer mistake', false);
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseInternalServerError(response), 'Expected HttpResponseInternalServerError');
    const body = response.body as Record<string, unknown>;
    strictEqual(body['error'], 'Internal Server Error');
  });

  // ── Generic Error ─────────────────────────────────────────────────────────
  it('should return 500 for a generic Error.', async () => {
    const err = new Error('Something went wrong');
    const response = await controller.handleError(err, makeCtx());
    ok(isHttpResponseInternalServerError(response), 'Expected HttpResponseInternalServerError');
  });

  it('should not expose error message in production for generic errors.', async () => {
    // settings.debug defaults to false (not set)
    const err = new Error('Database connection failed');
    const response = await controller.handleError(err, makeCtx());
    const body = response.body as Record<string, unknown>;
    strictEqual(body['error'], 'Internal Server Error');
    strictEqual(body['message'], undefined);
    strictEqual(body['stack'], undefined);
  });

  // ── Stack traces in development ───────────────────────────────────────────
  it('should include stack trace in development mode for AppError.', async () => {
    Config.set('settings.debug', true);
    try {
      const err = new NotFoundError('test');
      const response = await controller.handleError(err, makeCtx());
      const body = response.body as Record<string, unknown>;
      ok(typeof body['stack'] === 'string', 'Expected stack trace in dev mode');
    } finally {
      Config.remove('settings.debug');
    }
  });

  it('should include stack trace in development mode for generic errors.', async () => {
    Config.set('settings.debug', true);
    try {
      const err = new Error('boom');
      const response = await controller.handleError(err, makeCtx());
      const body = response.body as Record<string, unknown>;
      ok(typeof body['stack'] === 'string', 'Expected stack trace in dev mode');
      ok(typeof body['message'] === 'string', 'Expected message in dev mode');
    } finally {
      Config.remove('settings.debug');
    }
  });

  it('should NOT include stack trace when debug is false.', async () => {
    Config.set('settings.debug', false);
    try {
      const err = new NotFoundError('hidden');
      const response = await controller.handleError(err, makeCtx());
      const body = response.body as Record<string, unknown>;
      strictEqual(body['stack'], undefined);
    } finally {
      Config.remove('settings.debug');
    }
  });
});
