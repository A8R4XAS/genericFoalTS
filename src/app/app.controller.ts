import { controller, IAppController } from '@foal/core';

import { ApiController, AuthController } from './controllers';
import { RequestLogger } from '../middlewares';

@RequestLogger()
export class AppController implements IAppController {
  subControllers = [controller('/api', ApiController), controller('/api/auth', AuthController)];
}
