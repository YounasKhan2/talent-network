import assert from 'node:assert/strict';
import test from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import { DATABASE_JSON_DB_NULL, type DatabaseClient } from '@talent-network/database';
import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeExtractionResult,
  type ResumeOcrEngine,
} from '@talent-network/resume-extraction';
import { processResumeOcrJob } from './resume-ocr-worker.js';

const VERSION_ID = '11111111-1111-4111-8111-111111111111';
const RESUME_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_EXTRACTION_ID = '33333333-3333-4333-8333-333333333333';
const OCR_EXTRACTION_ID = '44444444-4444-4444-8444-444444444444';
const PIPELINE_VERSION = 'resume-pipeline-v1';
const PRIVATE_TEXT =
  'Senior TypeScript engineer with professional experience building production web applications using NestJS, React, PostgreSQL and Redis. Experienced in API design, background processing, testing, observability and secure cloud deployment workflows.';
const SOURCE_BYTES = Buffer.from('private scanned resume bytes', 'utf8');

void test('successful OCR persists a separate derived extraction and advances to parsing', async () => {
  const fixture = createFixture('OCR_REQUIRED');

  await processResumeOcrJob(job(), fixture.dependencies(engineWithText(PRIVATE_TEXT)));

  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.state.failureCode, null);
  assert.equal(fixture.state.failureMetadata, DATABASE_JSON_DB_NULL);
  assert.equal(fixture.ocrExtraction.status, 'COMPLETED');
  assert.equal(fixture.ocrExtraction.extractionMethod, 'OCR');
  assert.match(fixture.ocrExtraction.textChecksumSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(readDocumentText(fixture.ocrExtraction.documentJson), PRIVATE_TEXT);
  assert.equal(fixture.auditEvents.at(-1)?.action, 'candidate.resume.ocr_completed');
  assert.equal(fixture.outboxEvents.at(-1)?.eventType, 'candidate.resume.ocr_completed');
});

void test('OCR refuses a mismatched source extraction identity before reading private bytes', async () => {
  const fixture = createFixture('OCR_REQUIRED', { sourceResumeVersionId: RESUME_ID });
  let calls = 0;

  await assert.rejects(
    () =>
      processResumeOcrJob(
        job(),
        fixture.dependencies(
          engineWithText(PRIVATE_TEXT, () => {
            calls += 1;
          }),
        ),
      ),
    /identity mismatch/,
  );

  assert.equal(calls, 0);
  assert.equal(fixture.state.processingState, 'OCR_REQUIRED');
});

void test('OCR refuses a source extraction that was not routed to OCR_REQUIRED', async () => {
  const fixture = createFixture('OCR_REQUIRED', {
    sourceQualityDecision: 'NATIVE_TEXT_SUFFICIENT',
  });

  await assert.rejects(
    () => processResumeOcrJob(job(), fixture.dependencies(engineWithText(PRIVATE_TEXT))),
    /not eligible for OCR/,
  );

  assert.equal(fixture.state.processingState, 'OCR_REQUIRED');
});

void test('private object read failure is retryable and a later OCR retry can complete', async () => {
  const fixture = createFixture('OCR_REQUIRED', { storageFailures: 1 });
  const engine = engineWithText(PRIVATE_TEXT);

  await assert.rejects(() =>
    processResumeOcrJob(job(), fixture.dependencies(engine), {
      finalAttempt: false,
      retryAttempt: false,
    }),
  );
  assert.equal(fixture.state.processingState, 'FAILED_RETRYABLE');
  assert.equal(fixture.state.failureCode, 'RESUME_OCR_OBJECT_READ_FAILED');

  await processResumeOcrJob(job(), fixture.dependencies(engine), {
    finalAttempt: false,
    retryAttempt: true,
  });
  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.ocrExtraction.status, 'COMPLETED');
});

void test('insufficient OCR quality fails terminal instead of looping back to OCR', async () => {
  const fixture = createFixture('OCR_REQUIRED');

  await processResumeOcrJob(job(), fixture.dependencies(engineWithText('short OCR text')));

  assert.equal(fixture.state.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.state.failureCode, 'RESUME_OCR_QUALITY_INSUFFICIENT');
  assert.equal(fixture.ocrExtraction.status, 'FAILED');
  assert.equal(fixture.auditEvents.at(-1)?.action, 'candidate.resume.ocr_failed_terminal');
});

