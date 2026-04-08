import { z } from 'zod';

/**
 * Validation schema for user registration
 */
export const registerSchema = z.object({
  email: z.string().min(1, 'Email is required').trim().toLowerCase().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(100, 'First name must be at most 100 characters')
    .trim(),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(100, 'Last name must be at most 100 characters')
    .trim(),
});

export type RegisterDto = z.infer<typeof registerSchema>;

/**
 * Validation schema for user login
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').trim().toLowerCase().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof loginSchema>;

/**
 * Validation schema for token refresh
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

/**
 * Validation schema for resending the verification email
 */
export const resendVerificationSchema = z.object({
  email: z.string().min(1, 'Email is required').trim().toLowerCase().email('Invalid email format'),
});

export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;

/**
 * Validation schema for requesting a password reset email
 */
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').trim().toLowerCase().email('Invalid email format'),
});

export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;

/**
 * Validation schema for resetting the password using a reset token
 */
export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
