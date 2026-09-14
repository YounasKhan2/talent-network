import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DatabaseClient } from '@talent-network/database';
import { randomUUID } from 'node:crypto';
import { DATABASE_CLIENT } from '../database/database.module.js';
import { writeAuditEvent, writeOutboxEvent } from '../events/transactional-events.js';

export interface PrepareResumeUploadInput {
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
}

const PROCESSING_PIPELINE_VERSION = 'resume-pipeline-v1';

@Injectable()
export class ResumesService {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseClient) {}

  async prepareInitialUpload(userId: string, input: PrepareResumeUploadInput) {
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

function candidateNotInitialized() {
  return new ConflictException({ code: 'CANDIDATE_NOT_INITIALIZED' });
}
