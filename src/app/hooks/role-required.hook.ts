// 3p
import {
  Context,
  Hook,
  HookDecorator,
  HttpResponseForbidden,
  HttpResponseUnauthorized,
} from '@foal/core';

// App
import { User, UserRole } from '../entities';

/**
 * Hook that requires the authenticated user to have at least one of the specified roles.
 * Must be applied after `JwtRequired` (or another hook that sets `ctx.user`).
 *
 * Returns 401 Unauthorized if no user is attached to the context.
 * Returns 403 Forbidden if the user's role does not match any of the required roles.
 *
 * @param roles - One or more roles that are permitted to access the route.
 */
export function RoleRequired(...roles: UserRole[]): HookDecorator {
  if (roles.length === 0) {
    throw new Error('RoleRequired called with no roles. Provide at least one UserRole.');
  }

  return Hook((ctx: Context) => {
    const user = ctx.user as User | null;

    if (!user) {
      return new HttpResponseUnauthorized({ error: 'Authentication required' });
    }

    if (!roles.includes(user.role)) {
      return new HttpResponseForbidden({ error: 'Insufficient role' });
    }
  });
}
