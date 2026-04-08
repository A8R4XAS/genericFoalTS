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
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.USER]: ['read:profile'],
  [UserRole.MODERATOR]: ['read:profile', 'read:users', 'moderate:content'],
  [UserRole.ADMIN]: [
    'read:profile',
    'read:users',
    'write:users',
    'delete:users',
    'assign:roles',
    'moderate:content',
  ],
};

/**
 * Returns true if the given role has the specified permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions !== undefined && permissions.includes(permission);
}

/**
 * Returns the full list of permissions for a given role.
 */
export function getPermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
