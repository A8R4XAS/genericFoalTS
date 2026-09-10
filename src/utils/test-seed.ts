/**
 * Test Data Factories
 *
 * Factory functions for creating test entities with realistic default values.
 * Useful for seeding databases and creating test fixtures.
 */

import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { User, UserRole } from '../app/entities';
import { PasswordHashingService } from '../app/services';

const passwordHashingService = new PasswordHashingService();

function buildIndexedEmail(email: string, index: number): string {
  const [localPart, domain] = email.split('@');

  if (!domain) {
    return `${email}-${index}`;
  }

  return `${localPart}-${index}@${domain}`;
}

/**
 * Factory interface for User creation
 */
export interface UserFactoryOptions {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  isVerified?: boolean;
  verificationToken?: string | null;
  verificationTokenExpiresAt?: Date | null;
  resetPasswordToken?: string | null;
  resetPasswordTokenExpiresAt?: Date | null;
}

/**
 * User factory - creates User entities with default test values
 */
export async function createUser(
  dataSource: DataSource,
  options: UserFactoryOptions = {}
): Promise<User> {
  const user = new User();

  user.email = options.email || `user-${randomUUID()}@example.com`;
  user.password = options.password || 'TestPassword123';
  user.firstName = options.firstName || 'Test';
  user.lastName = options.lastName || 'User';
  user.role = options.role || UserRole.USER;
  user.isVerified = options.isVerified ?? false;
  user.verificationToken = options.verificationToken ?? null;
  user.verificationTokenExpiresAt = options.verificationTokenExpiresAt ?? null;
  user.resetPasswordToken = options.resetPasswordToken ?? null;
  user.resetPasswordTokenExpiresAt = options.resetPasswordTokenExpiresAt ?? null;

  // Hash password if not already hashed
  if (user.password && !PasswordHashingService.isBcryptHash(user.password)) {
    user.password = await passwordHashingService.hash(user.password);
  }

  return dataSource.getRepository(User).save(user);
}

/**
 * Create multiple users
 */
export async function createUsers(
  dataSource: DataSource,
  count: number,
  options: UserFactoryOptions = {}
): Promise<User[]> {
  const users: User[] = [];
  const batchId = randomUUID();

  for (let i = 0; i < count; i++) {
    const user = await createUser(dataSource, {
      ...options,
      // Ensure unique emails
      email: options.email
        ? buildIndexedEmail(options.email, i)
        : `user-${batchId}-${i}@example.com`,
    });
    users.push(user);
  }

  return users;
}

/**
 * Seed data for tests - creates standard test users
 */
export async function seedTestData(dataSource: DataSource): Promise<Record<string, User>> {
  const users: Record<string, User> = {};

  // Create standard test users
  users.admin = await createUser(dataSource, {
    email: 'admin@example.com',
    password: 'AdminPass123',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
    isVerified: true,
  });

  users.moderator = await createUser(dataSource, {
    email: 'moderator@example.com',
    password: 'ModPass123',
    firstName: 'Moderator',
    lastName: 'User',
    role: UserRole.MODERATOR,
    isVerified: true,
  });

  users.regularUser = await createUser(dataSource, {
    email: 'user@example.com',
    password: 'UserPass123',
    firstName: 'Regular',
    lastName: 'User',
    role: UserRole.USER,
    isVerified: true,
  });

  users.unverifiedUser = await createUser(dataSource, {
    email: 'unverified@example.com',
    password: 'UnverifiedPass123',
    firstName: 'Unverified',
    lastName: 'User',
    role: UserRole.USER,
    isVerified: false,
    verificationToken: 'test-verification-token',
    verificationTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
  });

  return users;
}
