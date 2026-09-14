import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  assertCsrf,
  clearAuthCookies,
  CSRF_COOKIE,
  readOptionalSessionToken,
  readSessionToken,
  SESSION_COOKIE,
  sessionContextFromRequest,
  setAuthCookies,
  type RequestLike,
  type ResponseLike,
} from './auth.http.js';

void test('reads session cookie and preserves encoded token values', () => {
  const request: RequestLike = {
    headers: { cookie: `other=value; ${SESSION_COOKIE}=token%2Fwith%2Fslashes` },
  };

  assert.equal(readSessionToken(request), 'token/with/slashes');
  assert.equal(readOptionalSessionToken(request), 'token/with/slashes');
});

void test('requires authentication when the session cookie is absent', () => {
  assert.throws(() => readSessionToken({ headers: {} }), UnauthorizedException);
  assert.equal(readOptionalSessionToken({ headers: {} }), null);
});

void test('accepts csrf only when the cookie and header match', () => {
  const request: RequestLike = {
    headers: {
      cookie: `${CSRF_COOKIE}=csrf-value`,
      'x-csrf-token': 'csrf-value',
    },
  };

  assert.doesNotThrow(() => assertCsrf(request));
});

void test('rejects missing or mismatched csrf tokens', () => {
  assert.throws(() => assertCsrf({ headers: {} }), ForbiddenException);
  assert.throws(
    () =>
      assertCsrf({
        headers: {
          cookie: `${CSRF_COOKIE}=cookie-token`,
          'x-csrf-token': 'header-token',
        },
      }),
    ForbiddenException,
  );
});

void test('sets secure session and readable csrf cookies with matching lifetime', () => {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const response: ResponseLike = {
    cookie(name, value, options) {
      cookies.push({ name, value, options });
    },
    clearCookie() {},
  };

  const csrfToken = setAuthCookies(response, 'session-value', true);

  assert.equal(cookies.length, 2);
  assert.deepEqual(cookies[0], {
    name: SESSION_COOKIE,
    value: 'session-value',
    options: {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
  assert.equal(cookies[1]?.name, CSRF_COOKIE);
  assert.equal(cookies[1]?.value, csrfToken);
  assert.equal(cookies[1]?.options.httpOnly, false);
  assert.equal(cookies[1]?.options.secure, true);
});

void test('clears both auth cookies with the same security scope', () => {
  const cleared: Array<{ name: string; options: Record<string, unknown> }> = [];
  const response: ResponseLike = {
    cookie() {},
    clearCookie(name, options) {
      cleared.push({ name, options });
    },
  };

  clearAuthCookies(response, false);

  assert.deepEqual(cleared, [
    {
      name: SESSION_COOKIE,
      options: { httpOnly: true, secure: false, sameSite: 'lax', path: '/' },
    },
    {
      name: CSRF_COOKIE,
      options: { httpOnly: false, secure: false, sameSite: 'lax', path: '/' },
    },
  ]);
});

void test('derives user agent and first forwarded ip from the request', () => {
  assert.deepEqual(
    sessionContextFromRequest({
      headers: {
        'user-agent': 'TalentNetworkTest/1.0',
        'x-forwarded-for': '203.0.113.10, 10.0.0.4',
      },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    { userAgent: 'TalentNetworkTest/1.0', ip: '203.0.113.10' },
  );
});
