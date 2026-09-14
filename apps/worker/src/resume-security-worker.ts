import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { DatabaseClient } from '@talent-network/database';
import {
  type MalwareScanner,
  type ResumeSecurityJobData,
  validateResumeDocument,
} from '@talent-network/resume-security';

export const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;

const SECURITY_RETRYABLE_FAILURE_CODES = [
  'RESUME_OBJECT_READ_FAILED',
  'MALWARE_SCANNER_UNAVAILABLE',
] as const;

export interface ResumeSecurityProcessorDependencies {
  database: DatabaseClient;
  storage: S3Client;
  bucket: string;
  scanner: MalwareScanner;
}

export interface ResumeSecurityExecutionContext {
  finalAttempt?: boolean;
  retryAttempt?: boolean;
}

export async function processResumeSecurityJob(
  input: ResumeSecurityJobData,
  dependencies: ResumeSecurityProcessorDependencies,
  execution: ResumeSecurityExecutionContext = {},
): Promise<void> {
  const { database, storage, bucket, scanner } = dependencies;
  let claimed = await database.resumeVersion.updateMany({
    where: {
      id: input.resumeVersionId,
      OR: [
        { processingState: 'UPLOADED' },
        {
          processingState: 'FAILED_RETRYABLE',
          failureCode: { in: [...SECURITY_RETRYABLE_FAILURE_CODES] },
        },
      ],
    },
    data: {
      processingState: 'VALIDATING',
      failureCode: null,
      failureMetadata: null,
    },
  });

  if (claimed.count === 0 && execution.retryAttempt === true) {
    claimed = await database.resumeVersion.updateMany({
      where: {
        id: input.resumeVersionId,
        processingState: { in: ['VALIDATING', 'SCANNING'] },
      },
      data: {
        processingState: 'VALIDATING',
        failureCode: null,
        failureMetadata: null,
      },
    });
  }

  if (claimed.count === 0) {
    const existing = await database.resumeVersion.findUnique({
      where: { id: input.resumeVersionId },
      select: { processingState: true },
    });
    if (!existing) throw new Error('ResumeVersion not found.');

    if (
      existing.processingState === 'VALIDATING' ||
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
    await markProcessingFailure(
      database,
      version,
      'RESUME_OBJECT_READ_FAILED',
      {
        stage: 'VALIDATING',
        reason: safeErrorMessage(error),
      },
      execution.finalAttempt === true,
    );
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

  const movedToScanning = await database.resumeVersion.updateMany({
    where: { id: version.id, processingState: 'VALIDATING' },
    data: {
      processingState: 'SCANNING',
      checksumSha256: validation.checksumSha256,
      failureCode: null,
      failureMetadata: null,
    },
  });
  if (movedToScanning.count === 0) return;

  const scan = await scanner.scan(bytes);
  if (scan.status === 'ERROR') {
    await markProcessingFailure(
      database,
      version,
      'MALWARE_SCANNER_UNAVAILABLE',
      {
        stage: 'SCANNING',
        engine: scan.engine,
        engineVersion: scan.engineVersion,
        durationMs: scan.durationMs,
      },
      execution.finalAttempt === true,
    );
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
    const advanced = await transaction.resumeVersion.updateMany({
      where: { id: version.id, processingState: 'SCANNING' },
      data: {
        processingState: 'EXTRACTING',
        failureCode: null,
        failureMetadata: null,
      },
    });
    if (advanced.count === 0) return;

    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.security_passed',
        resourceType: 'ResumeVersion',
        resourceId: version.id,
        metadata: {
          resumeId: version.resumeId,
          processingPipelineVersion: version.processingPipelineVersion,
          detectedMimeType: validation.detectedMimeType,
          documentKind: validation.kind,
          checksumSha256: validation.checksumSha256,
          scannerEngine: scan.engine,
          scannerEngineVersion: scan.engineVersion,
          scanDurationMs: scan.durationMs,
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
    const rejected = await transaction.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingState: { in: ['VALIDATING', 'SCANNING'] },
      },
      data: { processingState: 'REJECTED', failureCode, failureMetadata },
    });
    if (rejected.count === 0) return;

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

async function markProcessingFailure(
  database: DatabaseClient,
  version: { id: string; resumeId: string; processingPipelineVersion: string },
  failureCode: string,
  failureMetadata: Record<string, unknown>,
  finalAttempt: boolean,
): Promise<void> {
  if (!finalAttempt) {
    await database.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingState: { in: ['VALIDATING', 'SCANNING'] },
      },
      data: { processingState: 'FAILED_RETRYABLE', failureCode, failureMetadata },
    });
    return;
  }

  await database.$transaction(async (transaction) => {
    const failed = await transaction.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingState: { in: ['VALIDATING', 'SCANNING'] },
      },
      data: { processingState: 'FAILED_TERMINAL', failureCode, failureMetadata },
    });
    if (failed.count === 0) return;

    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.security_failed_terminal',
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
        eventType: 'candidate.resume.security_failed_terminal',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          failureCode,
        },
      },
    });
  });
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : 'unknown error';
}
