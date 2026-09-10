/**
 * Test Database Utilities
 *
 * Provides helper functions for managing database state in tests:
 * - Database initialization and cleanup
 * - Table/entity cleanup
 * - Connection management
 */

import { DataSource, EntityManager } from 'typeorm';
import { dataSource } from '../db';

/**
 * Initialize the database for testing.
 * Creates schema and runs migrations if needed.
 */
export async function initializeTestDatabase(): Promise<DataSource> {
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  return dataSource;
}

/**
 * Destroy the database connection after testing.
 */
export async function destroyTestDatabase(): Promise<void> {
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
}

/**
 * Reset all tables in the database.
 * Clears all entities while preserving the schema.
 */
export async function resetDatabase(): Promise<void> {
  if (!dataSource.isInitialized) {
    throw new Error('DataSource not initialized. Call initializeTestDatabase first.');
  }

  const entities = dataSource.entityMetadatas;

  // Disable foreign key constraints
  await dataSource.query('SET session_replication_role = replica');

  try {
    for (const entity of entities) {
      const repository = dataSource.getRepository(entity.name);
      await repository.clear();
    }
  } finally {
    // Re-enable foreign key constraints
    await dataSource.query('SET session_replication_role = default');
  }
}

/**
 * Clear a specific entity/table from the database.
 * @param entityName The name of the entity to clear
 */
export async function clearEntity(entityName: string): Promise<void> {
  if (!dataSource.isInitialized) {
    throw new Error('DataSource not initialized. Call initializeTestDatabase first.');
  }

  const repository = dataSource.getRepository(entityName);
  await repository.clear();
}

/**
 * Get the database manager for running raw queries in tests.
 */
export function getDatabaseManager(): EntityManager {
  if (!dataSource.isInitialized) {
    throw new Error('DataSource not initialized. Call initializeTestDatabase first.');
  }

  return dataSource.manager;
}

/**
 * Check if database is initialized.
 */
export function isDatabaseInitialized(): boolean {
  return dataSource.isInitialized;
}

/**
 * Get the data source instance.
 */
export function getDataSource(): DataSource {
  return dataSource;
}
