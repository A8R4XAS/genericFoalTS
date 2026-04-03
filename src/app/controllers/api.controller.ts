import { Context, Get, HttpResponseOK } from '@foal/core';
import { JWTRequired } from '@foal/jwt';
import { User } from '../entities';

@JWTRequired({ user: (id: number) => User.findOneBy({ id }) })
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
}
