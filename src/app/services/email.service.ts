import { Config } from '@foal/core';
import { createHash } from 'crypto';
import * as nodemailer from 'nodemailer';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNECTION',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EPIPE',
]);
const TRANSIENT_RESPONSE_CODES = new Set([421, 450, 451, 452]);
type EmailTransport = {
  sendMail: (message: {
    from: string | undefined;
    to: string;
    subject: string;
    text: string;
  }) => Promise<unknown>;
};

export class EmailService {
  readonly transporter?: EmailTransport;
  readonly fromAddress?: string;

  constructor() {
    const port = Config.get('smtp.port', 'number', 587);
    const configuredSecure = Config.get('smtp.secure', 'boolean', false);
    const secure = port === 465 || (port !== 587 && configuredSecure);

    this.transporter = nodemailer.createTransport({
      host: Config.get('smtp.host', 'string', 'localhost'),
      port,
      secure,
      requireTLS: port === 587 && !secure,
      auth: {
        user: Config.get('smtp.user', 'string', ''),
        pass: Config.get('smtp.password', 'string', ''),
      },
    });
    this.fromAddress = Config.get('smtp.fromAddress', 'string', '');
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const baseUrl = Config.get('app.baseUrl', 'string', 'http://localhost:3001');
    const verificationUrl = `${baseUrl}/api/auth/verify/${token}`;

    await sendMail(this.transporter, this.fromAddress, email, {
      subject: 'Verify your email address',
      text: `Please verify your email address by visiting: ${verificationUrl}`,
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const baseUrl = Config.get('app.frontendBaseUrl', 'string', 'http://localhost:3000');
    const resetUrl = `${baseUrl}/reset-password/${token}`;

    // Do not log the reset URL as it contains a valid credential.
    await sendMail(this.transporter, this.fromAddress, email, {
      subject: 'Reset your password',
      text: `Reset your password by visiting: ${resetUrl}`,
    });
  }
}

async function sendMail(
  transporter: EmailTransport | undefined,
  fromAddress: string | undefined,
  email: string,
  message: { subject: string; text: string }
): Promise<void> {
  if (!transporter) {
    throw new Error('SMTP transport is not configured');
  }

  const recipient = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
  const startedAt = new Date().toISOString();

  for (let attempt = 0; ; attempt++) {
    try {
      await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject: message.subject,
        text: message.text,
      });
      console.log(`[EmailService] Email sent at ${startedAt} to ${recipient}.`);
      return;
    } catch (error) {
      if (!isTransientError(error) || attempt >= MAX_RETRIES) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[EmailService] Email failed at ${startedAt} to ${recipient}: ${reason}`);
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2 ** attempt));
    }
  }
}

function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const smtpError = error as { code?: string; responseCode?: number };
  return (
    (smtpError.code !== undefined && TRANSIENT_ERROR_CODES.has(smtpError.code)) ||
    (smtpError.responseCode !== undefined && TRANSIENT_RESPONSE_CODES.has(smtpError.responseCode))
  );
}
