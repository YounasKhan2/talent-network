import { createHash } from 'node:crypto';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { DATABASE_JSON_DB_NULL, type DatabaseClient } from '@talent-network/database';
import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  decideResumeExtractionQuality,
  type ResumeOcrEngine,
  type ResumeOcrJobData,
} from '@talent-network/resume-extraction';

const OCR_RETRYABLE_FAILURE_CODES = [
  'RESUME_OCR_OBJECT_READ_FAILED',
  'RESUME_OCR_SERVICE_UNAVAILABLE',
] as const;
const OCR_FAILURE_CODES = new Set([
  'RESUME_OCR_OBJECT_READ_FAILED',
  'RESUME_OCR_SERVICE_UNAVAILABLE',
  'RESUME_OCR_RECOGNITION_FAILED',
  'RESUME_OCR_QUALITY_INSUFFICIENT',
  'RESUME_OCR_FAILED',
]);

type ResumeFailureMetadata = NonNullable<
  Parameters<DatabaseClient['resumeVersion']['updateMany']>[0]['data']['failureMetadata']
>;

export interface ResumeOcrProcessorDependencies {
  database: DatabaseClient;
  storage: S3Client;
  bucket: string;
  engine: ResumeOcrEngine;
}

export interface ResumeOcrExecutionContext {
  finalAttempt?: boolean;
  retryAttempt?: boolean;
}

