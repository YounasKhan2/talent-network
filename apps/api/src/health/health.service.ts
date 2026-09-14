import { Inject, Injectable } from '@nestjs/common';
import type { ReadinessDependency, ReadinessResponse } from '@talent-network/contracts';
import type { DatabaseClient } from '@talent-network/database';
import type { Redis } from 'ioredis';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  liveness() {
    return {
      service: 'api',
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const dependencies = await Promise.all([
      this.probe('postgres', async () => {
        await this.database.$queryRaw`SELECT 1`;
      }),
      this.probe('redis', async () => {
        if (this.redis.status === 'wait') await this.redis.connect();
        await this.redis.ping();
      }),
    ]);

    const ready = dependencies.every((dependency) => dependency.status === 'ok');

    return {
      service: 'api',
      status: ready ? 'ok' : 'unavailable',
      timestamp: new Date().toISOString(),
      dependencies,
    };
  }

  private async probe(name: string, operation: () => Promise<void>): Promise<ReadinessDependency> {
    const startedAt = performance.now();

    try {
      await operation();
      return {
        name,
        status: 'ok',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch {
      return {
        name,
        status: 'unavailable',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }
  }
}
