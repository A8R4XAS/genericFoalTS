/**
 * Rate Limiting Hook
 *
 * Rate limiting controls how many requests a single client (user or IP address) is
 * allowed to make within a given time window. When the limit is exceeded, the server
 * rejects further requests with HTTP 429 ("Too Many Requests") until the window resets.
 *
 * Why rate limiting?
 *  - Prevents brute-force attacks (e.g. guessing passwords by rapid login attempts).
 *  - Protects the server from being overwhelmed by a single misbehaving client.
 *  - Enforces fair usage across all clients.
 *
 * Key concepts used here:
 *  - "points"   – the maximum number of requests allowed per window (e.g. 120 per minute).
 *  - "duration" – the length of the time window in seconds (e.g. 60 = 1 minute).
 *  - "profile"  – a named preset ('default' for normal API routes, 'auth' for login/register).
 *  - "endpoint override" – a more specific limit for a single controller method that overrides
 *                          the profile's default (e.g. stricter limits on AuthController.login).
 *
 * How it works end-to-end:
 *  1. A request arrives. The hook identifies the caller (authenticated user ID or IP address)
 *     and the target endpoint (ControllerName.methodName).
 *  2. The limiter checks how many requests this caller has made in the current window.
 *  3. If under the limit: the request is allowed and rate-limit headers are added to the
 *     response so the client knows how many requests remain.
 *  4. If over the limit: the hook returns HTTP 429 with a "Retry-After" header telling the
 *     client how many seconds to wait before trying again.
 *
 * See RATE_LIMITING.md for configuration examples and a beginner-friendly walkthrough.
 */

import { Config, Context, Hook, HookDecorator, HttpResponseTooManyRequests } from '@foal/core';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

// A profile selects the base limits to use. 'auth' uses stricter defaults than 'default'
// because login/register endpoints are more sensitive targets for abuse.
type RateLimitProfile = 'default' | 'auth';

// A time window defines how many requests ("points") are allowed within a period ("duration"
// in seconds). For example { points: 120, duration: 60 } = 120 requests per minute.
interface RateLimitWindow {
  points: number;
  duration: number;
}

// Options that can be passed directly to the @RateLimit() decorator to override config values
// at the call site (useful for one-off overrides without touching config files).
interface RateLimitOptions {
  default?: Partial<RateLimitWindow>;
  auth?: Partial<RateLimitWindow>;
  endpoints?: Record<string, Partial<RateLimitWindow>>;
}

// The fully resolved configuration after merging config file values with decorator overrides.
interface ResolvedRateLimitConfig {
  default: RateLimitWindow;
  auth: RateLimitWindow;
  endpoints: Record<string, Partial<RateLimitWindow>>;
}

// Cache limiter instances keyed by "points:duration" so that the same window configuration
// always reuses the same in-memory counter. Creating a new limiter per request would reset
// counters on every call, defeating the purpose of rate limiting.
const limiterCache = new Map<string, RateLimiterMemory>();

// Guard against invalid config values: ensures that points and duration are always positive
// integers. Falls back to a safe default if the value is 0, negative, or non-numeric.
function positiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Reads rate-limit settings from config/default.json (or environment-specific overrides)
 * and merges them with any options passed directly to the decorator. Decorator options take
 * precedence over config file values, which take precedence over hard-coded fallbacks.
 *
 * Config keys (in config/default.json):
 *   rateLimit.default.points / rateLimit.default.duration  – base limits for normal endpoints
 *   rateLimit.auth.points    / rateLimit.auth.duration     – base limits for auth endpoints
 *   rateLimit.endpoints.<Controller>.<method>              – per-endpoint overrides
 */
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
      // Config-file endpoint overrides come first so that decorator-level overrides win.
      ...(typeof configEndpoints === 'object' && configEndpoints !== null ? configEndpoints : {}),
      ...(options?.endpoints ?? {}),
    },
  };
}

/**
 * Determines a stable identifier for the requesting client.
 *
 * Authenticated users are identified by their user ID so that the limit applies per account
 * (regardless of IP). Unauthenticated requests fall back to the request IP address, which
 * covers cases like login/register where the user is not yet logged in.
 */
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

/**
 * Builds the lookup key for per-endpoint overrides.
 * Format: "ControllerName.methodName" (e.g. "AuthController.login").
 * This matches the keys used in rateLimit.endpoints in config/default.json.
 */
function getEndpointKey(ctx: Context): string {
  return `${ctx.controllerName || 'unknown'}.${ctx.controllerMethodName || 'unknown'}`;
}

/**
 * Attaches rate-limit information to the HTTP response as standard headers.
 *
 * Clients and proxies can read these headers to know:
 *   RateLimit-Limit     / X-RateLimit-Limit     – total requests allowed in the window
 *   RateLimit-Remaining / X-RateLimit-Remaining – requests still available right now
 *   RateLimit-Reset     / X-RateLimit-Reset     – seconds until the window resets
 *
 * Both the modern "RateLimit-*" names (IETF draft) and the legacy "X-RateLimit-*" names
 * are set for broad compatibility with clients and API gateways.
 */
