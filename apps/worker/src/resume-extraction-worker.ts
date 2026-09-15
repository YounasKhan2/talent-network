import { createHash } from 'node:crypto';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { DATABASE_JSON_DB_NULL, type DatabaseClient } from '@talent-network/database';
import {
  MammothDocxResumeExtractor,
  PdfJsResumeExtractor,
  decideResumeExtractionQuality,
  type ResumeExtractionJobData,
  type ResumeExtractionMethod,
  type ResumeExtractor,
} from '@talent-network/resume-extraction';

const EXTRACTION_RETRYABLE_FAILURE_CODES = ['RESUME_EXTRACTION_OBJECT_READ_FAILED'] as const;
const EXTRACTION_FAILURE_CODES = new Set([
  'RESUME_EXTRACTION_UNSUPPORTED_MIME_TYPE',
  'RESUME_EXTRACTION_OBJECT_READ_FAILED',
  'RESUME_EXTRACTION_PARSE_FAILED',
  'RESUME_EXTRACTION_FAILED',
]);

export interface ResumeExtractionProcessorDependencies {
  database: DatabaseClient;
  storage: S3Client;
  bucket: string;
  extractors?: ResumeExtractor[];
}

export interface ResumeExtractionExecutionContext {
  finalAttempt?: boolean;
  retryAttempt?: boolean;
}

