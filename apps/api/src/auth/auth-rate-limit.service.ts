import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module.js';

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
}

const SIGNUP_IP_POLICY: RateLimitPolicy = {
  scope: 'signup:ip',
  limit: 5,
  windowMs: 15 * 60 * 1000,
};
const SIGNUP_EMAIL_POLICY: RateLimitPolicy = {
  scope: 'signup:email',
  limit: 3,
  windowMs: 60 * 60 * 1000,
};
const LOGIN_IP_POLICY: RateLimitPolicy = { scope: 'login:ip', limit: 20, windowMs: 15 * 60 * 1000 };
const LOGIN_ACCOUNT_POLICY: RateLimitPolicy = {
  scope: 'login:account',
  limit: 10,
  windowMs: 15 * 60 * 1000,
};
const PASSWORD_RESET_IP_POLICY: RateLimitPolicy = {
  scope: 'password-reset:ip',
  limit: 5,
  windowMs: 15 * 60 * 1000,
};
const PASSWORD_RESET_EMAIL_POLICY: RateLimitPolicy = {
  scope: 'password-reset:email',
  limit: 3,
  windowMs: 60 * 60 * 1000,
};
const EMAIL_VERIFICATION_IP_POLICY: RateLimitPolicy = {
  scope: 'email-verification:ip',
  limit: 10,
  windowMs: 60 * 60 * 1000,
};
const TOKEN_CONSUME_IP_POLICY: RateLimitPolicy = {
  scope: 'token-consume:ip',
  limit: 20,
  windowMs: 15 * 60 * 1000,
};

@Injectable()
export class AuthRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async assertSignupAllowed(email: string, ip?: string): Promise<void> {
    await Promise.all([
      this.consume(SIGNUP_IP_POLICY, ip ?? 'unknown'),
      this.consume(SIGNUP_EMAIL_POLICY, normalizeEmail(email)),
    ]);
  }

  async assertLoginAllowed(email: string, ip?: string): Promise<void> {
    await Promise.all([
      this.consume(LOGIN_IP_POLICY, ip ?? 'unknown'),
      this.consume(LOGIN_ACCOUNT_POLICY, normalizeEmail(email)),
    ]);
  }

  async assertPasswordResetRequestAllowed(email: string, ip?: string): Promise<void> {
    await Promise.all([
      this.consume(PASSWORD_RESET_IP_POLICY, ip ?? 'unknown'),
      this.consume(PASSWORD_RESET_EMAIL_POLICY, normalizeEmail(email)),
    ]);
  }

  async assertEmailVerificationRequestAllowed(ip?: string): Promise<void> {
    await this.consume(EMAIL_VERIFICATION_IP_POLICY, ip ?? 'unknown');
  }

  async assertTokenConsumeAllowed(ip?: string): Promise<void> {
    await this.consume(TOKEN_CONSUME_IP_POLICY, ip ?? 'unknown');
  }

  private async consume(policy: RateLimitPolicy, subject: string): Promise<void> {
    const key = `tn:ratelimit:auth:${policy.scope}:${hashIdentifier(subject)}`;

    let result: unknown;
    try {
      result = await this.redis.eval(RATE_LIMIT_SCRIPT, 1, key, String(policy.windowMs));
    } catch {
      throw new ServiceUnavailableException({
        code: 'AUTH_RATE_LIMIT_UNAVAILABLE',
        message: 'Authentication is temporarily unavailable. Please try again shortly.',
      });
    }

    const [count, ttlMs] = parseRateLimitResult(result);
    if (count <= policy.limit) return;

    throw new HttpException(
      {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

function hashIdentifier(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseRateLimitResult(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new ServiceUnavailableException(
      'Authentication rate limiting returned an invalid response.',
    );
  }

  const count = Number(value[0]);
  const ttlMs = Number(value[1]);
  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new ServiceUnavailableException(
      'Authentication rate limiting returned an invalid response.',
    );
  }

  return [count, ttlMs];
}
