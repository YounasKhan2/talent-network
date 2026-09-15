import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import { createDatabaseClient, type DatabaseClient } from '@talent-network/database';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

const API_DATABASE_POOL_OVERRIDES = Object.freeze({
  max: 20,
  connectionTimeoutMillis: 10_000,
});

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (): DatabaseClient => {
        const env = parseApiEnv();
        return createDatabaseClient(env.DATABASE_URL, API_DATABASE_POOL_OVERRIDES);
      },
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
