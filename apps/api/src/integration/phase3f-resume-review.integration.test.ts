import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { createDatabaseClient } from '@talent-network/database';
import { ResumeReviewService } from '../resumes/resume-review.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 3F review tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 3F resume review read model stays candidate-owned and privacy bounded', async (t) => {
  const runId = randomUUID();
  const createdUserIds: string[] = [];

  try {
    const owner = await database.user.create({
      data: {
        primaryEmail: `phase3f-owner-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(owner.id);
    const candidate = await database.candidate.create({ data: { userId: owner.id } });
    const passportVersion = await database.candidateProfileVersion.create({
      data: {
        candidateId: candidate.id,
        versionNumber: 1,
        status: 'APPROVED',
        source: 'SYSTEM',
        headline: 'Current Passport headline',
        summary: 'Current Passport summary',
        approvedAt: new Date(),
        preferredWorkModes: [],
        preferredEmploymentTypes: [],
      },
    });
    await database.candidate.update({
      where: { id: candidate.id },
      data: { currentProfileVersionId: passportVersion.id },
    });

    const stranger = await database.user.create({
      data: {
        primaryEmail: `phase3f-stranger-${runId}@integration.local`,
        passwordHash: 'integration-only',
      },
    });
    createdUserIds.push(stranger.id);
    await database.candidate.create({ data: { userId: stranger.id } });

    const resume = await database.resume.create({
      data: { candidateId: candidate.id, title: 'Review fixture' },
    });
    const version = await database.resumeVersion.create({
      data: {
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'READY_FOR_REVIEW',
        objectKey: `private/phase3f/${runId}/original`,
        originalFilename: 'candidate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        uploadedAt: new Date(),
      },
    });
    await database.resume.update({
      where: { id: resume.id },
      data: { currentVersionId: version.id },
    });
    const extraction = await database.resumeExtraction.create({
      data: {
        resumeVersionId: version.id,
        extractionMethod: 'NATIVE_PDF',
        extractorName: 'phase3f-fixture',
        extractorVersion: '1.0.0',
        pipelineVersion: version.processingPipelineVersion,
        status: 'COMPLETED',
        documentJson: {
          schemaVersion: 'resume-document-v1',
          text: 'RAW_PRIVATE_EXTRACTION_TEXT_MUST_NOT_LEAVE_REVIEW_API',
        },
        textChecksumSha256: 'c'.repeat(64),
        completedAt: new Date(),
      },
    });
    await database.resumeParseResult.create({
      data: {
        resumeVersionId: version.id,
        sourceExtractionId: extraction.id,
        pipelineVersion: version.processingPipelineVersion,
        parserName: 'local-deterministic-resume-parser',
        parserVersion: '1',
        schemaVersion: 'parsed-resume-v1',
        parserPolicyVersion: 'resume-parser-policy-v1',
        evidencePolicyVersion: 'resume-evidence-policy-v1',
        promptVersion: 'none',
        status: 'COMPLETED',
        parsedJson: {
          schemaVersion: 'parsed-resume-v1',
          resumeVersionId: version.id,
          sourceExtractionId: extraction.id,
          parser: {
            name: 'local-deterministic-resume-parser',
            version: '1',
            parserPolicyVersion: 'resume-parser-policy-v1',
            evidencePolicyVersion: 'resume-evidence-policy-v1',
          },
          identityCandidate: {
            email: {
              value: 'candidate.private@example.com',
              confidence: 1,
              evidence: [
                {
                  resumeExtractionId: extraction.id,
                  pageNumber: 1,
                  blockIndex: 0,
                  sourceRange: { start: 0, end: 29 },
                  evidenceKind: 'DIRECT_TEXT',
                },
              ],
              warnings: [],
            },
          },
          experiences: [],
          education: [],
          skills: [],
          projects: [],
          certifications: [],
          languages: [],
          links: [],
          locations: [],
          warnings: [],
          confidenceSummary: {
            overall: 1,
            lowConfidenceClaimCount: 0,
            totalClaimCount: 1,
          },
        },
        confidenceSummary: { overall: 1, lowConfidenceClaimCount: 0, totalClaimCount: 1 },
        warnings: [],
        completedAt: new Date(),
      },
    });

    const service = new ResumeReviewService(database);

    await t.test('owner receives completed proposal and current Passport snapshot', async () => {
      const review = await service.getReview(owner.id, resume.id);
      assert.equal(review.resume.id, resume.id);
      assert.equal(review.version?.processingState, 'READY_FOR_REVIEW');
      assert.equal(review.review.available, true);
      assert.equal(review.review.blockingReason, null);
      assert.equal(review.passport.currentProfileVersion?.headline, 'Current Passport headline');
      assert.equal(review.proposal?.status, 'COMPLETED');
    });

    await t.test('cross-candidate review lookup fails closed', async () => {
      await assert.rejects(
        () => service.getReview(stranger.id, resume.id),
        (error) => error instanceof NotFoundException,
      );
    });

    await t.test('review response omits source object keys and raw extraction text', async () => {
      const review = await service.getReview(owner.id, resume.id);
      const serialized = JSON.stringify(review);
      assert.equal(serialized.includes(version.objectKey), false);
      assert.equal(
        serialized.includes('RAW_PRIVATE_EXTRACTION_TEXT_MUST_NOT_LEAVE_REVIEW_API'),
        false,
      );
      assert.equal(serialized.includes('candidate.private@example.com'), true);
    });
  } finally {
    if (createdUserIds.length > 0) {
      await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await database.$disconnect();
  }
});
