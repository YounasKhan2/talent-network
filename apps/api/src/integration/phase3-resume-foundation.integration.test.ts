import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createDatabaseClient } from '@talent-network/database';
import { AuthService } from '../auth/auth.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import type { StorageObjectMetadata, StorageService } from '../storage/storage.service.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for Phase 3 resume tests.');

const database = createDatabaseClient(connectionString);

void test('Phase 3 resume foundation keeps resume versions candidate-owned and traceable', async (t) => {
  const runId = randomUUID();
  const auth = new AuthService(database);
  const candidates = new CandidatesService(database);
  let storedObject: StorageObjectMetadata = {
    contentLength: 245_760,
    contentType: 'application/pdf',
    eTag: 'phase3-integration-etag',
  };
  const storage = {
    ensureBucketExists: () => Promise.resolve(),
    createPresignedUploadUrl: () => Promise.resolve('http://storage.local/presigned-upload'),
    createPresignedDownloadUrl: () => Promise.resolve('http://storage.local/presigned-download'),
    headObject: () => Promise.resolve(storedObject),
  } as unknown as StorageService;
  const resumes = new ResumesService(database, storage);
  const createdUserIds: string[] = [];
  const createdResumeVersionIds: string[] = [];

  try {
    const primary = await auth.signup(
      `resume-primary-${runId}@integration.local`,
      'IntegrationPass!2026',
      { ip: '127.0.0.1' },
    );
    createdUserIds.push(primary.session.user.id);
    const candidate = await candidates.initialize(primary.session.user.id);

    const prepared = await resumes.prepareInitialUpload(primary.session.user.id, {
      title: 'Primary resume',
      originalFilename: 'muhammad-younas-resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 245_760,
    });
    createdResumeVersionIds.push(prepared.version.id);

    await t.test('creates a logical resume with immutable first version metadata', () => {
      assert.equal(prepared.resume.candidateId, candidate.id);
      assert.equal(prepared.resume.currentVersionId, prepared.version.id);
      assert.equal(prepared.version.versionNumber, 1);
      assert.equal(prepared.version.processingState, 'UPLOADING');
      assert.equal(prepared.version.processingPipelineVersion, 'resume-pipeline-v1');
      assert.equal(prepared.version.mimeType, 'application/pdf');
      assert.equal(prepared.version.sizeBytes, 245_760);
      assert.match(
        prepared.version.objectKey,
        new RegExp(`^resumes/${candidate.id}/${prepared.resume.id}/[0-9a-f-]+/original$`),
      );
    });

    await t.test('lists and reads only the authenticated candidate resume domain', async () => {
      const list = await resumes.list(primary.session.user.id);
      assert.equal(list.length, 1);
      assert.equal(list[0]?.id, prepared.resume.id);
      assert.equal(list[0]?.currentVersion?.id, prepared.version.id);

      const detail = await resumes.get(primary.session.user.id, prepared.resume.id);
      assert.equal(detail.versions.length, 1);
      assert.equal(detail.versions[0]?.id, prepared.version.id);
    });

    await t.test('does not expose storage authorization to another candidate', async () => {
      const other = await auth.signup(
        `resume-other-${runId}@integration.local`,
        'IntegrationPass!2026',
        { ip: '127.0.0.2' },
      );
      createdUserIds.push(other.session.user.id);
      await candidates.initialize(other.session.user.id);

      await assert.rejects(
        () => resumes.get(other.session.user.id, prepared.resume.id),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 404,
      );

      await assert.rejects(
        () => resumes.assertVersionOwnedByUser(other.session.user.id, prepared.version.id),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 404,
      );

      await assert.rejects(
        () => resumes.completeDirectUpload(other.session.user.id, prepared.version.id),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 404,
      );

      await assert.rejects(
        () => resumes.createDownloadAuthorization(other.session.user.id, prepared.version.id),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 404,
      );
    });

    await t.test('size mismatch fails without advancing the resume state', async () => {
      storedObject = {
        contentLength: prepared.version.sizeBytes + 1,
        contentType: prepared.version.mimeType,
        eTag: 'wrong-size',
      };

      await assert.rejects(
        () => resumes.completeDirectUpload(primary.session.user.id, prepared.version.id),
        (error: unknown) =>
          error instanceof Error &&
          'getStatus' in error &&
          typeof (error as { getStatus?: unknown }).getStatus === 'function' &&
          (error as { getStatus: () => number }).getStatus() === 409,
      );

      const persisted = await database.resumeVersion.findUniqueOrThrow({
        where: { id: prepared.version.id },
        select: { processingState: true },
      });
      assert.equal(persisted.processingState, 'UPLOADING');

      storedObject = {
        contentLength: prepared.version.sizeBytes,
        contentType: prepared.version.mimeType,
        eTag: 'phase3-integration-etag',
      };
    });

    await t.test(
      'matching object metadata advances to uploaded and enables private download',
      async () => {
        const completed = await resumes.completeDirectUpload(
          primary.session.user.id,
          prepared.version.id,
        );
        assert.equal(completed.processingState, 'UPLOADED');

        const download = await resumes.createDownloadAuthorization(
          primary.session.user.id,
          prepared.version.id,
        );
        assert.equal(download.url, 'http://storage.local/presigned-download');
        assert.equal(download.resumeVersionId, prepared.version.id);
        assert.equal(download.expiresInSeconds, 300);
      },
    );

    await t.test('writes auditable upload-prepared and upload-completed records', async () => {
      const preparedAudit = await database.auditEvent.findFirst({
        where: {
          resourceType: 'ResumeVersion',
          resourceId: prepared.version.id,
          action: 'candidate.resume.upload_prepared',
        },
      });
      const preparedOutbox = await database.outboxEvent.findFirst({
        where: {
          aggregateType: 'ResumeVersion',
          aggregateId: prepared.version.id,
          eventType: 'candidate.resume.upload_prepared',
        },
      });
      const completedAudit = await database.auditEvent.findFirst({
        where: {
          resourceType: 'ResumeVersion',
          resourceId: prepared.version.id,
          action: 'candidate.resume.upload_completed',
        },
      });
      const completedOutbox = await database.outboxEvent.findFirst({
        where: {
          aggregateType: 'ResumeVersion',
          aggregateId: prepared.version.id,
          eventType: 'candidate.resume.upload_completed',
        },
      });
      assert.ok(preparedAudit);
      assert.ok(preparedOutbox);
      assert.ok(completedAudit);
      assert.ok(completedOutbox);
    });
  } finally {
    for (const resumeVersionId of createdResumeVersionIds) {
      await database.auditEvent.deleteMany({ where: { resourceId: resumeVersionId } });
      await database.outboxEvent.deleteMany({
        where: { aggregateType: 'ResumeVersion', aggregateId: resumeVersionId },
      });
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
