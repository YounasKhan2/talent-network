import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 2 integration tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 2 Career Passport versions candidate-owned professional state', async (t) => {
  const runId = randomUUID();
  const email = `candidate-${runId}@integration.local`;
  const password = 'IntegrationPass!2026';
  const auth = new AuthService(database);
  const candidates = new CandidatesService(database);
  let userId: string | null = null;
  let candidateId: string | null = null;

  try {
    const signup = await auth.signup(email, password, { ip: '127.0.0.1' });
    userId = signup.session.user.id;

    await t.test(
      'initialization creates private candidate identity and first approved version',
      async () => {
        const passport = await candidates.initialize(signup.session.user.id);
        candidateId = passport.id;
        assert.equal(passport.visibility, 'PRIVATE');
        assert.equal(passport.discoverability, 'HIDDEN');
        assert.equal(passport.currentProfileVersion?.versionNumber, 1);
        assert.equal(passport.currentProfileVersion?.status, 'APPROVED');

        const event = await database.outboxEvent.findFirst({
          where: {
            aggregateType: 'Candidate',
            aggregateId: passport.id,
            eventType: 'candidate.passport.created',
          },
        });
        assert.ok(event);
      },
    );

    await t.test(
      'overview update creates a new version and supersedes the previous snapshot',
      async () => {
        const passport = await candidates.updateOverview(signup.session.user.id, {
          headline: 'Full Stack Engineer',
          summary: 'Builds reliable web products.',
          availabilityStatus: 'OPEN_TO_OFFERS',
          compensationCurrency: 'USD',
          compensationTarget: 48000,
          compensationPeriod: 'ANNUAL',
          preferredWorkModes: ['REMOTE', 'HYBRID'],
        });

        assert.equal(passport.currentProfileVersion?.versionNumber, 2);
        assert.equal(passport.currentProfileVersion?.headline, 'Full Stack Engineer');
        assert.deepEqual(passport.currentProfileVersion?.preferredWorkModes, ['REMOTE', 'HYBRID']);

        const versions = await database.candidateProfileVersion.findMany({
          where: { candidateId: passport.id },
          orderBy: { versionNumber: 'asc' },
        });
        assert.equal(versions.length, 2);
        assert.equal(versions[0]?.status, 'SUPERSEDED');
        assert.equal(versions[1]?.status, 'APPROVED');
      },
    );

    await t.test(
      'section replacement preserves unrelated profile data in the next snapshot',
      async () => {
        const passport = await candidates.replaceSkills(signup.session.user.id, [
          { name: 'TypeScript', proficiency: 'ADVANCED', experienceMonths: 30, lastUsedAt: null },
          { name: 'React', proficiency: null, experienceMonths: 24, lastUsedAt: null },
        ]);

        assert.equal(passport.currentProfileVersion?.versionNumber, 3);
        assert.equal(passport.currentProfileVersion?.headline, 'Full Stack Engineer');
        assert.deepEqual(
          passport.currentProfileVersion?.skills.map((skill) => skill.normalizedName),
          ['typescript', 'react'],
        );
      },
    );

    await t.test(
      'experience and education updates remain candidate-owned versioned state',
      async () => {
        const withExperience = await candidates.replaceEmployment(signup.session.user.id, [
          {
            companyName: 'Integration Labs',
            title: 'Software Engineer',
            employmentType: 'FULL_TIME',
            location: 'Remote',
            workMode: 'REMOTE',
            startDate: new Date('2025-01-01T00:00:00.000Z'),
            endDate: null,
            isCurrent: true,
            summary: 'Integration test employment.',
          },
        ]);
        assert.equal(withExperience.currentProfileVersion?.versionNumber, 4);
        assert.equal(withExperience.currentProfileVersion?.employments.length, 1);

        const withEducation = await candidates.replaceEducation(signup.session.user.id, [
          {
            institutionName: 'Integration University',
            degree: 'BS Software Engineering',
            fieldOfStudy: 'Software Engineering',
            location: null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            description: null,
          },
        ]);
        assert.equal(withEducation.currentProfileVersion?.versionNumber, 5);
        assert.equal(withEducation.currentProfileVersion?.employments.length, 1);
        assert.equal(withEducation.currentProfileVersion?.education.length, 1);
        assert.equal(withEducation.currentProfileVersion?.skills.length, 2);
      },
    );

    await t.test(
      'privacy settings remain separate from professional profile versions',
      async () => {
        const before = await candidates.getPassport(signup.session.user.id);
        const versionId = before.currentProfileVersionId;

        const settings = await candidates.updateSettings(signup.session.user.id, {
          visibility: 'VERIFIED_RECRUITERS',
          discoverability: 'SEARCHABLE',
          timezone: 'Asia/Karachi',
        });
        assert.equal(settings.visibility, 'VERIFIED_RECRUITERS');
        assert.equal(settings.discoverability, 'SEARCHABLE');
        assert.equal(settings.currentProfileVersionId, versionId);
      },
    );
  } finally {
    if (candidateId) {
      await database.outboxEvent.deleteMany({
        where: { aggregateType: 'Candidate', aggregateId: candidateId },
      });
      await database.auditEvent.deleteMany({
        where: { OR: [{ resourceId: candidateId }, ...(userId ? [{ actorId: userId }] : [])] },
      });
    }
    if (userId) {
      await database.outboxEvent.deleteMany({
        where: { aggregateType: 'User', aggregateId: userId },
      });
      await database.session.deleteMany({ where: { userId } });
      await database.user.deleteMany({ where: { id: userId } });
    }
    await database.$disconnect();
  }
});