function setRateLimitHeaders(
  target: { setHeader(name: string, value: string): unknown },
  points: number,
  remainingPoints: number,
  msBeforeNext: number
) {
  const resetInSeconds = Math.max(1, Math.ceil(msBeforeNext / 1000));

  target.setHeader('RateLimit-Limit', `${points}`);
  target.setHeader('RateLimit-Remaining', `${Math.max(0, remainingPoints)}`);
  target.setHeader('RateLimit-Reset', `${resetInSeconds}`);
  target.setHeader('X-RateLimit-Limit', `${points}`);
  target.setHeader('X-RateLimit-Remaining', `${Math.max(0, remainingPoints)}`);
  target.setHeader('X-RateLimit-Reset', `${resetInSeconds}`);
}

/**
 * Returns a cached RateLimiterMemory instance for the given window configuration.
 * Each unique (points, duration) pair shares one limiter instance so that counters
 * persist correctly across multiple requests.
 *
 * Note: RateLimiterMemory stores counters in the Node.js process heap. This means
 * counters are reset if the server restarts, and each process instance has its own
 * counters (not shared across multiple server instances). For multi-instance deployments
 * a shared store such as Redis should be used instead (see RATE_LIMITING.md).
 */
function getLimiter(points: number, duration: number): RateLimiterMemory {
  const cacheKey = `${points}:${duration}`;
  const existing = limiterCache.get(cacheKey);
  if (existing) return existing;

  const created = new RateLimiterMemory({ points, duration });
  limiterCache.set(cacheKey, created);
  return created;
}

/**
 * Type guard: confirms that an unknown thrown value is a RateLimiterRes (the object
 * rate-limiter-flexible throws when the limit is exceeded) rather than a programming
 * error or unexpected exception. Without this guard, a real bug could be silently
 * swallowed and returned as a 429 response.
 */
function isRateLimiterResult(error: unknown): error is RateLimiterRes {
  if (typeof error !== 'object' || error === null) return false;
  return 'msBeforeNext' in error && 'remainingPoints' in error;
}

// When msBeforeNext is undefined (edge case in some limiter versions) fall back to the
// full duration so the Retry-After header always contains a sensible value.
function resolveMsBeforeNext(msBeforeNext: number | undefined, duration: number): number {
  return msBeforeNext ?? duration * 1000;
}

/**
 * FoalTS hook decorator that enforces rate limiting on a controller or method.
 *
 * Usage:
 *   @RateLimit('default')  – applies the standard API limit (rateLimit.default in config)
 *   @RateLimit('auth')     – applies the stricter auth limit (rateLimit.auth in config)
 *
 * Individual endpoints within a controller can receive finer-grained limits via the
 * rateLimit.endpoints config key (e.g. "AuthController.login": { points: 15, duration: 60 }).
 * Those per-endpoint values override the profile limit automatically — no code change needed.
 *
 * @param profile  Which base profile to use ('default' or 'auth'). Defaults to 'default'.
 * @param options  Optional inline overrides for any window value or endpoint override.
 */
export function RateLimit(
  profile: RateLimitProfile = 'default',
  options?: RateLimitOptions
): HookDecorator {
  return Hook(async (ctx: Context) => {
    const config = getRateLimitConfig(options);
    const endpointKey = getEndpointKey(ctx);

    // Check if this specific endpoint has a narrower limit configured; if so, use it
    // instead of the profile's default.
    const endpointOverride = config.endpoints[endpointKey];
    const base = config[profile];

    const points = positiveInt(endpointOverride?.points ?? base.points, 1);
    const duration = positiveInt(endpointOverride?.duration ?? base.duration, 1);

    // The limiter key combines the endpoint and the caller identity so that each
    // client gets their own independent counter per endpoint.
    const limiter = getLimiter(points, duration);
    const identifier = `${endpointKey}:${getClientIdentifier(ctx)}`;

    try {
      // consume(key, 1) deducts 1 point from the caller's allowance.
      // It resolves with the updated counter if points remain, or throws a RateLimiterRes
      // if the caller has exhausted their allowance.
      const result = await limiter.consume(identifier, 1);
      const response = (
        ctx.request as { res?: { setHeader(name: string, value: string): unknown } }
      ).res;
      if (response?.setHeader) {
        setRateLimitHeaders(
          response,
          points,
          result.remainingPoints,
          resolveMsBeforeNext(result.msBeforeNext, duration)
        );
      }
      // Returning undefined lets FoalTS continue to the actual controller method.
      return;
    } catch (error) {
      // Re-throw anything that is not a rate-limiter exhaustion result (e.g. a real bug).
      if (!isRateLimiterResult(error)) {
        throw error;
      }
      const rateLimitResult = error;
      const msBeforeNext = resolveMsBeforeNext(rateLimitResult.msBeforeNext, duration);
      const remainingPoints = rateLimitResult.remainingPoints ?? 0;

      // Return a 429 response. Returning a response from a hook short-circuits the
      // request — the controller method is never called.
      const response = new HttpResponseTooManyRequests({
        error: 'Too many requests',
      });
      setRateLimitHeaders(response, points, remainingPoints, msBeforeNext);
      // Retry-After tells the client exactly how long to wait (in seconds) before retrying.
      response.setHeader('Retry-After', `${Math.max(1, Math.ceil(msBeforeNext / 1000))}`);
      return response;
    }
  });
}
