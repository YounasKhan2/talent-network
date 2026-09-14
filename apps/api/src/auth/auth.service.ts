import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ORGANIZATION_ROLE_KEYS,
  ROLE_PERMISSIONS,
  type OrganizationRoleKey,
  type SessionResponse,
} from '@talent-network/contracts';
import type { DatabaseClient } from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';
import {
  createOpaqueToken,
  hashContextValue,
  hashOpaqueToken,
  hashPassword,
  verifyPassword,
} from './auth.crypto.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export interface SessionContext {
  userAgent?: string;
  ip?: string;
}

interface AuthResult {
  sessionToken: string;
  session: SessionResponse;
}

export interface OneTimeTokenDelivery {
  email: string;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async signup(email: string, password: string, context: SessionContext): Promise<AuthResult> {
    const primaryEmail = normalizeEmail(email);
    const existing = await this.database.user.findUnique({
      where: { primaryEmail },
      select: { id: true },
    });

    if (existing) throw new ConflictException('An account already exists for this email address.');

    const passwordHash = await hashPassword(password);
    const sessionToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    try {
      const user = await this.database.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: { primaryEmail, passwordHash },
          select: { id: true, primaryEmail: true, emailVerifiedAt: true },
        });

        await transaction.session.create({
          data: {
            userId: createdUser.id,
            tokenHash,
            expiresAt,
            userAgentHash: hashContextValue(context.userAgent),
            ipHash: hashContextValue(context.ip),
          },
        });

        await transaction.auditEvent.create({
          data: {
            actorType: 'USER',
            actorId: createdUser.id,
            action: 'auth.user.created',
            resourceType: 'User',
            resourceId: createdUser.id,
          },
        });

        await transaction.outboxEvent.create({
          data: {
            aggregateType: 'User',
            aggregateId: createdUser.id,
            eventType: 'identity.user.created',
            payload: { userId: createdUser.id },
          },
        });

