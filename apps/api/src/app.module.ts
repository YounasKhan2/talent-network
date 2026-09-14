import { Module } from '@nestjs/common';
import { AccountModule } from './account/account.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ResumesModule } from './resumes/resumes.module.js';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    AuthModule,
    AccountModule,
    AuthorizationModule,
    OrganizationsModule,
    CandidatesModule,
    ResumesModule,
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
