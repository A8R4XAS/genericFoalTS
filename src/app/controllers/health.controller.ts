import { Get, HttpResponse, HttpResponseOK, HttpResponseServerError } from '@foal/core';
import { dataSource } from '../../db';

/** Minimal 503 response – FoalTS v5 does not ship one out of the box. */
class HttpResponseServiceUnavailable extends HttpResponseServerError {
  readonly statusCode = 503;
  readonly statusMessage = 'Service Unavailable';
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
   * Database connection status with detailed diagnostic info.
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
    const details = { ...dbResult } as Record<string, unknown>;
    delete details.ok;
    return new HttpResponseOK({
      status: 'ok',
      db: 'connected',
      details,
    });
  }

  // ─── private helpers ──────────────────────────────────────────────────────

  private async checkDatabaseConnection(): Promise<
    | {
        ok: true;
        type: string;
        database?: string;
        user?: string;
        size?: string;
        activeConnections?: number;
        maxConnections?: number;
        serverTime?: string;
        timezone?: string;
        serverStartTime?: string;
        isReplica?: boolean;
        latencyMs: number;
        version?: string;
      }
    | { ok: false; reason: string }
  > {
    if (!dataSource.isInitialized) {
      return { ok: false, reason: 'DataSource not initialized' };
    }
    try {
      const dbType = dataSource.options?.type || 'unknown';
      const configuredDbName = (dataSource.options as any)?.database;

      const startTime = Date.now();

      if (dbType === 'postgres') {
        try {
          const pgQuery = `
            SELECT 
              version() AS version,
              current_database() AS database_name,
              current_user AS current_user,
              pg_size_pretty(pg_database_size(current_database())) AS size,
              (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
              current_setting('max_connections')::int AS max_connections,
              NOW()::text AS server_time,
              current_setting('TIMEZONE') AS timezone,
              pg_postmaster_start_time()::text AS server_start_time,
              pg_is_in_recovery() AS is_replica
          `;
          const [row] = await dataSource.query(pgQuery);
          const latencyMs = Date.now() - startTime;

          return {
            ok: true,
            type: dbType,
            database: row?.database_name || configuredDbName,
            user: row?.current_user,
            size: row?.size,
            activeConnections:
              row?.active_connections != null ? Number(row.active_connections) : undefined,
            maxConnections: row?.max_connections != null ? Number(row.max_connections) : undefined,
            serverTime: row?.server_time,
            timezone: row?.timezone,
            serverStartTime: row?.server_start_time,
            isReplica: row?.is_replica != null ? Boolean(row.is_replica) : undefined,
            latencyMs,
            version: row?.version,
          };
        } catch {
          // Fall back to simple query if PG system views/functions are restricted or stubbed in tests
        }
      }

      // Fallback for non-postgres or restricted environments
      const versionResult = await dataSource.query('SELECT version()');
      const latencyMs = Date.now() - startTime;

      let version: string | undefined;
      if (Array.isArray(versionResult) && versionResult.length > 0) {
        const firstRow = versionResult[0];
        const val = Object.values(firstRow)[0];
        if (typeof val === 'string') {
          version = val;
        }
      }

      return {
        ok: true,
        type: dbType,
        database: typeof configuredDbName === 'string' ? configuredDbName : undefined,
        latencyMs,
        version,
      };
    } catch {
      return { ok: false, reason: 'Database query failed' };
    }
  }
}
