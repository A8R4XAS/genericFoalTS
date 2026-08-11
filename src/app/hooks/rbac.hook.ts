import { Hook, HookDecorator, HttpResponseForbidden, HttpResponseUnauthorized } from '@foal/core';
import { UserRole } from '../entities';
import { Permission, hasPermission } from '../permissions';

/** Shape of the authenticated user as stored on the Context. */
type AuthenticatedUser = { role?: UserRole };

/**
 * Hook that restricts access to users with one of the specified roles.
 * Returns 401 if no authenticated user is present.
 * Returns 403 if the user does not have a required role.
 *
 * When called with no arguments, any authenticated user is allowed through.
 *
 * @example
 * \@Get('/admin-only')
 * \@RequireRole(UserRole.ADMIN)
 * adminOnly(ctx: Context) { ... }
 */
export function RequireRole(...roles: UserRole[]): HookDecorator {
  return Hook(ctx => {
    const user = ctx.user as AuthenticatedUser | undefined;

    if (!user) {
      return new HttpResponseUnauthorized({ error: 'Authentication required' });
    }

    // When no roles are specified, any authenticated user is allowed.
    if (roles.length > 0 && !roles.includes(user.role as UserRole)) {
      return new HttpResponseForbidden({ error: 'Insufficient role' });
    }
  });
}

/**
 * Hook that restricts access to users whose role grants the specified permission.
 * Returns 401 if no authenticated user is present.
 * Returns 403 if the user's role does not include the required permission.
 *
 * @example
 * \@Get('/users')
 * \@RequirePermission('read:users')
 * listUsers(ctx: Context) { ... }
 */
export function RequirePermission(permission: Permission): HookDecorator {
  return Hook(ctx => {
    const user = ctx.user as AuthenticatedUser | undefined;

    if (!user) {
      return new HttpResponseUnauthorized({ error: 'Authentication required' });
    }

    if (!user.role || !hasPermission(user.role, permission)) {
      return new HttpResponseForbidden({ error: 'Insufficient permissions' });
    }
  });
}
