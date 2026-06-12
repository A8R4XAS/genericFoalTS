import { Config, Context, Hook, HookDecorator, HttpResponseTooManyRequests } from '@foal/core';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

type RateLimitProfile = 'default' | 'auth';

interface RateLimitWindow {
  points: number;
  duration: number;
}

interface RateLimitOptions {
  default?: Partial<RateLimitWindow>;
  auth?: Partial<RateLimitWindow>;
  endpoints?: Record<string, Partial<RateLimitWindow>>;
}

interface ResolvedRateLimitConfig {
  default: RateLimitWindow;
  auth: RateLimitWindow;
  endpoints: Record<string, Partial<RateLimitWindow>>;
}

const limiterCache = new Map<string, RateLimiterMemory>();

function positiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function getRateLimitConfig(options?: RateLimitOptions): ResolvedRateLimitConfig {
  const configDefaultPoints = Config.get('rateLimit.default.points', 'number', 120);
  const configDefaultDuration = Config.get('rateLimit.default.duration', 'number', 60);
  const configAuthPoints = Config.get('rateLimit.auth.points', 'number', 60);
  const configAuthDuration = Config.get('rateLimit.auth.duration', 'number', 60);
  const configEndpoints = Config.get('rateLimit.endpoints', 'any', {});

  return {
    default: {
      points: positiveInt(options?.default?.points ?? configDefaultPoints, 120),
      duration: positiveInt(options?.default?.duration ?? configDefaultDuration, 60),
    },
    auth: {
      points: positiveInt(options?.auth?.points ?? configAuthPoints, 60),
      duration: positiveInt(options?.auth?.duration ?? configAuthDuration, 60),
    },
    endpoints: {
      ...(typeof configEndpoints === 'object' && configEndpoints !== null ? configEndpoints : {}),
      ...(options?.endpoints ?? {}),
    },
  };
}

function getClientIdentifier(ctx: Context): string {
  const request = ctx.request as Context['request'] & {
    socket?: { remoteAddress?: string };
  };
  const user = ctx.user as { id?: number | string } | null;

  if (user?.id !== undefined && user?.id !== null) {
    return `user:${user.id}`;
  }

  return request.ip || request.socket?.remoteAddress || 'anonymous';
}

function getEndpointKey(ctx: Context): string {
  return `${ctx.controllerName || 'unknown'}.${ctx.controllerMethodName || 'unknown'}`;
}

function setRateLimitHeaders(
  target: { setHeader(name: string, value: string): unknown },
  points: number,
  remainingPoints: number,
  msBeforeNext: number
) {
  const resetInSeconds = Math.max(1, Math.ceil(msBeforeNext / 1000));
  const resetAtUnix = Math.ceil((Date.now() + msBeforeNext) / 1000);

  target.setHeader('RateLimit-Limit', `${points}`);
  target.setHeader('RateLimit-Remaining', `${Math.max(0, remainingPoints)}`);
  target.setHeader('RateLimit-Reset', `${resetInSeconds}`);
  target.setHeader('X-RateLimit-Limit', `${points}`);
  target.setHeader('X-RateLimit-Remaining', `${Math.max(0, remainingPoints)}`);
  target.setHeader('X-RateLimit-Reset', `${resetAtUnix}`);
}

function getLimiter(points: number, duration: number): RateLimiterMemory {
  const cacheKey = `${points}:${duration}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;

  const created = new RateLimiterMemory({ points, duration });
  limiterCache.set(cacheKey, created);
  return created;
}

function isRateLimiterResult(error: unknown): error is RateLimiterRes {
  if (typeof error !== 'object' || error === null) return false;
  return 'msBeforeNext' in error || 'remainingPoints' in error;
}

export function RateLimit(
  profile: RateLimitProfile = 'default',
  options?: RateLimitOptions
): HookDecorator {
  return Hook(async (ctx: Context) => {
    const config = getRateLimitConfig(options);
    const endpointKey = getEndpointKey(ctx);
    const endpointOverride = config.endpoints[endpointKey];
    const base = config[profile];

    const points = positiveInt(endpointOverride?.points ?? base.points, base.points);
    const duration = positiveInt(endpointOverride?.duration ?? base.duration, base.duration);

    const limiter = getLimiter(points, duration);
    const identifier = `${endpointKey}:${getClientIdentifier(ctx)}`;

    try {
      const result = await limiter.consume(identifier, 1);
      const response = (
        ctx.request as { res?: { setHeader(name: string, value: string): unknown } }
      ).res;
      if (response?.setHeader) {
        setRateLimitHeaders(
          response,
          points,
          result.remainingPoints,
          result.msBeforeNext || duration * 1000
        );
      }
      return;
    } catch (error) {
      if (!isRateLimiterResult(error)) {
        throw error;
      }
      const rateLimitResult = error;
      const msBeforeNext = rateLimitResult.msBeforeNext || duration * 1000;
      const remainingPoints = rateLimitResult.remainingPoints ?? 0;

      const response = new HttpResponseTooManyRequests({
        error: 'Too many requests',
      });
      setRateLimitHeaders(response, points, remainingPoints, msBeforeNext);
      response.setHeader('Retry-After', `${Math.max(1, Math.ceil(msBeforeNext / 1000))}`);
      return response;
    }
  });
}
