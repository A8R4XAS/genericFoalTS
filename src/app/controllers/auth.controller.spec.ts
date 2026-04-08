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
import { randomBytes } from 'crypto';

// App
import { AuthController } from './auth.controller';
import { User } from '../entities';
import { dataSource } from '../../db';
import { EmailService } from '../services';

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
    // Stub the email service to avoid real sends during tests
    controller.emailService = {
      sendVerificationEmail: async () => {},
      sendPasswordResetEmail: async () => {},
    } as EmailService;
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
      ok(!body.password, 'Response should not include password');
      ok(!body.verificationToken, 'Response should not include verification token');

      // Verify user was saved to database with token
      const savedUser = await User.findOne({ where: { email: 'test@example.com' } });
      ok(savedUser, 'User should be saved in database');
      strictEqual(savedUser?.email, 'test@example.com');
      ok(savedUser?.password.startsWith('$2b$'), 'Password should be hashed with bcrypt');
      ok(savedUser?.verificationToken, 'User should have a verification token');
      ok(savedUser?.verificationTokenExpiresAt, 'User should have a token expiry date');
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

  describe('has a "verifyEmail" method that', () => {
    it('should handle requests at GET /verify/:token.', () => {
      strictEqual(getHttpMethod(AuthController, 'verifyEmail'), 'GET');
      strictEqual(getPath(AuthController, 'verifyEmail'), '/verify/:token');
    });

    it('should verify a user with a valid, non-expired token.', async () => {
      const token = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'verify@example.com';
      user.password = 'Password123';
      user.firstName = 'Verify';
      user.lastName = 'User';
      user.verificationToken = token;
      user.verificationTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      user.isVerified = false;
      await user.save();

      const ctx = new Context({ params: { token } });
      const response = await controller.verifyEmail(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      strictEqual(body.message, 'Email verified successfully');

      const updatedUser = await User.findOne({ where: { email: 'verify@example.com' } });
      strictEqual(updatedUser?.isVerified, true);
      strictEqual(updatedUser?.verificationToken, null);
      strictEqual(updatedUser?.verificationTokenExpiresAt, null);
    });

    it('should reject an invalid (non-existent) token.', async () => {
      const ctx = new Context({ params: { token: 'nonexistenttoken' } });
      const response = await controller.verifyEmail(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid or expired verification token');
    });

    it('should reject an expired token.', async () => {
      const token = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'expired@example.com';
      user.password = 'Password123';
      user.firstName = 'Expired';
      user.lastName = 'User';
      user.verificationToken = token;
      user.verificationTokenExpiresAt = new Date(Date.now() - 1000); // 1 second ago (expired)
      user.isVerified = false;
      await user.save();

      const ctx = new Context({ params: { token } });
      const response = await controller.verifyEmail(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid or expired verification token');

      // User should remain unverified
      const unchanged = await User.findOne({ where: { email: 'expired@example.com' } });
      strictEqual(unchanged?.isVerified, false);
    });

    it('should return OK if the user is already verified.', async () => {
      const token = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'alreadyverified@example.com';
      user.password = 'Password123';
      user.firstName = 'Already';
      user.lastName = 'Verified';
      user.verificationToken = token;
      user.verificationTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      user.isVerified = true;
      await user.save();

      const ctx = new Context({ params: { token } });
      const response = await controller.verifyEmail(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      strictEqual(body.message, 'Email already verified');
    });
  });

  describe('has a "resendVerification" method that', () => {
    it('should handle requests at POST /resend-verification.', () => {
      strictEqual(getHttpMethod(AuthController, 'resendVerification'), 'POST');
      strictEqual(getPath(AuthController, 'resendVerification'), '/resend-verification');
    });

    it('should issue a new token and send an email for an unverified user.', async () => {
      const oldToken = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'resend@example.com';
      user.password = 'Password123';
      user.firstName = 'Resend';
      user.lastName = 'User';
      user.verificationToken = oldToken;
      user.verificationTokenExpiresAt = new Date(Date.now() - 1000); // expired
      user.isVerified = false;
      await user.save();

      let emailSentTo = '';
      controller.emailService = {
        sendVerificationEmail: async (email: string) => {
          emailSentTo = email;
        },
        sendPasswordResetEmail: async () => {},
      } as EmailService;

      const ctx = new Context({ body: { email: 'resend@example.com' } });
      const response = await controller.resendVerification(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(
        emailSentTo,
        'resend@example.com',
        'Verification email should have been sent to the user'
      );

      const updatedUser = await User.findOne({ where: { email: 'resend@example.com' } });
      ok(updatedUser?.verificationToken !== oldToken, 'Token should be refreshed');
      ok(updatedUser?.verificationTokenExpiresAt, 'New expiry should be set');
      ok(updatedUser.verificationTokenExpiresAt > new Date(), 'New expiry should be in the future');
    });

    it('should return OK (without sending email) for an already-verified user.', async () => {
      const user = new User();
      user.email = 'verified@example.com';
      user.password = 'Password123';
      user.firstName = 'Verified';
      user.lastName = 'User';
      user.isVerified = true;
      await user.save();

      let emailSent = false;
      controller.emailService = {
        sendVerificationEmail: async () => {
          emailSent = true;
        },
        sendPasswordResetEmail: async () => {},
      } as EmailService;

      const ctx = new Context({ body: { email: 'verified@example.com' } });
      const response = await controller.resendVerification(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(emailSent, false, 'Email should not be sent for already-verified users');
    });

    it('should return OK (without sending email) for a non-existent email.', async () => {
      let emailSent = false;
      controller.emailService = {
        sendVerificationEmail: async () => {
          emailSent = true;
        },
        sendPasswordResetEmail: async () => {},
      } as EmailService;

      const ctx = new Context({ body: { email: 'nobody@example.com' } });
      const response = await controller.resendVerification(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(emailSent, false, 'Email should not be sent for non-existent email');
    });

    it('should reject a missing or invalid email.', async () => {
      const ctx = new Context({ body: {} });
      const response = await controller.resendVerification(ctx);

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

  describe('has a "forgotPassword" method that', () => {
    it('should handle requests at POST /forgot-password.', () => {
      strictEqual(getHttpMethod(AuthController, 'forgotPassword'), 'POST');
      strictEqual(getPath(AuthController, 'forgotPassword'), '/forgot-password');
    });

    it('should generate a reset token and send a reset email for a registered user.', async () => {
      const user = new User();
      user.email = 'resetme@example.com';
      user.password = 'Password123';
      user.firstName = 'Reset';
      user.lastName = 'Me';
      await user.save();

      let emailSentTo = '';
      let emailToken = '';
      controller.emailService = {
        sendVerificationEmail: async () => {},
        sendPasswordResetEmail: async (email: string, token: string) => {
          emailSentTo = email;
          emailToken = token;
        },
      } as EmailService;

      const ctx = new Context({ body: { email: 'resetme@example.com' } });
      const response = await controller.forgotPassword(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      strictEqual(
        body.message,
        'If this email is registered, a password reset email has been sent'
      );
      strictEqual(emailSentTo, 'resetme@example.com');
      ok(emailToken, 'Reset token should be passed to the email service');

      const updatedUser = await User.findOne({ where: { email: 'resetme@example.com' } });
      ok(updatedUser?.resetPasswordToken, 'User should have a reset token');
      ok(updatedUser?.resetPasswordTokenExpiresAt, 'User should have a reset token expiry');
      ok(
        updatedUser.resetPasswordTokenExpiresAt > new Date(),
        'Reset token expiry should be in the future'
      );
    });

    it('should return OK (without sending email) for a non-existent email.', async () => {
      let emailSent = false;
      controller.emailService = {
        sendVerificationEmail: async () => {},
        sendPasswordResetEmail: async () => {
          emailSent = true;
        },
      } as EmailService;

      const ctx = new Context({ body: { email: 'nobody@example.com' } });
      const response = await controller.forgotPassword(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(emailSent, false, 'Email should not be sent for non-existent email');
    });

    it('should reject a missing or invalid email.', async () => {
      const ctx = new Context({ body: {} });
      const response = await controller.forgotPassword(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });
  });

  describe('has a "resetPassword" method that', () => {
    it('should handle requests at POST /reset-password/:token.', () => {
      strictEqual(getHttpMethod(AuthController, 'resetPassword'), 'POST');
      strictEqual(getPath(AuthController, 'resetPassword'), '/reset-password/:token');
    });

    it('should reset the password with a valid, non-expired token.', async () => {
      const resetToken = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'doreset@example.com';
      user.password = 'OldPassword1';
      user.firstName = 'Do';
      user.lastName = 'Reset';
      user.resetPasswordToken = resetToken;
      user.resetPasswordTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      const ctx = new Context({
        params: { token: resetToken },
        body: { password: 'NewPassword1' },
      });
      const response = await controller.resetPassword(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      strictEqual(body.message, 'Password reset successfully');

      // Token should be cleared and password updated
      const updatedUser = await User.findOne({ where: { email: 'doreset@example.com' } });
      strictEqual(updatedUser?.resetPasswordToken, null);
      strictEqual(updatedUser?.resetPasswordTokenExpiresAt, null);
      ok(updatedUser?.password.startsWith('$2b$'), 'Password should be re-hashed with bcrypt');
    });

    it('should reject an invalid (non-existent) reset token.', async () => {
      const ctx = new Context({
        params: { token: 'nonexistentresettoken' },
        body: { password: 'NewPassword1' },
      });
      const response = await controller.resetPassword(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid or expired password reset token');
    });

    it('should reject an expired reset token.', async () => {
      const resetToken = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'expiredreset@example.com';
      user.password = 'OldPassword1';
      user.firstName = 'Expired';
      user.lastName = 'Reset';
      user.resetPasswordToken = resetToken;
      user.resetPasswordTokenExpiresAt = new Date(Date.now() - 1000); // 1 second ago (expired)
      await user.save();

      const ctx = new Context({
        params: { token: resetToken },
        body: { password: 'NewPassword1' },
      });
      const response = await controller.resetPassword(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Invalid or expired password reset token');

      // Password should remain unchanged
      const unchanged = await User.findOne({ where: { email: 'expiredreset@example.com' } });
      ok(unchanged?.resetPasswordToken, 'Token should not be cleared after rejected attempt');
    });

    it('should reject a reset with a weak new password.', async () => {
      const resetToken = randomBytes(32).toString('hex');
      const user = new User();
      user.email = 'weakpw@example.com';
      user.password = 'OldPassword1';
      user.firstName = 'Weak';
      user.lastName = 'Pw';
      user.resetPasswordToken = resetToken;
      user.resetPasswordTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const ctx = new Context({
        params: { token: resetToken },
        body: { password: 'weak' }, // Too weak
      });
      const response = await controller.resetPassword(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });

    it('should reject a reset with a missing password.', async () => {
      const resetToken = randomBytes(32).toString('hex');
      const ctx = new Context({
        params: { token: resetToken },
        body: {},
      });
      const response = await controller.resetPassword(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }

      const body = response.body as any;
      strictEqual(body.error, 'Validation failed');
    });
  });
});
