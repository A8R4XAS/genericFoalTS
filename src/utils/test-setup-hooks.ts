/**
 * Test Setup Hooks
 *
 * Mocha hooks for setting up and tearing down test database state.
 * These hooks ensure:
 * - Database is initialized before tests run
 * - Database is cleaned up after tests complete
 * - Each test starts with a clean database state (for unit tests)
 * - Database state is consistent across test runs
 *
 * Usage in test files:
 * ```typescript
 * import { setupTestDatabase } from '../utils/test-setup-hooks';
 *
 * describe('My Feature', () => {
 *   setupTestDatabase();
 *   // ... tests
 * });
 * ```
 */

import { DataSource } from 'typeorm';
import {
  initializeTestDatabase,
  destroyTestDatabase,
  resetDatabase,
  getDataSource,
} from './test-database';

/**
 * Setup database hooks for a test suite.
 * - Initializes database before suite runs
 * - Destroys database connection after suite completes
 * - Optionally resets database before each test
 *
 * @param options Configuration options
 * @param options.resetBeforeEach - Whether to reset database before each test (default: true for unit tests)
 */
export function setupTestDatabase(options: { resetBeforeEach?: boolean } = {}): void {
  const { resetBeforeEach = true } = options;

  before(async function () {
    this.timeout(30000); // Increase timeout for database initialization
    await initializeTestDatabase();
  });

  after(async function () {
    this.timeout(30000);
    await destroyTestDatabase();
  });

  if (resetBeforeEach) {
    beforeEach(async function () {
      this.timeout(10000);
      await resetDatabase();
    });
  }
}

/**
 * Setup database for E2E tests.
 * Similar to setupTestDatabase but with E2E-specific configuration.
 * - Initializes database once before all tests
 * - Cleans up after all tests
 * - Does NOT reset between each test (for performance)
 *   Individual test should use resetDatabase() or clearEntity() as needed
 *
 * Usage:
 * ```typescript
 * describe('[E2E] Feature', () => {
 *   setupTestDatabaseE2E();
 *   // ... tests
 * });
 * ```
 */
export function setupTestDatabaseE2E(): void {
  before(async function () {
    this.timeout(30000);
    await initializeTestDatabase();
  });

  after(async function () {
    this.timeout(30000);
    await destroyTestDatabase();
  });
}

/**
 * Get the initialized DataSource instance in tests.
 * Only available after setupTestDatabase() or setupTestDatabaseE2E() has run.
 */
export function getTestDataSource(): DataSource {
  const ds = getDataSource();
  if (!ds.isInitialized) {
    throw new Error(
      'DataSource is not initialized. Make sure setupTestDatabase() or setupTestDatabaseE2E() was called.'
    );
  }
  return ds;
}
