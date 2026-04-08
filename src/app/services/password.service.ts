import * as bcrypt from 'bcrypt';
import { Config } from '@foal/core';

export class PasswordHashingService {
  /**
   * Hash a plain-text password using bcrypt.
   * Salt rounds are configured via the `bcrypt.saltRounds` config key (default: 10).
   */
  async hash(password: string): Promise<string> {
    const saltRounds = Config.get('bcrypt.saltRounds', 'number', 10);
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a plain-text password against a bcrypt hash.
   */
  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Update a user's password by hashing the new plain-text password with bcrypt.
   * Provides a dedicated entry point for password update flows, allowing future
   * extension with logic such as password history checks or change auditing.
   */
  async updatePassword(newPassword: string): Promise<string> {
    return this.hash(newPassword);
  }
}
