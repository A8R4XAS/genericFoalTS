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
    // TODO: Integrate a real email provider here.
    // Construct the reset link using `app.frontendBaseUrl` and provide it to the email template:
    //   `${Config.get('app.frontendBaseUrl', 'string', 'http://localhost:3000')}/reset-password/${token}`
    // Do NOT log the reset URL as it contains a valid credential.
    console.log(`[EmailService] Sending password reset email to ${email}.`);
  }
}
