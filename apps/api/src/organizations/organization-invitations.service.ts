import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ORGANIZATION_ROLE_KEYS,
  type OrganizationRoleKey,
} from '@talent-network/contracts';
import type { DatabaseClient } from '@talent-network/database';
import { createOpaqueToken, hashOpaqueToken } from '../auth/auth.crypto.js';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { OrganizationInvitationDeliveryService } from './organization-invitation-delivery.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITABLE_ROLE_KEYS: readonly OrganizationRoleKey[] = ORGANIZATION_ROLE_KEYS.filter(
  (role) => role !== 'ORG_OWNER',
);

export interface CreateOrganizationInvitationInput {
  email: string;
  roleKey: OrganizationRoleKey;
}

@Injectable()
export class OrganizationInvitationsService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(OrganizationInvitationDeliveryService)
    private readonly deliveryService: OrganizationInvitationDeliveryService,
  ) {}

  async create(
    organizationId: string,
    invitedByUserId: string,
    input: CreateOrganizationInvitationInput,
  ) {
    const email = normalizeEmail(input.email);
    if (!INVITABLE_ROLE_KEYS.includes(input.roleKey)) {
      throw new BadRequestException('This role cannot be assigned through an invitation.');
    }

    const existingUser = await this.database.user.findUnique({
      where: { primaryEmail: email },
      select: {
        memberships: {
          where: { organizationId, status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });

    if (existingUser?.memberships.length) {
      throw new ConflictException('This person is already an active member of the organization.');
    }

    const rawToken = createOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.database.$transaction(async (transaction) => {
      await transaction.organizationInvitation.updateMany({
        where: { organizationId, email, status: 'PENDING' },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      const created = await transaction.organizationInvitation.create({
        data: {
          organizationId,
          email,
          roleKey: input.roleKey,
          tokenHash,
          invitedByUserId,
          expiresAt,
        },
        select: {
          id: true,
          organizationId: true,
          email: true,
          roleKey: true,
          status: true,
          expiresAt: true,
          createdAt: true,
        },
      });

      await transaction.auditEvent.create({
        data: {
          organizationId,
          actorType: 'USER',
          actorId: invitedByUserId,
          action: 'organization.invitation.created',
          resourceType: 'OrganizationInvitation',
          resourceId: created.id,
          metadata: { email, roleKey: input.roleKey },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          organizationId,
          aggregateType: 'OrganizationInvitation',
          aggregateId: created.id,
          eventType: 'organization.invitation.created',
          payload: {
            invitationId: created.id,
            organizationId,
            email,
            roleKey: input.roleKey,
          },
        },
      });

      return created;
    });

    try {
      await this.deliveryService.sendInvitation(email, rawToken);
      return invitation;
    } catch (error: unknown) {
      await this.database.$transaction([
        this.database.organizationInvitation.updateMany({
          where: { id: invitation.id, status: 'PENDING' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        }),
        this.database.auditEvent.create({
          data: {
            organizationId,
            actorType: 'USER',
            actorId: invitedByUserId,
            action: 'organization.invitation.delivery_failed',
            resourceType: 'OrganizationInvitation',
            resourceId: invitation.id,
          },
        }),
      ]);
      throw error;
    }
  }

  async accept(sessionUserId: string, sessionEmail: string, rawToken: string) {
    const tokenHash = hashOpaqueToken(rawToken);
    const now = new Date();

    return this.database.$transaction(async (transaction) => {
      const invitation = await transaction.organizationInvitation.findUnique({
        where: { tokenHash },
        include: { organization: true },
      });

      if (!invitation) {
        throw new BadRequestException({
          code: 'INVITATION_TOKEN_INVALID',
          message: 'Invitation is invalid or expired.',
        });
      }

      if (invitation.status !== 'PENDING' || invitation.expiresAt <= now) {
        if (invitation.status === 'PENDING' && invitation.expiresAt <= now) {
          await transaction.organizationInvitation.update({
            where: { id: invitation.id },
            data: { status: 'EXPIRED' },
          });
        }
        throw new BadRequestException({
          code: 'INVITATION_TOKEN_INVALID',
          message: 'Invitation is invalid or expired.',
        });
      }

      if (normalizeEmail(sessionEmail) !== invitation.email) {
        throw new ForbiddenException('This invitation belongs to a different email address.');
      }

      const consumed = await transaction.organizationInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('This invitation has already been handled.');
      }

      const membership = await transaction.organizationMember.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: sessionUserId,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: sessionUserId,
          roleKey: invitation.roleKey,
          status: 'ACTIVE',
          invitedAt: invitation.createdAt,
          joinedAt: now,
        },
        update: {
          roleKey: invitation.roleKey,
          status: 'ACTIVE',
          invitedAt: invitation.createdAt,
          joinedAt: now,
        },
        select: { id: true },
      });

      await transaction.user.updateMany({
        where: { id: sessionUserId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });

      await transaction.auditEvent.create({
        data: {
          organizationId: invitation.organizationId,
          actorType: 'USER',
          actorId: sessionUserId,
          action: 'organization.invitation.accepted',
          resourceType: 'OrganizationInvitation',
          resourceId: invitation.id,
          metadata: { roleKey: invitation.roleKey },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          organizationId: invitation.organizationId,
          aggregateType: 'OrganizationMember',
          aggregateId: membership.id,
          eventType: 'organization.member.joined',
          payload: {
            membershipId: membership.id,
            organizationId: invitation.organizationId,
            userId: sessionUserId,
            roleKey: invitation.roleKey,
          },
        },
      });

      return {
        organization: {
          id: invitation.organization.id,
          displayName: invitation.organization.displayName,
          slug: invitation.organization.slug,
        },
        roleKey: invitation.roleKey,
      };
    });
  }

  async list(organizationId: string) {
    return this.database.organizationInvitation.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        roleKey: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(organizationId: string, invitationId: string, actorUserId: string): Promise<void> {
    const invitation = await this.database.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
      select: { id: true, status: true },
    });
    if (!invitation) throw new NotFoundException('Invitation was not found.');
    if (invitation.status !== 'PENDING') {
      throw new ConflictException('Only pending invitations can be revoked.');
    }

    await this.database.$transaction([
      this.database.organizationInvitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
      this.database.auditEvent.create({
        data: {
          organizationId,
          actorType: 'USER',
          actorId: actorUserId,
          action: 'organization.invitation.revoked',
          resourceType: 'OrganizationInvitation',
          resourceId: invitationId,
        },
      }),
    ]);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
