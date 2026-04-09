import { Context, Get, HttpResponseOK } from '@foal/core';
import { User, UserRole } from '../entities';
import { JwtRequired, Permission, PermissionRequired, RoleRequired } from '../hooks';

// @JwtRequired handles JWT verification and user loading for the whole controller.
// Method-level @RoleRequired / @PermissionRequired hooks add authorization on top.
@JwtRequired()
export class ApiController {
  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK('Hello world!');
  }

  @Get('/profile')
  profile(ctx: Context) {
    const user = ctx.user as User;
    return new HttpResponseOK({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isVerified: user.isVerified,
    });
  }

  @Get('/admin')
  @RoleRequired(UserRole.ADMIN)
  @PermissionRequired(Permission.MANAGE_USERS)
  adminDashboard(ctx: Context) {
    const user = ctx.user as User;
    return new HttpResponseOK({
      message: 'Welcome to the admin dashboard',
      admin: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  }
}
