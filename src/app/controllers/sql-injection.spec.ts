/**
 * SQL-Injection Security Tests
 *
 * Diese Tests prüfen, dass die Anwendung keine SQL-Injection-Schwachstellen aufweist.
 * Alle Datenbankzugriffe nutzen TypeORM-ORM-Methoden (findOne, findOneBy, find, save),
 * die intern parameterisierte Queries verwenden und damit Injection-Angriffe verhindern.
 * Eingaben werden zusätzlich durch Zod-Schemas validiert und gesäubert.
 *
 * Getestete Endpunkte:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   GET  /api/auth/verify/:token
 *   POST /api/auth/resend-verification
 *   POST /api/auth/forgot-password
 *   POST /api/auth/reset-password/:token
 */

// std
import { ok, strictEqual } from 'assert';

// 3p
import {
  Context,
  createController,
  isHttpResponseBadRequest,
  isHttpResponseOK,
  isHttpResponseUnauthorized,
} from '@foal/core';

// App
import { AuthController } from './auth.controller';
import { User } from '../entities';
import { dataSource } from '../../db';
import { EmailService } from '../services';

/**
 * Common SQL-Injection payload strings used across all test cases.
 * These cover classic UNION-based, boolean-based, time-based and
 * stacked-query patterns.
 */
/* eslint-disable @typescript-eslint/quotes, prettier/prettier */
const SQL_INJECTION_PAYLOADS = [
  // Classic single-quote bypass
  "' OR '1'='1",
  // Comment-based bypass
  "' OR 1=1 --",
  "admin'--",
  // UNION-based injection
  "' UNION SELECT 1,2,3 --",
  "' UNION SELECT null, username, password FROM users --",
  // Boolean-based blind injection
  "' AND 1=1 --",
  "' AND 1=2 --",
  // Time-based blind injection (PostgreSQL)
  "'; SELECT pg_sleep(5) --",
  // Stacked queries
  "'; DROP TABLE users; --",
  "'; INSERT INTO users (email) VALUES ('hacked@evil.com'); --",
  // Null byte injection
  "' OR 1=1\x00",
  // Double-quote variant
  '" OR "1"="1',
];
/* eslint-enable @typescript-eslint/quotes, prettier/prettier */

