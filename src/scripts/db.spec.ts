import { strictEqual } from 'assert';

import { Config } from '@foal/core';

import { createDataSource } from '../db';

describe('db datasource ssl options', () => {
  let originalGet: typeof Config.get;

  function mockConfig(overrides: Record<string, unknown>): void {
    Config.get = (key: string, type?: any, defaultValue?: any) => {
      if (key in overrides) {
        return overrides[key];
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (originalGet as (...args: unknown[]) => unknown).call(Config, key, type, defaultValue);
    };
  }

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalGet = Config.get;
  });

  afterEach(() => {
    Config.get = originalGet;
  });

  it('should prioritize database.extra.ssl.rejectUnauthorized=true when ssl is enabled.', () => {
    mockConfig({
      'database.ssl': true,
      'database.extra.ssl.rejectUnauthorized': true,
      'database.ssl.rejectUnauthorized': false,
    });

    const dataSource = createDataSource();

    strictEqual(
      (dataSource.options as { ssl: { rejectUnauthorized: boolean } }).ssl.rejectUnauthorized,
      true
    );
  });

  it('should prioritize database.extra.ssl.rejectUnauthorized=false when ssl is enabled.', () => {
    mockConfig({
      'database.ssl': true,
      'database.extra.ssl.rejectUnauthorized': false,
      'database.ssl.rejectUnauthorized': true,
    });

    const dataSource = createDataSource();

    strictEqual(
      (dataSource.options as { ssl: { rejectUnauthorized: boolean } }).ssl.rejectUnauthorized,
      false
    );
  });
});