void test('OCR engine failure is sanitized and private text never enters audit or outbox events', async () => {
  const fixture = createFixture('OCR_REQUIRED');
  const engine: ResumeOcrEngine = {
    name: 'fixture-ocr',
    version: '1.0.0',
    recognize: () => Promise.reject(new Error(`RESUME_OCR_RECOGNITION_FAILED:${PRIVATE_TEXT}`)),
  };

  await processResumeOcrJob(job(), fixture.dependencies(engine));

  assert.equal(fixture.state.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.state.failureCode, 'RESUME_OCR_RECOGNITION_FAILED');
  assertNoPrivateText(fixture.state.failureMetadata, PRIVATE_TEXT);
  assertNoPrivateText(fixture.auditEvents, PRIVATE_TEXT);
  assertNoPrivateText(fixture.outboxEvents, PRIVATE_TEXT);
});

void test('duplicate OCR delivery after completion is idempotent', async () => {
  const fixture = createFixture('OCR_REQUIRED');
  let calls = 0;
  const engine = engineWithText(PRIVATE_TEXT, () => {
    calls += 1;
  });

  await processResumeOcrJob(job(), fixture.dependencies(engine));
  await processResumeOcrJob(job(), fixture.dependencies(engine));

  assert.equal(calls, 1);
  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.auditEvents.length, 1);
  assert.equal(fixture.outboxEvents.length, 1);
});

void test('successful OCR events are metadata-only while private text remains in derived storage', async () => {
  const fixture = createFixture('OCR_REQUIRED');

  await processResumeOcrJob(job(), fixture.dependencies(engineWithText(PRIVATE_TEXT)));

  assertNoPrivateText(fixture.auditEvents, PRIVATE_TEXT);
  assertNoPrivateText(fixture.outboxEvents, PRIVATE_TEXT);
  assert.equal(readDocumentText(fixture.ocrExtraction.documentJson), PRIVATE_TEXT);
});

type ProcessingState = 'OCR_REQUIRED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'PARSING';
type ExtractionStatus = 'STARTED' | 'COMPLETED' | 'FAILED';

interface MutableVersionState {
  processingState: ProcessingState;
  failureCode: string | null;
  failureMetadata: unknown;
}

interface MutableExtractionState {
  id: string;
  extractionMethod: 'OCR';
  status: ExtractionStatus;
  failureCode: string | null;
  qualityMetadata: unknown;
  documentJson: unknown;
  textChecksumSha256: string | null;
  completedAt: Date | null;
}

interface RecordedAuditEvent {
  action: string;
  metadata?: unknown;
}

interface RecordedOutboxEvent {
  eventType: string;
  payload?: unknown;
}

