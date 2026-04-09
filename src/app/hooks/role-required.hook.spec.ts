// std
import { ok } from 'assert';

// 3p
import {
  Context,
  getHookFunction,
  isHttpResponseForbidden,
  isHttpResponseUnauthorized,
  ServiceManager,
} from '@foal/core';

// App
import { RoleRequired } from './role-required.hook';
import { User, UserRole } from '../entities';

function makeContextWithUser(user: Partial<User> | null): Context {
  const ctx = new Context({});
  ctx.user = user as User;
  return ctx;
}

describe('RoleRequired hook', () => {
  it('should throw when called with no roles.', () => {
    let threw = false;
    try {
      RoleRequired();
    } catch (err: unknown) {
      threw = true;
      ok(
        err instanceof Error && err.message.includes('no roles'),
        'Expected an error mentioning "no roles"'
      );
    }
    ok(threw, 'Expected RoleRequired() to throw');
  });

  it('should return 401 when ctx.user is null.', () => {
    const hookFn = getHookFunction(RoleRequired(UserRole.ADMIN));
    const ctx = makeContextWithUser(null);

    const response = hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 403 when the user role does not match any required role.', () => {
    const hookFn = getHookFunction(RoleRequired(UserRole.ADMIN));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(isHttpResponseForbidden(response), 'Expected HttpResponseForbidden');
  });

  it('should return nothing when the user has the required role.', () => {
    const hookFn = getHookFunction(RoleRequired(UserRole.ADMIN));
    const ctx = makeContextWithUser({ role: UserRole.ADMIN });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when the user has one of the required roles.', () => {
    const hookFn = getHookFunction(RoleRequired(UserRole.USER, UserRole.ADMIN));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when the user has the only required role.', () => {
    const hookFn = getHookFunction(RoleRequired(UserRole.USER));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });
});
