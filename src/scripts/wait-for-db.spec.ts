import { rejects, strictEqual } from 'assert';

import { getConnectionHosts, parseGatewayIp, waitForDatabase } from './wait-for-db';

describe('wait-for-db', () => {
  it('should parse the default gateway from /proc/net/route format.', () => {
    const routeTable = `Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT
eth0\t00000000\t010012AC\t0003\t0\t0\t0\t00000000\t0\t0\t0`;

    strictEqual(parseGatewayIp(routeTable), '172.18.0.1');
  });

  it('should keep the primary host first and append the fallback only once.', () => {
    strictEqual(getConnectionHosts('db').join(','), 'db');
    strictEqual(getConnectionHosts('db', '172.18.0.1').join(','), 'db,172.18.0.1');
    strictEqual(getConnectionHosts('db', 'db').join(','), 'db');
  });

  it('should return the first host that becomes reachable.', async () => {
    const calls: string[] = [];

    const resolvedHost = await waitForDatabase(
      {
        host: 'db',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'genericfoalts',
        timeoutMs: 100,
      },
      {
        retries: 2,
        delayMs: 1,
        hosts: ['db', '172.18.0.1'],
        connector: async config => {
          calls.push(config.host);
          return config.host === '172.18.0.1';
        },
        sleeper: async () => undefined,
        logger: { error: () => undefined, warn: () => undefined },
      }
    );

    strictEqual(resolvedHost, '172.18.0.1');
    strictEqual(calls.join(','), 'db,172.18.0.1');
  });

  it('should fail cleanly after exhausting all retries.', async () => {
    await rejects(
      waitForDatabase(
        {
          host: 'db',
          port: 5432,
          user: 'postgres',
          password: 'postgres',
          database: 'genericfoalts',
          timeoutMs: 100,
        },
        {
          retries: 2,
          delayMs: 1,
          hosts: ['db'],
          connector: async () => false,
          sleeper: async () => undefined,
          logger: { error: () => undefined, warn: () => undefined },
        }
      ),
      /Database is not reachable after 2 attempts\./
    );
  });
});
