import { rejects, strictEqual } from 'assert';
import { createServer, Socket } from 'net';

import {
  getConnectionHosts,
  getPositiveIntegerEnv,
  getPositiveNumberEnv,
  tryDatabaseConnection,
  waitForDatabase,
} from './wait-for-db';

describe('wait-for-db', () => {
  it('should return only the configured primary host.', () => {
    strictEqual(getConnectionHosts('db').join(','), 'db');
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

  it('should connect using a real TCP socket when the host is reachable.', async () => {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected TCP server address.');
    }

    try {
      const connected = await tryDatabaseConnection({
        host: '127.0.0.1',
        port: address.port,
        user: 'postgres',
        password: 'postgres',
        database: 'genericfoalts',
        timeoutMs: 100,
      });

      strictEqual(connected, true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  });

  it('should return false and clean up the socket on timeout.', async () => {
    const socket = new Socket();
    const originalConnect = socket.connect.bind(socket);
    socket.connect = (() => {
      setImmediate(() => socket.emit('timeout'));
      return socket;
    }) as typeof originalConnect;

    const connected = await tryDatabaseConnection(
      {
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'genericfoalts',
        timeoutMs: 25,
      },
      () => socket
    );

    strictEqual(connected, false);
    strictEqual(socket.destroyed, true);
    strictEqual(socket.listenerCount('connect'), 0);
    strictEqual(socket.listenerCount('timeout'), 0);
    strictEqual(socket.listenerCount('error'), 0);
  });

  it('should return false and clean up the socket on connection errors.', async () => {
    const socket = new Socket();
    const originalConnect = socket.connect.bind(socket);
    socket.connect = (() => {
      setImmediate(() => socket.emit('error', new Error('connect failed')));
      return socket;
    }) as typeof originalConnect;

    const connected = await tryDatabaseConnection(
      {
        host: '127.0.0.1',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'genericfoalts',
        timeoutMs: 25,
      },
      () => socket
    );

    strictEqual(connected, false);
    strictEqual(socket.destroyed, true);
    strictEqual(socket.listenerCount('connect'), 0);
    strictEqual(socket.listenerCount('timeout'), 0);
    strictEqual(socket.listenerCount('error'), 0);
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

  it('should use the fallback for missing numeric environment values.', () => {
    delete process.env.DATABASE_CONNECT_RETRIES;

    strictEqual(getPositiveNumberEnv('DATABASE_CONNECT_RETRIES', 30), 30);
  });

  it('should reject invalid numeric environment values.', () => {
    process.env.DATABASE_CONNECT_RETRIES = 'abc';

    try {
      getPositiveNumberEnv('DATABASE_CONNECT_RETRIES', 30);
      throw new Error('Expected numeric validation to fail.');
    } catch (error) {
      strictEqual((error as Error).message, 'DATABASE_CONNECT_RETRIES must be a positive number.');
    } finally {
      delete process.env.DATABASE_CONNECT_RETRIES;
    }
  });

  it('should reject non-integer values for integer environment variables.', () => {
    process.env.DATABASE_PORT = '5432.5';

    try {
      getPositiveIntegerEnv('DATABASE_PORT', 5432);
      throw new Error('Expected integer validation to fail.');
    } catch (error) {
      strictEqual((error as Error).message, 'DATABASE_PORT must be a positive integer.');
    } finally {
      delete process.env.DATABASE_PORT;
    }
  });

  it('should reject zero for positive integer environment variables.', () => {
    process.env.DATABASE_CONNECT_RETRIES = '0';

    try {
      getPositiveIntegerEnv('DATABASE_CONNECT_RETRIES', 30);
      throw new Error('Expected zero validation to fail.');
    } catch (error) {
      strictEqual((error as Error).message, 'DATABASE_CONNECT_RETRIES must be a positive number.');
    } finally {
      delete process.env.DATABASE_CONNECT_RETRIES;
    }
  });

  it('should reject negative values for positive numeric environment variables.', () => {
    process.env.DATABASE_CONNECT_TIMEOUT_MS = '-1';

    try {
      getPositiveNumberEnv('DATABASE_CONNECT_TIMEOUT_MS', 2000);
      throw new Error('Expected negative validation to fail.');
    } catch (error) {
      strictEqual(
        (error as Error).message,
        'DATABASE_CONNECT_TIMEOUT_MS must be a positive number.'
      );
    } finally {
      delete process.env.DATABASE_CONNECT_TIMEOUT_MS;
    }
  });
});
