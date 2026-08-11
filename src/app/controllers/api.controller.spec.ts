// std
import { strictEqual } from 'assert';

// 3p
import { Context, createController, getHttpMethod, getPath, isHttpResponseOK } from '@foal/core';

// App
import { ApiController } from './api.controller';
import { User, UserRole } from '../entities';

describe('ApiController', () => {
  describe('has a "index" method that', () => {
    it('should handle requests at GET /.', () => {
      strictEqual(getHttpMethod(ApiController, 'index'), 'GET');
      strictEqual(getPath(ApiController, 'index'), '/');
    });

    it('should return a HttpResponseOK.', () => {
      const controller = createController(ApiController);
      const ctx = new Context({});

      const response = controller.index(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(response.body, 'Hello world!');
    });
  });

  describe('has an "adminDashboard" method that', () => {
    it('should handle requests at GET /admin.', () => {
      strictEqual(getHttpMethod(ApiController, 'adminDashboard'), 'GET');
      strictEqual(getPath(ApiController, 'adminDashboard'), '/admin');
    });

    it('should return a HttpResponseOK with admin info when user is set.', () => {
      const controller = createController(ApiController);
      const ctx = new Context({});
      const user = new User();
      user.id = 1;
      user.email = 'admin@example.com';
      user.role = UserRole.ADMIN;
      ctx.user = user;

      const response = controller.adminDashboard(ctx);

      if (!isHttpResponseOK(response)) {
        throw new Error('The response should be an instance of HttpResponseOK.');
      }

      strictEqual(response.body.message, 'Welcome to the admin dashboard');
      strictEqual(response.body.admin.id, user.id);
      strictEqual(response.body.admin.email, user.email);
      strictEqual(response.body.admin.role, UserRole.ADMIN);
    });
  });
});
