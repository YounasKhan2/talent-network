import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AuthRateLimitService } from './auth-rate-limit.service.js';

function createCountingRedis(): Redis {
  const counts = new Map<string, number>();
  return {
    eval: (...args: unknown[]) => {
      const key = String(args[2]);
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return Promise.resolve([next, 15 * 60 * 1000]);
    },
  } as unknown as Redis;
}

test('login account policy allows ten attempts and rate limits the eleventh', async () => {
  const service = new AuthRateLimitService(createCountingRedis());

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    await service.assertLoginAllowed('Candidate@Example.com', `203.0.113.${attempt}`);
  }

  await assert.rejects(
    () => service.assertLoginAllowed(' candidate@example.com ', '203.0.113.200'),
    (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 429);
      assert.deepEqual(error.getResponse(), {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfterSeconds: 900,
      });
      return true;
    },
  );
});

test('signup applies an independent email limit', async () => {
  const service = new AuthRateLimitService(createCountingRedis());

  await service.assertSignupAllowed('new@example.com', '203.0.113.1');
  await service.assertSignupAllowed('new@example.com', '203.0.113.2');
  await service.assertSignupAllowed('new@example.com', '203.0.113.3');

  await assert.rejects(() => service.assertSignupAllowed('new@example.com', '203.0.113.4'), HttpException);
});

test('fails closed when redis is unavailable', async () => {
  const redis = {
    eval: () => Promise.reject(new Error('redis unavailable')),
  } as unknown as Redis;
  const service = new AuthRateLimitService(redis);

  await assert.rejects(
    () => service.assertLoginAllowed('candidate@example.com', '203.0.113.10'),
    (error: unknown) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.deepEqual(error.getResponse(), {
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable. Please try again shortly.',
      });
      return true;
    },
  );
});

test('fails closed when redis returns an invalid rate-limit result', async () => {
  const redis = {
    eval: () => Promise.resolve(['invalid']),
  } as unknown as Redis;
  const service = new AuthRateLimitService(redis);

  await assert.rejects(
    () => service.assertTokenConsumeAllowed('203.0.113.10'),
    ServiceUnavailableException,
  );
});