export async function processResumeExtractionJob(
  input: ResumeExtractionJobData,
  dependencies: ResumeExtractionProcessorDependencies,
  execution: ResumeExtractionExecutionContext = {},
): Promise<void> {
  const { database, storage, bucket } = dependencies;
  const extractors = dependencies.extractors ?? [
    new PdfJsResumeExtractor(),
    new MammothDocxResumeExtractor(),
  ];

  let claimed = await database.resumeVersion.updateMany({
    where: {
      id: input.resumeVersionId,
      processingPipelineVersion: input.processingPipelineVersion,
      processingState: 'EXTRACTING',
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
        failureCode: { in: [...EXTRACTION_RETRYABLE_FAILURE_CODES] },
      },
      data: {
        processingState: 'EXTRACTING',
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
      throw new Error('Resume extraction pipeline version mismatch.');
    }
    if (
      existing.processingState === 'OCR_REQUIRED' ||
      existing.processingState === 'PARSING' ||
      existing.processingState === 'READY_FOR_REVIEW' ||
      existing.processingState === 'APPROVED' ||
      existing.processingState === 'REJECTED' ||
      existing.processingState === 'FAILED_TERMINAL'
    ) {
      return;
    }
    throw new Error(`ResumeVersion is not ready for extraction: ${existing.processingState}`);
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

  const extractor = extractors.find((candidate) => candidate.supports(version.mimeType));
  if (!extractor) {
    await markExtractionFailure(
      database,
      version,
      'RESUME_EXTRACTION_UNSUPPORTED_MIME_TYPE',
      { stage: 'EXTRACTING', mimeType: version.mimeType },
      true,
    );
    return;
  }

  const extractionMethod: ResumeExtractionMethod =
    version.mimeType === 'application/pdf' ? 'NATIVE_PDF' : 'NATIVE_DOCX';

  const extraction = await database.resumeExtraction.upsert({
    where: {
      resumeVersionId_pipelineVersion_extractorName_extractorVersion_extractionMethod: {
        resumeVersionId: version.id,
        pipelineVersion: version.processingPipelineVersion,
        extractorName: extractor.name,
        extractorVersion: extractor.version,
        extractionMethod,
      },
    },
    update: {
      status: 'STARTED',
      failureCode: null,
      completedAt: null,
    },
    create: {
      resumeVersionId: version.id,
      pipelineVersion: version.processingPipelineVersion,
      extractorName: extractor.name,
      extractorVersion: extractor.version,
      extractionMethod,
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
        failureCode: 'RESUME_EXTRACTION_OBJECT_READ_FAILED',
        completedAt: new Date(),
      },
    });
    await markExtractionFailure(
      database,
      version,
      'RESUME_EXTRACTION_OBJECT_READ_FAILED',
      { stage: 'EXTRACTING', reason: safeInfrastructureErrorReason(error) },
      execution.finalAttempt === true,
    );
    throw error;
  }

  try {
    const result = await extractor.extract({
      resumeVersionId: version.id,
      mimeType: version.mimeType,
      bytes,
    });
    const qualityDecision = decideResumeExtractionQuality(result.document.quality);
    const checksum = createHash('sha256').update(result.document.text).digest('hex');
    const nextState = qualityDecision.decision === 'OCR_REQUIRED' ? 'OCR_REQUIRED' : 'PARSING';
    const eventType =
      nextState === 'OCR_REQUIRED'
        ? 'candidate.resume.ocr_required'
        : 'candidate.resume.extraction_completed';

    await database.$transaction(async (transaction) => {
      await transaction.resumeExtraction.update({
        where: { id: extraction.id },
        data: {
          status: 'COMPLETED',
          qualityMetadata: {
            ...result.document.quality,
            decision: qualityDecision.decision,
            policyVersion: qualityDecision.policyVersion,
            reasons: qualityDecision.reasons,
            durationMs: result.durationMs,
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
          processingState: 'EXTRACTING',
          processingPipelineVersion: version.processingPipelineVersion,
        },
        data: {
          processingState: nextState,
          failureCode: null,
          failureMetadata: DATABASE_JSON_DB_NULL,
        },
      });
      if (advanced.count === 0) return;

      await transaction.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: eventType,
          resourceType: 'ResumeVersion',
          resourceId: version.id,
          metadata: {
            resumeId: version.resumeId,
            resumeExtractionId: extraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            extractionMethod,
            extractorName: extractor.name,
            extractorVersion: extractor.version,
            schemaVersion: result.document.schemaVersion,
            textChecksumSha256: checksum,
            qualityDecision: qualityDecision.decision,
            qualityPolicyVersion: qualityDecision.policyVersion,
            nextStage: nextState,
          },
        },
      });

      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'ResumeVersion',
          aggregateId: version.id,
          eventType,
          payload: {
            resumeId: version.resumeId,
            resumeVersionId: version.id,
            resumeExtractionId: extraction.id,
            processingPipelineVersion: version.processingPipelineVersion,
            nextStage: nextState,
          },
        },
      });
    });
  } catch (error: unknown) {
    const failureCode = safeExtractionFailureCode(error);
    await database.resumeExtraction.update({
      where: { id: extraction.id },
      data: {
        status: 'FAILED',
        failureCode,
        completedAt: new Date(),
      },
    });

    await markExtractionFailure(
      database,
      version,
      failureCode,
      { stage: 'EXTRACTING', reason: 'EXTRACTOR_FAILED' },
      true,
    );
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

async function markExtractionFailure(
  database: DatabaseClient,
  version: { id: string; resumeId: string; processingPipelineVersion: string },
  failureCode: string,
  failureMetadata: Parameters<
    DatabaseClient['resumeVersion']['updateMany']
  >[0]['data']['failureMetadata'],
  finalAttempt: boolean,
): Promise<void> {
  if (!finalAttempt) {
    await database.resumeVersion.updateMany({
      where: { id: version.id, processingState: 'EXTRACTING' },
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
        processingState: { in: ['EXTRACTING', 'FAILED_RETRYABLE'] },
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
        action: 'candidate.resume.extraction_failed_terminal',
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
        eventType: 'candidate.resume.extraction_failed_terminal',
        payload: {
          resumeId: version.resumeId,
          resumeVersionId: version.id,
          failureCode,
        },
      },
    });
  });
}

function safeExtractionFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'RESUME_EXTRACTION_FAILED';
  const candidate = error.message.split(':', 1)[0]?.trim();
  return candidate && EXTRACTION_FAILURE_CODES.has(candidate)
    ? candidate
    : 'RESUME_EXTRACTION_FAILED';
}

function safeInfrastructureErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return 'OBJECT_READ_FAILED';
  return error.name && error.name !== 'Error' ? error.name.slice(0, 80) : 'OBJECT_READ_FAILED';
}
