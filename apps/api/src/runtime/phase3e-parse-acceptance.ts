import { createHash, randomUUID } from 'node:crypto';
import { parseApiEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';

const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;
const PRIVATE_MARKERS = ['private.phase3e@example.com', 'https://example.com/private-profile'];

async function main(): Promise<void> {
  const env = parseApiEnv();
  const timeoutMs = readPositiveIntegerEnv('PHASE3E_ACCEPTANCE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const keepOnSuccess = process.env.PHASE3E_ACCEPTANCE_KEEP === '1';
  const runId = randomUUID();
  const database = createDatabaseClient(env.DATABASE_URL);
  let createdUserId: string | null = null;
  let succeeded = false;

  try {
    const user = await database.user.create({
      data: {
        primaryEmail: `phase3e-parse-${runId}@runtime.local`,
        passwordHash: 'runtime-acceptance-only',
      },
    });
    createdUserId = user.id;
    const candidate = await database.candidate.create({ data: { userId: user.id } });
    const resume = await database.resume.create({
      data: {
        candidateId: candidate.id,
        title: 'Phase 3E parse runtime acceptance',
      },
    });
    const resumeVersion = await database.resumeVersion.create({
      data: {
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'PARSING',
        objectKey: `runtime/phase3e-parse/${runId}/source`,
        originalFilename: 'phase3e-runtime.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        uploadedAt: new Date(),
      },
      select: {
        id: true,
        processingPipelineVersion: true,
      },
    });
    await database.resume.update({
      where: { id: resume.id },
      data: { currentVersionId: resumeVersion.id },
    });

    const documentText = [
      'CONTACT',
      'private.phase3e@example.com',
      'https://example.com/private-profile',
    ].join('\n');
    const extraction = await database.resumeExtraction.create({
      data: {
        resumeVersionId: resumeVersion.id,
        extractionMethod: 'NATIVE_PDF',
        extractorName: 'phase3e-runtime-fixture',
        extractorVersion: '1',
        pipelineVersion: resumeVersion.processingPipelineVersion,
        status: 'COMPLETED',
        documentJson: {
          schemaVersion: 'resume-document-v1',
          resumeVersionId: resumeVersion.id,
          sourceMimeType: 'application/pdf',
          extractionMethod: 'NATIVE_PDF',
          extractor: { name: 'phase3e-runtime-fixture', version: '1' },
          text: documentText,
          pages: [
            {
              pageNumber: 1,
              text: documentText,
              blocks: [
                { text: 'CONTACT', sourceRange: { startOffset: 0, endOffset: 7 } },
                {
                  text: 'private.phase3e@example.com',
                  sourceRange: { startOffset: 8, endOffset: 35 },
                },
                {
                  text: 'https://example.com/private-profile',
                  sourceRange: { startOffset: 36, endOffset: 71 },
                },
              ],
            },
          ],
          quality: {
            characterCount: documentText.length,
            nonWhitespaceCharacterCount: documentText.replace(/\s/g, '').length,
            pageCount: 1,
            pagesWithText: 1,
            replacementCharacterRatio: 0,
            controlCharacterRatio: 0,
            warnings: [],
          },
        },
        textChecksumSha256: createHash('sha256').update(documentText).digest('hex'),
        completedAt: new Date(),
      },
    });

    const payload = {
      resumeId: resume.id,
      resumeVersionId: resumeVersion.id,
      resumeExtractionId: extraction.id,
      processingPipelineVersion: resumeVersion.processingPipelineVersion,
      nextStage: 'PARSING',
      runtimeAcceptanceSeed: true,
    };
    await database.outboxEvent.createMany({
      data: [
        {
          aggregateType: 'ResumeVersion',
          aggregateId: resumeVersion.id,
          eventType: 'candidate.resume.extraction_completed',
          payload,
        },
        {
          aggregateType: 'ResumeVersion',
          aggregateId: resumeVersion.id,
          eventType: 'candidate.resume.extraction_completed',
          payload,
        },
      ],
    });

    console.log('Phase 3E parse runtime acceptance started.');
    console.log(`resumeVersionId=${resumeVersion.id}`);
    console.log(`resumeExtractionId=${extraction.id}`);

    await waitForReview(database, resumeVersion.id, timeoutMs);

    const parseResults = await database.resumeParseResult.findMany({
      where: {
        resumeVersionId: resumeVersion.id,
        sourceExtractionId: extraction.id,
      },
      orderBy: { createdAt: 'asc' },
    });
    assert(parseResults.length === 1, 'Expected exactly one idempotent ResumeParseResult.');
    const parseResult = parseResults[0];
    assert(parseResult?.status === 'COMPLETED', 'Expected completed ResumeParseResult.');
    assert(
      JSON.stringify(parseResult.parsedJson).includes(PRIVATE_MARKERS[0] ?? ''),
      'Expected deterministic private email claim in candidate-private parsedJson.',
    );

    const outboxEvents = await database.outboxEvent.findMany({
      where: { aggregateId: resumeVersion.id },
      orderBy: { occurredAt: 'asc' },
      select: {
        eventType: true,
        payload: true,
        publishedAt: true,
        attemptCount: true,
      },
    });
    const auditEvents = await database.auditEvent.findMany({
      where: { resourceType: 'ResumeVersion', resourceId: resumeVersion.id },
      orderBy: { occurredAt: 'asc' },
      select: { action: true, metadata: true },
    });
    const profileVersionCount = await database.candidateProfileVersion.count({
      where: { candidateId: candidate.id },
    });

    const sourceEvents = outboxEvents.filter(
      (event) => event.eventType === 'candidate.resume.extraction_completed',
    );
    assert(
      sourceEvents.length === 2,
      'Expected duplicate source events for idempotency acceptance.',
    );
    for (const event of sourceEvents) {
      assert(event.publishedAt instanceof Date, 'Expected parse source event to be published.');
      assert(event.attemptCount > 0, 'Expected parse source publication attemptCount > 0.');
    }
    assertEvent(outboxEvents, 'candidate.resume.parse_completed');
    assertEvent(auditEvents, 'candidate.resume.parse_completed', 'action');
    assertNoPrivateMarkers(outboxEvents, 'outbox events');
    assertNoPrivateMarkers(auditEvents, 'audit events');
    assert(profileVersionCount === 0, 'Parsing must not create a Career Passport version.');

    console.log(
      'Duplicate delivery assertion passed: one ResumeParseResult for two source events.',
    );
    console.log(
      'Privacy assertion passed: private parsed values absent from audit/outbox metadata.',
    );
    console.log('Career Passport assertion passed: no CandidateProfileVersion was created.');
    console.log('Phase 3E runtime acceptance PASSED: PARSING -> resume.parse -> READY_FOR_REVIEW.');
    succeeded = true;
  } finally {
    const shouldCleanup = succeeded ? !keepOnSuccess : false;
    if (shouldCleanup && createdUserId) {
      await database.user.delete({ where: { id: createdUserId } });
      console.log('Runtime acceptance fixture cleaned up.');
    } else if (createdUserId) {
      console.log(
        succeeded
          ? 'Runtime acceptance fixture preserved because PHASE3E_ACCEPTANCE_KEEP=1.'
          : 'Runtime acceptance failed; fixture state was preserved for diagnosis.',
      );
    }
    await database.$disconnect();
  }
}

async function waitForReview(
  database: ReturnType<typeof createDatabaseClient>,
  resumeVersionId: string,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let previousState: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const version = await database.resumeVersion.findUniqueOrThrow({
      where: { id: resumeVersionId },
      select: {
        processingState: true,
        failureCode: true,
        failureMetadata: true,
      },
    });
    if (version.processingState !== previousState) {
      console.log(`state=${version.processingState}`);
      previousState = version.processingState;
    }
    if (version.processingState === 'READY_FOR_REVIEW') return;
    if (version.processingState === 'FAILED_TERMINAL' || version.processingState === 'REJECTED') {
      throw new Error(
        `Resume parsing terminated in ${version.processingState}: ${version.failureCode ?? 'UNKNOWN_FAILURE'} ${JSON.stringify(version.failureMetadata)}`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for resume ${resumeVersionId} to reach READY_FOR_REVIEW. Ensure scheduler, worker, PostgreSQL, and Redis are running.`,
  );
}

function assertEvent(
  events: Array<Record<string, unknown>>,
  expected: string,
  key = 'eventType',
): void {
  assert(
    events.some((event) => event[key] === expected),
    `Expected ${key}=${expected}.`,
  );
}

function assertNoPrivateMarkers(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  for (const marker of PRIVATE_MARKERS) {
    assert(!serialized.includes(marker), `Private parsed marker leaked into ${label}: ${marker}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
