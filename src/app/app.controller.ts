import { controller, IAppController } from '@foal/core';

import { ApiController, AuthController } from './controllers';

export class AppController implements IAppController {
  subControllers = [controller('/api', ApiController), controller('/api/auth', AuthController)];
}
