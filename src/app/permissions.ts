import { UserRole } from './entities';

/**
 * All available permissions in the application.
 */
export type Permission =
  | 'read:profile'
  | 'read:users'
  | 'write:users'
  | 'delete:users'
  | 'assign:roles'
  | 'moderate:content';

/**
 * Role-to-permissions mapping.
 * Each role is granted a specific set of permissions.
 *
 * Kept private to this module and frozen to prevent runtime mutation.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [UserRole.USER]: Object.freeze(['read:profile'] as Permission[]),
  [UserRole.MODERATOR]: Object.freeze([
    'read:profile',
    'read:users',
    'moderate:content',
  ] as Permission[]),
  [UserRole.ADMIN]: Object.freeze([
    'read:profile',
    'read:users',
    'write:users',
    'delete:users',
    'assign:roles',
    'moderate:content',
  ] as Permission[]),
}) satisfies Readonly<Record<UserRole, readonly Permission[]>>;

/**
 * Returns true if the given role has the specified permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions !== undefined && permissions.includes(permission);
}

/**
 * Returns the full list of permissions for a given role.
 * Returns a defensive copy so callers cannot mutate the global mapping.
 */
export function getPermissions(role: UserRole): Permission[] {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? [...permissions] : [];
}
