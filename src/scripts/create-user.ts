// 3p
import { Logger, ServiceManager } from '@foal/core';

// App
import { User } from '../app/entities';
import { dataSource } from '../db';
import { PasswordHashingService } from '../app/services';

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
    const passwordHashingService = services.get(PasswordHashingService);
    const user = new User();
    user.email = args.email;
    user.password = await passwordHashingService.hash(args.password);

    await user.save();

    logger.info(`User created: ${JSON.stringify(user, null, 2)}`);
  } finally {
    await dataSource.destroy();
  }
}
