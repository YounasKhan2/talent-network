import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationService } from './authorization.service.js';
import { OrganizationPermissionGuard } from './organization-permission.guard.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [
    AuthorizationService,
    OrganizationPermissionGuard,
    {
      provide: APP_GUARD,
      useExisting: OrganizationPermissionGuard,
    },
  ],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
