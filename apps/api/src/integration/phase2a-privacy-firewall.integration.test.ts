import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { createDatabaseClient } from '@talent-network/database';
import { AccountContextService } from '../account/account-context.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import type { OrganizationInvitationDeliveryService } from '../organizations/organization-invitation-delivery.service.js';
import { OrganizationInvitationsService } from '../organizations/organization-invitations.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 2A integration tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 2A privacy firewall keeps Career and Organization contexts isolated', async (t) => {
  const runId = randomUUID();
  const ownerEmail = `privacy-owner-${runId}@integration.local`;
  const candidateEmail = `privacy-candidate-${runId}@integration.local`;
  const password = 'IntegrationPass!2026';
  const userIds: string[] = [];
  const organizationIds: string[] = [];
  const candidateIds: string[] = [];

  const auth = new AuthService(database);
  const candidates = new CandidatesService(database);
  const organizations = new OrganizationsService(database);
  const accountContexts = new AccountContextService(database, auth);

  let deliveredInvitationToken: string | null = null;
  const deliveryService = {
    sendInvitation: (_email: string, token: string) => {
      deliveredInvitationToken = token;
      return Promise.resolve();
    },
  } as OrganizationInvitationDeliveryService;
  const invitations = new OrganizationInvitationsService(database, deliveryService);

  try {
    const ownerSignup = await auth.signup(ownerEmail, password, { ip: '127.0.0.1' });
    const candidateSignup = await auth.signup(candidateEmail, password, { ip: '127.0.0.1' });
    userIds.push(ownerSignup.session.user.id, candidateSignup.session.user.id);

    const organization = await organizations.create(ownerSignup.session.user.id, {
      displayName: `Privacy Firewall ${runId}`,
      slug: `privacy-${runId}`,
    });
    organizationIds.push(organization.id);

    const candidate = await candidates.initialize(candidateSignup.session.user.id);
    candidateIds.push(candidate.id);
    await candidates.updateOverview(candidateSignup.session.user.id, {
      headline: 'Private Candidate Headline',
      summary: 'Private professional summary.',
      availabilityStatus: 'OPEN_TO_OFFERS',
      compensationCurrency: 'USD',
      compensationTarget: 90000,
      compensationPeriod: 'ANNUAL',
      preferredWorkModes: ['REMOTE'],
    });

    await t.test('Career Passport lookup is bound to the authenticated user identity', async () => {
      await assert.rejects(
        () => candidates.getPassport(ownerSignup.session.user.id),
        (error: unknown) => error instanceof NotFoundException,
      );

      const privatePassport = await candidates.getPassport(candidateSignup.session.user.id);
      assert.equal(privatePassport.currentProfileVersion?.headline, 'Private Candidate Headline');
      assert.equal(privatePassport.currentProfileVersion?.compensationTarget, 90000);
    });

    await t.test(
      'account context discovery exposes capability metadata but no professional data',
      async () => {
        const context = await accountContexts.resolve(candidateSignup.sessionToken);
        assert.equal(context.career.available, true);
        assert.equal(context.career.candidateId, candidate.id);
        assert.deepEqual(Object.keys(context.career).sort(), ['available', 'candidateId']);
        assert.equal('headline' in context.career, false);
        assert.equal('compensationTarget' in context.career, false);
        assert.equal('availabilityStatus' in context.career, false);
      },
    );

    await t.test(
      'candidate accepting an organization invitation preserves private Career state',
      async () => {
        const before = await candidates.getPassport(candidateSignup.session.user.id);
        const beforeVersionId = before.currentProfileVersionId;
        const beforeVisibility = before.visibility;
        const beforeDiscoverability = before.discoverability;

        await invitations.create(organization.id, ownerSignup.session.user.id, {
          email: candidateEmail,
          roleKey: 'RECRUITER',
        });
        assert.ok(deliveredInvitationToken);

        await invitations.accept(
          candidateSignup.session.user.id,
          candidateSignup.session.user.primaryEmail,
          deliveredInvitationToken,
        );

        const after = await candidates.getPassport(candidateSignup.session.user.id);
        assert.equal(after.id, before.id);
        assert.equal(after.currentProfileVersionId, beforeVersionId);
        assert.equal(after.visibility, beforeVisibility);
        assert.equal(after.discoverability, beforeDiscoverability);
        assert.equal(after.currentProfileVersion?.headline, 'Private Candidate Headline');
        assert.equal(after.currentProfileVersion?.compensationTarget, 90000);

        const context = await accountContexts.resolve(candidateSignup.sessionToken);
        assert.equal(context.career.available, true);
        assert.equal(context.organizations.length, 1);
        assert.equal(context.organizations[0]?.organizationId, organization.id);
        assert.equal(context.organizations[0]?.roleKey, 'RECRUITER');

        await assert.rejects(
          () => candidates.getPassport(ownerSignup.session.user.id),
          (error: unknown) => error instanceof NotFoundException,
        );
      },
    );

    await t.test(
      'creating Career for an organization member preserves memberships and permissions',
      async () => {
        const beforeSession = await auth.getSession(ownerSignup.sessionToken);
        assert.equal(beforeSession.memberships.length, 1);
        assert.equal(beforeSession.memberships[0]?.roleKey, 'ORG_OWNER');

        const ownerCandidate = await candidates.initialize(ownerSignup.session.user.id);
        candidateIds.push(ownerCandidate.id);

        const afterSession = await auth.getSession(ownerSignup.sessionToken);
        assert.deepEqual(afterSession.memberships, beforeSession.memberships);

        const context = await accountContexts.resolve(ownerSignup.sessionToken);
        assert.equal(context.career.available, true);
        assert.equal(context.career.candidateId, ownerCandidate.id);
        assert.deepEqual(context.organizations, beforeSession.memberships);
      },
    );

    await t.test('candidate privacy changes do not alter organization membership', async () => {
      const beforeSession = await auth.getSession(candidateSignup.sessionToken);
      const beforeVersion = (await candidates.getPassport(candidateSignup.session.user.id))
        .currentProfileVersionId;

      await candidates.updateSettings(candidateSignup.session.user.id, {
        visibility: 'PRIVATE',
        discoverability: 'HIDDEN',
        timezone: 'Asia/Karachi',
      });

      const afterSession = await auth.getSession(candidateSignup.sessionToken);
      const afterPassport = await candidates.getPassport(candidateSignup.session.user.id);
      assert.deepEqual(afterSession.memberships, beforeSession.memberships);
      assert.equal(afterPassport.currentProfileVersionId, beforeVersion);
      assert.equal(afterPassport.visibility, 'PRIVATE');
      assert.equal(afterPassport.discoverability, 'HIDDEN');
    });
  } finally {
    await database.outboxEvent.deleteMany({
      where: {
        OR: [
          { aggregateId: { in: [...userIds, ...organizationIds, ...candidateIds] } },
          { organizationId: { in: organizationIds } },
        ],
      },
    });
    await database.auditEvent.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { organizationId: { in: organizationIds } },
          { resourceId: { in: candidateIds } },
        ],
      },
    });
    await database.organizationInvitation.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  }
});
