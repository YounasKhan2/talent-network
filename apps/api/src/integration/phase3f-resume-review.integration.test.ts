import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { createDatabaseClient, type DatabaseClient } from '@talent-network/database';
import { ResumeReviewService } from '../resumes/resume-review.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 3F review tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 3F candidate review is private, explicit, traceable, and idempotent', async (t) => {
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

    const readFixture = await createReadyForReviewResume(database, {
      candidateId: candidate.id,
      runId,
      suffix: 'read',
      headline: 'Parsed read headline',
    });
    const ignoreFixture = await createReadyForReviewResume(database, {
      candidateId: candidate.id,
      runId,
      suffix: 'ignore',
      headline: 'Ignored headline',
    });
    const acceptFixture = await createReadyForReviewResume(database, {
      candidateId: candidate.id,
      runId,
      suffix: 'accept',
      headline: 'Imported headline',
      summary: 'Imported summary',
    });
    const editFixture = await createReadyForReviewResume(database, {
      candidateId: candidate.id,
      runId,
      suffix: 'edit',
      headline: 'Parser headline before edit',
      summary: 'Parser summary before edit',
    });

    const service = new ResumeReviewService(database);

    await t.test('owner receives completed proposal and current Passport snapshot', async () => {
      const review = await service.getReview(owner.id, readFixture.resume.id);
      assert.equal(review.resume.id, readFixture.resume.id);
      assert.equal(review.version?.processingState, 'READY_FOR_REVIEW');
      assert.equal(review.review.available, true);
      assert.equal(review.review.blockingReason, null);
      assert.equal(review.review.record, null);
      assert.equal(review.passport.currentProfileVersion?.headline, 'Current Passport headline');
      assert.equal(review.proposal?.status, 'COMPLETED');
    });

    await t.test('cross-candidate review lookup and decision fail closed', async () => {
      await assert.rejects(
        () => service.getReview(stranger.id, readFixture.resume.id),
        (error) => error instanceof NotFoundException,
      );
      await assert.rejects(
        () => service.decide(stranger.id, readFixture.resume.id, { decision: 'ACCEPT' }),
        (error) => error instanceof NotFoundException,
      );
    });

    await t.test('review response omits source object keys and raw extraction text', async () => {
      const review = await service.getReview(owner.id, readFixture.resume.id);
      const serialized = JSON.stringify(review);
      assert.equal(serialized.includes(readFixture.version.objectKey), false);
      assert.equal(serialized.includes(`RAW_PRIVATE_EXTRACTION_TEXT_${readFixture.suffix}`), false);
      assert.equal(serialized.includes('candidate.private@example.com'), true);
    });

    await t.test('ignore records the decision without creating a Passport version', async () => {
      const beforeCount = await database.candidateProfileVersion.count({
        where: { candidateId: candidate.id },
      });

      const review = await service.decide(owner.id, ignoreFixture.resume.id, {
        decision: 'IGNORE',
      });

      const afterCount = await database.candidateProfileVersion.count({
        where: { candidateId: candidate.id },
      });
      const version = await database.resumeVersion.findUniqueOrThrow({
        where: { id: ignoreFixture.version.id },
      });
      assert.equal(afterCount, beforeCount);
      assert.equal(version.processingState, 'REJECTED');
      assert.equal(version.approvedProfileVersionId, null);
      assert.equal(review.review.record?.decision, 'IGNORED');
      assert.equal(review.review.record?.appliedProfileVersionId, null);
    });

    await t.test(
      'accept creates one traceable RESUME_IMPORT version and duplicate retry is idempotent',
      async () => {
        const first = await service.decide(owner.id, acceptFixture.resume.id, {
          decision: 'ACCEPT',
        });
        const appliedId = first.review.record?.appliedProfileVersionId;
        assert.ok(appliedId);

        const imported = await database.candidateProfileVersion.findUniqueOrThrow({
          where: { id: appliedId },
        });
        const sourceVersion = await database.resumeVersion.findUniqueOrThrow({
          where: { id: acceptFixture.version.id },
        });
        assert.equal(imported.source, 'RESUME_IMPORT');
        assert.equal(imported.status, 'APPROVED');
        assert.equal(imported.headline, 'Imported headline');
        assert.equal(imported.summary, 'Imported summary');
        assert.equal(sourceVersion.processingState, 'APPROVED');
        assert.equal(sourceVersion.approvedProfileVersionId, imported.id);
        assert.equal(first.review.record?.decision, 'ACCEPTED');

        const beforeRetryCount = await database.candidateProfileVersion.count({
          where: { candidateId: candidate.id },
        });
        const retry = await service.decide(owner.id, acceptFixture.resume.id, {
          decision: 'ACCEPT',
        });
        const afterRetryCount = await database.candidateProfileVersion.count({
          where: { candidateId: candidate.id },
        });
        assert.equal(afterRetryCount, beforeRetryCount);
        assert.equal(retry.review.record?.appliedProfileVersionId, imported.id);
      },
    );

    await t.test('edit stores candidate overrides in a new RESUME_IMPORT version', async () => {
      const review = await service.decide(owner.id, editFixture.resume.id, {
        decision: 'EDIT',
        edits: {
          headline: 'Candidate reviewed headline',
          summary: 'Candidate reviewed summary',
        },
      });
      const appliedId = review.review.record?.appliedProfileVersionId;
      assert.ok(appliedId);

      const imported = await database.candidateProfileVersion.findUniqueOrThrow({
        where: { id: appliedId },
      });
      assert.equal(imported.source, 'RESUME_IMPORT');
      assert.equal(imported.headline, 'Candidate reviewed headline');
      assert.equal(imported.summary, 'Candidate reviewed summary');
      assert.equal(review.review.record?.decision, 'EDITED');
      assert.deepEqual(review.review.record?.candidateEdits, {
        headline: 'Candidate reviewed headline',
        summary: 'Candidate reviewed summary',
      });
    });

    await t.test('review audit and outbox events remain metadata-only', async () => {
      const auditEvents = await database.auditEvent.findMany({
        where: {
          resourceId: { in: [acceptFixture.version.id, editFixture.version.id] },
        },
      });
      const outboxEvents = await database.outboxEvent.findMany({
        where: {
          eventType: {
            in: ['candidate.passport.resume_imported', 'candidate.resume.review_ignored'],
          },
        },
      });
      const serialized = JSON.stringify({ auditEvents, outboxEvents });
      assert.equal(serialized.includes('candidate.private@example.com'), false);
      assert.equal(serialized.includes('RAW_PRIVATE_EXTRACTION_TEXT'), false);
    });
  } finally {
    if (createdUserIds.length > 0) {
      await database.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await database.$disconnect();
  }
});

