// 3p
import { Config, Logger, PasswordService, ServiceManager } from '@foal/core';
import * as jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

// App
import { User, UserRole } from '../app/entities';
import { dataSource } from '../db';

const TEST_EMAIL = `jwt-test-${randomBytes(4).toString('hex')}@test.de`;
const TEST_PASSWORD = 'Test1234!';

export async function main(_args: any, services: ServiceManager, logger: Logger) {
  await dataSource.initialize();

  try {
    const passwordService = services.get(PasswordService);
    const secret = Config.getOrThrow('jwt.secret', 'string');
    const accessExpiresIn = Config.get('jwt.accessTokenExpiresIn', 'string', '15m');
    const refreshExpiresIn = Config.get('jwt.refreshTokenExpiresIn', 'string', '7d');

    // ─── 1. User anlegen ──────────────────────────────────────────────
    logger.info('1. Erstelle Testuser...');
    const user = new User();
    user.email = TEST_EMAIL;
    user.firstName = 'JWT';
    user.lastName = 'Test';
    user.role = UserRole.USER;
    user.isVerified = false;
    user.verificationToken = null;
    user.password = await passwordService.hashPassword(TEST_PASSWORD);
    await user.save();
    logger.info(`   User erstellt: id=${user.id}, email=${user.email}`);

    // ─── 2. Passwort verifizieren (Login-Simulation) ──────────────────
    logger.info('2. Verifiziere Passwort...');
    const passwordValid = await passwordService.verifyPassword(TEST_PASSWORD, user.password);
    if (!passwordValid) {
      throw new Error('Passwort-Verifikation fehlgeschlagen!');
    }
    logger.info('   Passwort korrekt.');

    // ─── 3. Tokens signieren ──────────────────────────────────────────
    logger.info('3. Signiere Access- und Refresh-Token...');
    const payload = { sub: user.id.toString(), userId: user.id, role: user.role };

    const accessToken = jwt.sign(payload, secret, {
      expiresIn: accessExpiresIn,
    } as jwt.SignOptions);
    const refreshToken = jwt.sign(payload, secret, {
      expiresIn: refreshExpiresIn,
    } as jwt.SignOptions);
    logger.info(`   Access Token:  ${accessToken}`);
    logger.info(`   Refresh Token: ${refreshToken}`);

    // ─── 4. Access Token verifizieren ────────────────────────────────
    logger.info('4. Verifiziere Access Token...');
    const decoded = jwt.verify(accessToken, secret) as jwt.JwtPayload;
    if (decoded.sub !== user.id.toString() || decoded['userId'] !== user.id) {
      throw new Error('Token-Payload stimmt nicht überein!');
    }
    logger.info(
      `   Decoded payload: sub=${decoded.sub}, userId=${decoded['userId']}, role=${decoded['role']}`
    );

    // ─── 5. User via sub aus DB laden (wie JWTRequired) ──────────────
    logger.info('5. Lade User via sub (wie JWTRequired-Hook)...');
    const foundUser = await User.findOneBy({ id: Number(decoded.sub) });
    if (!foundUser) {
      throw new Error('User via sub nicht gefunden!');
    }
    logger.info(`   User gefunden: ${foundUser.email}`);

    // ─── 6. Refresh Token → neuen Access Token ausstellen ────────────
    logger.info('6. Stelle neuen Access Token via Refresh Token aus...');
    const decodedRefresh = jwt.verify(refreshToken, secret) as jwt.JwtPayload;
    const refreshedUser = await User.findOne({ where: { id: decodedRefresh['userId'] } });
    if (!refreshedUser) {
      throw new Error('User beim Refresh nicht gefunden!');
    }
    const newPayload = {
      sub: refreshedUser.id.toString(),
      userId: refreshedUser.id,
      role: refreshedUser.role,
    };
    const newAccessToken = jwt.sign(newPayload, secret, {
      expiresIn: accessExpiresIn,
    } as jwt.SignOptions);
    logger.info(`   Neuer Access Token: ${newAccessToken}`);

    // ─── 7. Abgelaufenen Token testen ────────────────────────────────
    logger.info('7. Teste Verifikation eines abgelaufenen Tokens...');
    const expiredToken = jwt.sign(payload, secret, { expiresIn: 0 } as jwt.SignOptions);
    try {
      jwt.verify(expiredToken, secret);
      throw new Error('Abgelaufener Token wurde akzeptiert – das ist ein Fehler!');
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        logger.info('   Abgelaufener Token korrekt abgelehnt (TokenExpiredError).');
      } else {
        throw err;
      }
    }

    // ─── 8. Manipulierten Token testen ───────────────────────────────
    logger.info('8. Teste Verifikation eines manipulierten Tokens...');
    const tamperedToken = accessToken.slice(0, -5) + 'XXXXX';
    try {
      jwt.verify(tamperedToken, secret);
      throw new Error('Manipulierter Token wurde akzeptiert – das ist ein Fehler!');
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        logger.info('   Manipulierter Token korrekt abgelehnt (JsonWebTokenError).');
      } else {
        throw err;
      }
    }

    logger.info('');
    logger.info('Alle Tests bestanden!');
  } finally {
    // Testuser aufräumen
    await User.delete({ email: TEST_EMAIL });
    await dataSource.destroy();
  }
}
