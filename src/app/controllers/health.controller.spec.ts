// std
import { deepStrictEqual, ok, strictEqual } from 'assert';

// 3p
import { createController, getHttpMethod, getPath, isHttpResponseOK } from '@foal/core';

// App
import { HealthController } from './health.controller';

// ─── helpers ─────────────────────────────────────────────────────────────────

function isHttpResponseServiceUnavailable(response: any): boolean {
  return response && response.statusCode === 503;
}

/**
 * Lightweight stub that replaces the real dataSource for isolated unit tests.
 * We monkey-patch the module-level `dataSource` by replacing the property on
 * the imported `db` module object, then restore it in afterEach.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const db = require('../../db');

function stubDataSource(isInitialized: boolean, queryError?: Error) {
  db.dataSource = {
    isInitialized,
    query: queryError
      ? () => Promise.reject(queryError)
      : () => Promise.resolve([{ '?column?': 1 }]),
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  let controller: HealthController;
  let originalDataSource: unknown;

  before(() => {
    // Save the real dataSource so we can restore it after the suite.
    originalDataSource = db.dataSource;
  });

  afterEach(() => {
    db.dataSource = originalDataSource;
  });

  beforeEach(() => {
    controller = createController(HealthController);
    // Default: healthy DB
    stubDataSource(true);
  });

  // ── GET / ──────────────────────────────────────────────────────────────────

  describe('has a "check" method that', () => {
    it('should handle requests at GET /.', () => {
      strictEqual(getHttpMethod(HealthController, 'check'), 'GET');
      strictEqual(getPath(HealthController, 'check'), '/');
    });

    it('should return HttpResponseOK with status, timestamp and uptime.', () => {
      const response = controller.check();

      ok(isHttpResponseOK(response));
      strictEqual(response.body.status, 'ok');
      ok(typeof response.body.timestamp === 'string');
      ok(typeof response.body.uptime === 'number');
    });
  });

  // ── GET /live ──────────────────────────────────────────────────────────────

  describe('has a "live" method that', () => {
    it('should handle requests at GET /live.', () => {
      strictEqual(getHttpMethod(HealthController, 'live'), 'GET');
      strictEqual(getPath(HealthController, 'live'), '/live');
    });

    it('should return HttpResponseOK with alive: true.', () => {
      const response = controller.live();

      ok(isHttpResponseOK(response));
      deepStrictEqual(response.body, { status: 'ok', alive: true });
    });
  });

  // ── GET /ready ─────────────────────────────────────────────────────────────

  describe('has a "ready" method that', () => {
    it('should handle requests at GET /ready.', () => {
      strictEqual(getHttpMethod(HealthController, 'ready'), 'GET');
      strictEqual(getPath(HealthController, 'ready'), '/ready');
    });

    it('should return HttpResponseOK when the DB is reachable.', async () => {
      stubDataSource(true);
      const response = await controller.ready();

      ok(isHttpResponseOK(response));
      deepStrictEqual(response.body, { status: 'ok', ready: true });
    });

    it('should return 503 when the DataSource is not initialized.', async () => {
      stubDataSource(false);
      const response = await controller.ready();

      ok(isHttpResponseServiceUnavailable(response));
      strictEqual(response.body.status, 'error');
      strictEqual(response.body.ready, false);
    });

    it('should return 503 when the DB query fails.', async () => {
      stubDataSource(true, new Error('connection refused'));
      const response = await controller.ready();

      ok(isHttpResponseServiceUnavailable(response));
      strictEqual(response.body.status, 'error');
      strictEqual(response.body.ready, false);
      strictEqual(response.body.reason, 'Database query failed');
    });
  });

  // ── GET /db ────────────────────────────────────────────────────────────────

  describe('has a "db" method that', () => {
    it('should handle requests at GET /db.', () => {
      strictEqual(getHttpMethod(HealthController, 'db'), 'GET');
      strictEqual(getPath(HealthController, 'db'), '/db');
    });

    it('should return HttpResponseOK when the DB is reachable.', async () => {
      stubDataSource(true);
      const response = await controller.db();

      ok(isHttpResponseOK(response));
      deepStrictEqual(response.body, { status: 'ok', db: 'connected' });
    });

    it('should return 503 when the DataSource is not initialized.', async () => {
      stubDataSource(false);
      const response = await controller.db();

      ok(isHttpResponseServiceUnavailable(response));
      strictEqual(response.body.status, 'error');
      strictEqual(response.body.db, 'disconnected');
    });

    it('should return 503 when the DB query fails.', async () => {
      stubDataSource(true, new Error('ECONNREFUSED'));
      const response = await controller.db();

      ok(isHttpResponseServiceUnavailable(response));
      strictEqual(response.body.db, 'disconnected');
      strictEqual(response.body.reason, 'Database query failed');
    });
  });
});
