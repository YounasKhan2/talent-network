import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Permission, SessionResponse } from '@talent-network/contracts';
import { AuthService } from '../auth/auth.service.js';

@Injectable()
export class AuthorizationService {
  constructor(private readonly authService: AuthService) {}

  async authorizeOrganization(
    sessionToken: string,
    organizationId: string,
    permission: Permission,
  ): Promise<SessionResponse> {
    const session = await this.authService.getSession(sessionToken);
    const membership = session.memberships.find(
      (candidate) => candidate.organizationId === organizationId,
    );

    if (!membership || !membership.permissions.includes(permission)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    return session;
  }
}
