import {
  controller,
  Get,
  HttpResponseNoContent,
  HttpResponseNotFound,
  IAppController,
  Post,
} from '@foal/core';

import { ApiController, AuthController, HealthController } from './controllers';
import { Cors, RequestLogger, SecurityHeaders } from '../middlewares';

@SecurityHeaders()
@Cors()
@RequestLogger()
export class AppController implements IAppController {
  subControllers = [
    controller('/api', ApiController),
    controller('/api/auth', AuthController),
    controller('/health', HealthController),
  ];

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

  /**
   * Browser can send CSP violation reports to this endpoint.
   * We return 204 intentionally: reporting clients only need an ACK.
   * Actual logging is done inside the SecurityHeaders/Helmet hook.
   */
  @Post('/csp-violation-report')
  receiveCspViolationReport(): HttpResponseNoContent {
    return new HttpResponseNoContent();
  }
}
