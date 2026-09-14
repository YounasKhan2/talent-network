import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import { createDatabaseClient, type DatabaseClient } from '@talent-network/database';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

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
        return createDatabaseClient(env.DATABASE_URL);
      },
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE_CLIENT],
})
export class DatabaseModule {}
