import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { ResumeReviewService } from '../resumes/resume-review.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for Phase 3F open-world review tests.');
}

const database = createDatabaseClient(connectionString);

void test('Phase 3F imports approved contact awards and open-world sections losslessly', async () => {
  const runId = randomUUID();
  const loginEmail = `phase3f-open-world-${runId}@integration.local`;
  let userId: string | null = null;

  try {
    const user = await database.user.create({
      data: { primaryEmail: loginEmail, passwordHash: 'integration-only' },
    });
    userId = user.id;
    const candidate = await database.candidate.create({ data: { userId: user.id } });
    const base = await database.candidateProfileVersion.create({
      data: {
        candidateId: candidate.id,
        versionNumber: 1,
        status: 'APPROVED',
        source: 'SYSTEM',
        contactFullName: 'Existing Name',
        contactEmail: 'existing-professional@example.com',
        headline: 'Existing headline',
        approvedAt: new Date(),
        preferredWorkModes: [],
        preferredEmploymentTypes: [],
      },
    });
    await database.candidate.update({
      where: { id: candidate.id },
      data: { currentProfileVersionId: base.id },
    });

    const resume = await database.resume.create({
      data: { candidateId: candidate.id, title: 'Open world import fixture' },
    });
    const version = await database.resumeVersion.create({
      data: {
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'READY_FOR_REVIEW',
        objectKey: `private/phase3f/${runId}/open-world`,
        originalFilename: 'open-world.pdf',
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
        extractorName: 'phase3f-open-world-fixture',
        extractorVersion: '1.0.0',
        pipelineVersion: version.processingPipelineVersion,
        status: 'COMPLETED',
        documentJson: { schemaVersion: 'resume-document-v2', text: 'private fixture' },
        textChecksumSha256: 'd'.repeat(64),
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
        version: '5',
        parserPolicyVersion: 'resume-parser-policy-v1',
        evidencePolicyVersion: 'resume-evidence-policy-v1',
      },
      identityCandidate: {
        fullName: claim('Alex Morgan', 0),
        email: claim('alex.professional@example.com', 20),
        phone: claim('+1 202 555 0199', 55),
      },
      headline: claim('Principal Software Engineer', 80),
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      certifications: [],
      languages: [],
      links: [],
      locations: [],
      additionalSections: [
        {
          sourceOrder: 4,
          heading: claim('AWARDS', 120),
          entries: [claim('Engineering Excellence Award', 130)],
        },
        {
          sourceOrder: 5,
          heading: claim('PUBLICATIONS', 170),
          entries: [claim('Reliable Multi-Tenant Systems, 2026', 185)],
        },
        {
          sourceOrder: 6,
          heading: claim('INDUSTRY ACTIVITIES', 230),
          entries: [claim('Mentored founders on secure SaaS architecture', 250)],
        },
      ],
      warnings: [],
      confidenceSummary: {
        overall: 1,
        lowConfidenceClaimCount: 0,
        totalClaimCount: 4,
      },
    };

    await database.resumeParseResult.create({
      data: {
        resumeVersionId: version.id,
        sourceExtractionId: extraction.id,
        pipelineVersion: version.processingPipelineVersion,
        parserName: 'local-deterministic-resume-parser',
        parserVersion: '5',
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

    const service = new ResumeReviewService(database);
    const review = await service.decide(user.id, resume.id, { decision: 'ACCEPT' });
    const appliedId = review.review.record?.appliedProfileVersionId;
    assert.ok(appliedId);

    const imported = await database.candidateProfileVersion.findUniqueOrThrow({
      where: { id: appliedId },
      include: {
        awards: { orderBy: { sortOrder: 'asc' } },
        customSections: {
          orderBy: { sortOrder: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    assert.equal(imported.contactFullName, 'Alex Morgan');
    assert.equal(imported.contactEmail, 'alex.professional@example.com');
    assert.equal(imported.contactPhone, '+1 202 555 0199');
    assert.equal(imported.headline, 'Principal Software Engineer');

    assert.equal(imported.awards.length, 1);
    assert.equal(imported.awards[0]?.title, 'Engineering Excellence Award');

    assert.equal(imported.customSections.length, 2);
    const publications = imported.customSections.find(
      (section) => section.sectionTypeKey === 'PUBLICATIONS',
    );
    assert.ok(publications);
    assert.equal(publications.sourceHeading, 'PUBLICATIONS');
    assert.equal(publications.classificationStatus, 'AUTO_CLASSIFIED');
    assert.equal(publications.classificationConfidence, 1);
    assert.equal(publications.items[0]?.title, 'Reliable Multi-Tenant Systems, 2026');

    const unknown = imported.customSections.find((section) => section.sectionTypeKey === 'CUSTOM');
    assert.ok(unknown);
    assert.equal(unknown.title, 'INDUSTRY ACTIVITIES');
    assert.equal(unknown.sourceHeading, 'INDUSTRY ACTIVITIES');
    assert.equal(unknown.classificationStatus, 'NEEDS_REVIEW');
    assert.equal(unknown.classificationConfidence, 0);
    assert.equal(unknown.items[0]?.title, 'Mentored founders on secure SaaS architecture');

    const account = await database.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(account.primaryEmail, loginEmail);
  } finally {
    if (userId) await database.user.deleteMany({ where: { id: userId } });
    await database.$disconnect();
  }
});
