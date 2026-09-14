import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { writeAuditEvent, writeOutboxEvent } from '../events/transactional-events.js';
import type { OrganizationInvitationDeliveryService } from '../organizations/organization-invitation-delivery.service.js';
import { OrganizationInvitationsService } from '../organizations/organization-invitations.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 1 integration tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 1 identity, tenancy, invitations, audit and outbox flows persist atomically', async (t) => {
  const runId = randomUUID();
  const ownerEmail = `owner-${runId}@integration.local`;
  const recruiterEmail = `recruiter-${runId}@integration.local`;
  const outsiderEmail = `outsider-${runId}@integration.local`;
  const password = 'IntegrationPass!2026';
  const nextPassword = 'IntegrationPass!2027';
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const auth = new AuthService(database);
  const organizations = new OrganizationsService(database);
  const authorization = new AuthorizationService(auth);

  let deliveredInvitationToken: string | null = null;
  const deliveryService = {
    sendInvitation: (_email: string, token: string) => {
      deliveredInvitationToken = token;
      return Promise.resolve();
    },
  } as OrganizationInvitationDeliveryService;
  const invitations = new OrganizationInvitationsService(database, deliveryService);

  try {
    const ownerSignup = await auth.signup(ownerEmail, password, {
      userAgent: 'phase1-integration',
      ip: '127.0.0.1',
    });
    userIds.push(ownerSignup.session.user.id);

    await t.test('signup creates a durable session plus audit and outbox records', async () => {
      const session = await auth.getSession(ownerSignup.sessionToken);
      assert.equal(session.user.primaryEmail, ownerEmail);

      const [auditEvent, outboxEvent] = await Promise.all([
        database.auditEvent.findFirst({
          where: {
            actorId: session.user.id,
            action: 'auth.user.created',
            resourceId: session.user.id,
          },
        }),
        database.outboxEvent.findFirst({
          where: {
            aggregateType: 'User',
            aggregateId: session.user.id,
            eventType: 'identity.user.created',
          },
        }),
      ]);

      assert.ok(auditEvent);
      assert.ok(outboxEvent);
    });

    const organization = await organizations.create(ownerSignup.session.user.id, {
      displayName: `Integration Organization ${runId}`,
      slug: `integration-${runId}`,
    });
    organizationIds.push(organization.id);

    await t.test(
      'organization creation atomically establishes owner membership and events',
      async () => {
        const [membership, auditEvent, outboxEvent] = await Promise.all([
          database.organizationMember.findUnique({
            where: {
              organizationId_userId: {
                organizationId: organization.id,
                userId: ownerSignup.session.user.id,
              },
            },
          }),
          database.auditEvent.findFirst({
            where: {
              organizationId: organization.id,
              action: 'organization.created',
              resourceId: organization.id,
            },
          }),
          database.outboxEvent.findFirst({
            where: {
              organizationId: organization.id,
              aggregateType: 'Organization',
              aggregateId: organization.id,
              eventType: 'organization.created',
            },
          }),
        ]);

        assert.equal(membership?.roleKey, 'ORG_OWNER');
        assert.equal(membership?.status, 'ACTIVE');
        assert.ok(auditEvent);
        assert.ok(outboxEvent);
      },
    );

    const recruiterSignup = await auth.signup(recruiterEmail, password, {});
    userIds.push(recruiterSignup.session.user.id);

    await invitations.create(organization.id, ownerSignup.session.user.id, {
      email: recruiterEmail,
      roleKey: 'RECRUITER',
    });

    assert.ok(deliveredInvitationToken);
    const accepted = await invitations.accept(
      recruiterSignup.session.user.id,
      recruiterEmail,
      deliveredInvitationToken,
    );

    await t.test(
      'invitation acceptance creates membership, verifies email and emits events',
      async () => {
        assert.equal(accepted.organization.id, organization.id);
        assert.equal(accepted.roleKey, 'RECRUITER');

        const [recruiter, membership, auditEvent, outboxEvent] = await Promise.all([
          database.user.findUnique({ where: { id: recruiterSignup.session.user.id } }),
          database.organizationMember.findUnique({
            where: {
              organizationId_userId: {
                organizationId: organization.id,
                userId: recruiterSignup.session.user.id,
              },
            },
          }),
          database.auditEvent.findFirst({
            where: {
              organizationId: organization.id,
              actorId: recruiterSignup.session.user.id,
              action: 'organization.invitation.accepted',
            },
          }),
          database.outboxEvent.findFirst({
            where: {
              organizationId: organization.id,
              eventType: 'organization.member.joined',
            },
          }),
        ]);

        assert.ok(recruiter?.emailVerifiedAt);
        assert.equal(membership?.roleKey, 'RECRUITER');
        assert.equal(membership?.status, 'ACTIVE');
        assert.ok(auditEvent);
        assert.ok(outboxEvent);
      },
    );

    await t.test('permission bundles enforce tenant-aware recruiter boundaries', async () => {
      await authorization.authorizeOrganization(
        recruiterSignup.sessionToken,
        organization.id,
        'organization.members.read',
      );

      await assert.rejects(
        () =>
          authorization.authorizeOrganization(
            recruiterSignup.sessionToken,
            organization.id,
            'organization.members.manage',
          ),
        ForbiddenException,
      );

      const outsiderSignup = await auth.signup(outsiderEmail, password, {});
      userIds.push(outsiderSignup.session.user.id);
      const outsiderOrganization = await organizations.create(outsiderSignup.session.user.id, {
        displayName: `Outsider Organization ${runId}`,
        slug: `outsider-${runId}`,
      });
      organizationIds.push(outsiderOrganization.id);

      await assert.rejects(
        () =>
          authorization.authorizeOrganization(
            recruiterSignup.sessionToken,
            outsiderOrganization.id,
            'organization.read',
          ),
        ForbiddenException,
      );
    });

    await t.test('session rotation invalidates the replaced session', async () => {
      const rotated = await auth.refresh(recruiterSignup.sessionToken, {
        userAgent: 'phase1-integration-rotated',
      });

      await assert.rejects(
        () => auth.getSession(recruiterSignup.sessionToken),
        UnauthorizedException,
      );
      const current = await auth.getSession(rotated.sessionToken);
      assert.equal(current.user.id, recruiterSignup.session.user.id);
    });

    await t.test(
      'password reset revokes active sessions and accepts the new password',
      async () => {
        const resetDelivery = await auth.requestPasswordReset(ownerEmail);
        assert.ok(resetDelivery);

        await auth.resetPassword(resetDelivery.token, nextPassword);
        await assert.rejects(
          () => auth.getSession(ownerSignup.sessionToken),
          UnauthorizedException,
        );

        const login = await auth.login(ownerEmail, nextPassword, {});
        assert.equal(login.session.user.id, ownerSignup.session.user.id);
      },
    );

    await t.test(
      'transactional event writers roll back with a failed domain transaction',
      async () => {
        const resourceId = randomUUID();

        await assert.rejects(
          () =>
            database.$transaction(async (transaction) => {
              await writeAuditEvent(transaction, {
                actorType: 'USER',
                actorId: ownerSignup.session.user.id,
                action: 'integration.rollback.audit',
                resourceType: 'IntegrationProbe',
                resourceId,
              });
              await writeOutboxEvent(transaction, {
                aggregateType: 'IntegrationProbe',
                aggregateId: resourceId,
                eventType: 'integration.rollback.outbox',
                payload: { resourceId },
              });
              throw new Error('force rollback');
            }),
          /force rollback/,
        );

        const [auditCount, outboxCount] = await Promise.all([
          database.auditEvent.count({
            where: { resourceId, action: 'integration.rollback.audit' },
          }),
          database.outboxEvent.count({
            where: { aggregateId: resourceId, eventType: 'integration.rollback.outbox' },
          }),
        ]);

        assert.equal(auditCount, 0);
        assert.equal(outboxCount, 0);
      },
    );
  } finally {
    if (userIds.length || organizationIds.length) {
      await database.auditEvent.deleteMany({
        where: {
          OR: [
            ...(userIds.length ? [{ actorId: { in: userIds } }] : []),
            ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
          ],
        },
      });
      await database.outboxEvent.deleteMany({
        where: {
          OR: [
            ...(userIds.length ? [{ aggregateId: { in: userIds } }] : []),
            ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
          ],
        },
      });
      if (organizationIds.length) {
        await database.organization.deleteMany({ where: { id: { in: organizationIds } } });
      }
      if (userIds.length) {
        await database.user.deleteMany({ where: { id: { in: userIds } } });
      }
    }
    await database.$disconnect();
  }
});
