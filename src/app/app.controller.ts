import { controller, Get, HttpResponseNotFound, IAppController } from '@foal/core';

import { ApiController, AuthController } from './controllers';
import { RequestLogger } from '../middlewares';

@RequestLogger()
export class AppController implements IAppController {
  subControllers = [controller('/api', ApiController), controller('/api/auth', AuthController)];

  /**
   * Block the dev-only test harness in production.
   * In non-production environments the request falls through to the Express
   * static-file middleware which serves public/test.html as normal.
   */
  @Get('/test.html')
  blockTestHtmlInProd(): HttpResponseNotFound | void {
    if (process.env.NODE_ENV === 'production') {
      return new HttpResponseNotFound();
    }
  }
}
