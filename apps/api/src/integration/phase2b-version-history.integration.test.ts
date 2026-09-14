import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { CandidateVersionsService } from '../candidates/candidate-versions.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error('DATABASE_URL is required for Phase 2B version-history tests.');

const database = createDatabaseClient(connectionString);

void test('Phase 2B Career Passport version history is candidate-owned and immutable', async (t) => {
  const runId = randomUUID();
  const auth = new AuthService(database);
  const candidates = new CandidatesService(database);
  const versions = new CandidateVersionsService(database);
  const createdUserIds: string[] = [];
  const createdCandidateIds: string[] = [];

  try {
    const primary = await auth.signup(
      `history-primary-${runId}@integration.local`,
      'IntegrationPass!2026',
      {
        ip: '127.0.0.1',
      },
    );
    createdUserIds.push(primary.session.user.id);
    const initialized = await candidates.initialize(primary.session.user.id);
    createdCandidateIds.push(initialized.id);

    await candidates.updateOverview(primary.session.user.id, {
      headline: 'Version two headline',
      summary: 'Snapshot two summary.',
      availabilityStatus: 'OPEN_TO_OFFERS',
      preferredWorkModes: ['REMOTE'],
    });
    await candidates.replaceSkills(primary.session.user.id, [
      { name: 'TypeScript', proficiency: 'ADVANCED', experienceMonths: 36, lastUsedAt: null },
      { name: 'React', proficiency: null, experienceMonths: 30, lastUsedAt: null },
    ]);

    await t.test('lists versions newest first, paginates, and marks current version', async () => {
      const firstPage = await versions.list(primary.session.user.id, { limit: 2 });
      assert.deepEqual(
        firstPage.versions.map((version) => version.versionNumber),
        [3, 2],
      );
      assert.equal(firstPage.versions.filter((version) => version.isCurrent).length, 1);
      assert.equal(firstPage.versions[0]?.isCurrent, true);
      assert.equal(firstPage.currentProfileVersionId, firstPage.versions[0]?.id);
      assert.equal(firstPage.nextCursor, 2);

      const secondPage = await versions.list(primary.session.user.id, {
        beforeVersionNumber: firstPage.nextCursor ?? undefined,
        limit: 2,
      });
      assert.deepEqual(
        secondPage.versions.map((version) => version.versionNumber),
        [1],
      );
      assert.equal(secondPage.nextCursor, null);
    });

    await t.test('returns the exact read-only historical snapshot', async () => {
      const versionTwo = await versions.get(primary.session.user.id, 2);
      assert.equal(versionTwo.versionNumber, 2);
      assert.equal(versionTwo.isCurrent, false);
      assert.equal(versionTwo.status, 'SUPERSEDED');
      assert.equal(versionTwo.headline, 'Version two headline');
      assert.equal(versionTwo.summary, 'Snapshot two summary.');
      assert.equal(versionTwo.skills.length, 0);

      const current = await versions.get(primary.session.user.id, 3);
      assert.equal(current.isCurrent, true);
      assert.equal(current.headline, 'Version two headline');
      assert.deepEqual(
        current.skills.map((skill) => skill.name),
        ['TypeScript', 'React'],
      );
    });

    await t.test('does not expose another candidate version by version number', async () => {
      const other = await auth.signup(
        `history-other-${runId}@integration.local`,
        'IntegrationPass!2026',
        {
          ip: '127.0.0.2',
        },
      );
      createdUserIds.push(other.session.user.id);
      const otherCandidate = await candidates.initialize(other.session.user.id);
      createdCandidateIds.push(otherCandidate.id);

      await assert.rejects(
        () => versions.get(other.session.user.id, 3),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 404,
      );
    });
  } finally {
    for (const candidateId of createdCandidateIds) {
      await database.outboxEvent.deleteMany({
        where: { aggregateType: 'Candidate', aggregateId: candidateId },
      });
      await database.auditEvent.deleteMany({ where: { resourceId: candidateId } });
    }
    for (const userId of createdUserIds) {
      await database.auditEvent.deleteMany({ where: { actorId: userId } });
      await database.outboxEvent.deleteMany({
        where: { aggregateType: 'User', aggregateId: userId },
      });
      await database.session.deleteMany({ where: { userId } });
      await database.user.deleteMany({ where: { id: userId } });
    }
    await database.$disconnect();
  }
});
