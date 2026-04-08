// std
import { strictEqual, ok } from 'assert';

// 3p
import {
  Context,
  createController,
  getHookFunction,
  getHttpMethod,
  getPath,
  isHttpResponseBadRequest,
  isHttpResponseForbidden,
  isHttpResponseNotFound,
  isHttpResponseOK,
  isHttpResponseUnauthorized,
} from '@foal/core';

// App
import { AdminController } from './admin.controller';
import { User, UserRole } from '../entities';
import { dataSource } from '../../db';
import { RequirePermission } from '../hooks';

/** Helper: create a Context with an authenticated user attached. */
function makeAuthCtx(user: User, body?: object, params?: object): Context {
  const ctx = new Context({ body: body ?? {}, params: params ?? {} });
  (ctx as any).user = user;
  return ctx;
}

/** Helper: create a Context without any authenticated user (unauthenticated). */
function makeUnauthCtx(): Context {
  return new Context({});
}

describe('AdminController', () => {
  let controller: AdminController;
  let adminUser: User;
  let regularUser: User;
  let moderatorUser: User;

  before(async () => {
    await dataSource.initialize();
  });

  after(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    controller = createController(AdminController);
    await User.clear();

    // Create admin user
    adminUser = new User();
    adminUser.email = 'admin@example.com';
    adminUser.password = 'Password123';
    adminUser.firstName = 'Admin';
    adminUser.lastName = 'User';
    adminUser.role = UserRole.ADMIN;
    await adminUser.save();

    // Create regular user
    regularUser = new User();
    regularUser.email = 'user@example.com';
    regularUser.password = 'Password123';
    regularUser.firstName = 'Regular';
    regularUser.lastName = 'User';
    regularUser.role = UserRole.USER;
    await regularUser.save();

    // Create moderator user
    moderatorUser = new User();
    moderatorUser.email = 'moderator@example.com';
    moderatorUser.password = 'Password123';
    moderatorUser.firstName = 'Moderator';
    moderatorUser.lastName = 'User';
    moderatorUser.role = UserRole.MODERATOR;
    await moderatorUser.save();
  });

  describe('has a "listUsers" method that', () => {
    it('should handle requests at GET /users.', () => {
      strictEqual(getHttpMethod(AdminController, 'listUsers'), 'GET');
      strictEqual(getPath(AdminController, 'listUsers'), '/users');
    });

    it('should return 401 for unauthenticated requests.', () => {
      const hook = getHookFunction(RequirePermission('read:users'));
      const result = hook(makeUnauthCtx(), null as any);
      strictEqual(isHttpResponseUnauthorized(result), true);
    });

    it('should return 403 for users with USER role.', () => {
      const hook = getHookFunction(RequirePermission('read:users'));
      const result = hook(makeAuthCtx(regularUser), null as any);
      strictEqual(isHttpResponseForbidden(result), true);
    });

    it('should allow access for users with MODERATOR role.', () => {
      const hook = getHookFunction(RequirePermission('read:users'));
      const result = hook(makeAuthCtx(moderatorUser), null as any);
      strictEqual(result === undefined || result === null, true);
    });

    it('should allow access for users with ADMIN role.', () => {
      const hook = getHookFunction(RequirePermission('read:users'));
      const result = hook(makeAuthCtx(adminUser), null as any);
      strictEqual(result === undefined || result === null, true);
    });

    it('should return all users without sensitive fields.', async () => {
      const response = await controller.listUsers();

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any[];
      ok(Array.isArray(body), 'Body should be an array');
      strictEqual(body.length, 3);
      ok(
        body.every(u => !('password' in u)),
        'Response should not include passwords'
      );
      ok(
        body.every(u => !('verificationToken' in u)),
        'Response should not include verification tokens'
      );
      ok(
        body.every(u => !('resetPasswordToken' in u)),
        'Response should not include reset password tokens'
      );
    });
  });

  describe('has an "assignRole" method that', () => {
    it('should handle requests at PATCH /users/:id/role.', () => {
      strictEqual(getHttpMethod(AdminController, 'assignRole'), 'PATCH');
      strictEqual(getPath(AdminController, 'assignRole'), '/users/:id/role');
    });

    it('should allow an admin to assign a role to a user.', async () => {
      const ctx = makeAuthCtx(
        adminUser,
        { role: UserRole.MODERATOR },
        { id: regularUser.id.toString() }
      );
      const response = await controller.assignRole(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      const body = response.body as any;
      strictEqual(body.role, UserRole.MODERATOR);

      // Verify the role was persisted
      const updated = await User.findOneBy({ id: regularUser.id });
      strictEqual(updated?.role, UserRole.MODERATOR);
    });

    it('should return 404 when the target user does not exist.', async () => {
      const ctx = makeAuthCtx(adminUser, { role: UserRole.MODERATOR }, { id: '99999' });
      const response = await controller.assignRole(ctx);

      if (!isHttpResponseNotFound(response)) {
        throw new Error('The response should be an instance of HttpResponseNotFound.');
      }
    });

    it('should return 400 when an invalid role is provided.', async () => {
      const ctx = makeAuthCtx(adminUser, { role: 'superuser' }, { id: regularUser.id.toString() });
      const response = await controller.assignRole(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }
    });

    it('should return 400 when an invalid user ID is provided.', async () => {
      const ctx = makeAuthCtx(adminUser, { role: UserRole.MODERATOR }, { id: 'not-a-number' });
      const response = await controller.assignRole(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }
    });

    it('should return 400 when a partial-numeric user ID is provided.', async () => {
      const ctx = makeAuthCtx(adminUser, { role: UserRole.MODERATOR }, { id: '1abc' });
      const response = await controller.assignRole(ctx);

      if (!isHttpResponseBadRequest(response)) {
        throw new Error('The response should be an instance of HttpResponseBadRequest.');
      }
    });

    it('should allow assigning all valid roles.', async () => {
      for (const role of Object.values(UserRole)) {
        const ctx = makeAuthCtx(adminUser, { role }, { id: regularUser.id.toString() });
        const response = await controller.assignRole(ctx);

        if (!isHttpResponseOK(response)) {
          throw new Error(`The response should be HttpResponseOK for role: ${role}`);
        }

        const body = response.body as any;
        strictEqual(body.role, role);
      }
    });
  });
});
