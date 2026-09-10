# Test Database Setup & Configuration

This document describes how the test database is set up and configured for unit tests and end-to-end (E2E) tests.

## Overview

The project uses separate test databases for unit tests and E2E tests:
- **Unit Tests**: `genericfoalts_test`
- **E2E Tests**: `genericfoalts_e2e`

Each database is automatically reset between test runs to ensure test isolation and consistency.

## Database Configuration

### Test Databases (test.json)

```json
{
  "database": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "postgres",
    "password": "postgres",
    "database": "genericfoalts_test",
    "dropSchema": true,
    "synchronize": true,
    "pool": {
      "max": 5,
      "min": 1,
      "idleTimeout": 10000,
      "connectionTimeout": 2000
    }
  }
}
```

### E2E Databases (e2e.json)

```json
{
  "database": {
    "type": "postgres",
    "host": "localhost",
    "port": 5432,
    "username": "postgres",
    "password": "postgres",
    "database": "genericfoalts_e2e",
    "dropSchema": true,
    "synchronize": true
  }
}
```

### Key Configuration Options

- **`dropSchema: true`**: Database schema is dropped before synchronization
- **`synchronize: true`**: TypeORM automatically synchronizes the database schema with entities (⚠️ Never use in production!)

## Setting Up Test Database

### 1. Start PostgreSQL

```bash
npm run db:start
```

### 2. Create Test Databases

```bash
npm run setup:test-db
```

This script:
- Connects to PostgreSQL
- Drops existing test databases if they exist
- Creates fresh test databases
- Displays setup confirmation

## Running Tests

### Unit Tests

```bash
npm run build:test
npm run start:test
```

Or in watch mode:

```bash
npm test
```

### E2E Tests

```bash
npm run build:e2e
npm run start:e2e
```

Or in watch mode:

```bash
npm run e2e
```

## Test Database Utilities

The project provides utility functions for managing database state in tests.

### Database Setup Hooks

Use `setupTestDatabase()` for unit tests that reset the database before each test:

```typescript
import { setupTestDatabase } from '../utils';

describe('UserService', () => {
  setupTestDatabase(); // Automatically handles before/after/beforeEach hooks

  it('should create a user', async () => {
    // Test code here
  });
});
```

Use `setupTestDatabaseE2E()` for E2E tests that initialize once:

```typescript
import { setupTestDatabaseE2E } from '../utils';
import { createApp } from '@foal/core';

describe('[E2E] API', () => {
  setupTestDatabaseE2E(); // Initialize DB once for all tests

  let app: any;

  before(async () => {
    app = await createApp(AppController);
  });

  beforeEach(async () => {
    // Manually clean up specific entities as needed
    await User.clear();
  });

  it('should register a user', async () => {
    // Test code here
  });
});
```

### Database Functions

#### Initialize Database

```typescript
import { initializeTestDatabase } from '../utils';

await initializeTestDatabase();
```

#### Reset Database

Clears all tables while preserving the schema:

```typescript
import { resetDatabase } from '../utils';

await resetDatabase();
```

#### Clear Specific Entity

```typescript
import { clearEntity } from '../utils';

await clearEntity('User');
```

#### Get Database Manager

For running raw queries in tests:

```typescript
import { getDatabaseManager } from '../utils';

const manager = getDatabaseManager();
const users = await manager.query('SELECT * FROM "user"');
```

## Test Factories & Seed Data

### Create Test Users

```typescript
import { createUser, createUsers, seedTestData } from '../utils';
import { getDataSource } from '../utils';

const dataSource = getDataSource();

// Create single user
const user = await createUser(dataSource, {
  email: 'test@example.com',
  password: 'Password123',
  firstName: 'Test',
  lastName: 'User',
  role: UserRole.ADMIN,
});

// Create multiple users
const users = await createUsers(dataSource, 3, {
  role: UserRole.USER,
});

// Seed standard test data
const testData = await seedTestData(dataSource);
// testData.admin, testData.moderator, testData.regularUser, testData.unverifiedUser
```

## Database Reset Between Tests

### Automatic Reset (Unit Tests)

When using `setupTestDatabase()`, the database is automatically reset before each test via the `beforeEach` hook.

### Manual Reset (E2E Tests)

For E2E tests, manually reset entities as needed:

```typescript
beforeEach(async () => {
  await User.clear();
  await FileUpload.clear();
});
```

Or reset all tables:

```typescript
import { resetDatabase } from '../utils';

beforeEach(async () => {
  await resetDatabase();
});
```

## Example Unit Test

```typescript
import * as assert from 'assert';
import { setupTestDatabase, createUser, getDataSource } from '../utils';
import { UserService } from './user.service';

describe('UserService', () => {
  setupTestDatabase();

  it('should find user by email', async () => {
    const dataSource = getDataSource();
    const testUser = await createUser(dataSource, {
      email: 'test@example.com',
      password: 'Password123',
    });

    const service = new UserService();
    const found = await service.findByEmail('test@example.com');

    assert.ok(found);
    assert.strictEqual(found.id, testUser.id);
  });
});
```

## Example E2E Test

```typescript
import * as assert from 'assert';
import { setupTestDatabaseE2E, createUser, getDataSource } from '../utils';
import { createApp } from '@foal/core';
import * as request from 'supertest';

describe('[E2E] User API', () => {
  setupTestDatabaseE2E();

  let app: any;

  before(async () => {
    app = await createApp(AppController);
  });

  beforeEach(async () => {
    await User.clear();
  });

  it('should fetch a user by ID', async () => {
    const dataSource = getDataSource();
    const user = await createUser(dataSource, {
      email: 'test@example.com',
      password: 'Password123',
    });

    const response = await request(app)
      .get(`/api/users/${user.id}`)
      .expect(200);

    assert.strictEqual(response.body.email, 'test@example.com');
  });
});
```

## Troubleshooting

### Database Connection Errors

If you get connection errors:

1. Ensure PostgreSQL is running:
   ```bash
   npm run db:status
   ```

2. Check database credentials in `.env`

3. Verify test databases exist:
   ```bash
   npm run setup:test-db
   ```

### Schema Synchronization Issues

If schema synchronization fails:

1. Check that migrations are up to date:
   ```bash
   npm run migrations
   ```

2. Verify entities are properly defined in `src/app/entities/`

3. Check TypeORM config in `src/db.ts`

### Tests Interfering With Each Other

If tests interfere with each other:

1. Use `setupTestDatabase()` for automatic reset
2. Manually call `resetDatabase()` in test setup
3. Ensure `beforeEach` clears necessary entities
4. Check for tests that don't wait for async operations

### Tests Running Against Wrong Database

Ensure `NODE_ENV` is set correctly:

- Unit tests: `NODE_ENV=test`
- E2E tests: `NODE_ENV=e2e`

The npm scripts automatically set this, but if running tests manually, verify this is set.

## Best Practices

1. **Use Setup Hooks**: Always use `setupTestDatabase()` or `setupTestDatabaseE2E()` instead of manually managing connections

2. **Clear Data Between Tests**: Use `beforeEach` to clear tables relevant to each test

3. **Use Factories**: Use `createUser()` and `seedTestData()` instead of creating entities manually

4. **Keep Tests Isolated**: Don't rely on test execution order or shared state

5. **Use Meaningful Test Data**: Use factory options to create realistic test scenarios

6. **Check Database State**: Verify data is persisted correctly using queries in assertions

## Performance Considerations

- Database reset time increases with number of tables
- For large test suites, consider grouping tests and resetting only relevant entities
- E2E tests are slower due to HTTP overhead; use unit tests when possible
- Connection pooling is configured for tests to reuse connections efficiently
