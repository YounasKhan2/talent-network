import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';

@Injectable()
export class OrganizationInvitationDeliveryService {
  private readonly env = parseApiEnv();

  sendInvitation(email: string, token: string): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException({
        code: 'ORGANIZATION_INVITATION_MAIL_UNAVAILABLE',
        message: 'Organization invitation email delivery is not configured yet.',
      });
    }

    const url = `${this.env.WEB_ORIGIN}/invitations/accept?token=${encodeURIComponent(token)}`;
    process.stdout.write(`[dev-mail] organization invitation for ${email}: ${url}\n`);
    return Promise.resolve();
  }
}
