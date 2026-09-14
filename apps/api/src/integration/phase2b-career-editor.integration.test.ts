import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 2B integration tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 2B Career Passport preserves full replacement and ordering semantics', async (t) => {
  const runId = randomUUID();
  const email = `candidate-phase2b-${runId}@integration.local`;
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

    await t.test('edit remove and reorder create immutable next snapshots', async () => {
      const seeded = await candidates.replaceEmployment(userId!, [
        {
          companyName: 'Alpha Labs',
          title: 'Frontend Engineer',
          employmentType: 'FULL_TIME',
          location: 'Remote',
          workMode: 'REMOTE',
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2025-01-01T00:00:00.000Z'),
          isCurrent: false,
          summary: 'Built the candidate-facing application.',
        },
        {
          companyName: 'Beta Systems',
          title: 'Full Stack Engineer',
          employmentType: 'FULL_TIME',
          location: 'Karachi, Pakistan',
          workMode: 'HYBRID',
          startDate: new Date('2025-02-01T00:00:00.000Z'),
          endDate: null,
          isCurrent: true,
          summary: 'Built hiring workflows and platform services.',
        },
      ]);

      const seededVersion = seeded.currentProfileVersion!;
      assert.deepEqual(
        seededVersion.employments.map((item) => [item.companyName, item.sortOrder]),
        [
          ['Alpha Labs', 0],
          ['Beta Systems', 1],
        ],
      );

      const updated = await candidates.replaceEmployment(userId!, [
        {
          companyName: 'Beta Systems',
          title: 'Senior Full Stack Engineer',
          employmentType: 'FULL_TIME',
          location: 'Karachi, Pakistan',
          workMode: 'HYBRID',
          startDate: new Date('2025-02-01T00:00:00.000Z'),
          endDate: null,
          isCurrent: true,
          summary: 'Owns hiring workflows and platform services.',
        },
      ]);

      assert.equal(updated.currentProfileVersion!.versionNumber, seededVersion.versionNumber + 1);
      assert.equal(updated.currentProfileVersion!.employments.length, 1);
      assert.equal(updated.currentProfileVersion!.employments[0]?.companyName, 'Beta Systems');
      assert.equal(
        updated.currentProfileVersion!.employments[0]?.title,
        'Senior Full Stack Engineer',
      );
      assert.equal(updated.currentProfileVersion!.employments[0]?.sortOrder, 0);

      const previous = await database.candidateProfileVersion.findUniqueOrThrow({
        where: { id: seededVersion.id },
        include: { employments: { orderBy: { sortOrder: 'asc' } } },
      });
      assert.equal(previous.status, 'SUPERSEDED');
      assert.equal(previous.employments.length, 2);
      assert.equal(previous.employments[0]?.companyName, 'Alpha Labs');
    });

    await t.test('skills use submitted array order as the canonical sort order', async () => {
      const first = await candidates.replaceSkills(userId!, [
        { name: 'TypeScript', proficiency: 'ADVANCED', experienceMonths: 36, lastUsedAt: null },
        { name: 'React', proficiency: 'ADVANCED', experienceMonths: 30, lastUsedAt: null },
        { name: 'Node.js', proficiency: 'ADVANCED', experienceMonths: 30, lastUsedAt: null },
      ]);

      const reordered = await candidates.replaceSkills(userId!, [
        { name: 'Node.js', proficiency: 'ADVANCED', experienceMonths: 30, lastUsedAt: null },
        { name: 'TypeScript', proficiency: 'ADVANCED', experienceMonths: 36, lastUsedAt: null },
      ]);

      assert.equal(
        reordered.currentProfileVersion!.versionNumber,
        first.currentProfileVersion!.versionNumber + 1,
      );
      assert.deepEqual(
        reordered.currentProfileVersion!.skills.map((item) => [item.name, item.sortOrder]),
        [
          ['Node.js', 0],
          ['TypeScript', 1],
        ],
      );
    });

    await t.test(
      'custom sections and items are versioned, editable, removable and reorderable',
      async () => {
        const created = await candidates.replaceCustomSections(userId!, [
          {
            title: 'Awards',
            description: 'Selected recognition.',
            items: [
              {
                title: 'Hackathon Winner',
                subtitle: 'SMIT',
                description: 'Won for a citizen complaint platform.',
                startDate: new Date('2026-03-01T00:00:00.000Z'),
                endDate: null,
                url: 'https://example.com/award',
              },
              {
                title: 'Engineering Award',
                subtitle: 'University',
                description: null,
                startDate: new Date('2025-06-01T00:00:00.000Z'),
                endDate: null,
                url: null,
              },
            ],
          },
          {
            title: 'Volunteering',
            description: null,
            items: [
              {
                title: 'Student Mentor',
                subtitle: 'Community Program',
                description: 'Mentored MERN students.',
                startDate: new Date('2025-01-01T00:00:00.000Z'),
                endDate: null,
                url: null,
              },
            ],
          },
        ]);

        assert.deepEqual(
          created.currentProfileVersion!.customSections.map((section) => [
            section.title,
            section.sortOrder,
          ]),
          [
            ['Awards', 0],
            ['Volunteering', 1],
          ],
        );
        assert.deepEqual(
          created.currentProfileVersion!.customSections[0]?.items.map((item) => [
            item.title,
            item.sortOrder,
          ]),
          [
            ['Hackathon Winner', 0],
            ['Engineering Award', 1],
          ],
        );

        const changed = await candidates.replaceCustomSections(userId!, [
          {
            title: 'Volunteering & Community',
            description: 'Community work outside employment.',
            items: [
              {
                title: 'Student Mentor',
                subtitle: 'Community Program',
                description: 'Mentored MERN and full-stack students.',
                startDate: new Date('2025-01-01T00:00:00.000Z'),
                endDate: null,
                url: null,
              },
            ],
          },
          {
            title: 'Awards',
            description: 'Selected recognition.',
            items: [
              {
                title: 'Engineering Award',
                subtitle: 'University',
                description: null,
                startDate: new Date('2025-06-01T00:00:00.000Z'),
                endDate: null,
                url: null,
              },
            ],
          },
        ]);

        assert.equal(
          changed.currentProfileVersion!.versionNumber,
          created.currentProfileVersion!.versionNumber + 1,
        );
        assert.deepEqual(
          changed.currentProfileVersion!.customSections.map((section) => [
            section.title,
            section.sortOrder,
          ]),
          [
            ['Volunteering & Community', 0],
            ['Awards', 1],
          ],
        );
        assert.equal(changed.currentProfileVersion!.customSections[1]?.items.length, 1);
        assert.equal(
          changed.currentProfileVersion!.customSections[1]?.items[0]?.title,
          'Engineering Award',
        );

        const removed = await candidates.replaceCustomSections(userId!, [
          {
            title: 'Volunteering & Community',
            description: 'Community work outside employment.',
            items: [
              {
                title: 'Student Mentor',
                subtitle: 'Community Program',
                description: 'Mentored MERN and full-stack students.',
                startDate: new Date('2025-01-01T00:00:00.000Z'),
                endDate: null,
                url: null,
              },
            ],
          },
        ]);

        assert.equal(removed.currentProfileVersion!.customSections.length, 1);
        assert.equal(
          removed.currentProfileVersion!.customSections[0]?.title,
          'Volunteering & Community',
        );
        assert.equal(removed.currentProfileVersion!.employments.length, 1);
        assert.equal(removed.currentProfileVersion!.skills.length, 2);
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