function createFixture(
  initialState: ProcessingState,
  options: {
    storageFailures?: number;
    sourceResumeVersionId?: string;
    sourceQualityDecision?: string;
  } = {},
) {
  const state: MutableVersionState = {
    processingState: initialState,
    failureCode: null,
    failureMetadata: null,
  };
  const ocrExtraction: MutableExtractionState = {
    id: OCR_EXTRACTION_ID,
    extractionMethod: 'OCR',
    status: 'STARTED',
    failureCode: null,
    qualityMetadata: null,
    documentJson: null,
    textChecksumSha256: null,
    completedAt: null,
  };
  const auditEvents: RecordedAuditEvent[] = [];
  const outboxEvents: RecordedOutboxEvent[] = [];
  let remainingStorageFailures = options.storageFailures ?? 0;

  const resumeVersion = {
    updateMany: (input: { where: Record<string, unknown>; data: Partial<MutableVersionState> }) => {
      if (!matchesVersionWhere(state, input.where)) return Promise.resolve({ count: 0 });
      Object.assign(state, input.data);
      return Promise.resolve({ count: 1 });
    },
    findUnique: () =>
      Promise.resolve({
        processingState: state.processingState,
        processingPipelineVersion: PIPELINE_VERSION,
      }),
    findUniqueOrThrow: () =>
      Promise.resolve({
        id: VERSION_ID,
        resumeId: RESUME_ID,
        objectKey: `resumes/candidate/${RESUME_ID}/${VERSION_ID}/original`,
        mimeType: 'application/pdf',
        processingPipelineVersion: PIPELINE_VERSION,
      }),
  };

  const resumeExtraction = {
    findUnique: () =>
      Promise.resolve({
        id: SOURCE_EXTRACTION_ID,
        resumeVersionId: options.sourceResumeVersionId ?? VERSION_ID,
        pipelineVersion: PIPELINE_VERSION,
        status: 'COMPLETED',
        extractionMethod: 'NATIVE_PDF',
        qualityMetadata: { decision: options.sourceQualityDecision ?? 'OCR_REQUIRED' },
      }),
    upsert: () => {
      ocrExtraction.status = 'STARTED';
      ocrExtraction.failureCode = null;
      ocrExtraction.completedAt = null;
      return Promise.resolve({ ...ocrExtraction });
    },
    update: (input: { data: Partial<MutableExtractionState> }) => {
      Object.assign(ocrExtraction, input.data);
      return Promise.resolve({ ...ocrExtraction });
    },
  };

  const transaction = {
    resumeVersion,
    resumeExtraction,
    auditEvent: {
      create: (input: { data: RecordedAuditEvent }) => {
        auditEvents.push(input.data);
        return Promise.resolve(input.data);
      },
    },
    outboxEvent: {
      create: (input: { data: RecordedOutboxEvent }) => {
        outboxEvents.push(input.data);
        return Promise.resolve(input.data);
      },
    },
  };

  const database = {
    resumeVersion,
    resumeExtraction,
    $transaction: <T>(callback: (tx: typeof transaction) => Promise<T>) => callback(transaction),
  } as unknown as DatabaseClient;

  const storage = {
    send: () => {
      if (remainingStorageFailures > 0) {
        remainingStorageFailures -= 1;
        return Promise.reject(new Error('fixture object storage unavailable'));
      }
      return Promise.resolve({
        Body: {
          transformToByteArray: () => Promise.resolve(new Uint8Array(SOURCE_BYTES)),
        },
      });
    },
  } as unknown as S3Client;

  return {
    state,
    ocrExtraction,
    auditEvents,
    outboxEvents,
    dependencies: (engine: ResumeOcrEngine) => ({
      database,
      storage,
      bucket: 'test-resumes',
      engine,
    }),
  };
}

function engineWithText(text: string, onRecognize?: () => void): ResumeOcrEngine {
  return {
    name: 'fixture-ocr',
    version: '1.0.0',
    recognize: (input) => {
      onRecognize?.();
      const result: ResumeExtractionResult = {
        document: {
          schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
          resumeVersionId: input.resumeVersionId,
          sourceMimeType: input.mimeType,
          extractionMethod: 'OCR',
          extractor: { name: 'fixture-ocr', version: '1.0.0' },
          text,
          pages: [
            {
              pageNumber: 1,
              text,
              blocks: [{ text, sourceRange: { startOffset: 0, endOffset: text.length } }],
            },
          ],
          quality: qualityFor(text),
        },
        durationMs: 5,
      };
      return Promise.resolve(result);
    },
  };
}

function qualityFor(text: string) {
  return {
    characterCount: text.length,
    nonWhitespaceCharacterCount: text.replace(/\s/g, '').length,
    pageCount: 1,
    pagesWithText: text.trim().length > 0 ? 1 : 0,
    replacementCharacterRatio: 0,
    controlCharacterRatio: 0,
    warnings: [],
  };
}

function job() {
  return {
    resumeVersionId: VERSION_ID,
    processingPipelineVersion: PIPELINE_VERSION,
    extractionId: SOURCE_EXTRACTION_ID,
  };
}

function matchesVersionWhere(state: MutableVersionState, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && where.id !== VERSION_ID) return false;
  if (
    where.processingPipelineVersion !== undefined &&
    where.processingPipelineVersion !== PIPELINE_VERSION
  ) {
    return false;
  }
  if (!matchesValue(state.processingState, where.processingState)) return false;
  if (!matchesValue(state.failureCode, where.failureCode)) return false;
  return true;
}

function matchesValue(current: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (expected && typeof expected === 'object' && 'in' in expected) {
    const values = (expected as { in?: unknown }).in;
    return Array.isArray(values) && values.includes(current);
  }
  return current === expected;
}

function readDocumentText(documentJson: unknown): string | undefined {
  if (!documentJson || typeof documentJson !== 'object') return undefined;
  return (documentJson as { text?: string }).text;
}

function assertNoPrivateText(value: unknown, privateText: string): void {
  assert.equal(JSON.stringify(value).includes(privateText), false);
}
