import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';

@Injectable()
export class AuthTokenDeliveryService {
  private readonly env = parseApiEnv();

  async sendEmailVerification(email: string, token: string): Promise<void> {
    await this.deliver(
      'email verification',
      email,
      `${this.env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`,
    );
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    await this.deliver(
      'password reset',
      email,
      `${this.env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  private deliver(kind: string, email: string, url: string): Promise<void> {
    if (this.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException({
        code: 'AUTH_MAIL_PROVIDER_UNAVAILABLE',
        message: 'Email delivery is not configured yet.',
      });
    }

    // Development-only delivery boundary. Replace with the production mail adapter before launch.
    // The raw one-time token exists only in memory and this local terminal output; it is never
    // written to PostgreSQL, audit events, or outbox payloads.
    process.stdout.write(`[dev-mail] ${kind} for ${email}: ${url}\n`);
    return Promise.resolve();
  }
}
