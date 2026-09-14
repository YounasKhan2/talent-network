import assert from 'node:assert/strict';
import test from 'node:test';
import type { S3Client } from '@aws-sdk/client-s3';
import type { DatabaseClient } from '@talent-network/database';
import type { MalwareScanResult, MalwareScanner } from '@talent-network/resume-security';
import { processResumeSecurityJob } from './resume-security-worker.js';

const CLEAN_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n', 'latin1');
const VERSION_ID = '11111111-1111-4111-8111-111111111111';
const RESUME_ID = '22222222-2222-4222-8222-222222222222';

void test('scanner failure becomes retryable and a later retry can advance to extracting', async () => {
  const fixture = createFixture('UPLOADED');
  const failingScanner = scannerResult({
    status: 'ERROR',
    engine: 'clamav',
    engineVersion: '1.4-test',
    signature: null,
    scannedBytes: CLEAN_PDF.length,
    durationMs: 7,
  });

  await assert.rejects(() =>
    processResumeSecurityJob(
      { resumeVersionId: VERSION_ID },
      fixture.dependencies(failingScanner),
      { finalAttempt: false, retryAttempt: false },
    ),
  );

  assert.equal(fixture.state.processingState, 'FAILED_RETRYABLE');
  assert.equal(fixture.state.failureCode, 'MALWARE_SCANNER_UNAVAILABLE');

  const cleanScanner = scannerResult({
    status: 'CLEAN',
    engine: 'clamav',
    engineVersion: '1.4-test',
    signature: null,
    scannedBytes: CLEAN_PDF.length,
    durationMs: 5,
  });

  await processResumeSecurityJob(
    { resumeVersionId: VERSION_ID },
    fixture.dependencies(cleanScanner),
    { finalAttempt: false, retryAttempt: true },
  );

  assert.equal(fixture.state.processingState, 'EXTRACTING');
  assert.equal(fixture.state.failureCode, null);
  assert.match(fixture.state.checksumSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.equal(fixture.auditActions.at(-1), 'candidate.resume.security_passed');
  assert.equal(fixture.outboxTypes.at(-1), 'candidate.resume.security_passed');
});

void test('the final scanner failure becomes terminal and is audited', async () => {
  const fixture = createFixture('UPLOADED');
  const failingScanner = scannerResult({
    status: 'ERROR',
    engine: 'clamav',
    engineVersion: null,
    signature: null,
    scannedBytes: CLEAN_PDF.length,
    durationMs: 11,
  });

  await assert.rejects(() =>
    processResumeSecurityJob(
      { resumeVersionId: VERSION_ID },
      fixture.dependencies(failingScanner),
      { finalAttempt: true, retryAttempt: true },
    ),
  );

  assert.equal(fixture.state.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.state.failureCode, 'MALWARE_SCANNER_UNAVAILABLE');
  assert.equal(fixture.auditActions.at(-1), 'candidate.resume.security_failed_terminal');
  assert.equal(fixture.outboxTypes.at(-1), 'candidate.resume.security_failed_terminal');
});

void test('retry execution recovers an interrupted scanning state', async () => {
  const fixture = createFixture('SCANNING');
  const cleanScanner = scannerResult({
    status: 'CLEAN',
    engine: 'clamav',
    engineVersion: '1.4-test',
    signature: null,
    scannedBytes: CLEAN_PDF.length,
    durationMs: 3,
  });

  await processResumeSecurityJob(
    { resumeVersionId: VERSION_ID },
    fixture.dependencies(cleanScanner),
    { finalAttempt: false, retryAttempt: true },
  );

  assert.equal(fixture.state.processingState, 'EXTRACTING');
  assert.equal(fixture.auditActions.at(-1), 'candidate.resume.security_passed');
});

void test('infected resume is rejected and never advances to extraction', async () => {
  const fixture = createFixture('UPLOADED');
  const infectedScanner = scannerResult({
    status: 'INFECTED',
    engine: 'clamav',
    engineVersion: '1.4-test',
    signature: 'Eicar-Signature',
    scannedBytes: CLEAN_PDF.length,
    durationMs: 4,
  });

  await processResumeSecurityJob(
    { resumeVersionId: VERSION_ID },
    fixture.dependencies(infectedScanner),
    { finalAttempt: false, retryAttempt: false },
  );

  assert.equal(fixture.state.processingState, 'REJECTED');
  assert.equal(fixture.state.failureCode, 'MALWARE_DETECTED');
  assert.equal(fixture.auditActions.at(-1), 'candidate.resume.security_rejected');
  assert.equal(fixture.outboxTypes.at(-1), 'candidate.resume.security_rejected');
});

void test('invalid document is rejected before the malware scanner is called', async () => {
  const fixture = createFixture('UPLOADED', Buffer.from('not-a-pdf', 'ascii'));
  let scanCalls = 0;
  const scanner: MalwareScanner = {
    scan: () => {
      scanCalls += 1;
      return Promise.resolve({
        status: 'CLEAN',
        engine: 'fake',
        engineVersion: '1',
        signature: null,
        scannedBytes: 9,
        durationMs: 1,
      });
    },
  };

  await processResumeSecurityJob(
    { resumeVersionId: VERSION_ID },
    fixture.dependencies(scanner),
  );

  assert.equal(scanCalls, 0);
  assert.equal(fixture.state.processingState, 'REJECTED');
  assert.equal(fixture.state.failureCode, 'RESUME_VALIDATION_SIGNATURE_MISMATCH');
});

type ProcessingState =
  | 'UPLOADED'
  | 'VALIDATING'
  | 'SCANNING'
  | 'EXTRACTING'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL'
  | 'REJECTED';

interface MutableVersionState {
  processingState: ProcessingState;
  failureCode: string | null;
  failureMetadata: unknown;
  checksumSha256: string | null;
}

function createFixture(initialState: ProcessingState, bytes: Buffer = CLEAN_PDF) {
  const state: MutableVersionState = {
    processingState: initialState,
    failureCode: null,
    failureMetadata: null,
    checksumSha256: null,
  };
  const auditActions: string[] = [];
  const outboxTypes: string[] = [];

  const resumeVersion = {
    updateMany: (input: {
      where: Record<string, unknown>;
      data: Partial<MutableVersionState>;
    }) => {
      if (!matchesWhere(state, input.where)) return Promise.resolve({ count: 0 });
      Object.assign(state, input.data);
      return Promise.resolve({ count: 1 });
    },
    findUnique: () => Promise.resolve({ processingState: state.processingState }),
    findUniqueOrThrow: () =>
      Promise.resolve({
        id: VERSION_ID,
        resumeId: RESUME_ID,
        objectKey: `resumes/candidate/${RESUME_ID}/${VERSION_ID}/original`,
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        processingPipelineVersion: 'resume-pipeline-v1',
      }),
  };

  const transaction = {
    resumeVersion,
    auditEvent: {
      create: (input: { data: { action: string } }) => {
        auditActions.push(input.data.action);
        return Promise.resolve(input.data);
      },
    },
    outboxEvent: {
      create: (input: { data: { eventType: string } }) => {
        outboxTypes.push(input.data.eventType);
        return Promise.resolve(input.data);
      },
    },
  };

  const database = {
    resumeVersion,
    $transaction: <T>(callback: (tx: typeof transaction) => Promise<T>) => callback(transaction),
  } as unknown as DatabaseClient;

  const storage = {
    send: () =>
      Promise.resolve({
        Body: {
          transformToByteArray: () => Promise.resolve(new Uint8Array(bytes)),
        },
      }),
  } as unknown as S3Client;

  return {
    state,
    auditActions,
    outboxTypes,
    dependencies: (scanner: MalwareScanner) => ({
      database,
      storage,
      bucket: 'test-resumes',
      scanner,
    }),
  };
}

function scannerResult(result: MalwareScanResult): MalwareScanner {
  return { scan: () => Promise.resolve(result) };
}

function matchesWhere(state: MutableVersionState, where: Record<string, unknown>): boolean {
  if (!matchesProcessingState(state.processingState, where.processingState)) return false;
  if (!matchesFailureCode(state.failureCode, where.failureCode)) return false;

  const or = where.OR;
  if (Array.isArray(or)) {
    return or.some((clause) =>
      clause && typeof clause === 'object'
        ? matchesWhere(state, clause as Record<string, unknown>)
        : false,
    );
  }

  return true;
}

function matchesProcessingState(current: string, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (typeof expected === 'string') return current === expected;
  if (expected && typeof expected === 'object' && 'in' in expected) {
    const values = (expected as { in?: unknown }).in;
    return Array.isArray(values) && values.includes(current);
  }
  return false;
}

function matchesFailureCode(current: string | null, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (typeof expected === 'string') return current === expected;
  if (expected && typeof expected === 'object' && 'in' in expected) {
    const values = (expected as { in?: unknown }).in;
    return Array.isArray(values) && values.includes(current);
  }
  return false;
}
