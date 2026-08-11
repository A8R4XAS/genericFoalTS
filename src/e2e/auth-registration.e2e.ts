// std
import { ok, strictEqual } from 'assert';

// 3p
import { createApp } from '@foal/core';
import * as request from 'supertest';

// App
import { AppController } from '../app/app.controller';
import { User } from '../app/entities';
import { dataSource } from '../db';

describe('[E2E] User Registration', () => {
  let app: any;

  async function postWithCsrf(
    path: string,
    payload: Record<string, unknown>,
    expectedStatus: number
  ) {
    const csrfResponse = await request(app).get('/health').expect(200);
    return request(app)
      .post(path)
      .set('X-CSRF-Token', csrfResponse.headers['x-csrf-token'] as string)
      .set('Cookie', csrfResponse.headers['set-cookie'] as string[])
      .send(payload)
      .expect(expectedStatus);
  }

  before(async () => {
    await dataSource.initialize();
    app = await createApp(AppController);
  });

  after(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Clean up users table before each test
    await User.clear();
  });

  describe('POST /api/auth/register', () => {
    it('should successfully register a new user with valid data', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'newuser@example.com',
          password: 'SecurePass123',
          firstName: 'Alice',
          lastName: 'Johnson',
        },
        201
      );

      strictEqual(response.body.email, 'newuser@example.com');
      strictEqual(response.body.firstName, 'Alice');
      strictEqual(response.body.lastName, 'Johnson');
      strictEqual(response.body.isVerified, false);
      ok(response.body.id, 'Should have user id');
      ok(!response.body.verificationToken, 'Should not include verification token in response');
      ok(!response.body.password, 'Should not include password in response');

      // Verify user is saved in database with hashed password
      const savedUser = await User.findOne({ where: { email: 'newuser@example.com' } });
      ok(savedUser, 'User should be saved in database');
      ok(savedUser?.password.startsWith('$2b$'), 'Password should be hashed with bcrypt');
    });

    it('should reject registration with duplicate email (409 Conflict)', async () => {
      // Create a user first
      const existingUser = new User();
      existingUser.email = 'existing@example.com';
      existingUser.password = 'Password123';
      existingUser.firstName = 'Existing';
      existingUser.lastName = 'User';
      await existingUser.save();

      // Try to register with same email
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'existing@example.com',
          password: 'DifferentPass123',
          firstName: 'New',
          lastName: 'User',
        },
        409
      );

      strictEqual(response.body.error, 'Email already registered');
    });

    it('should reject registration with invalid email (400 Bad Request)', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'not-an-email',
          password: 'Password123',
          firstName: 'John',
          lastName: 'Doe',
        },
        400
      );

      strictEqual(response.body.error, 'Validation failed');
      ok(Array.isArray(response.body.details), 'Should have validation details');
    });

    it('should reject registration with weak password - too short', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'Pass1',
          firstName: 'John',
          lastName: 'Doe',
        },
        400
      );

      strictEqual(response.body.error, 'Validation failed');
      const passwordError = response.body.details.find((d: any) => d.field === 'password');
      ok(passwordError, 'Should have password validation error');
    });

    it('should reject registration with weak password - no uppercase', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
        },
        400
      );

      strictEqual(response.body.error, 'Validation failed');
    });

    it('should reject registration with weak password - no number', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'PasswordABC',
          firstName: 'John',
          lastName: 'Doe',
        },
        400
      );

      strictEqual(response.body.error, 'Validation failed');
    });

    it('should reject registration with missing required fields', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'incomplete@example.com',
          password: 'Password123',
          // Missing firstName and lastName
        },
        400
      );

      strictEqual(response.body.error, 'Validation failed');
      ok(response.body.details.length >= 2, 'Should have multiple validation errors');
    });

    it('should normalize email to lowercase', async () => {
      const response = await postWithCsrf(
        '/api/auth/register',
        {
          email: 'TEST@EXAMPLE.COM',
          password: 'Password123',
          firstName: 'John',
          lastName: 'Doe',
        },
        201
      );

      strictEqual(
        response.body.email,
        'test@example.com',
        'Email should be normalized to lowercase'
      );
    });
  });
});
