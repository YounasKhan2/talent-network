import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

const redisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis => {
    const env = parseApiEnv();
    return new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  },
};

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status === 'end') return;
    if (this.redis.status === 'wait') {
      this.redis.disconnect();
      return;
    }
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [redisProvider, RedisLifecycle],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
