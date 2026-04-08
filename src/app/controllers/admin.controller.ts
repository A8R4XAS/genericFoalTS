import {
  Context,
  Get,
  HttpResponseBadRequest,
  HttpResponseNotFound,
  HttpResponseOK,
  Patch,
} from '@foal/core';
import { JWTRequired } from '@foal/jwt';
import { ZodError, z } from 'zod';
import { User, UserRole } from '../entities';
import { RequirePermission } from '../hooks';

const assignRoleSchema = z.object({
  role: z.nativeEnum(UserRole, { errorMap: () => ({ message: 'Invalid role' }) }),
});

@JWTRequired({ user: (id: number) => User.findOneBy({ id }) })
export class AdminController {
  /**
   * GET /api/admin/users
   * List all users. Requires `read:users` permission (admin or moderator).
   */
  @Get('/users')
  @RequirePermission('read:users')
  async listUsers() {
    const users = await User.find({ order: { id: 'ASC' } });
    return new HttpResponseOK(
      users.map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
      }))
    );
  }

  /**
   * PATCH /api/admin/users/:id/role
   * Assign a role to a user. Requires `assign:roles` permission (admin only).
   */
  @Patch('/users/:id/role')
  @RequirePermission('assign:roles')
  async assignRole(ctx: Context) {
    try {
      const { id } = ctx.request.params as { id: string };
      const userId = parseInt(id, 10);

      if (isNaN(userId)) {
        return new HttpResponseBadRequest({ error: 'Invalid user ID' });
      }

      const validatedData = assignRoleSchema.parse(ctx.request.body);

      const user = await User.findOneBy({ id: userId });
      if (!user) {
        return new HttpResponseNotFound({ error: 'User not found' });
      }

      user.role = validatedData.role;
      await user.save();

      return new HttpResponseOK({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return new HttpResponseBadRequest({
          error: 'Validation failed',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }

      throw error;
    }
  }
}
