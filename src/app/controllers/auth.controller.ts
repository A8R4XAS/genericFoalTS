import {
  Context,
  HttpResponseBadRequest,
  HttpResponseConflict,
  HttpResponseCreated,
  Post,
} from '@foal/core';
import { ZodError } from 'zod';
import { randomBytes } from 'crypto';
import { User } from '../entities';
import { registerSchema } from '../../validators';

export class AuthController {
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
}
