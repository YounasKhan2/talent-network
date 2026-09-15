import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import {
  ResumeParseResultRepository,
  ResumeParseSourceError,
} from '../resumes/resume-parse-result.repository.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for Phase 3E parse tests.');

const database = createDatabaseClient(connectionString);

void test('Phase 3E parse persistence is candidate-owned, source-bound, and rebuildable', async (t) => {
  const runId = randomUUID();
  const createdUserIds: string[] = [];

  try {
    const primaryUser = await database.user.create({
      data: {
        primaryEmail: `phase3e-primary-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(primaryUser.id);
    const primaryCandidate = await database.candidate.create({ data: { userId: primaryUser.id } });

    const otherUser = await database.user.create({
      data: {
        primaryEmail: `phase3e-other-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(otherUser.id);
    const otherCandidate = await database.candidate.create({ data: { userId: otherUser.id } });

    const resume = await database.resume.create({
      data: { candidateId: primaryCandidate.id, title: 'Phase 3E parse fixture' },
    });
    const resumeVersion = await database.resumeVersion.create({
      data: {
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'PARSING',
        objectKey: `integration/phase3e/${runId}/original`,
        originalFilename: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    });
    const sourceExtraction = await database.resumeExtraction.create({
      data: {
        resumeVersionId: resumeVersion.id,
        extractionMethod: 'NATIVE_PDF',
        extractorName: 'phase3e-source',
        extractorVersion: '1.0.0',
        pipelineVersion: resumeVersion.processingPipelineVersion,
        status: 'COMPLETED',
        documentJson: { schemaVersion: 'resume-document-v1', text: 'private parse fixture' },
        textChecksumSha256: 'b'.repeat(64),
        completedAt: new Date(),
      },
    });

    const siblingResume = await database.resume.create({
      data: { candidateId: primaryCandidate.id, title: 'Phase 3E sibling fixture' },
    });
    const siblingVersion = await database.resumeVersion.create({
      data: {
        resumeId: siblingResume.id,
        versionNumber: 1,
        processingState: 'PARSING',
        objectKey: `integration/phase3e/${runId}/sibling`,
        originalFilename: 'sibling.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
      },
    });
    const siblingExtraction = await database.resumeExtraction.create({
      data: {
        resumeVersionId: siblingVersion.id,
        extractionMethod: 'NATIVE_PDF',
        extractorName: 'phase3e-sibling',
        extractorVersion: '1.0.0',
        pipelineVersion: siblingVersion.processingPipelineVersion,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
    const incompleteExtraction = await database.resumeExtraction.create({
      data: {
        resumeVersionId: resumeVersion.id,
        extractionMethod: 'OCR',
        extractorName: 'phase3e-incomplete',
        extractorVersion: '1.0.0',
        pipelineVersion: resumeVersion.processingPipelineVersion,
        status: 'STARTED',
      },
    });

    const repository = new ResumeParseResultRepository(database);
    const baseExecution = {
      candidateId: primaryCandidate.id,
      resumeVersionId: resumeVersion.id,
      sourceExtractionId: sourceExtraction.id,
      pipelineVersion: resumeVersion.processingPipelineVersion,
      parserName: 'phase3e-fixture-parser',
      parserVersion: '1.0.0',
      schemaVersion: 'parsed-resume-v1',
    } as const;

    let firstParseResultId = '';

    await t.test('same execution identity converges on one parse result', async () => {
      const beforeProfileCount = await database.candidateProfileVersion.count({
        where: { candidateId: primaryCandidate.id },
      });
      const first = await repository.getOrCreateStartedExecution(baseExecution);
      const duplicate = await repository.getOrCreateStartedExecution(baseExecution);
      firstParseResultId = first.id;

      assert.equal(duplicate.id, first.id);
      assert.equal(
        await database.resumeParseResult.count({
          where: { resumeVersionId: resumeVersion.id, parserVersion: '1.0.0' },
        }),
        1,
      );
      assert.equal(
        await database.candidateProfileVersion.count({ where: { candidateId: primaryCandidate.id } }),
        beforeProfileCount,
      );

      const unchangedSource = await database.resumeVersion.findUniqueOrThrow({
        where: { id: resumeVersion.id },
      });
      assert.equal(unchangedSource.processingState, 'PARSING');
      assert.equal(unchangedSource.objectKey, resumeVersion.objectKey);
    });

    await t.test('new parser version creates a distinct rebuildable result', async () => {
      const rebuilt = await repository.getOrCreateStartedExecution({
        ...baseExecution,
        parserVersion: '1.1.0',
      });
      assert.notEqual(rebuilt.id, firstParseResultId);
      assert.equal(
        await database.resumeParseResult.count({ where: { resumeVersionId: resumeVersion.id } }),
        2,
      );
    });

    await t.test('candidate ownership blocks cross-candidate source resolution', async () => {
      await assert.rejects(
        () =>
          repository.resolveOwnedSource({
            candidateId: otherCandidate.id,
            resumeVersionId: resumeVersion.id,
            sourceExtractionId: sourceExtraction.id,
          }),
        (error) =>
          error instanceof ResumeParseSourceError && error.code === 'RESUME_VERSION_NOT_FOUND',
      );
    });

    await t.test('source extraction must belong to the same resume version', async () => {
      await assert.rejects(
        () =>
          repository.resolveOwnedSource({
            candidateId: primaryCandidate.id,
            resumeVersionId: resumeVersion.id,
            sourceExtractionId: siblingExtraction.id,
          }),
        (error) =>
          error instanceof ResumeParseSourceError && error.code === 'SOURCE_EXTRACTION_NOT_FOUND',
      );
    });

    await t.test('source extraction must be completed', async () => {
      await assert.rejects(
        () =>
          repository.resolveOwnedSource({
            candidateId: primaryCandidate.id,
            resumeVersionId: resumeVersion.id,
            sourceExtractionId: incompleteExtraction.id,
          }),
        (error) =>
          error instanceof ResumeParseSourceError &&
          error.code === 'SOURCE_EXTRACTION_NOT_COMPLETED',
      );
    });

    await t.test('execution pipeline version must match the source resume', async () => {
      await assert.rejects(
        () =>
          repository.getOrCreateStartedExecution({
            ...baseExecution,
            pipelineVersion: 'stale-pipeline-v0',
          }),
        (error) =>
          error instanceof ResumeParseSourceError && error.code === 'PIPELINE_VERSION_MISMATCH',
      );
    });

    await t.test('candidate-scoped parse lookup does not cross the privacy boundary', async () => {
      const owned = await repository.findOwnedParseResult({
        candidateId: primaryCandidate.id,
        parseResultId: firstParseResultId,
      });
      const crossCandidate = await repository.findOwnedParseResult({
        candidateId: otherCandidate.id,
        parseResultId: firstParseResultId,
      });

      assert.equal(owned?.id, firstParseResultId);
      assert.equal(crossCandidate, null);
    });

    await t.test('derived parse results cascade with their source resume version', async () => {
      const cascadeResume = await database.resume.create({
        data: { candidateId: primaryCandidate.id, title: 'Phase 3E cascade fixture' },
      });
      const cascadeVersion = await database.resumeVersion.create({
        data: {
          resumeId: cascadeResume.id,
          versionNumber: 1,
          processingState: 'PARSING',
          objectKey: `integration/phase3e/${runId}/cascade`,
          originalFilename: 'cascade.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 256,
        },
      });
      const cascadeExtraction = await database.resumeExtraction.create({
        data: {
          resumeVersionId: cascadeVersion.id,
          extractionMethod: 'NATIVE_PDF',
          extractorName: 'phase3e-cascade',
          extractorVersion: '1.0.0',
          pipelineVersion: cascadeVersion.processingPipelineVersion,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      const cascadeParse = await repository.getOrCreateStartedExecution({
        candidateId: primaryCandidate.id,
        resumeVersionId: cascadeVersion.id,
        sourceExtractionId: cascadeExtraction.id,
        pipelineVersion: cascadeVersion.processingPipelineVersion,
        parserName: 'phase3e-fixture-parser',
        parserVersion: '1.0.0',
        schemaVersion: 'parsed-resume-v1',
      });

      await database.resumeVersion.delete({ where: { id: cascadeVersion.id } });
      assert.equal(await database.resumeParseResult.count({ where: { id: cascadeParse.id } }), 0);
    });
  } finally {
    if (createdUserIds.length > 0) {
      await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await database.$disconnect();
  }
});
