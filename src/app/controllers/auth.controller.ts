import {
  Config,
  Context,
  Get,
  HttpResponseBadRequest,
  HttpResponseConflict,
  HttpResponseCreated,
  HttpResponseOK,
  HttpResponseUnauthorized,
  Post,
  dependency,
} from '@foal/core';
import { ZodError } from 'zod';
import { randomBytes, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { User } from '../entities';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../../validators';
import { EmailService, PasswordHashingService } from '../services';

/** Verification token TTL in hours (default: 24) */
const VERIFICATION_TOKEN_TTL_HOURS = 24;

/** Password reset token TTL in hours (default: 1) */
const RESET_PASSWORD_TOKEN_TTL_HOURS = 1;

export class AuthController {
  @dependency
  passwordHashingService: PasswordHashingService;

  @dependency
  emailService: EmailService;

  /**
   * POST /api/auth/register
   * Register a new user with email, password, firstName, and lastName.
   * Sends a verification email with a time-limited token.
   */
  @Post('/register')
  async register(ctx: Context) {
    try {
      // Validate request body using Zod schema
      const validatedData = registerSchema.parse(ctx.request.body);

      // Check if user with this email already exists
      const existingUser = await User.findOne({
        where: { email: validatedData.email },
      });

      if (existingUser) {
        return new HttpResponseConflict({
          error: 'Email already registered',
        });
      }

      // Create new user
      const user = new User();
      user.email = validatedData.email;
      user.password = validatedData.password; // Will be hashed by @BeforeInsert hook
      user.firstName = validatedData.firstName;
      user.lastName = validatedData.lastName;
      user.isVerified = false;

      // Generate verification token (32 bytes = 64 hex characters) with expiry
      const verificationToken = randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;
      user.verificationTokenExpiresAt = new Date(
        Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000
      );

      // Save user to database
      await user.save();

      // Send verification email (errors are logged but do not fail the request)
      await this.emailService
        .sendVerificationEmail(user.email, verificationToken)
        .catch(err => console.error('[AuthController] Failed to send verification email:', err));

      // Return response without sensitive data
      return new HttpResponseCreated({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        // Return validation errors
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      // Re-throw unexpected errors
      throw error;
    }
  }

  /**
   * GET /api/auth/verify/:token
   * Verify a user's email address using the token sent in the verification email.
   */
  @Get('/verify/:token')
  async verifyEmail(ctx: Context) {
    const { token } = ctx.request.params as { token: string };

    const user = await User.findOne({ where: { verificationToken: token } });

    if (!user) {
      return new HttpResponseBadRequest({ error: 'Invalid or expired verification token' });
    }

    if (user.isVerified) {
      return new HttpResponseOK({ message: 'Email already verified' });
    }

    if (!user.verificationTokenExpiresAt || user.verificationTokenExpiresAt < new Date()) {
      return new HttpResponseBadRequest({ error: 'Invalid or expired verification token' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationTokenExpiresAt = null;
    await user.save();

    return new HttpResponseOK({ message: 'Email verified successfully' });
  }

  /**
   * POST /api/auth/resend-verification
   * Resend the verification email for an unverified account.
   */
  @Post('/resend-verification')
  async resendVerification(ctx: Context) {
    try {
      const validatedData = resendVerificationSchema.parse(ctx.request.body);

      const user = await User.findOne({ where: { email: validatedData.email } });

      // Always return OK to avoid user enumeration
      if (!user || user.isVerified) {
        return new HttpResponseOK({
          message: 'If this email is registered and unverified, a verification email has been sent',
        });
      }

      // Generate new token and expiry
      const verificationToken = randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;
      user.verificationTokenExpiresAt = new Date(
        Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000
      );
      await user.save();

      await this.emailService
        .sendVerificationEmail(user.email, verificationToken)
        .catch(err => console.error('[AuthController] Failed to send verification email:', err));

      return new HttpResponseOK({
        message: 'If this email is registered and unverified, a verification email has been sent',
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }

  /**
   * POST /api/auth/login
   * Authenticate user with email/password and return JWT access + refresh tokens
   */
  @Post('/login')
  async login(ctx: Context) {
    try {
      const validatedData = loginSchema.parse(ctx.request.body);

      const user = await User.findOneBy({ email: validatedData.email });

      if (!user) {
        return new HttpResponseUnauthorized({ error: 'Invalid credentials' });
      }

      const passwordValid = await this.passwordHashingService.verify(
        validatedData.password,
        user.password
      );

      if (!passwordValid) {
        return new HttpResponseUnauthorized({ error: 'Invalid credentials' });
      }

      const secret = Config.getOrThrow('jwt.secret', 'string');
      const accessExpiresIn = Config.get('jwt.accessTokenExpiresIn', 'string', '15m');
      const refreshExpiresIn = Config.get('jwt.refreshTokenExpiresIn', 'string', '7d');

      const payload = { sub: user.id.toString(), userId: user.id, role: user.role };

      const accessToken = jwt.sign(payload, secret, {
        expiresIn: accessExpiresIn,
      } as jwt.SignOptions);
      const refreshToken = jwt.sign(payload, secret, {
        expiresIn: refreshExpiresIn,
      } as jwt.SignOptions);

      return new HttpResponseOK({
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: accessExpiresIn,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }

  /**
   * POST /api/auth/refresh
   * Issue a new access token using a valid refresh token
   */
  @Post('/refresh')
  async refresh(ctx: Context) {
    try {
      const validatedData = refreshTokenSchema.parse(ctx.request.body);

      const secret = Config.getOrThrow('jwt.secret', 'string');
      const accessExpiresIn = Config.get('jwt.accessTokenExpiresIn', 'string', '15m');

      let decoded: jwt.JwtPayload;
      try {
        decoded = jwt.verify(validatedData.refreshToken, secret) as jwt.JwtPayload;
      } catch {
        return new HttpResponseUnauthorized({ error: 'Invalid or expired refresh token' });
      }

      const user = await User.findOne({ where: { id: decoded['userId'] } });
      if (!user) {
        return new HttpResponseUnauthorized({ error: 'Invalid or expired refresh token' });
      }

      const payload = { sub: user.id.toString(), userId: user.id, role: user.role };
      const accessToken = jwt.sign(payload, secret, {
        expiresIn: accessExpiresIn,
      } as jwt.SignOptions);

      return new HttpResponseOK({
        accessToken,
        tokenType: 'Bearer',
        expiresIn: accessExpiresIn,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }

  /**
   * POST /api/auth/forgot-password
   * Request a password-reset email. Always returns OK to avoid user enumeration.
   */
  @Post('/forgot-password')
  async forgotPassword(ctx: Context) {
    try {
      const validatedData = forgotPasswordSchema.parse(ctx.request.body);

      const user = await User.findOne({ where: { email: validatedData.email } });

      // Always return OK to avoid user enumeration
      if (!user) {
        return new HttpResponseOK({
          message: 'If this email is registered, a password reset email has been sent',
        });
      }

      // Generate reset token (32 bytes = 64 hex characters) with expiry.
      // Only the SHA-256 hash is stored in the DB; the raw token is emailed to the user.
      const resetToken = randomBytes(32).toString('hex');
      const hashedResetToken = createHash('sha256').update(resetToken).digest('hex');
      user.resetPasswordToken = hashedResetToken;
      user.resetPasswordTokenExpiresAt = new Date(
        Date.now() + RESET_PASSWORD_TOKEN_TTL_HOURS * 60 * 60 * 1000
      );
      await user.save();

      await this.emailService
        .sendPasswordResetEmail(user.email, resetToken)
        .catch(err => console.error('[AuthController] Failed to send password reset email:', err));

      return new HttpResponseOK({
        message: 'If this email is registered, a password reset email has been sent',
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }

  /**
   * POST /api/auth/reset-password/:token
   * Set a new password using a valid, non-expired reset token.
   * Invalidates the token after use.
   */
  @Post('/reset-password/:token')
  async resetPassword(ctx: Context) {
    try {
      const { token } = ctx.request.params as { token: string };
      const validatedData = resetPasswordSchema.parse(ctx.request.body);

      // Hash the provided raw token to match the stored hash
      const hashedToken = createHash('sha256').update(token).digest('hex');
      const user = await User.findOne({ where: { resetPasswordToken: hashedToken } });

      if (!user) {
        return new HttpResponseBadRequest({ error: 'Invalid or expired password reset token' });
      }

      if (!user.resetPasswordTokenExpiresAt || user.resetPasswordTokenExpiresAt < new Date()) {
        return new HttpResponseBadRequest({ error: 'Invalid or expired password reset token' });
      }

      // Update password and invalidate the token
      user.password = validatedData.password; // Will be hashed by @BeforeInsert/@BeforeUpdate hook
      user.resetPasswordToken = null;
      user.resetPasswordTokenExpiresAt = null;
      await user.save();

      return new HttpResponseOK({ message: 'Password reset successfully' });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }
}
