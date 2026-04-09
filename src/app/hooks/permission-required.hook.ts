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
 * Application-level permissions.
 * Permissions represent fine-grained access rights and are derived from a user's role.
 */
export enum Permission {
  READ_OWN_PROFILE = 'read:own:profile',
  UPDATE_OWN_PROFILE = 'update:own:profile',
  READ_ANY_PROFILE = 'read:any:profile',
  UPDATE_ANY_PROFILE = 'update:any:profile',
  DELETE_ANY_USER = 'delete:any:user',
  MANAGE_USERS = 'manage:users',
}

/**
 * Role-to-permission mapping.
 * Each role is granted a specific set of permissions.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.USER]: [Permission.READ_OWN_PROFILE, Permission.UPDATE_OWN_PROFILE],
  [UserRole.ADMIN]: [
    Permission.READ_OWN_PROFILE,
    Permission.UPDATE_OWN_PROFILE,
    Permission.READ_ANY_PROFILE,
    Permission.UPDATE_ANY_PROFILE,
    Permission.DELETE_ANY_USER,
    Permission.MANAGE_USERS,
  ],
};

/**
 * Hook that requires the authenticated user to hold the specified permission.
 * Must be applied after `JwtRequired` (or another hook that sets `ctx.user`).
 *
 * Returns 401 Unauthorized if no user is attached to the context.
 * Returns 403 Forbidden if the user does not have the required permission.
 *
 * @param permission - The permission required to access the route.
 */
export function PermissionRequired(permission: Permission): HookDecorator {
  return Hook((ctx: Context) => {
    const user = ctx.user as User | null;

    if (!user) {
      return new HttpResponseUnauthorized({ error: 'Authentication required' });
    }

    const userPermissions = ROLE_PERMISSIONS[user.role] ?? [];

    if (!userPermissions.includes(permission)) {
      return new HttpResponseForbidden({ error: 'Insufficient permissions' });
    }
  });
}