describe('SQL Injection Security Tests', () => {
  let controller: AuthController;

  before(async () => {
    // Initialize the database connection once for the whole suite
    await dataSource.initialize();
  });

  after(async () => {
    // Tear down the database connection after all tests
    await dataSource.destroy();
  });

  beforeEach(async () => {
    controller = createController(AuthController);

    // Stub email service so no real emails are sent during security tests
    controller.emailService = {
      sendVerificationEmail: async () => {},
      sendPasswordResetEmail: async () => {},
    } as EmailService;

    // Start each test with an empty users table
    await User.clear();
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/register – Registrierung
  // ---------------------------------------------------------------------------
  describe('POST /register – SQL-Injection in Registrierungsfeldern', () => {
    /**
     * Zod-Schema erwartet eine gültige E-Mail-Adresse. SQL-Injection-Payloads
     * sind keine gültigen E-Mail-Adressen und werden daher mit 400 Bad Request
     * abgelehnt, bevor sie die Datenbankschicht erreichen.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should reject SQL payload in email field: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({
          body: {
            email: payload,
            password: 'ValidPass1',
            firstName: 'Test',
            lastName: 'User',
          },
        });

        const response = await controller.register(ctx);

        // Must be rejected before hitting the database
        ok(
          isHttpResponseBadRequest(response),
          `Expected 400 Bad Request for email payload "${payload}", got ${(response as any)?.constructor?.name}`
        );
      });
    }

    /**
     * Injection im firstName-Feld: Das Zod-Schema begrenzt auf max. 100 Zeichen
     * und trimmt den Wert, übergibt ihn dann aber als string. TypeORM verwendet
     * parameterisierte Queries, daher ist kein Injection-Risiko vorhanden.
     * Der Request muss entweder erfolgreich sein (wenn Payload gültig ist) oder
     * mit 400 abgelehnt werden – der Datenbankinhalt darf nicht manipuliert sein.
     */
    it('should safely store SQL payload in firstName without affecting DB integrity', async () => {
      // eslint-disable-next-line @typescript-eslint/quotes, prettier/prettier
      const payload = "O'Brien"; // Single quote – gültiger Name, kein Angriff

      const ctx = new Context({
        body: {
          email: 'firstname-test@example.com',
          password: 'ValidPass1',
          firstName: payload,
          lastName: 'User',
        },
      });

      await controller.register(ctx);

      // Verify that the value was stored as-is, not interpreted as SQL
      const user = await User.findOne({ where: { email: 'firstname-test@example.com' } });
      ok(user, 'User should have been saved');
      strictEqual(user?.firstName, payload, 'firstName should be stored verbatim');

      // No extra users should have been created
      const count = await User.count();
      strictEqual(count, 1, 'Exactly one user should exist in the database');
    });

    /**
     * Injection im lastName-Feld: Gleiche Sicherheitsanforderung wie firstName.
     */
    it('should safely store SQL payload in lastName without affecting DB integrity', async () => {
      // eslint-disable-next-line @typescript-eslint/quotes, prettier/prettier
      const payload = "'; DROP TABLE users; --"; // Enthält SQL, aber als Datenstring

      const ctx = new Context({
        body: {
          email: 'lastname-test@example.com',
          password: 'ValidPass1',
          firstName: 'Test',
          lastName: payload,
        },
      });

      await controller.register(ctx);

      const user = await User.findOne({ where: { email: 'lastname-test@example.com' } });
      ok(user, 'User should have been saved despite SQL-like lastName');
      strictEqual(user?.lastName, payload, 'lastName should be stored verbatim, not executed');

      // The users table must still exist and contain exactly one row
      const count = await User.count();
      strictEqual(count, 1, 'Table must not have been dropped; exactly one user should exist');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/login – Anmeldung
  // ---------------------------------------------------------------------------
  describe('POST /login – SQL-Injection in Login-Feldern', () => {
    /**
     * Classic authentication bypass: "' OR '1'='1" als E-Mail.
     * Zod lehnt diese als ungültige E-Mail-Adresse ab.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should reject SQL payload in login email: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({
          body: {
            email: payload,
            password: 'AnyPassword1',
          },
        });

        const response = await controller.login(ctx);

        // Entweder 400 (Validierungsfehler) oder 401 (falsche Credentials),
        // niemals 200 OK mit einem echten Token
        ok(
          isHttpResponseBadRequest(response) || isHttpResponseUnauthorized(response),
          `Expected 400 or 401 for login with SQL email payload "${payload}"`
        );
      });
    }

    /**
     * SQL-Payload im Passwort-Feld: Zod erfordert nur min. 1 Zeichen.
     * Das Passwort wird gegen bcrypt-Hash verglichen – kein SQL-Kontext.
     * Der Login muss scheitern (Benutzer existiert nicht).
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should not authenticate with SQL payload as password: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({
          body: {
            email: 'nonexistent@example.com',
            password: payload,
          },
        });

        const response = await controller.login(ctx);

        // Must fail – either validation error or invalid credentials
        ok(
          isHttpResponseBadRequest(response) || isHttpResponseUnauthorized(response),
          `Login must not succeed with SQL injection payload as password "${payload}"`
        );
      });
    }

    /**
     * Prüft, dass ein gültiger Benutzer sich trotz SQL-ähnlicher (aber regulärer)
     * Passwort-Eingabe nicht anmelden kann, sofern das Passwort falsch ist.
     */
    it('should not bypass authentication via SQL payload as password for existing user', async () => {
      // Lege einen echten Benutzer an
      const user = new User();
      user.email = 'victim@example.com';
      user.password = 'CorrectPass1'; // wird durch BeforeInsert gehasht
      user.firstName = 'Victim';
      user.lastName = 'User';
      await user.save();

      // Versuche, ihn mit einem SQL-Injection-Passwort anzumelden
      const ctx = new Context({
        body: {
          email: 'victim@example.com',
          // eslint-disable-next-line @typescript-eslint/quotes, prettier/prettier
          password: "' OR '1'='1",
        },
      });

      const response = await controller.login(ctx);

      // Muss mit 401 scheitern – bcrypt-Vergleich ist nicht durch SQL beeinflussbar
      ok(
        isHttpResponseBadRequest(response) || isHttpResponseUnauthorized(response),
        'Authentication bypass via SQL payload in password field must not succeed'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/auth/verify/:token – E-Mail-Verifizierung
  // ---------------------------------------------------------------------------
  describe('GET /verify/:token – SQL-Injection im Verifizierungs-Token', () => {
    /**
     * Das Token ist ein URL-Parameter und wird direkt an TypeORM übergeben.
     * Durch die parameterisierte Query (findOne({ where: { verificationToken: token } }))
     * kann ein SQL-Payload nicht ausgeführt werden – er wird als literaler String
     * behandelt und findet keinen Treffer.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should return 400 for SQL payload as verification token: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({ params: { token: payload } });

        const response = await controller.verifyEmail(ctx);

        // Kein Benutzer mit diesem Token → 400 Bad Request
        ok(
          isHttpResponseBadRequest(response),
          `Expected 400 for verification token SQL payload "${payload}"`
        );
      });
    }

    /**
     * Stellt sicher, dass die Datenbank nach den Injektionsversuchen noch integer ist.
     */
    it('should leave the database intact after multiple SQL injection attempts on verify endpoint', async () => {
      // Lege einen verifizierten und einen unverifizierten Benutzer an
      const verifiedUser = new User();
      verifiedUser.email = 'verified@example.com';
      verifiedUser.password = 'ValidPass1';
      verifiedUser.firstName = 'Alice';
      verifiedUser.lastName = 'Smith';
      verifiedUser.isVerified = true;
      await verifiedUser.save();

      // Sende alle Injection-Payloads als Tokens
      for (const payload of SQL_INJECTION_PAYLOADS) {
        const ctx = new Context({ params: { token: payload } });
        await controller.verifyEmail(ctx);
      }

      // Datenbank muss unverändert sein
      const count = await User.count();
      strictEqual(count, 1, 'User count must not change after injection attempts');

      const dbUser = await User.findOne({ where: { email: 'verified@example.com' } });
      ok(dbUser?.isVerified, 'User verification status must not be modified');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/resend-verification – Verifizierungs-E-Mail erneut senden
  // ---------------------------------------------------------------------------
  describe('POST /resend-verification – SQL-Injection in E-Mail-Feld', () => {
    /**
     * Zod-Schema erfordert eine gültige E-Mail-Adresse.
     * SQL-Injection-Payloads werden daher vor der Datenbankabfrage abgelehnt.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should reject SQL payload in resend-verification email: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({ body: { email: payload } });

        const response = await controller.resendVerification(ctx);

        ok(
          isHttpResponseBadRequest(response) || isHttpResponseOK(response),
          `Expected 400 or 200 for resend-verification payload "${payload}"`
        );

        // Bei 200 darf kein Token generiert worden sein (Benutzer existiert nicht)
        if (isHttpResponseOK(response)) {
          const count = await User.count();
          strictEqual(count, 0, 'No user should have been created by a SQL injection payload');
        }
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/forgot-password – Passwort vergessen
  // ---------------------------------------------------------------------------
  describe('POST /forgot-password – SQL-Injection in E-Mail-Feld', () => {
    /**
     * Gleiche Schutzmaßnahme wie bei resend-verification:
     * Zod lehnt ungültige E-Mail-Formate ab.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should reject SQL payload in forgot-password email: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({ body: { email: payload } });

        const response = await controller.forgotPassword(ctx);

        ok(
          isHttpResponseBadRequest(response) || isHttpResponseOK(response),
          `Expected 400 or 200 for forgot-password payload "${payload}"`
        );

        // Kein Benutzer darf geändert oder angelegt worden sein
        const count = await User.count();
        strictEqual(count, 0, 'No user should be affected by SQL injection in forgot-password');
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/auth/reset-password/:token – Passwort zurücksetzen
  // ---------------------------------------------------------------------------
  describe('POST /reset-password/:token – SQL-Injection im Reset-Token', () => {
    /**
     * Das Token wird per SHA-256 gehasht und gegen den gespeicherten Hash verglichen.
     * Selbst wenn ein Payload-Token einen SQL-Charakter enthält, trifft er nie
     * auf einen passenden Hash in der Datenbank.
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should return 400 for SQL payload as reset token: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({
          params: { token: payload },
          body: { password: 'NewValidPass1' },
        });

        const response = await controller.resetPassword(ctx);

        ok(
          isHttpResponseBadRequest(response),
          `Expected 400 for reset-password with SQL token payload "${payload}"`
        );
      });
    }

    /**
     * Stellt sicher, dass Injektionsversuche im Passwort-Feld des Reset-Endpunkts
     * abgelehnt werden (Zod-Validierung).
     */
    for (const payload of SQL_INJECTION_PAYLOADS) {
      it(`should reject SQL payload in new password field: ${JSON.stringify(payload)}`, async () => {
        const ctx = new Context({
          params: { token: 'somevalidtoken' },
          body: { password: payload },
        });

        const response = await controller.resetPassword(ctx);

        // Payload erfüllt nicht die Passwort-Anforderungen (Groß-/Kleinbuchstaben,
        // Ziffern) oder es gibt keinen passenden Reset-Token → 400
        ok(
          isHttpResponseBadRequest(response),
          `Expected 400 for reset-password with SQL payload as new password "${payload}"`
        );
      });
    }
  });
});
