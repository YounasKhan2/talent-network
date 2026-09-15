import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from '@talent-network/database';
import { LocalDeterministicResumeParser } from '@talent-network/resume-parsing';
import { processResumeParseJob } from './resume-parse-worker.js';

void test('successful parse persists proposal and advances exactly to READY_FOR_REVIEW', async () => {
  const fixture = createFixture();

  await processResumeParseJob(
    {
      resumeVersionId: fixture.version.id,
      processingPipelineVersion: fixture.version.processingPipelineVersion,
      extractionId: fixture.extraction.id,
    },
    { database: fixture.database, parser: new LocalDeterministicResumeParser() },
  );

  assert.equal(fixture.version.processingState, 'READY_FOR_REVIEW');
  assert.equal(fixture.parseResult.status, 'COMPLETED');
  assert.equal(fixture.parseResult.failureCode, null);
  assert.equal(fixture.auditEvents.length, 1);
  assert.equal(fixture.outboxEvents.length, 1);
  assert.equal(fixture.outboxEvents[0]?.eventType, 'candidate.resume.parse_completed');
  assert.equal(JSON.stringify(fixture.outboxEvents).includes('private@example.com'), false);
  assert.equal(JSON.stringify(fixture.auditEvents).includes('private@example.com'), false);
  assert.equal(JSON.stringify(fixture.parseResult.parsedJson).includes('private@example.com'), true);
});

void test('duplicate delivery after completion is idempotent', async () => {
  const fixture = createFixture();
  const input = {
    resumeVersionId: fixture.version.id,
    processingPipelineVersion: fixture.version.processingPipelineVersion,
    extractionId: fixture.extraction.id,
  };
  const dependencies = {
    database: fixture.database,
    parser: new LocalDeterministicResumeParser(),
  };

  await processResumeParseJob(input, dependencies);
  await processResumeParseJob(input, dependencies);

  assert.equal(fixture.version.processingState, 'READY_FOR_REVIEW');
  assert.equal(fixture.auditEvents.length, 1);
  assert.equal(fixture.outboxEvents.length, 1);
});

void test('mismatched source extraction fails terminal without parsing private content', async () => {
  const fixture = createFixture();
  fixture.extraction.resumeVersionId = 'another-resume-version';

  await processResumeParseJob(
    {
      resumeVersionId: fixture.version.id,
      processingPipelineVersion: fixture.version.processingPipelineVersion,
      extractionId: fixture.extraction.id,
    },
    { database: fixture.database, parser: new LocalDeterministicResumeParser() },
  );

  assert.equal(fixture.version.processingState, 'FAILED_TERMINAL');
  assert.equal(fixture.version.failureCode, 'RESUME_PARSE_SOURCE_INVALID');
  assert.equal(fixture.parseResult.status, 'STARTED');
  assert.equal(fixture.outboxEvents[0]?.eventType, 'candidate.resume.parse_failed_terminal');
  assert.equal(JSON.stringify(fixture.outboxEvents).includes('private@example.com'), false);
});

function createFixture() {
  const version = {
    id: '11111111-1111-4111-8111-111111111111',
    resumeId: '22222222-2222-4222-8222-222222222222',
    processingState: 'PARSING',
    processingPipelineVersion: 'resume-v1',
    failureCode: null as string | null,
    failureMetadata: null as unknown,
  };
  const extraction = {
    id: '33333333-3333-4333-8333-333333333333',
    resumeVersionId: version.id,
    pipelineVersion: version.processingPipelineVersion,
    status: 'COMPLETED',
    schemaVersion: 'resume-document-v1',
    textChecksumSha256: 'checksum-1',
    documentJson: {
      schemaVersion: 'resume-document-v1',
      resumeVersionId: version.id,
      sourceMimeType: 'application/pdf',
      extractionMethod: 'NATIVE_PDF',
      extractor: { name: 'fixture', version: '1' },
      text: 'CONTACT\nprivate@example.com',
      pages: [
        {
          pageNumber: 1,
          text: 'CONTACT\nprivate@example.com',
          blocks: [
            { text: 'CONTACT', sourceRange: { startOffset: 0, endOffset: 7 } },
            {
              text: 'private@example.com',
              sourceRange: { startOffset: 8, endOffset: 27 },
            },
          ],
        },
      ],
      quality: {
        characterCount: 27,
        nonWhitespaceCharacterCount: 26,
        pageCount: 1,
        pagesWithText: 1,
        replacementCharacterRatio: 0,
        controlCharacterRatio: 0,
        warnings: [],
      },
    },
  };
  const parseResult = {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'STARTED',
    failureCode: null as string | null,
    parsedJson: null as unknown,
    completedAt: null as Date | null,
  };
  const auditEvents: Array<Record<string, unknown>> = [];
  const outboxEvents: Array<Record<string, unknown>> = [];

  const resumeVersion = {
    findUnique: () => Promise.resolve({ ...version }),
    updateMany: (input: {
      where: { processingState?: string | { in: string[] }; failureCode?: { in: string[] } };
      data: {
        processingState?: string;
        failureCode?: string | null;
        failureMetadata?: unknown;
      };
    }) => {
      const expectedState = input.where.processingState;
      const stateMatches =
        expectedState === undefined ||
        (typeof expectedState === 'string'
          ? version.processingState === expectedState
          : expectedState.in.includes(version.processingState));
      const failureMatches =
        input.where.failureCode === undefined ||
        (version.failureCode !== null && input.where.failureCode.in.includes(version.failureCode));
      if (!stateMatches || !failureMatches) return Promise.resolve({ count: 0 });
      if (input.data.processingState) version.processingState = input.data.processingState;
      if ('failureCode' in input.data) version.failureCode = input.data.failureCode ?? null;
      if ('failureMetadata' in input.data) version.failureMetadata = input.data.failureMetadata;
      return Promise.resolve({ count: 1 });
    },
  };

  const resumeParseResult = {
    findFirst: (input: { where: { status?: string } }) =>
      Promise.resolve(
        input.where.status === 'COMPLETED' && parseResult.status === 'COMPLETED'
          ? { id: parseResult.id }
          : null,
      ),
    upsert: () => Promise.resolve({ ...parseResult }),
    update: (input: {
      data: {
        status?: string;
        failureCode?: string | null;
        parsedJson?: unknown;
        completedAt?: Date | null;
      };
    }) => {
      if (input.data.status) parseResult.status = input.data.status;
      if ('failureCode' in input.data) parseResult.failureCode = input.data.failureCode ?? null;
      if ('parsedJson' in input.data) parseResult.parsedJson = input.data.parsedJson;
      if ('completedAt' in input.data) parseResult.completedAt = input.data.completedAt ?? null;
      return Promise.resolve({ ...parseResult });
    },
  };

  const transaction = {
    resumeVersion,
    resumeParseResult,
    auditEvent: {
      create: (input: { data: Record<string, unknown> }) => {
        auditEvents.push(input.data);
        return Promise.resolve(input.data);
      },
    },
    outboxEvent: {
      create: (input: { data: Record<string, unknown> }) => {
        outboxEvents.push(input.data);
        return Promise.resolve(input.data);
      },
    },
  };

  const database = {
    resumeVersion,
    resumeExtraction: {
      findUnique: () => Promise.resolve({ ...extraction }),
    },
    resumeParseResult,
    auditEvent: transaction.auditEvent,
    outboxEvent: transaction.outboxEvent,
    $transaction: (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  } as unknown as DatabaseClient;

  return {
    database,
    version,
    extraction,
    parseResult,
    auditEvents,
    outboxEvents,
  };
}
