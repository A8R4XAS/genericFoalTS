// std
import { strictEqual, ok } from 'assert';

// 3p
import { Context, getHookFunction, isHttpResponseUnauthorized, ServiceManager } from '@foal/core';
import * as jwt from 'jsonwebtoken';

// App
import { JwtRequired } from './jwt-required.hook';
import { User, UserRole } from '../entities';
import { dataSource } from '../../db';

const JWT_SECRET = 'test-jwt-secret-not-for-production';

function makeContext(authHeader?: string) {
  return new Context({
    get: (field: string) => (field === 'Authorization' ? authHeader : undefined),
  });
}

describe('JwtRequired hook', () => {
  let savedUser: User;

  before(async () => {
    await dataSource.initialize();
  });

  after(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await User.clear();

    savedUser = new User();
    savedUser.email = 'hook-test@example.com';
    savedUser.password = 'Password123';
    savedUser.firstName = 'Hook';
    savedUser.lastName = 'Tester';
    savedUser.role = UserRole.USER;
    await savedUser.save();
  });

  it('should return 401 when Authorization header is missing.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const ctx = makeContext(undefined);

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 401 when Authorization header does not start with "Bearer ".', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const ctx = makeContext('Token sometoken');

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 401 when token is invalid.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const ctx = makeContext('Bearer invalidtoken');

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 401 when token is signed with the wrong secret.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const token = jwt.sign({ userId: savedUser.id }, 'wrong-secret');
    const ctx = makeContext(`Bearer ${token}`);

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 401 when token is expired.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const token = jwt.sign({ userId: savedUser.id }, JWT_SECRET, { expiresIn: -1 });
    const ctx = makeContext(`Bearer ${token}`);

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 401 when userId in token does not match any user.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const token = jwt.sign({ userId: 99999 }, JWT_SECRET);
    const ctx = makeContext(`Bearer ${token}`);

    const response = await hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should attach the user to ctx and return nothing when token is valid.', async () => {
    const hookFn = getHookFunction(JwtRequired());
    const token = jwt.sign({ userId: savedUser.id }, JWT_SECRET);
    const ctx = makeContext(`Bearer ${token}`);

    const response = await hookFn(ctx, new ServiceManager());

    strictEqual(response, undefined, 'Expected no response (request proceeds)');
    ok(ctx.user, 'ctx.user should be set');
    strictEqual((ctx.user as User).id, savedUser.id);
    strictEqual((ctx.user as User).email, savedUser.email);
  });
});
