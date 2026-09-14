import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { DatabaseClient } from '@talent-network/database';
import {
  type MalwareScanner,
  type ResumeSecurityJobData,
  validateResumeDocument,
} from '@talent-network/resume-security';

export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;

export interface ResumeSecurityProcessorDependencies {
  database: DatabaseClient;
  storage: S3Client;
  bucket: string;
  scanner: MalwareScanner;
}

export async function processResumeSecurityJob(
  input: ResumeSecurityJobData,
  dependencies: ResumeSecurityProcessorDependencies,
): Promise<void> {
  const { database, storage, bucket, scanner } = dependencies;
  const claimed = await database.resumeVersion.updateMany({
    where: { id: input.resumeVersionId, processingState: 'UPLOADED' },
    data: {
      processingState: 'VALIDATING',
      failureCode: null,
    },
  });

  if (claimed.count === 0) {
    const existing = await database.resumeVersion.findUnique({
      where: { id: input.resumeVersionId },
      select: { processingState: true },
    });
    if (!existing) throw new Error('ResumeVersion not found.');

    if (
      existing.processingState === 'SCANNING' ||
      existing.processingState === 'EXTRACTING' ||
      existing.processingState === 'OCR_REQUIRED' ||
      existing.processingState === 'PARSING' ||
      existing.processingState === 'READY_FOR_REVIEW' ||
      existing.processingState === 'APPROVED' ||
      existing.processingState === 'REJECTED' ||
      existing.processingState === 'FAILED_TERMINAL'
    ) {
      return;
    }

    throw new Error(`ResumeVersion is not ready for security processing: ${existing.processingState}`);
  }

  const version = await database.resumeVersion.findUniqueOrThrow({
    where: { id: input.resumeVersionId },
    select: {
      id: true,
      resumeId: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      processingPipelineVersion: true,
    },
  });

  let bytes: Uint8Array;
  try {
    bytes = await readPrivateObject(storage, bucket, version.objectKey);
  } catch (error: unknown) {
    await markRetryable(database, version.id, 'RESUME_OBJECT_READ_FAILED', {
      stage: 'VALIDATING',
      reason: safeErrorMessage(error),
    });
    throw error;
  }

  const validation = validateResumeDocument({
    bytes,
    declaredMimeType: version.mimeType,
    declaredSizeBytes: version.sizeBytes,
    maxSizeBytes: MAX_RESUME_SIZE_BYTES,
  });

  if (!validation.ok) {
    await rejectResume(database, version, `RESUME_VALIDATION_${validation.code}`, {
      stage: 'VALIDATING',
      validationCode: validation.code,
      message: validation.message,
    });
    return;
  }

  await database.resumeVersion.update({
    where: { id: version.id },
    data: {
      processingState: 'SCANNING',
      checksumSha256: validation.checksumSha256,
      failureCode: null,
    },
  });

  const scan = await scanner.scan(bytes);
  if (scan.status === 'ERROR') {
    await markRetryable(database, version.id, 'MALWARE_SCANNER_UNAVAILABLE', {
      stage: 'SCANNING',
      engine: scan.engine,
      engineVersion: scan.engineVersion,
      durationMs: scan.durationMs,
    });
    throw new Error('Malware scanner failed to produce a trustworthy result.');
  }

  if (scan.status === 'INFECTED') {
    await rejectResume(database, version, 'MALWARE_DETECTED', {
      stage: 'SCANNING',
      engine: scan.engine,
      engineVersion: scan.engineVersion,
      signature: scan.signature,
      durationMs: scan.durationMs,
    });
    return;
  }

  await database.$transaction(async (transaction) => {
    await transaction.resumeVersion.update({
      where: { id: version.id },
      data: {
        processingState: 'EXTRACTING',
        failureCode: null,
        failureMetadata: {
          security: {
            validation: {
              detectedMimeType: validation.detectedMimeType,
              documentKind: validation.kind,
              checksumSha256: validation.checksumSha256,
            },
            malwareScan: {
              engine: scan.engine,
              engineVersion: scan.engineVersion,
              status: scan.status,
              durationMs: scan.durationMs,
            },
          },
        },
      },
    });

    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.security_passed',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: {
          resumeId: version.resumeId,
          processingPipelineVersion: version.processingPipelineVersion,
          scannerEngine: scan.engine,
          scannerEngineVersion: scan.engineVersion,
        },
      },
    });

    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'ResumeVersion',
        aggregateId: version.id,
        eventType: 'candidate.resume.security_passed',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          nextStage: 'EXTRACTING',
        },
      },
    });
  });
}

async function readPrivateObject(
  client: S3Client,
  bucket: string,
  objectKey: string,
): Promise<Uint8Array> {
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
  if (!response.Body) throw new Error('Stored resume object has no body.');
  return response.Body.transformToByteArray();
}

async function rejectResume(
  database: DatabaseClient,
  version: { id: string; resumeId: string; processingPipelineVersion: string },
  failureCode: string,
  failureMetadata: Record<string, unknown>,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await transaction.resumeVersion.update({
      where: { id: version.id },
      data: { processingState: 'REJECTED', failureCode, failureMetadata },
    });
    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.security_rejected',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: {
          resumeId: version.resumeId,
          failureCode,
          processingPipelineVersion: version.processingPipelineVersion,
        },
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'ResumeVersion',
        aggregateId: version.id,
        eventType: 'candidate.resume.security_rejected',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          failureCode,
        },
      },
    });
  });
}

async function markRetryable(
  database: DatabaseClient,
  resumeVersionId: string,
  failureCode: string,
  failureMetadata: Record<string, unknown>,
): Promise<void> {
  await database.resumeVersion.update({
    where: { id: resumeVersionId },
    data: { processingState: 'FAILED_RETRYABLE', failureCode, failureMetadata },
  });
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'unknown error';
}
