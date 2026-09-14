import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [DatabaseModule, RedisModule, AuthModule, OrganizationsModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
