// std
import { strictEqual, deepStrictEqual, ok } from 'assert';

// App
import { UserRole } from './entities';
import { hasPermission, getPermissions, ROLE_PERMISSIONS, Permission } from './permissions';

describe('Permissions', () => {
  describe('ROLE_PERMISSIONS', () => {
    it('should define permissions for all roles', () => {
      for (const role of Object.values(UserRole)) {
        ok(Array.isArray(ROLE_PERMISSIONS[role]), `Missing permissions for role: ${role}`);
      }
    });

    it('user role should only have read:profile permission', () => {
      deepStrictEqual(ROLE_PERMISSIONS[UserRole.USER], ['read:profile']);
    });

    it('moderator role should have read:profile, read:users and moderate:content permissions', () => {
      const moderatorPermissions = ROLE_PERMISSIONS[UserRole.MODERATOR];
      ok(moderatorPermissions.includes('read:profile'));
      ok(moderatorPermissions.includes('read:users'));
      ok(moderatorPermissions.includes('moderate:content'));
    });

    it('admin role should have all permissions', () => {
      const adminPermissions = ROLE_PERMISSIONS[UserRole.ADMIN];
      const allPermissions: Permission[] = [
        'read:profile',
        'read:users',
        'write:users',
        'delete:users',
        'assign:roles',
        'moderate:content',
      ];
      for (const permission of allPermissions) {
        ok(adminPermissions.includes(permission), `Admin should have permission: ${permission}`);
      }
    });
  });

  describe('hasPermission', () => {
    it('should return true for a permission the role has', () => {
      strictEqual(hasPermission(UserRole.USER, 'read:profile'), true);
      strictEqual(hasPermission(UserRole.MODERATOR, 'read:users'), true);
      strictEqual(hasPermission(UserRole.ADMIN, 'assign:roles'), true);
    });

    it('should return false for a permission the role does not have', () => {
      strictEqual(hasPermission(UserRole.USER, 'read:users'), false);
      strictEqual(hasPermission(UserRole.USER, 'assign:roles'), false);
      strictEqual(hasPermission(UserRole.MODERATOR, 'assign:roles'), false);
      strictEqual(hasPermission(UserRole.MODERATOR, 'delete:users'), false);
    });
  });

  describe('getPermissions', () => {
    it('should return the permissions array for each role', () => {
      deepStrictEqual(getPermissions(UserRole.USER), ROLE_PERMISSIONS[UserRole.USER]);
      deepStrictEqual(getPermissions(UserRole.MODERATOR), ROLE_PERMISSIONS[UserRole.MODERATOR]);
      deepStrictEqual(getPermissions(UserRole.ADMIN), ROLE_PERMISSIONS[UserRole.ADMIN]);
    });

    it('should return a defensive copy that does not mutate the global mapping', () => {
      const role = UserRole.MODERATOR;
      const originalPermissions = [...ROLE_PERMISSIONS[role]];
      const permissions = getPermissions(role);

      permissions.push('assign:roles');

      deepStrictEqual(ROLE_PERMISSIONS[role], originalPermissions);
    });
  });
});
