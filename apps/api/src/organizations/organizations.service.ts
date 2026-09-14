import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { DATABASE_CLIENT } from '../database/database.module.js';

export interface CreateOrganizationInput {
  displayName: string;
  legalName?: string;
  slug?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async create(userId: string, input: CreateOrganizationInput) {
    const displayName = input.displayName.trim();
    const legalName = input.legalName?.trim() || null;
    const slug = normalizeSlug(input.slug?.trim() || displayName);

    try {
      return await this.database.$transaction(async (transaction) => {
        const organization = await transaction.organization.create({
          data: {
            displayName,
            legalName,
            slug,
          },
        });

        await transaction.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId,
            roleKey: 'ORG_OWNER',
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        });

        await transaction.auditEvent.create({
          data: {
            organizationId: organization.id,
            actorType: 'USER',
            actorId: userId,
            action: 'organization.created',
            resourceType: 'Organization',
            resourceId: organization.id,
            metadata: { slug: organization.slug },
          },
        });

        await transaction.outboxEvent.create({
          data: {
            organizationId: organization.id,
            aggregateType: 'Organization',
            aggregateId: organization.id,
            eventType: 'organization.created',
            payload: { organizationId: organization.id },
          },
        });

        return organization;
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('That organization slug is already in use.');
      }
      throw error;
    }
  }

  async getById(organizationId: string) {
    return this.database.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        id: true,
        displayName: true,
        legalName: true,
        slug: true,
        primaryDomain: true,
        verificationStatus: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

function normalizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

  if (!slug) throw new ConflictException('Organization name cannot produce a valid slug.');
  return slug;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
