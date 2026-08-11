import {
  Config,
  Context,
  Hook,
  HookDecorator,
  HttpResponse,
  HttpResponseForbidden,
} from '@foal/core';
import { randomBytes, timingSafeEqual } from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type RequestLike = {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, unknown>;
  get?: (headerName: string) => string | undefined;
};

export function CsrfProtection(): HookDecorator {
  return Hook((ctx: Context) => {
    const enabled = Config.get('csrf.enabled', 'boolean', true);
    if (!enabled) {
      return;
    }

    const request = ctx.request as RequestLike;
    const method = (request.method ?? 'GET').toUpperCase();
    const path = getRequestPath(request);
    const cookieName = Config.get('csrf.cookieName', 'string', 'csrf_token');
    const requestHeaderName = Config.get('csrf.requestHeaderName', 'string', 'x-csrf-token');
    const responseHeaderName = Config.get('csrf.responseHeaderName', 'string', 'X-CSRF-Token');
    const loginPath = Config.get('csrf.rotateOnLoginPath', 'string', '/api/auth/login');
    const exemptPaths = parseExemptPaths(
      Config.get('csrf.exemptPaths', 'string', '/csp-violation-report')
    );

    const cookies = parseCookies(getRequestHeader(request, 'cookie'));
    const csrfCookieToken = cookies[cookieName];
    const skipForJwtBearer = Config.get('csrf.skipForJwtBearer', 'boolean', true);
    const hasJwtBearerToken =
      skipForJwtBearer &&
      getRequestHeader(request, 'authorization')?.startsWith('Bearer ') === true;
    const isExemptPath = exemptPaths.some(pattern => matchPathPattern(path, pattern));
    const shouldValidateToken = !SAFE_METHODS.has(method) && !isExemptPath && !hasJwtBearerToken;

    const csrfHeaderToken = getRequestHeader(request, requestHeaderName);
    if (shouldValidateToken && !areTokensEqual(csrfCookieToken, csrfHeaderToken)) {
      const response = new HttpResponseForbidden({ error: 'Invalid CSRF token' });
      const bootstrapToken = generateCsrfToken();
      applyCsrfToResponse(response, cookieName, bootstrapToken, responseHeaderName);
      return response;
    }

    const shouldRotateToken = method === 'POST' && path === loginPath;
    const csrfResponseToken = shouldRotateToken
      ? generateCsrfToken()
      : csrfCookieToken || generateCsrfToken();

    return (response: HttpResponse) => {
      applyCsrfToResponse(response, cookieName, csrfResponseToken, responseHeaderName);
    };
  });
}

function getRequestHeader(request: RequestLike, headerName: string): string | undefined {
  if (typeof request.get === 'function') {
    return request.get(headerName);
  }

  const headers = request.headers;
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const normalized = headerName.toLowerCase();
  const value = headers[normalized];
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce(
      (acc, segment) => {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex <= 0) {
          return acc;
        }

        const key = segment.slice(0, separatorIndex).trim();
        const value = segment.slice(separatorIndex + 1).trim();
        if (!key) {
          return acc;
        }

        try {
          acc[key] = decodeURIComponent(value);
        } catch {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );
}

function areTokensEqual(cookieToken: string | undefined, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken) {
    return false;
  }

  const cookieBuffer = Buffer.from(cookieToken, 'utf8');
  const headerBuffer = Buffer.from(headerToken, 'utf8');
  if (cookieBuffer.length !== headerBuffer.length) {
    return false;
  }

  return timingSafeEqual(cookieBuffer, headerBuffer);
}

function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

function getRequestPath(request: RequestLike): string {
  if (typeof request.path === 'string') {
    return request.path;
  }
  if (typeof request.url === 'string') {
    return request.url.split('?')[0];
  }
  return '';
}

function parseExemptPaths(raw: string): string[] {
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function matchPathPattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return path === pattern;
}

function applyCsrfToResponse(
  response: HttpResponse,
  cookieName: string,
  csrfToken: string,
  responseHeaderName: string
): void {
  appendSetCookieHeader(response, serializeCookie(cookieName, csrfToken));
  response.setHeader(responseHeaderName, csrfToken);
}

function appendSetCookieHeader(response: HttpResponse, cookie: string): void {
  const current = response.getHeader('Set-Cookie');
  if (!current) {
    response.setHeader('Set-Cookie', cookie);
    return;
  }

  const serializedCurrent = Array.isArray(current)
    ? current.map(value => String(value)).join(', ')
    : String(current);
  response.setHeader('Set-Cookie', `${serializedCurrent}, ${cookie}`);
}

function serializeCookie(name: string, value: string): string {
  const path = Config.get('csrf.cookiePath', 'string', '/');
  const secure = Config.get('csrf.cookieSecure', 'boolean', process.env.NODE_ENV === 'production');
  const httpOnly = Config.get('csrf.cookieHttpOnly', 'boolean', true);
  const sameSite = normalizeSameSite(Config.get('csrf.cookieSameSite', 'string', 'strict'));

  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) {
    parts.push('HttpOnly');
  }
  if (secure || sameSite === 'None') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function normalizeSameSite(value: string): 'Strict' | 'Lax' | 'None' {
  const normalized = value.toLowerCase();
  if (normalized === 'strict') return 'Strict';
  if (normalized === 'none') return 'None';
  return 'Lax';
}
