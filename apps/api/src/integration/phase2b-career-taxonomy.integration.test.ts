import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Career Passport taxonomy integration tests.');
}

const database = createDatabaseClient(connectionString);

void test('Career Passport core contact awards and taxonomy stay immutable and lossless', async (t) => {
  const runId = randomUUID();
  const email = `candidate-taxonomy-${runId}@integration.local`;
  const password = 'IntegrationPass!2026';
  const auth = new AuthService(database);
  const candidates = new CandidatesService(database);
  let userId: string | null = null;
  let candidateId: string | null = null;

  try {
    const signup = await auth.signup(email, password, { ip: '127.0.0.1' });
    userId = signup.session.user.id;
    const initialized = await candidates.initialize(userId);
    candidateId = initialized.id;

    await t.test('professional contact information versions separately from account identity', async () => {
      const before = await candidates.getPassport(userId!);
      const beforeVersion = before.currentProfileVersion!;

      const updated = await candidates.updateContactInformation(userId!, {
        fullName: 'Alex Morgan',
        email: 'career@example.test',
        phone: '+1 202 555 0187',
        location: 'Remote',
      });
      const updatedVersion = updated.currentProfileVersion!;

      assert.equal(updatedVersion.versionNumber, beforeVersion.versionNumber + 1);
      assert.equal(updatedVersion.contactFullName, 'Alex Morgan');
      assert.equal(updatedVersion.contactEmail, 'career@example.test');
      assert.equal(updatedVersion.contactPhone, '+1 202 555 0187');
      assert.equal(updatedVersion.contactLocation, 'Remote');

      const account = await database.user.findUniqueOrThrow({ where: { id: userId! } });
      assert.equal(account.primaryEmail, email);

      const cleared = await candidates.updateContactInformation(userId!, {
        fullName: null,
        email: null,
        phone: null,
        location: null,
      });
      assert.equal(cleared.currentProfileVersion!.contactFullName, null);
      assert.equal(cleared.currentProfileVersion!.contactEmail, null);
      assert.equal(cleared.currentProfileVersion!.contactPhone, null);
      assert.equal(cleared.currentProfileVersion!.contactLocation, null);

      const historical = await database.candidateProfileVersion.findUniqueOrThrow({
        where: { id: updatedVersion.id },
      });
      assert.equal(historical.contactEmail, 'career@example.test');
      assert.equal(historical.status, 'SUPERSEDED');
    });

    await t.test('awards preserve submitted order and untouched sections across snapshots', async () => {
      const awards = await candidates.replaceAwards(userId!, [
        {
          title: 'Engineering Excellence',
          issuer: 'Example University',
          awardedAt: new Date('2026-05-01T00:00:00.000Z'),
          description: 'Recognition for the final-year engineering project.',
          url: 'https://example.test/award',
        },
        {
          title: 'Hackathon Winner',
          issuer: 'Community Lab',
          awardedAt: new Date('2025-11-01T00:00:00.000Z'),
          description: null,
          url: null,
        },
      ]);

      assert.deepEqual(
        awards.currentProfileVersion!.awards.map((award) => [award.title, award.sortOrder]),
        [
          ['Engineering Excellence', 0],
          ['Hackathon Winner', 1],
        ],
      );

      const afterOverview = await candidates.updateOverview(userId!, {
        headline: 'Senior Software Engineer',
      });
      assert.deepEqual(
        afterOverview.currentProfileVersion!.awards.map((award) => award.title),
        ['Engineering Excellence', 'Hackathon Winner'],
      );
    });

    await t.test('recognized and unknown extension metadata survives unrelated version changes', async () => {
      const withSections = await candidates.replaceCustomSections(userId!, [
        {
          title: 'Research Publications',
          description: 'Selected published work.',
          sectionTypeKey: 'PUBLICATIONS',
          sourceHeading: 'RESEARCH PUBLICATIONS',
          classificationConfidence: 1,
          classificationStatus: 'AUTO_CLASSIFIED',
          items: [
            {
              title: 'Reliable Hiring Systems',
              subtitle: 'Systems Journal',
              description: null,
              startDate: new Date('2026-01-01T00:00:00.000Z'),
              endDate: null,
              url: 'https://example.test/publication',
            },
          ],
        },
        {
          title: 'Industry Involvement',
          description: null,
          sectionTypeKey: 'CUSTOM',
          sourceHeading: 'INDUSTRY INVOLVEMENT',
          classificationConfidence: 0,
          classificationStatus: 'NEEDS_REVIEW',
          items: [
            {
              title: 'Developer community contributor',
              subtitle: null,
              description: null,
              startDate: null,
              endDate: null,
              url: null,
            },
          ],
        },
      ]);

      const next = await candidates.replaceAwards(userId!, [
        {
          title: 'Engineering Excellence',
          issuer: 'Example University',
          awardedAt: null,
          description: null,
          url: null,
        },
      ]);

      assert.equal(next.currentProfileVersion!.versionNumber, withSections.currentProfileVersion!.versionNumber + 1);
      assert.deepEqual(
        next.currentProfileVersion!.customSections.map((section) => ({
          title: section.title,
          sectionTypeKey: section.sectionTypeKey,
          sourceHeading: section.sourceHeading,
          classificationConfidence: section.classificationConfidence,
          classificationStatus: section.classificationStatus,
        })),
        [
          {
            title: 'Research Publications',
            sectionTypeKey: 'PUBLICATIONS',
            sourceHeading: 'RESEARCH PUBLICATIONS',
            classificationConfidence: 1,
            classificationStatus: 'AUTO_CLASSIFIED',
          },
          {
            title: 'Industry Involvement',
            sectionTypeKey: 'CUSTOM',
            sourceHeading: 'INDUSTRY INVOLVEMENT',
            classificationConfidence: 0,
            classificationStatus: 'NEEDS_REVIEW',
          },
        ],
      );
    });
  } finally {
    if (candidateId) await database.candidate.deleteMany({ where: { id: candidateId } });
    if (userId) await database.user.deleteMany({ where: { id: userId } });
  }
});

test.after(async () => {
  await database.$disconnect();
});
