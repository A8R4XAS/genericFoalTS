import { Socket } from 'net';

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  timeoutMs: number;
}

type Connector = (config: DatabaseConnectionConfig) => Promise<boolean>;
type Sleeper = (ms: number) => Promise<void>;

export function getConnectionHosts(primaryHost: string): string[] {
  return [primaryHost];
}

export async function tryDatabaseConnection(
  config: DatabaseConnectionConfig,
  socketFactory: () => Socket = () => new Socket()
): Promise<boolean> {
  return new Promise(resolve => {
    const socket = socketFactory();

    const finalize = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(config.timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(config.port, config.host);
  });
}

export async function waitForDatabase(
  config: DatabaseConnectionConfig,
  options?: {
    retries?: number;
    delayMs?: number;
    hosts?: string[];
    connector?: Connector;
    sleeper?: Sleeper;
    logger?: Pick<Console, 'error' | 'warn'>;
  }
): Promise<string> {
  const retries = options?.retries ?? 30;
  const delayMs = options?.delayMs ?? 2000;
  const hosts = options?.hosts ?? getConnectionHosts(config.host);
  const connector = options?.connector ?? tryDatabaseConnection;
  const sleeper = options?.sleeper ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const logger = options?.logger ?? console;

  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const host of hosts) {
      const connected = await connector({ ...config, host });
      if (connected) {
        if (host !== config.host) {
          logger.warn(
            `Primary database host "${config.host}" unavailable. Using "${host}" instead.`
          );
        }

        return host;
      }
    }

    if (attempt < retries) {
      logger.error(`Waiting for database connection (${attempt}/${retries})...`);
      await sleeper(delayMs);
    }
  }

  throw new Error(`Database is not reachable after ${retries} attempts.`);
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getPositiveNumberEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const value = rawValue ? Number(rawValue) : fallback;

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

export function getPositiveIntegerEnv(name: string, fallback: number): number {
  const value = getPositiveNumberEnv(name, fallback);

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return value;
}

async function main() {
  const retries = getPositiveIntegerEnv('DATABASE_CONNECT_RETRIES', 30);
  const delayMs = getPositiveNumberEnv('DATABASE_CONNECT_DELAY', 2) * 1000;
  const timeoutMs = getPositiveNumberEnv('DATABASE_CONNECT_TIMEOUT_MS', 2000);

  const host = await waitForDatabase(
    {
      host: getRequiredEnv('DATABASE_HOST'),
      port: getPositiveIntegerEnv('DATABASE_PORT', 5432),
      user: getRequiredEnv('DATABASE_USERNAME'),
      password: getRequiredEnv('DATABASE_PASSWORD'),
      database: getRequiredEnv('DATABASE_NAME'),
      timeoutMs,
    },
    { retries, delayMs }
  );

  process.stdout.write(host);
}

if (require.main === module) {
  main().catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
