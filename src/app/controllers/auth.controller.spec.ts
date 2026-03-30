// std
import { strictEqual, ok } from 'assert';

// 3p
import {
  Context,
  createController,
  getHttpMethod,
  getPath,
  isHttpResponseCreated,
  isHttpResponseConflict,
  isHttpResponseBadRequest,
} from '@foal/core';

// App
import { AuthController } from './auth.controller';
import { User } from '../entities';
import { dataSource } from '../../db';

describe('AuthController', () => {
  let controller: AuthController;

  before(async () => {
    await dataSource.initialize();
  });

  after(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    controller = createController(AuthController);
    // Clean up users table before each test
    await User.clear();
  });

  describe('has a "register" method that', () => {
    it('should handle requests at POST /register.', () => {
      strictEqual(getHttpMethod(AuthController, 'register'), 'POST');
      strictEqual(getPath(AuthController, 'register'), '/register');
    });

    it('should successfully register a user with valid data.', async () => {
      const ctx = new Context({
        body: {
          email: 'test@example.com',
          password: 'Password123',
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseCreated(response)) {
        throw new Error('The response should be an instance of HttpResponseCreated.');
      }

      const body = response.body as any;
      strictEqual(body.email, 'test@example.com');
      strictEqual(body.firstName, 'John');
      strictEqual(body.lastName, 'Doe');
      strictEqual(body.isVerified, false);
      ok(body.id, 'User should have an id');
      ok(body.verificationToken, 'Should include verification token');
      ok(!body.password, 'Response should not include password');

      // Verify user was saved to database
      const savedUser = await User.findOne({ where: { email: 'test@example.com' } });
      ok(savedUser, 'User should be saved in database');
      strictEqual(savedUser?.email, 'test@example.com');
      ok(savedUser?.password.startsWith('pbkdf2_'), 'Password should be hashed');
    });

    it('should reject registration with duplicate email.', async () => {
      // Create a user first
      const existingUser = new User();
      existingUser.email = 'existing@example.com';
      existingUser.password = 'Password123';
      existingUser.firstName = 'Existing';
      existingUser.lastName = 'User';
      await existingUser.save();

      // Try to register with same email
      const ctx = new Context({
        body: {
          email: 'existing@example.com',
          password: 'NewPassword123',
          firstName: 'New',
          lastName: 'User',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseConflict(response)) {
        throw new Error('The response should be an instance of HttpResponseConflict.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Email already registered');
    });

    it('should reject registration with invalid email.', async () => {
      const ctx = new Context({
        body: {
          email: 'invalid-email',
          password: 'Password123',
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
      ok(Array.isArray(body.details), 'Should include validation details');
    });

    it('should reject registration with weak password (too short).', async () => {
      const ctx = new Context({
        body: {
          email: 'test@example.com',
          password: 'Pass1', // Too short
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });

    it('should reject registration with weak password (no uppercase).', async () => {
      const ctx = new Context({
        body: {
          email: 'test@example.com',
          password: 'password123', // No uppercase
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });

    it('should reject registration with weak password (no number).', async () => {
      const ctx = new Context({
        body: {
          email: 'test@example.com',
          password: 'PasswordABC', // No number
          firstName: 'John',
          lastName: 'Doe',
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });

    it('should reject registration without required fields.', async () => {
      const ctx = new Context({
        body: {
          email: 'test@example.com',
          // Missing password, firstName, lastName
        },
      });

      const response = await controller.register(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });
  });
});
