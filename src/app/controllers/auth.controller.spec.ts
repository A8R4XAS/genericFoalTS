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
  isHttpResponseOK,
  isHttpResponseUnauthorized,
} from '@foal/core';
import * as jwt from 'jsonwebtoken';

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
      ok(savedUser?.password.startsWith('$2b$'), 'Password should be hashed with bcrypt');
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

  describe('has a "login" method that', () => {
    it('should handle requests at POST /login.', () => {
      strictEqual(getHttpMethod(AuthController, 'login'), 'POST');
      strictEqual(getPath(AuthController, 'login'), '/login');
    });

    it('should return JWT tokens for valid credentials.', async () => {
      // Create a user first
      const user = new User();
      user.email = 'login@example.com';
      user.password = 'Password123';
      user.firstName = 'Login';
      user.lastName = 'User';
      await user.save();

      const ctx = new Context({
        body: { email: 'login@example.com', password: 'Password123' },
      });

      const response = await controller.login(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      ok(body.accessToken, 'Should return an access token');
      ok(body.refreshToken, 'Should return a refresh token');
      strictEqual(body.tokenType, 'Bearer');

      // Verify the token is valid and contains the expected payload
      const decoded = jwt.decode(body.accessToken) as jwt.JwtPayload;
      strictEqual(decoded['userId'], user.id);
      strictEqual(decoded['role'], user.role);
    });

    it('should reject login with incorrect password.', async () => {
      const user = new User();
      user.email = 'wrongpass@example.com';
      user.password = 'Password123';
      user.firstName = 'Wrong';
      user.lastName = 'Pass';
      await user.save();

      const ctx = new Context({
        body: { email: 'wrongpass@example.com', password: 'WrongPassword1' },
      });

      const response = await controller.login(ctx);

      if (!isHttpResponseUnauthorized(response)) {
        throw new Error('The response should be an instance of HttpResponseUnauthorized.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid credentials');
    });

    it('should reject login for non-existent user.', async () => {
      const ctx = new Context({
        body: { email: 'nobody@example.com', password: 'Password123' },
      });

      const response = await controller.login(ctx);

      if (!isHttpResponseUnauthorized(response)) {
        throw new Error('The response should be an instance of HttpResponseUnauthorized.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid credentials');
    });

    it('should reject login with missing credentials.', async () => {
      const ctx = new Context({ body: {} });

      const response = await controller.login(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });
  });

  describe('has a "refresh" method that', () => {
    it('should handle requests at POST /refresh.', () => {
      strictEqual(getHttpMethod(AuthController, 'refresh'), 'POST');
      strictEqual(getPath(AuthController, 'refresh'), '/refresh');
    });

    it('should issue a new access token from a valid refresh token.', async () => {
      const user = new User();
      user.email = 'refresh@example.com';
      user.password = 'Password123';
      user.firstName = 'Refresh';
      user.lastName = 'User';
      await user.save();

      // Get a refresh token by logging in first
      const loginCtx = new Context({
        body: { email: 'refresh@example.com', password: 'Password123' },
      });
      const loginResponse = await controller.login(loginCtx);

      if (!isHttpResponseOK(loginResponse)) {
        throw new Error('Login should succeed.');
      }

      const { refreshToken } = loginResponse.body as any;

      const refreshCtx = new Context({ body: { refreshToken } });
      const response = await controller.refresh(refreshCtx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      ok(body.accessToken, 'Should return a new access token');
      strictEqual(body.tokenType, 'Bearer');
    });

    it('should reject an invalid refresh token.', async () => {
      const ctx = new Context({ body: { refreshToken: 'invalid.token.here' } });

      const response = await controller.refresh(ctx);

      if (!isHttpResponseUnauthorized(response)) {
        throw new Error('The response should be an instance of HttpResponseUnauthorized.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid or expired refresh token');
    });

    it('should reject a missing refresh token.', async () => {
      const ctx = new Context({ body: {} });

      const response = await controller.refresh(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });
  });
});
