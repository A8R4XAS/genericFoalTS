import { Config } from '@foal/core';

export class EmailService {
  /**
   * Send a verification email to the user.
   * In production, replace the console.log with a real email provider
   * (e.g. nodemailer, SendGrid, AWS SES).
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = Config.get('app.baseUrl', 'string', 'http://localhost:3001');
    const verificationUrl = `${baseUrl}/api/auth/verify/${token}`;

    // TODO: Integrate a real email provider here.
    console.log(
      `[EmailService] Sending verification email to ${email}. Verification URL: ${verificationUrl}`
    );
  }

  /**
   * Send a password reset email to the user.
   * In production, replace the console.log with a real email provider
   * (e.g. nodemailer, SendGrid, AWS SES).
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const frontendBaseUrl = Config.get('app.frontendBaseUrl', 'string', 'http://localhost:3000');
    const resetUrl = `${frontendBaseUrl}/reset-password/${token}`;

    // TODO: Integrate a real email provider here.
    // NOTE: Do not log the resetUrl – it contains a valid credential.
    console.log(`[EmailService] Sending password reset email to ${email}. Reset URL: ${resetUrl}`);
  }
}
