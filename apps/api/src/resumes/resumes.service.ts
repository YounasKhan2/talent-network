import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { randomUUID } from 'node:crypto';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { writeAuditEvent, writeOutboxEvent } from '../events/transactional-events.js';
import { StorageService } from '../storage/storage.service.js';
import { assertResumeProcessingTransition } from './resume-processing-state.js';

export interface PrepareResumeUploadInput {
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

const PROCESSING_PIPELINE_VERSION = 'resume-pipeline-v1';
const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;
const UPLOAD_URL_TTL_SECONDS = 10 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const ALLOWED_RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async prepareInitialUpload(userId: string, input: PrepareResumeUploadInput) {
    validateUploadMetadata(input);
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw candidateNotInitialized();

    return this.database.$transaction(async (transaction) => {
      const resume = await transaction.resume.create({
        data: {
          candidateId: candidate.id,
          title: input.title,
        },
        select: { id: true, candidateId: true, title: true, createdAt: true },
      });

      const versionId = randomUUID();
      const objectKey = `resumes/${candidate.id}/${resume.id}/${versionId}/original`;
      const version = await transaction.resumeVersion.create({
        data: {
          id: versionId,
          resumeId: resume.id,
          versionNumber: 1,
          processingState: 'UPLOADING',
          objectKey,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          processingPipelineVersion: PROCESSING_PIPELINE_VERSION,
        },
      });

      await transaction.resume.update({
        where: { id: resume.id },
        data: { currentVersionId: version.id },
      });

      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.resume.upload_prepared',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: {
          resumeId: resume.id,
          versionNumber: version.versionNumber,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          processingPipelineVersion: version.processingPipelineVersion,
        },
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'ResumeVersion',
        aggregateId: version.id,
        eventType: 'candidate.resume.upload_prepared',
        payload: {
          candidateId: candidate.id,
          resumeId: resume.id,
          resumeVersionId: version.id,
          versionNumber: version.versionNumber,
        },
      });

