// Environment variables must be loaded BEFORE any other imports
import 'dotenv/config';

import { Config } from '@foal/core';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * TypeORM DataSource-Konfiguration
 * Unterstützt verschiedene Umgebungen: development, test, production
 */
export function createDataSource(): DataSource {
  const env = process.env.NODE_ENV || 'development';

  const options: DataSourceOptions = {
    type: Config.getOrThrow('database.type', 'string') as any,

    // Verbindungsparameter
    url: Config.get('database.url', 'string'),
    host: Config.get('database.host', 'string'),
    port: Config.get('database.port', 'number'),
    username: Config.get('database.username', 'string'),
    password: Config.get('database.password', 'string'),
    database: Config.get('database.database', 'string'),

    // Schema-Management
    dropSchema: Config.get('database.dropSchema', 'boolean', false),
    synchronize: Config.get('database.synchronize', 'boolean', false),

    // Entities und Migrations
    entities: ['build/app/**/*.entity.js'],
    migrations: ['build/migrations/*.js'],
    subscribers: ['build/subscribers/**/*.js'],

    // Connection Pooling
    extra: {
      // Maximale Anzahl an Verbindungen im Pool
      max: Config.get('database.pool.max', 'number') || 10,
      // Minimale Anzahl an Verbindungen im Pool
      min: Config.get('database.pool.min', 'number') || 2,
      // Zeit bis eine idle Connection geschlossen wird (in ms)
      idleTimeoutMillis: Config.get('database.pool.idleTimeout', 'number') || 30000,
      // Timeout für das Herstellen einer Verbindung (in ms)
      connectionTimeoutMillis: Config.get('database.pool.connectionTimeout', 'number') || 2000,
      // Maximale Lebensdauer einer Verbindung (in ms)
      maxLifetimeMillis: Config.get('database.pool.maxLifetime', 'number') || 600000,
    },

    // Logging - umgebungsabhängig konfiguriert
    logging: getLoggingLevel(env),
    logger: 'advanced-console',

    // SSL für Produktion (falls benötigt)
    ssl: Config.get('database.ssl', 'boolean', false)
      ? { rejectUnauthorized: Config.get('database.ssl.rejectUnauthorized', 'boolean', false) }
      : false,

    // Cache-Konfiguration (optional)
    cache: Config.get('database.cache.enabled', 'boolean', false)
      ? {
          type: 'database',
          duration: Config.get('database.cache.duration', 'number') || 60000,
        }
      : false,
  };

  return new DataSource(options);
}

/**
 * Bestimmt das Logging-Level basierend auf der Umgebung
 * - development: Query-Logs, Fehler, Warnungen und Migrations
 * - test: Nur Fehler
 * - production: Fehler und Warnungen
 */
function getLoggingLevel(
  env: string
): boolean | 'all' | ('query' | 'schema' | 'error' | 'warn' | 'info' | 'log' | 'migration')[] {
  switch (env) {
    case 'development':
      return ['query', 'error', 'warn', 'migration', 'schema'];
    case 'test':
      return ['error'];
    case 'production':
      return ['error', 'warn'];
    default:
      return false;
  }
}

export const dataSource = createDataSource();
