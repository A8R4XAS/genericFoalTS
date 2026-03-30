// std
import { ok, strictEqual } from 'assert';

// 3p
import { createApp } from '@foal/core';
import * as request from 'supertest';
import * as jwt from 'jsonwebtoken';

// App
import { AppController } from '../app/app.controller';
import { User } from '../app/entities';
import { dataSource } from '../db';

describe('[E2E] User Login & Token Refresh', () => {
  let app: any;

  before(async () => {
    await dataSource.initialize();
    app = await createApp(AppController);
  });

  after(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await User.clear();
  });

  describe('POST /api/auth/login', () => {
    it('should return JWT tokens for valid credentials', async () => {
      // Register a user first
      await request(app).post('/api/auth/register').send({
        email: 'logintest@example.com',
        password: 'Password123',
        firstName: 'Login',
        lastName: 'Test',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'logintest@example.com', password: 'Password123' })
        .expect(200);

      ok(response.body.accessToken, 'Should return an access token');
      ok(response.body.refreshToken, 'Should return a refresh token');
      strictEqual(response.body.tokenType, 'Bearer');

      // Verify access token payload
      const decoded = jwt.decode(response.body.accessToken) as jwt.JwtPayload;
      ok(decoded['userId'], 'Token should contain userId');
      ok(decoded['role'], 'Token should contain role');
    });

    it('should reject login with wrong password (401 Unauthorized)', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'wrongpass@example.com',
        password: 'Password123',
        firstName: 'Wrong',
        lastName: 'Pass',
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrongpass@example.com', password: 'WrongPassword1' })
        .expect(401);

      strictEqual(response.body.error, 'Invalid credentials');
    });

    it('should reject login for non-existent user (401 Unauthorized)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'Password123' })
        .expect(401);

      strictEqual(response.body.error, 'Invalid credentials');
    });

    it('should reject login with missing fields (400 Bad Request)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' })
        .expect(400);

      strictEqual(response.body.error, 'Validation failed');
    });

    it('should reject login with invalid email format (400 Bad Request)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'Password123' })
        .expect(400);

      strictEqual(response.body.error, 'Validation failed');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return a new access token from a valid refresh token', async () => {
      await request(app).post('/api/auth/register').send({
        email: 'refreshtest@example.com',
        password: 'Password123',
        firstName: 'Refresh',
        lastName: 'Test',
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'refreshtest@example.com', password: 'Password123' })
        .expect(200);

      const { refreshToken } = loginRes.body;

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      ok(response.body.accessToken, 'Should return a new access token');
      strictEqual(response.body.tokenType, 'Bearer');
    });

    it('should reject an invalid refresh token (401 Unauthorized)', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.value' })
        .expect(401);

      strictEqual(response.body.error, 'Invalid or expired refresh token');
    });

    it('should reject a missing refresh token (400 Bad Request)', async () => {
      const response = await request(app).post('/api/auth/refresh').send({}).expect(400);

      strictEqual(response.body.error, 'Validation failed');
    });
  });
});