async function createReadyForReviewResume(
  client: DatabaseClient,
  input: {
    candidateId: string;
    runId: string;
    suffix: string;
    headline?: string;
    summary?: string;
  },
) {
  const resume = await client.resume.create({
    data: { candidateId: input.candidateId, title: `Review fixture ${input.suffix}` },
  });
  const version = await client.resumeVersion.create({
    data: {
      resumeId: resume.id,
      versionNumber: 1,
      processingState: 'READY_FOR_REVIEW',
      objectKey: `private/phase3f/${input.runId}/${input.suffix}`,
      originalFilename: `${input.suffix}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      uploadedAt: new Date(),
    },
  });
  await client.resume.update({
    where: { id: resume.id },
    data: { currentVersionId: version.id },
  });
  const extraction = await client.resumeExtraction.create({
    data: {
      resumeVersionId: version.id,
      extractionMethod: 'NATIVE_PDF',
      extractorName: 'phase3f-fixture',
      extractorVersion: '1.0.0',
      pipelineVersion: version.processingPipelineVersion,
      status: 'COMPLETED',
      documentJson: {
        schemaVersion: 'resume-document-v1',
        text: `RAW_PRIVATE_EXTRACTION_TEXT_${input.suffix}`,
      },
      textChecksumSha256: 'c'.repeat(64),
      completedAt: new Date(),
    },
  });

  const claim = (value: string, start: number) => ({
    value,
    confidence: 1,
    evidence: [
      {
        resumeExtractionId: extraction.id,
        pageNumber: 1,
        blockIndex: 0,
        sourceRange: { start, end: start + value.length },
        evidenceKind: 'DIRECT_TEXT',
      },
    ],
    warnings: [],
  });

  const parsedJson = {
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
      email: claim('candidate.private@example.com', 0),
    },
    ...(input.headline ? { headline: claim(input.headline, 32) } : {}),
    ...(input.summary ? { summary: claim(input.summary, 64) } : {}),
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
      totalClaimCount: 1 + (input.headline ? 1 : 0) + (input.summary ? 1 : 0),
    },
  };

  const parseResult = await client.resumeParseResult.create({
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
      parsedJson,
      confidenceSummary: parsedJson.confidenceSummary,
      warnings: [],
      completedAt: new Date(),
    },
  });

  return { resume, version, extraction, parseResult, suffix: input.suffix };
}
