// 3p
import { Logger, ServiceManager, PasswordService } from '@foal/core';

// App
import { User } from '../app/entities';
import { dataSource } from '../db';

export const schema = {
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
  },
  required: ['email', 'password'],
  type: 'object',
};

export async function main(args: any, services: ServiceManager, logger: Logger) {
  await dataSource.initialize();

  try {
    const passwordService = services.get(PasswordService);
    const user = new User();
    user.email = args.email;
    user.password = await passwordService.hashPassword(args.password);

    await user.save();

    logger.info(`User created: ${JSON.stringify(user, null, 2)}`);
  } finally {
    await dataSource.destroy();
  }
}
