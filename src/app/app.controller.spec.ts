// std
import { strictEqual } from 'assert';

// 3p
import { Context } from '@foal/core';

// App
import { AppController } from './app.controller';

describe('AppController', () => {
  describe('receiveCspViolationReport', () => {
    it('should return 204 No Content.', () => {
      const controller = new AppController();
      const ctx = new Context({
        method: 'POST',
        url: '/csp-violation-report',
        body: { 'csp-report': { 'blocked-uri': 'https://example.com/script.js' } },
      } as any);

      const response = controller.receiveCspViolationReport(ctx);

      strictEqual(response.statusCode, 204);
    });
  });
});
