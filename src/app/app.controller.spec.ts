// std
import { ok, strictEqual } from 'assert';

// 3p
import { Context } from '@foal/core';

// App
import { AppController } from './app.controller';

describe('AppController', () => {
  describe('receiveCspViolationReport', () => {
    it('should return 204 No Content.', () => {
      const controller = new AppController();
      controller.logger = { warn: () => undefined } as any;
      const ctx = new Context({
        method: 'POST',
        url: '/csp-violation-report',
        body: { 'csp-report': { 'blocked-uri': 'https://example.com/script.js' } },
      } as any);

      const response = controller.receiveCspViolationReport(ctx);

      strictEqual(response.statusCode, 204);
    });

    it('should strip query string and fragment from document-uri before logging.', () => {
      let logged = '';
      const originalWarn = console.warn;
      console.warn = (msg: string) => {
        logged = msg;
      };

      try {
        const controller = new AppController();
        controller.logger = {
          warn: (msg: string) => {
            logged = msg;
          },
        } as any;
        const ctx = new Context({
          method: 'POST',
          url: '/csp-violation-report',
          body: {
            'csp-report': {
              'document-uri': 'https://example.com/page?token=secret&other=value#hash',
              'blocked-uri': 'https://evil.com/script.js',
            },
          },
        } as any);

        controller.receiveCspViolationReport(ctx);

        const logPrefix = 'CSP violation report: ';
        ok(logged.startsWith(logPrefix), 'should log a CSP violation report');
        const logData = JSON.parse(logged.slice(logPrefix.length)) as Record<string, string>;
        strictEqual(
          logData['document-uri'],
          'https://example.com/page',
          'query string and fragment should be stripped from document-uri'
        );
      } finally {
        console.warn = originalWarn;
      }
    });
    it('should strip control characters from CSP report fields to prevent log injection.', () => {
      let logged = '';
      const originalWarn = console.warn;
      console.warn = (msg: string) => {
        logged = msg;
      };

      try {
        const controller = new AppController();
        controller.logger = {
          warn: (msg: string) => {
            logged = msg;
          },
        } as any;
        const ctx = new Context({
          method: 'POST',
          url: '/csp-violation-report',
          body: {
            'csp-report': {
              'blocked-uri': 'https://evil.com/\r\nFake-Log-Entry: injected',
              'violated-directive': 'script-src\n',
            },
          },
        } as any);

        controller.receiveCspViolationReport(ctx);

        const logPrefix = 'CSP violation report: ';
        ok(logged.startsWith(logPrefix), 'should log a CSP violation report');
        const logData = JSON.parse(logged.slice(logPrefix.length)) as Record<string, string>;
        ok(!logData['blocked-uri'].includes('\r'), 'should strip carriage return');
        ok(!logData['blocked-uri'].includes('\n'), 'should strip newline');
        ok(
          !logData['violated-directive'].includes('\n'),
          'should strip newline from violated-directive'
        );
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});
