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
import { Permission, PermissionRequired } from './permission-required.hook';
import { User, UserRole } from '../entities';

function makeContextWithUser(user: Partial<User> | null): Context {
  const ctx = new Context({});
  ctx.user = user as User;
  return ctx;
}

describe('PermissionRequired hook', () => {
  it('should return 401 when ctx.user is null.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.MANAGE_USERS));
    const ctx = makeContextWithUser(null);

    const response = hookFn(ctx, new ServiceManager());

    ok(isHttpResponseUnauthorized(response), 'Expected HttpResponseUnauthorized');
  });

  it('should return 403 when a USER tries to access an ADMIN-only permission.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.MANAGE_USERS));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(isHttpResponseForbidden(response), 'Expected HttpResponseForbidden');
  });

  it('should return 403 when a USER tries to access READ_ANY_PROFILE.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.READ_ANY_PROFILE));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(isHttpResponseForbidden(response), 'Expected HttpResponseForbidden');
  });

  it('should return nothing when a USER accesses READ_OWN_PROFILE.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.READ_OWN_PROFILE));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when a USER accesses UPDATE_OWN_PROFILE.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.UPDATE_OWN_PROFILE));
    const ctx = makeContextWithUser({ role: UserRole.USER });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when an ADMIN accesses MANAGE_USERS.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.MANAGE_USERS));
    const ctx = makeContextWithUser({ role: UserRole.ADMIN });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when an ADMIN accesses DELETE_ANY_USER.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.DELETE_ANY_USER));
    const ctx = makeContextWithUser({ role: UserRole.ADMIN });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });

  it('should return nothing when an ADMIN accesses READ_OWN_PROFILE.', () => {
    const hookFn = getHookFunction(PermissionRequired(Permission.READ_OWN_PROFILE));
    const ctx = makeContextWithUser({ role: UserRole.ADMIN });

    const response = hookFn(ctx, new ServiceManager());

    ok(response === undefined, 'Expected no response (request proceeds)');
  });
});
