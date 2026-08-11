// std
import { strictEqual } from 'assert';

// 3p
import {
  Context,
  getHookFunction,
  isHttpResponseForbidden,
  isHttpResponseUnauthorized,
} from '@foal/core';

// App
import { UserRole } from '../entities';
import { RequireRole, RequirePermission } from './rbac.hook';

/**
 * Helper: create a Context with an optional user attached.
 */
function makeCtx(user?: { role: UserRole }): Context {
  const ctx = new Context({});
  (ctx as any).user = user;
  return ctx;
}

describe('RequireRole hook', () => {
  it('should return 401 when no user is in the context', () => {
    const hook = getHookFunction(RequireRole(UserRole.ADMIN));
    const ctx = makeCtx(undefined);
    const result = hook(ctx, null as any);
    strictEqual(isHttpResponseUnauthorized(result), true);
  });

  it('should return 403 when the user does not have the required role', () => {
    const hook = getHookFunction(RequireRole(UserRole.ADMIN));
    const ctx = makeCtx({ role: UserRole.USER });
    const result = hook(ctx, null as any);
    strictEqual(isHttpResponseForbidden(result), true);
  });

  it('should not return an error response when the user has the required role', () => {
    const hook = getHookFunction(RequireRole(UserRole.ADMIN));
    const ctx = makeCtx({ role: UserRole.ADMIN });
    const result = hook(ctx, null as any);
    strictEqual(result === undefined || result === null, true);
  });

  it('should allow access if the user matches any of multiple allowed roles', () => {
    const hook = getHookFunction(RequireRole(UserRole.ADMIN, UserRole.MODERATOR));
    const ctx = makeCtx({ role: UserRole.MODERATOR });
    const result = hook(ctx, null as any);
    strictEqual(result === undefined || result === null, true);
  });
});

describe('RequirePermission hook', () => {
  it('should return 401 when no user is in the context', () => {
    const hook = getHookFunction(RequirePermission('assign:roles'));
    const ctx = makeCtx(undefined);
    const result = hook(ctx, null as any);
    strictEqual(isHttpResponseUnauthorized(result), true);
  });

  it('should return 403 when the user role lacks the required permission', () => {
    const hook = getHookFunction(RequirePermission('assign:roles'));
    const ctx = makeCtx({ role: UserRole.USER });
    const result = hook(ctx, null as any);
    strictEqual(isHttpResponseForbidden(result), true);
  });

  it('should not return an error response when the user has the required permission', () => {
    const hook = getHookFunction(RequirePermission('assign:roles'));
    const ctx = makeCtx({ role: UserRole.ADMIN });
    const result = hook(ctx, null as any);
    strictEqual(result === undefined || result === null, true);
  });

  it('moderator should be allowed to moderate:content', () => {
    const hook = getHookFunction(RequirePermission('moderate:content'));
    const ctx = makeCtx({ role: UserRole.MODERATOR });
    const result = hook(ctx, null as any);
    strictEqual(result === undefined || result === null, true);
  });

  it('user should not be allowed to moderate:content', () => {
    const hook = getHookFunction(RequirePermission('moderate:content'));
    const ctx = makeCtx({ role: UserRole.USER });
    const result = hook(ctx, null as any);
    strictEqual(isHttpResponseForbidden(result), true);
  });
});
