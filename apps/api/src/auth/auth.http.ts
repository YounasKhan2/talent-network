import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createOpaqueToken } from './auth.crypto.js';

export const SESSION_COOKIE = 'tn_session';
export const CSRF_COOKIE = 'tn_csrf';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | undefined };
}

export interface ResponseLike {
  cookie(
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'lax' | 'strict' | 'none';
      path?: string;
      maxAge?: number;
    },
  ): void;
  clearCookie(
    name: string,
    options: { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none'; path?: string },
  ): void;
}

export function readSessionToken(request: RequestLike): string {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) throw new UnauthorizedException('Authentication is required.');
  return token;
}

export function readOptionalSessionToken(request: RequestLike): string | null {
  return readCookie(request, SESSION_COOKIE);
}

export function assertCsrf(request: RequestLike): void {
  const cookieToken = readCookie(request, CSRF_COOKIE);
  const headerValue = request.headers['x-csrf-token'];
  const headerToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new ForbiddenException('Invalid CSRF token.');
  }
}

export function setAuthCookies(response: ResponseLike, sessionToken: string, production: boolean): string {
  const csrfToken = createOpaqueToken();

  response.cookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
  response.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });

  return csrfToken;
}

export function clearAuthCookies(response: ResponseLike, production: boolean): void {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
  });
  response.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: production,
    sameSite: 'lax',
    path: '/',
  });
}

export function sessionContextFromRequest(request: RequestLike): { userAgent?: string; ip?: string } {
  const userAgentValue = request.headers['user-agent'];
  const forwardedForValue = request.headers['x-forwarded-for'];
  const userAgent = Array.isArray(userAgentValue) ? userAgentValue[0] : userAgentValue;
  const forwardedFor = Array.isArray(forwardedForValue) ? forwardedForValue[0] : forwardedForValue;
  const ip = forwardedFor?.split(',')[0]?.trim() || request.socket?.remoteAddress;

  return { userAgent, ip };
}

function readCookie(request: RequestLike, name: string): string | null {
  const cookieHeaderValue = request.headers.cookie;
  const cookieHeader = Array.isArray(cookieHeaderValue) ? cookieHeaderValue[0] : cookieHeaderValue;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return null;
}
