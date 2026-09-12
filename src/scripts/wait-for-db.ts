import { readFileSync } from 'fs';
import { Client } from 'pg';

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

export function parseGatewayIp(routeTable: string): string | undefined {
  const lines = routeTable.trim().split('\n').slice(1);

  for (const line of lines) {
    const columns = line.trim().split(/\s+/);
    if (columns[1] !== '00000000') continue;

    const gateway = columns[2];
    if (!/^[0-9A-Fa-f]{8}$/.test(gateway)) return undefined;

    const octets = gateway.match(/../g);
    if (!octets) return undefined;

    return octets
      .reverse()
      .map(octet => parseInt(octet, 16))
      .join('.');
  }

  return undefined;
}

export function getGatewayIp(routeFilePath = '/proc/net/route'): string | undefined {
  try {
    return parseGatewayIp(readFileSync(routeFilePath, 'utf8'));
  } catch {
    return undefined;
  }
}

export function getConnectionHosts(primaryHost: string, fallbackHost?: string): string[] {
  return fallbackHost && fallbackHost !== primaryHost ? [primaryHost, fallbackHost] : [primaryHost];
}

export async function tryDatabaseConnection(config: DatabaseConnectionConfig): Promise<boolean> {
  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionTimeoutMillis: config.timeoutMs,
  });

  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    try {
      await client.end();
    } catch {
      // Ignore cleanup errors after failed connect attempts.
    }

    return false;
  }
}

export async function waitForDatabase(
  config: DatabaseConnectionConfig,
  options?: {
    retries?: number;
    delayMs?: number;
    hosts?: string[];
    connector?: Connector;
    sleeper?: Sleeper;
    logger?: Pick<Console, 'error'>;
  }
): Promise<string> {
  const retries = options?.retries ?? 30;
  const delayMs = options?.delayMs ?? 2000;
  const hosts = options?.hosts ?? getConnectionHosts(config.host, getGatewayIp());
  const connector = options?.connector ?? tryDatabaseConnection;
  const sleeper = options?.sleeper ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const logger = options?.logger ?? console;

  for (let attempt = 1; attempt <= retries; attempt++) {
    for (const host of hosts) {
      const connected = await connector({ ...config, host });
      if (connected) {
        if (host !== config.host) {
          logger.error(
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

async function main() {
  const retries = Number(process.env.DATABASE_CONNECT_RETRIES || 30);
  const delayMs = Number(process.env.DATABASE_CONNECT_DELAY || 2) * 1000;
  const timeoutMs = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 2000);

  const host = await waitForDatabase(
    {
      host: getRequiredEnv('DATABASE_HOST'),
      port: Number(getRequiredEnv('DATABASE_PORT')),
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