      return {
        resume: { ...resume, currentVersionId: version.id },
        version,
      };
    });
  }

  async createUploadAuthorization(userId: string, input: PrepareResumeUploadInput) {
    await this.storage.ensureBucketExists();
    const prepared = await this.prepareInitialUpload(userId, input);
    const uploadUrl = await this.storage.createPresignedUploadUrl({
      objectKey: prepared.version.objectKey,
      contentType: prepared.version.mimeType,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    });

    return {
      resumeId: prepared.resume.id,
      resumeVersionId: prepared.version.id,
      upload: {
        method: 'PUT' as const,
        url: uploadUrl,
        headers: { 'Content-Type': prepared.version.mimeType },
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
        maxSizeBytes: MAX_RESUME_SIZE_BYTES,
      },
    };
  }

  async completeDirectUpload(userId: string, resumeVersionId: string) {
    const version = await this.database.resumeVersion.findFirst({
      where: { id: resumeVersionId, resume: { candidate: { userId } } },
      select: {
        id: true,
        resumeId: true,
        processingState: true,
        objectKey: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
      },
    });
    if (!version) throw new NotFoundException({ code: 'RESUME_VERSION_NOT_FOUND' });

    if (version.processingState === 'UPLOADED') return version;
    assertResumeProcessingTransition(version.processingState, 'UPLOADED');

    const object = await this.storage.headObject(version.objectKey);
    if (object.contentLength !== version.sizeBytes) {
      throw new ConflictException({
        code: 'RESUME_UPLOAD_SIZE_MISMATCH',
        expectedSizeBytes: version.sizeBytes,
        actualSizeBytes: object.contentLength,
      });
    }
    if (object.contentType && object.contentType !== version.mimeType) {
      throw new ConflictException({
        code: 'RESUME_UPLOAD_CONTENT_TYPE_MISMATCH',
        expectedMimeType: version.mimeType,
        actualMimeType: object.contentType,
      });
    }

    return this.database.$transaction(async (transaction) => {
      const updated = await transaction.resumeVersion.update({
        where: { id: version.id },
        data: { processingState: 'UPLOADED', uploadedAt: new Date() },
      });
      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.resume.upload_completed',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: { resumeId: version.resumeId, eTag: object.eTag },
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'ResumeVersion',
        aggregateId: version.id,
        eventType: 'candidate.resume.upload_completed',
        payload: { resumeId: version.resumeId, resumeVersionId: version.id },
      });
      return updated;
    });
  }

  async createDownloadAuthorization(userId: string, resumeVersionId: string) {
    const version = await this.database.resumeVersion.findFirst({
      where: { id: resumeVersionId, resume: { candidate: { userId } } },
      select: {
        id: true,
        objectKey: true,
        originalFilename: true,
        processingState: true,
        failureCode: true,
      },
    });
    if (!version) throw new NotFoundException({ code: 'RESUME_VERSION_NOT_FOUND' });
    if (version.processingState === 'UPLOADING') {
      throw new ConflictException({ code: 'RESUME_UPLOAD_NOT_COMPLETED' });
    }
    if (version.failureCode === 'MALWARE_DETECTED') {
      throw new ConflictException({ code: 'RESUME_SECURITY_QUARANTINED' });
    }

    return {
      resumeVersionId: version.id,
      url: await this.storage.createPresignedDownloadUrl({
        objectKey: version.objectKey,
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        downloadFilename: version.originalFilename,
      }),
      expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
    };
  }

  async list(userId: string) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw candidateNotInitialized();

    return this.database.resume.findMany({
      where: { candidateId: candidate.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        currentVersion: true,
      },
    });
  }

  async get(userId: string, resumeId: string) {
    const candidate = await this.database.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw candidateNotInitialized();

    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, candidateId: candidate.id },
      include: {
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });
    if (!resume) throw new NotFoundException({ code: 'RESUME_NOT_FOUND' });
    return resume;
  }

  async delete(userId: string, resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, candidate: { userId } },
      select: {
        id: true,
        candidateId: true,
        versions: { select: { id: true, objectKey: true } },
      },
    });
    if (!resume) throw new NotFoundException({ code: 'RESUME_NOT_FOUND' });

    const versionIds = resume.versions.map((version) => version.id);
    const [extractions, parseResults] = await Promise.all([
      versionIds.length
        ? this.database.resumeExtraction.findMany({
            where: { resumeVersionId: { in: versionIds } },
            select: { documentObjectKey: true },
          })
        : Promise.resolve([]),
      versionIds.length
        ? this.database.resumeParseResult.findMany({
            where: { resumeVersionId: { in: versionIds } },
            select: { parsedObjectKey: true, evidenceObjectKey: true },
          })
        : Promise.resolve([]),
    ]);

    const objectKeys = new Set<string>();
    for (const version of resume.versions) objectKeys.add(version.objectKey);
    for (const extraction of extractions) {
      if (extraction.documentObjectKey) objectKeys.add(extraction.documentObjectKey);
    }
    for (const result of parseResults) {
      if (result.parsedObjectKey) objectKeys.add(result.parsedObjectKey);
      if (result.evidenceObjectKey) objectKeys.add(result.evidenceObjectKey);
    }

    await this.storage.ensureBucketExists();
    for (const objectKey of objectKeys) {
      await this.storage.deleteObject(objectKey);
    }

    await this.database.$transaction(async (transaction) => {
      const deleted = await transaction.resume.deleteMany({
        where: { id: resume.id, candidateId: resume.candidateId },
      });
      if (deleted.count === 0) throw new NotFoundException({ code: 'RESUME_NOT_FOUND' });

      await writeAuditEvent(transaction, {
        actorType: 'USER',
        actorId: userId,
        action: 'candidate.resume.deleted',
        resourceType: 'Resume',
        resourceId: resume.id,
        metadata: {
          candidateId: resume.candidateId,
          versionCount: versionIds.length,
          privateObjectCount: objectKeys.size,
        },
      });
      await writeOutboxEvent(transaction, {
        aggregateType: 'Resume',
        aggregateId: resume.id,
        eventType: 'candidate.resume.deleted',
        payload: {
          candidateId: resume.candidateId,
          resumeId: resume.id,
          versionCount: versionIds.length,
        },
      });
    });

    return { deleted: true, resumeId: resume.id };
  }

  async assertVersionOwnedByUser(userId: string, resumeVersionId: string) {
    const version = await this.database.resumeVersion.findFirst({
      where: {
        id: resumeVersionId,
        resume: { candidate: { userId } },
      },
      select: { id: true, resumeId: true, processingState: true },
    });
    if (!version) throw new NotFoundException({ code: 'RESUME_VERSION_NOT_FOUND' });
    return version;
  }
}

function validateUploadMetadata(input: PrepareResumeUploadInput): void {
  if (!ALLOWED_RESUME_MIME_TYPES.has(input.mimeType)) {
    throw new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_RESUME_TYPE' });
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_RESUME_SIZE_BYTES) {
    throw new PayloadTooLargeException({
      code: 'RESUME_SIZE_LIMIT_EXCEEDED',
      maxSizeBytes: MAX_RESUME_SIZE_BYTES,
    });
  }
}

function candidateNotInitialized() {
  return new ConflictException({ code: 'CANDIDATE_NOT_INITIALIZED' });
}
