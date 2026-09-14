import { Inject, Injectable } from '@nestjs/common';
import type { AccountContextResponse } from '@talent-network/contracts';
import type { DatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { DATABASE_CLIENT } from '../database/database.module.js';

@Injectable()
export class AccountContextService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async resolve(sessionToken: string): Promise<AccountContextResponse> {
    const session = await this.authService.getSession(sessionToken);
    const candidate = await this.database.candidate.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    return {
      user: session.user,
      career: {
        available: Boolean(candidate),
        candidateId: candidate?.id ?? null,
      },
      organizations: session.memberships,
    };
  }
}
