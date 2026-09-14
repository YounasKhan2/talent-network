import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  OrganizationMembershipSummary,
  Permission,
  SessionResponse,
} from '@talent-network/contracts';
import { AuthService } from '../auth/auth.service.js';

export interface AuthorizedOrganizationContext {
  session: SessionResponse;
  membership: OrganizationMembershipSummary;
}

@Injectable()
export class AuthorizationService {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async authorizeOrganization(
    sessionToken: string,
    organizationId: string,
    permission: Permission,
  ): Promise<SessionResponse> {
    return (await this.authorizeOrganizationContext(sessionToken, organizationId, permission)).session;
  }

  async authorizeOrganizationContext(
    sessionToken: string,
    organizationId: string,
    permission: Permission,
  ): Promise<AuthorizedOrganizationContext> {
    const session = await this.authService.getSession(sessionToken);
    const membership = session.memberships.find(
      (candidate) => candidate.organizationId === organizationId,
    );

    if (!membership || !membership.permissions.includes(permission)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return { session, membership };
  }
}
