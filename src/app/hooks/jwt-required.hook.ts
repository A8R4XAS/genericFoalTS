// std
// 3p
import { Config, Context, Hook, HookDecorator, HttpResponseUnauthorized } from '@foal/core';
import * as jwt from 'jsonwebtoken';

// App
import { User } from '../entities';

/**
 * Hook that requires a valid JWT Bearer token in the Authorization header.
 * Extracts the token, verifies it, loads the corresponding user from the database,
 * and attaches the user object to `ctx.user`.
 *
 * Returns 401 Unauthorized if the token is missing, malformed, or invalid.
 */
export function JwtRequired(): HookDecorator {
  return Hook(async (ctx: Context) => {
    const authHeader = ctx.request.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new HttpResponseUnauthorized({
        error: 'Authorization header missing or invalid. Expected: Bearer <token>',
      });
    }

    const token = authHeader.slice(7);

    const secret = Config.getOrThrow('jwt.secret', 'string');

    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      return new HttpResponseUnauthorized({ error: 'Invalid or expired token' });
    }

    if (typeof decoded === 'string') {
      return new HttpResponseUnauthorized({ error: 'Invalid or expired token' });
    }

    const userId = decoded['userId'] as number | undefined;
    const tokenType = decoded['tokenType'] as string | undefined;
    if (!userId || tokenType !== 'access') {
      return new HttpResponseUnauthorized({ error: 'Invalid or expired token' });
    }

    const user = await User.findOneBy({ id: userId });
    if (!user) {
      return new HttpResponseUnauthorized({ error: 'Invalid or expired token' });
    }

    ctx.user = user;
  });
}
