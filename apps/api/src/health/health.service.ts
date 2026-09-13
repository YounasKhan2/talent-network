import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import type { ReadinessDependency, ReadinessResponse } from '@talent-network/contracts';
import { createDatabaseClient, type DatabaseClient } from '@talent-network/database';
import Redis from 'ioredis';

@Injectable()
export class HealthService implements OnApplicationShutdown {
  private readonly env = parseApiEnv();
  private readonly database: DatabaseClient = createDatabaseClient(this.env.DATABASE_URL);
  private readonly redis = new Redis(this.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

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

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.database.$disconnect(), this.redis.quit()]);
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
