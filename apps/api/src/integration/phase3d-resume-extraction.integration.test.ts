import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for Phase 3D extraction tests.');

const database = createDatabaseClient(connectionString);

void test('Phase 3D extraction persistence is candidate-owned, idempotent, and source-state bounded', async (t) => {
  const runId = randomUUID();
  const createdUserIds: string[] = [];

  try {
    const primaryUser = await database.user.create({
      data: {
        primaryEmail: `phase3d-primary-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(primaryUser.id);
    const primaryCandidate = await database.candidate.create({ data: { userId: primaryUser.id } });

    const otherUser = await database.user.create({
      data: {
        primaryEmail: `phase3d-other-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(otherUser.id);
    const otherCandidate = await database.candidate.create({ data: { userId: otherUser.id } });

    const resume = await database.resume.create({
      data: { candidateId: primaryCandidate.id, title: 'Phase 3D extraction fixture' },
    });
    const resumeVersion = await database.resumeVersion.create({
      data: {
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'EXTRACTING',
        objectKey: `integration/phase3d/${runId}/original`,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    });

    await t.test(
      'persists derived output separately from the immutable source artifact',
      async () => {
        const extraction = await database.resumeExtraction.create({
          data: {
            resumeVersionId: resumeVersion.id,
            extractionMethod: 'NATIVE_PDF',
            extractorName: 'phase3d-fixture',
            extractorVersion: '1.0.0',
            pipelineVersion: resumeVersion.processingPipelineVersion,
            status: 'COMPLETED',
            qualityMetadata: { decision: 'NATIVE_TEXT_SUFFICIENT', characterCount: 640 },
            documentJson: { schemaVersion: 'resume-document-v1', text: 'private fixture text' },
            textChecksumSha256: 'a'.repeat(64),
            completedAt: new Date(),
          },
        });

        assert.equal(extraction.resumeVersionId, resumeVersion.id);
        assert.equal(extraction.status, 'COMPLETED');

        const unchangedSource = await database.resumeVersion.findUniqueOrThrow({
          where: { id: resumeVersion.id },
        });
        assert.equal(unchangedSource.processingState, 'EXTRACTING');
        assert.equal(unchangedSource.objectKey, resumeVersion.objectKey);
      },
    );

    await t.test('enforces stable extraction execution identity', async () => {
      await assert.rejects(() =>
        database.resumeExtraction.create({
          data: {
            resumeVersionId: resumeVersion.id,
            extractionMethod: 'NATIVE_PDF',
            extractorName: 'phase3d-fixture',
            extractorVersion: '1.0.0',
            pipelineVersion: resumeVersion.processingPipelineVersion,
          },
        }),
      );
      assert.equal(
        await database.resumeExtraction.count({ where: { resumeVersionId: resumeVersion.id } }),
        1,
      );
    });

    await t.test('candidate-scoped source lookup does not cross the privacy boundary', async () => {
      const owned = await database.resumeVersion.findFirst({
        where: { id: resumeVersion.id, resume: { candidateId: primaryCandidate.id } },
        select: { id: true, processingState: true },
      });
      const crossCandidate = await database.resumeVersion.findFirst({
        where: { id: resumeVersion.id, resume: { candidateId: otherCandidate.id } },
        select: { id: true },
      });

      assert.equal(owned?.processingState, 'EXTRACTING');
      assert.equal(crossCandidate, null);
    });

    await t.test('derived extraction rows cascade with their source ResumeVersion', async () => {
      await database.resumeVersion.delete({ where: { id: resumeVersion.id } });
      assert.equal(
        await database.resumeExtraction.count({ where: { resumeVersionId: resumeVersion.id } }),
        0,
      );
    });
  } finally {
    if (createdUserIds.length > 0) {
      await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await database.$disconnect();
  }
});
