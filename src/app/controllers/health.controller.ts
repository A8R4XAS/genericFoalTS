import { Get, HttpResponse, HttpResponseOK, HttpResponseServerError } from '@foal/core';
import { dataSource } from '../../db';

/** Minimal 503 response – FoalTS v5 does not ship one out of the box. */
class HttpResponseServiceUnavailable extends HttpResponseServerError {
  readonly statusCode = 503;
  readonly statusMessage = 'SERVICE UNAVAILABLE';
}

export class HealthController {
  /**
   * GET /health
   * Basic health check – always 200 as long as the process is running.
   */
  @Get('/')
  check(): HttpResponse {
    return new HttpResponseOK({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  }

  /**
   * GET /health/live
   * Kubernetes liveness probe – returns 200 when the process is alive.
   */
  @Get('/live')
  live(): HttpResponse {
    return new HttpResponseOK({ status: 'ok', alive: true });
  }

  /**
   * GET /health/ready
   * Kubernetes readiness probe – returns 200 only when the database
   * connection is available and the app can serve traffic.
   */
  @Get('/ready')
  async ready(): Promise<HttpResponse> {
    const dbResult = await this.checkDatabaseConnection();
    if (!dbResult.ok) {
      return new HttpResponseServiceUnavailable({
        status: 'error',
        ready: false,
        reason: dbResult.reason,
      });
    }
    return new HttpResponseOK({ status: 'ok', ready: true });
  }

  /**
   * GET /health/db
   * Database connection status.
   */
  @Get('/db')
  async db(): Promise<HttpResponse> {
    const dbResult = await this.checkDatabaseConnection();
    if (!dbResult.ok) {
      return new HttpResponseServiceUnavailable({
        status: 'error',
        db: 'disconnected',
        reason: dbResult.reason,
      });
    }
    return new HttpResponseOK({ status: 'ok', db: 'connected' });
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private async checkDatabaseConnection(): Promise<{ ok: boolean; reason?: string }> {
    if (!dataSource.isInitialized) {
      return { ok: false, reason: 'DataSource not initialized' };
    }
    try {
      await dataSource.query('SELECT 1');
      return { ok: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, reason };
    }
  }
}
