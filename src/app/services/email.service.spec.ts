import * as assert from 'assert';
import { Config } from '@foal/core';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let originalGet: typeof Config.get;
  let originalCreateTransport: typeof nodemailer.createTransport;

  beforeEach(() => {
    originalGet = Config.get.bind(Config);
    originalCreateTransport = nodemailer.createTransport.bind(nodemailer);
    Config.get = ((key: string, _type?: string, defaultValue?: unknown) => {
      const values: Record<string, unknown> = {
        'smtp.host': 'smtp.example.com',
        'smtp.port': 587,
        'smtp.secure': false,
        'smtp.user': 'user',
        'smtp.password': 'password',
        'smtp.fromAddress': 'from@example.com',
        'app.baseUrl': 'http://localhost:3001',
        'app.frontendBaseUrl': 'http://localhost:3000',
      };
      return values[key] ?? defaultValue;
    }) as typeof Config.get;
  });

  afterEach(() => {
    Config.get = originalGet;
    nodemailer.createTransport = originalCreateTransport;
  });

  it('sends mail through a reused transport', async () => {
    const messages: { to: string; text: string }[] = [];
    const transport = {
      sendMail: async (message: { to: string; text: string }) => {
        messages.push(message);
      },
    };
    nodemailer.createTransport = (() => transport) as unknown as typeof nodemailer.createTransport;
    const service = new EmailService();

    await service.sendVerificationEmail('user@example.com', 'token');
    await service.sendPasswordResetEmail('user@example.com', 'reset-token');

    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].to, 'user@example.com');
    assert.match(messages[0].text, /api\/auth\/verify\/token/);
    assert.match(messages[1].text, /reset-password\/reset-token/);
  });

  it('retries transient failures and eventually succeeds', async () => {
    let attempts = 0;
    const transport = {
      sendMail: async () => {
        attempts++;
        if (attempts < 3) {
          const error = new Error('connection timeout') as Error & { code: string };
          error.code = 'ETIMEDOUT';
          throw error;
        }
      },
    };
    nodemailer.createTransport = (() => transport) as unknown as typeof nodemailer.createTransport;
    const service = new EmailService();

    await service.sendVerificationEmail('user@example.com', 'token');

    assert.strictEqual(attempts, 3);
  });

  it('does not retry permanent failures', async () => {
    let attempts = 0;
    const transport = {
      sendMail: async () => {
        attempts++;
        const error = new Error('authentication failed') as Error & { responseCode: number };
        error.responseCode = 535;
        throw error;
      },
    };
    nodemailer.createTransport = (() => transport) as unknown as typeof nodemailer.createTransport;
    const service = new EmailService();

    await assert.rejects(() => service.sendVerificationEmail('user@example.com', 'token'));
    assert.strictEqual(attempts, 1);
  });
});