export async function processResumeOcrJob(
  input: ResumeOcrJobData,
  dependencies: ResumeOcrProcessorDependencies,
  execution: ResumeOcrExecutionContext = {},
): Promise<void> {
  const { database, storage, bucket, engine } = dependencies;

  const sourceExtraction = await database.resumeExtraction.findUnique({
    where: { id: input.extractionId },
    select: {
      id: true,
      resumeVersionId: true,
      pipelineVersion: true,
      status: true,
      extractionMethod: true,
      qualityMetadata: true,
    },
  });

  if (!sourceExtraction) throw new Error('Resume OCR source extraction not found.');
  if (
    sourceExtraction.resumeVersionId !== input.resumeVersionId ||
    sourceExtraction.pipelineVersion !== input.processingPipelineVersion
  ) {
    throw new Error('Resume OCR source extraction identity mismatch.');
  }
  if (
    sourceExtraction.status !== 'COMPLETED' ||
    sourceExtraction.extractionMethod === 'OCR' ||
    readQualityDecision(sourceExtraction.qualityMetadata) !== 'OCR_REQUIRED'
  ) {
    throw new Error('Resume OCR source extraction is not eligible for OCR.');
  }

  let claimed = await database.resumeVersion.updateMany({
    where: {
      id: input.resumeVersionId,
      processingPipelineVersion: input.processingPipelineVersion,
      processingState: 'OCR_REQUIRED',
    },
    data: {
      failureCode: null,
      failureMetadata: DATABASE_JSON_DB_NULL,
    },
  });

  if (claimed.count === 0 && execution.retryAttempt === true) {
    claimed = await database.resumeVersion.updateMany({
      where: {
        id: input.resumeVersionId,
        processingPipelineVersion: input.processingPipelineVersion,
        processingState: 'FAILED_RETRYABLE',
        failureCode: { in: [...OCR_RETRYABLE_FAILURE_CODES] },
      },
      data: {
        processingState: 'OCR_REQUIRED',
        failureCode: null,
        failureMetadata: DATABASE_JSON_DB_NULL,
      },
    });
  }

  if (claimed.count === 0) {
    const existing = await database.resumeVersion.findUnique({
      where: { id: input.resumeVersionId },
      select: { processingState: true, processingPipelineVersion: true },
    });
    if (!existing) throw new Error('ResumeVersion not found.');
    if (existing.processingPipelineVersion !== input.processingPipelineVersion) {
      throw new Error('Resume OCR pipeline version mismatch.');
    }
    if (
      existing.processingState === 'PARSING' ||
      existing.processingState === 'READY_FOR_REVIEW' ||
      existing.processingState === 'APPROVED' ||
      existing.processingState === 'REJECTED' ||
      existing.processingState === 'FAILED_TERMINAL'
    ) {
      return;
    }
    throw new Error(`ResumeVersion is not ready for OCR: ${existing.processingState}`);
  }

  const version = await database.resumeVersion.findUniqueOrThrow({
    where: { id: input.resumeVersionId },
    select: {
      id: true,
      resumeId: true,
      objectKey: true,
      mimeType: true,
      processingPipelineVersion: true,
    },
  });

  const extraction = await database.resumeExtraction.upsert({
    where: {
      resumeVersionId_pipelineVersion_extractorName_extractorVersion_extractionMethod: {
        resumeVersionId: version.id,
        pipelineVersion: version.processingPipelineVersion,
        extractorName: engine.name,
        extractorVersion: engine.version,
        extractionMethod: 'OCR',
      },
    },
    update: {
      status: 'STARTED',
      schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
      failureCode: null,
      completedAt: null,
    },
    create: {
      resumeVersionId: version.id,
      pipelineVersion: version.processingPipelineVersion,
      extractorName: engine.name,
      extractorVersion: engine.version,
      extractionMethod: 'OCR',
      schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
      status: 'STARTED',
    },
  });

  let bytes: Uint8Array;
  try {
    bytes = await readPrivateObject(storage, bucket, version.objectKey);
  } catch (error: unknown) {
    await database.resumeExtraction.update({
      where: { id: extraction.id },
      data: {
        status: 'FAILED',
        failureCode: 'RESUME_OCR_OBJECT_READ_FAILED',
        completedAt: new Date(),
      },
    });
    await markOcrFailure(
      database,
      version,
      'RESUME_OCR_OBJECT_READ_FAILED',
      { stage: 'OCR', reason: safeInfrastructureErrorReason(error) },
      execution.finalAttempt === true,
    );
    throw error;
  }

  try {
    const result = await engine.recognize({
      resumeVersionId: version.id,
      mimeType: version.mimeType,
      bytes,
    });
    if (result.document.extractionMethod !== 'OCR') {
      throw new Error('RESUME_OCR_RECOGNITION_FAILED');
    }

    const qualityDecision = decideResumeExtractionQuality(result.document.quality);
    if (qualityDecision.decision === 'OCR_REQUIRED') {
      await database.resumeExtraction.update({
        where: { id: extraction.id },
        data: {
          status: 'FAILED',
          schemaVersion: result.document.schemaVersion,
          qualityMetadata: {
            ...result.document.quality,
            decision: qualityDecision.decision,
            policyVersion: qualityDecision.policyVersion,
            reasons: qualityDecision.reasons,
            durationMs: result.durationMs,
          },
          failureCode: 'RESUME_OCR_QUALITY_INSUFFICIENT',
          completedAt: new Date(),
        },
      });
      await markOcrFailure(
        database,
        version,
        'RESUME_OCR_QUALITY_INSUFFICIENT',
        { stage: 'OCR', reason: 'OCR_QUALITY_INSUFFICIENT' },
        true,
      );
      return;
    }

    const checksum = createHash('sha256').update(result.document.text).digest('hex');
    await database.$transaction(async (transaction) => {
      await transaction.resumeExtraction.update({
        where: { id: extraction.id },
        data: {
          status: 'COMPLETED',
          schemaVersion: result.document.schemaVersion,
          qualityMetadata: {
            ...result.document.quality,
            decision: qualityDecision.decision,
            policyVersion: qualityDecision.policyVersion,
            reasons: qualityDecision.reasons,
            durationMs: result.durationMs,
            sourceExtractionId: sourceExtraction.id,
          },
          documentJson: result.document,
          textChecksumSha256: checksum,
          failureCode: null,
          completedAt: new Date(),
        },
      });

      const advanced = await transaction.resumeVersion.updateMany({
        where: {
          id: version.id,
          processingState: 'OCR_REQUIRED',
          processingPipelineVersion: version.processingPipelineVersion,
        },
        data: {
          processingState: 'PARSING',
          failureCode: null,
          failureMetadata: DATABASE_JSON_DB_NULL,
        },
      });
      if (advanced.count === 0) return;

      await transaction.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: 'candidate.resume.ocr_completed',
          resourceType: 'ResumeVersion',
          resourceId: version.id,
          metadata: {
            resumeId: version.resumeId,
            sourceResumeExtractionId: sourceExtraction.id,
            resumeExtractionId: extraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            engineName: engine.name,
            engineVersion: engine.version,
            schemaVersion: result.document.schemaVersion,
            textChecksumSha256: checksum,
            qualityDecision: qualityDecision.decision,
            qualityPolicyVersion: qualityDecision.policyVersion,
            nextStage: 'PARSING',
          },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'ResumeVersion',
          aggregateId: version.id,
          eventType: 'candidate.resume.ocr_completed',
          payload: {
            resumeId: version.resumeId,
            resumeVersionId: version.id,
            sourceResumeExtractionId: sourceExtraction.id,
            resumeExtractionId: extraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            nextStage: 'PARSING',
          },
        },
      });
    });
  } catch (error: unknown) {
    const failureCode = safeOcrFailureCode(error);
    const retryable = isRetryableOcrFailureCode(failureCode);
    await database.resumeExtraction.update({
      where: { id: extraction.id },
      data: {
        status: 'FAILED',
        failureCode,
        completedAt: new Date(),
      },
    });
    await markOcrFailure(
      database,
      version,
      failureCode,
      { stage: 'OCR', reason: retryable ? 'OCR_SERVICE_UNAVAILABLE' : 'OCR_ENGINE_FAILED' },
      retryable ? execution.finalAttempt === true : true,
    );
    if (retryable && execution.finalAttempt !== true) throw error;
  }
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