        return createdUser;
      });

      return {
        sessionToken,
        session: {
          user: {
            id: user.id,
            primaryEmail: user.primaryEmail,
            emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
          },
          memberships: [],
        },
      };
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('An account already exists for this email address.');
      }
      throw error;
    }
  }

  async login(email: string, password: string, context: SessionContext): Promise<AuthResult> {
    const primaryEmail = normalizeEmail(email);
    const user = await this.database.user.findUnique({ where: { primaryEmail } });

    if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const sessionToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.database.$transaction([
      this.database.session.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(sessionToken),
          expiresAt,
          userAgentHash: hashContextValue(context.userAgent),
          ipHash: hashContextValue(context.ip),
        },
      }),
      this.database.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: user.id,
          action: 'auth.session.created',
          resourceType: 'User',
          resourceId: user.id,
        },
      }),
    ]);

    return { sessionToken, session: await this.getSession(sessionToken) };
  }

  async requestEmailVerification(userId: string): Promise<OneTimeTokenDelivery | null> {
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { id: true, primaryEmail: true, emailVerifiedAt: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE' || user.emailVerifiedAt) return null;

    const token = createOpaqueToken();
    const now = new Date();

    await this.database.$transaction(async (transaction) => {
      await transaction.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS),
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: userId,
          action: 'auth.email_verification.requested',
          resourceType: 'User',
          resourceId: userId,
        },
      });
    });

    return { email: user.primaryEmail, token };
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const record = await this.database.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (
      !record ||
      record.consumedAt ||
      record.expiresAt <= now ||
      record.user.status !== 'ACTIVE'
    ) {
      throw invalidOneTimeToken();
    }

    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.emailVerificationToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidOneTimeToken();

      await transaction.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: record.userId,
          action: 'auth.email.verified',
          resourceType: 'User',
          resourceId: record.userId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: record.userId,
          eventType: 'identity.email.verified',
          payload: { userId: record.userId },
        },
      });
    });
  }

  async requestPasswordReset(email: string): Promise<OneTimeTokenDelivery | null> {
    const user = await this.database.user.findUnique({
      where: { primaryEmail: normalizeEmail(email) },
      select: { id: true, primaryEmail: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return null;

    const token = createOpaqueToken();
    const now = new Date();

    await this.database.$transaction(async (transaction) => {
      await transaction.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
        },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: user.id,
          action: 'auth.password_reset.requested',
          resourceType: 'User',
          resourceId: user.id,
        },
      });
    });

    return { email: user.primaryEmail, token };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = hashOpaqueToken(token);
    const record = await this.database.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (
      !record ||
      record.consumedAt ||
      record.expiresAt <= now ||
      record.user.status !== 'ACTIVE'
    ) {
      throw invalidOneTimeToken();
    }

    const passwordHash = await hashPassword(password);

    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw invalidOneTimeToken();

      await transaction.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await transaction.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: record.userId,
          action: 'auth.password.reset',
          resourceType: 'User',
          resourceId: record.userId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'User',
          aggregateId: record.userId,
          eventType: 'identity.password.reset',
          payload: { userId: record.userId },
        },
      });
    });
  }

  async logout(sessionToken: string): Promise<void> {
    const tokenHash = hashOpaqueToken(sessionToken);
    const session = await this.database.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!session || session.revokedAt) return;

    await this.database.$transaction([
      this.database.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      }),
      this.database.auditEvent.create({
        data: {
          actorType: 'USER',
          actorId: session.userId,
          action: 'auth.session.revoked',
          resourceType: 'User',
          resourceId: session.userId,
        },
      }),
    ]);
  }

  async refresh(sessionToken: string, context: SessionContext): Promise<AuthResult> {
    const tokenHash = hashOpaqueToken(sessionToken);
    const current = await this.database.session.findUnique({ where: { tokenHash } });

    if (!current || current.revokedAt || current.expiresAt <= new Date()) {
      throw new UnauthorizedException('Session is invalid or expired.');
    }

    const nextToken = createOpaqueToken();
    const now = new Date();

    await this.database.$transaction(async (transaction) => {
      const revoked = await transaction.session.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, rotatedAt: now },
      });

      if (revoked.count !== 1) throw new UnauthorizedException('Session has already been rotated.');

      await transaction.session.create({
        data: {
          userId: current.userId,
          tokenHash: hashOpaqueToken(nextToken),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
          userAgentHash: hashContextValue(context.userAgent),
          ipHash: hashContextValue(context.ip),
        },
      });
    });

    return { sessionToken: nextToken, session: await this.getSession(nextToken) };
  }

  async getSession(sessionToken: string): Promise<SessionResponse> {
    const tokenHash = hashOpaqueToken(sessionToken);
    const session = await this.database.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            memberships: {
              where: { status: 'ACTIVE' },
              include: { organization: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException('Session is invalid or expired.');
    }

    await this.database.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      user: {
        id: session.user.id,
        primaryEmail: session.user.primaryEmail,
        emailVerifiedAt: session.user.emailVerifiedAt?.toISOString() ?? null,
      },
      memberships: session.user.memberships.flatMap((membership) => {
        const roleKey = parseRoleKey(membership.roleKey);
        if (!roleKey) return [];

        return [
          {
            organizationId: membership.organizationId,
            displayName: membership.organization.displayName,
            slug: membership.organization.slug,
            roleKey,
            permissions: ROLE_PERMISSIONS[roleKey],
          },
        ];
      }),
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function parseRoleKey(value: string): OrganizationRoleKey | null {
  return ORGANIZATION_ROLE_KEYS.includes(value as OrganizationRoleKey)
    ? (value as OrganizationRoleKey)
    : null;
}

function invalidOneTimeToken(): BadRequestException {
  return new BadRequestException({
    code: 'AUTH_TOKEN_INVALID',
    message: 'This authentication link is invalid or has expired.',
  });
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
