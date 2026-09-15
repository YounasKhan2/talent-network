import assert from 'node:assert/strict';
import test from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import { DATABASE_JSON_DB_NULL, type DatabaseClient } from '@talent-network/database';
import {
  RESUME_DOCUMENT_SCHEMA_VERSION,
  type ResumeExtractionResult,
  type ResumeExtractor,
} from '@talent-network/resume-extraction';
import { processResumeExtractionJob } from './resume-extraction-worker.js';

const VERSION_ID = '11111111-1111-4111-8111-111111111111';
const RESUME_ID = '22222222-2222-4222-8222-222222222222';
const PIPELINE_VERSION = 'resume-pipeline-v1';
const PRIVATE_TEXT =
  'Senior TypeScript engineer with professional experience building production web applications using NestJS, React, PostgreSQL and Redis. Experienced in API design, background processing, testing, observability and secure cloud deployment workflows.';
const SOURCE_BYTES = Buffer.from('private resume bytes', 'utf8');

void test('sufficient native extraction persists derived document and advances to parsing', async () => {
  const fixture = createFixture('EXTRACTING');

  await processResumeExtractionJob(job(), fixture.dependencies(extractorWithText(PRIVATE_TEXT)));

  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.state.failureCode, null);
  assert.equal(fixture.state.failureMetadata, DATABASE_JSON_DB_NULL);
  assert.equal(fixture.extraction.status, 'COMPLETED');
  assert.equal(fixture.extraction.failureCode, null);
  assert.match(fixture.extraction.textChecksumSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(readDocumentText(fixture.extraction.documentJson), PRIVATE_TEXT);
  assert.equal(fixture.auditEvents.at(-1)?.action, 'candidate.resume.extraction_completed');
  assert.equal(fixture.outboxEvents.at(-1)?.eventType, 'candidate.resume.extraction_completed');
});

void test('text-poor native extraction advances to OCR_REQUIRED', async () => {
  const fixture = createFixture('EXTRACTING');

  await processResumeExtractionJob(job(), fixture.dependencies(extractorWithText('short text')));

  assert.equal(fixture.state.processingState, 'OCR_REQUIRED');
  assert.equal(fixture.extraction.status, 'COMPLETED');
  assert.equal(fixture.auditEvents.at(-1)?.action, 'candidate.resume.ocr_required');
  assert.equal(fixture.outboxEvents.at(-1)?.eventType, 'candidate.resume.ocr_required');
  const quality = fixture.extraction.qualityMetadata as Record<string, unknown>;
  assert.equal(quality.decision, 'OCR_REQUIRED');
});

void test('private object read failure is retryable and a later retry can complete', async () => {
  const fixture = createFixture('EXTRACTING', { storageFailures: 1 });
  const extractor = extractorWithText(PRIVATE_TEXT);

  await assert.rejects(() =>
    processResumeExtractionJob(job(), fixture.dependencies(extractor), {
      finalAttempt: false,
      retryAttempt: false,
    }),
  );

  assert.equal(fixture.state.processingState, 'FAILED_RETRYABLE');
  assert.equal(fixture.state.failureCode, 'RESUME_EXTRACTION_OBJECT_READ_FAILED');
  assert.equal(fixture.extraction.status, 'FAILED');

  await processResumeExtractionJob(job(), fixture.dependencies(extractor), {
    finalAttempt: false,
    retryAttempt: true,
  });

  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.state.failureCode, null);
  assert.equal(fixture.extraction.status, 'COMPLETED');
});

void test('final private object read failure becomes terminal and is audited', async () => {
  const fixture = createFixture('EXTRACTING', { storageFailures: 1 });

  await assert.rejects(() =>
    processResumeExtractionJob(job(), fixture.dependencies(extractorWithText(PRIVATE_TEXT)), {
      finalAttempt: true,
      retryAttempt: true,
    }),
  );

  assert.equal(fixture.state.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.state.failureCode, 'RESUME_EXTRACTION_OBJECT_READ_FAILED');
  assert.equal(fixture.auditEvents.at(-1)?.action, 'candidate.resume.extraction_failed_terminal');
  assert.equal(
    fixture.outboxEvents.at(-1)?.eventType,
    'candidate.resume.extraction_failed_terminal',
  );
});

