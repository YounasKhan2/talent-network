import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationInvitationDeliveryService } from './organization-invitation-delivery.service.js';
import { OrganizationInvitationsService } from './organization-invitations.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationInvitationsService,
    OrganizationInvitationDeliveryService,
  ],
})
export class OrganizationsModule {}
