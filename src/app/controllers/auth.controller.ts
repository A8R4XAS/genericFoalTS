import {
  Config,
  Context,
  HttpResponseBadRequest,
  HttpResponseConflict,
  HttpResponseCreated,
  HttpResponseOK,
  HttpResponseUnauthorized,
  PasswordService,
  Post,
  dependency,
} from '@foal/core';
import { ZodError } from 'zod';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { User } from '../entities';
import { loginSchema, refreshTokenSchema, registerSchema } from '../../validators';

export class AuthController {
  @dependency
  passwordService: PasswordService;

  /**
   * POST /api/auth/register
   * Register a new user with email, password, firstName, and lastName
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

      // Generate verification token (32 bytes = 64 hex characters)
      const verificationToken = randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;

      // Save user to database
      await user.save();

      // Return response without sensitive data
      return new HttpResponseCreated({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
        verificationToken, // In production, this would be sent via email
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

      const passwordValid = await this.passwordService.verifyPassword(
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
}