void test('extractor failure becomes terminal without leaking private text into events', async () => {
  const fixture = createFixture('EXTRACTING');
  const privateFailureText = `RESUME_EXTRACTION_PARSE_FAILED:${PRIVATE_TEXT}`;
  const extractor: ResumeExtractor = {
    name: 'fixture-extractor',
    version: '1.0.0',
    supports: () => true,
    extract: () => Promise.reject(new Error(privateFailureText)),
  };

  await processResumeExtractionJob(job(), fixture.dependencies(extractor));

  assert.equal(fixture.state.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.state.failureCode, 'RESUME_EXTRACTION_PARSE_FAILED');
  assertNoPrivateText(fixture.state.failureMetadata, PRIVATE_TEXT);
  assertNoPrivateText(fixture.auditEvents, PRIVATE_TEXT);
  assertNoPrivateText(fixture.outboxEvents, PRIVATE_TEXT);
});

void test('duplicate delivery after a completed extraction is idempotent', async () => {
  const fixture = createFixture('EXTRACTING');
  let extractionCalls = 0;
  const extractor = extractorWithText(PRIVATE_TEXT, () => {
    extractionCalls += 1;
  });

  await processResumeExtractionJob(job(), fixture.dependencies(extractor));
  await processResumeExtractionJob(job(), fixture.dependencies(extractor));

  assert.equal(extractionCalls, 1);
  assert.equal(fixture.state.processingState, 'PARSING');
  assert.equal(fixture.auditEvents.length, 1);
  assert.equal(fixture.outboxEvents.length, 1);
});

void test('successful events contain metadata only and never raw resume text', async () => {
  const fixture = createFixture('EXTRACTING');

  await processResumeExtractionJob(job(), fixture.dependencies(extractorWithText(PRIVATE_TEXT)));

  assertNoPrivateText(fixture.auditEvents, PRIVATE_TEXT);
  assertNoPrivateText(fixture.outboxEvents, PRIVATE_TEXT);
  assert.equal(readDocumentText(fixture.extraction.documentJson), PRIVATE_TEXT);
});

type ProcessingState =
  'EXTRACTING' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'OCR_REQUIRED' | 'PARSING';

type ExtractionStatus = 'STARTED' | 'COMPLETED' | 'FAILED';

interface MutableVersionState {
  processingState: ProcessingState;
  failureCode: string | null;
  failureMetadata: unknown;
}

interface MutableExtractionState {
  id: string;
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

function createFixture(initialState: ProcessingState, options: { storageFailures?: number } = {}) {
  const state: MutableVersionState = {
    processingState: initialState,
    failureCode: null,
    failureMetadata: null,
  };
  const extraction: MutableExtractionState = {
    id: '33333333-3333-4333-8333-333333333333',
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
    upsert: () => {
      extraction.status = 'STARTED';
      extraction.failureCode = null;
      extraction.completedAt = null;
      return Promise.resolve({ ...extraction });
    },
    update: (input: { data: Partial<MutableExtractionState> }) => {
      Object.assign(extraction, input.data);
      return Promise.resolve({ ...extraction });
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
    extraction,
    auditEvents,
    outboxEvents,
    dependencies: (extractor: ResumeExtractor) => ({
      database,
      storage,
      bucket: 'test-resumes',
      extractors: [extractor],
    }),
  };
}

function extractorWithText(text: string, onExtract?: () => void): ResumeExtractor {
  return {
    name: 'fixture-extractor',
    version: '1.0.0',
    supports: () => true,
    extract: (input) => {
      onExtract?.();
      const result: ResumeExtractionResult = {
        document: {
          schemaVersion: RESUME_DOCUMENT_SCHEMA_VERSION,
          resumeVersionId: input.resumeVersionId,
          sourceMimeType: input.mimeType,
          extractionMethod: 'NATIVE_PDF',
          extractor: { name: 'fixture-extractor', version: '1.0.0' },
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
        durationMs: 2,
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
  return { resumeVersionId: VERSION_ID, processingPipelineVersion: PIPELINE_VERSION };
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