async function markOcrFailure(
  database: DatabaseClient,
  version: { id: string; resumeId: string; processingPipelineVersion: string },
  failureCode: string,
  failureMetadata: ResumeFailureMetadata,
  finalAttempt: boolean,
): Promise<void> {
  if (!finalAttempt) {
    await database.resumeVersion.updateMany({
      where: { id: version.id, processingState: 'OCR_REQUIRED' },
      data: {
        processingState: 'FAILED_RETRYABLE',
        failureCode,
        failureMetadata,
      },
    });
    return;
  }

  await database.$transaction(async (transaction) => {
    const failed = await transaction.resumeVersion.updateMany({
      where: {
        id: version.id,
        processingState: { in: ['OCR_REQUIRED', 'FAILED_RETRYABLE'] },
      },
      data: {
        processingState: 'FAILED_TERMINAL',
        failureCode,
        failureMetadata,
      },
    });
    if (failed.count === 0) return;

    await transaction.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'candidate.resume.ocr_failed_terminal',
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
        eventType: 'candidate.resume.ocr_failed_terminal',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          failureCode,
        },
      },
    });
  });
}

function readQualityDecision(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const decision = (value as Record<string, unknown>).decision;
  return typeof decision === 'string' ? decision : null;
}

function safeOcrFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'RESUME_OCR_FAILED';
  const candidate = error.message.split(':', 1)[0]?.trim();
  return candidate && OCR_FAILURE_CODES.has(candidate) ? candidate : 'RESUME_OCR_FAILED';
}

function isRetryableOcrFailureCode(failureCode: string): boolean {
  return OCR_RETRYABLE_FAILURE_CODES.some((candidate) => candidate === failureCode);
}

function safeInfrastructureErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return 'OBJECT_READ_FAILED';
  return error.name && error.name !== 'Error' ? error.name.slice(0, 80) : 'OBJECT_READ_FAILED';
}
