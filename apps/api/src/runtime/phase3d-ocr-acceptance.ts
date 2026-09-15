import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseApiEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const PRIVATE_MARKERS = ['Alex Morgan', 'Senior Software Engineer', 'TypeScript', 'PostgreSQL'];

async function main(): Promise<void> {
  const env = parseApiEnv();
  const timeoutMs = readPositiveIntegerEnv('PHASE3D_ACCEPTANCE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const keepOnSuccess = process.env.PHASE3D_ACCEPTANCE_KEEP === '1';
  const runId = randomUUID();
  const database = createDatabaseClient(env.DATABASE_URL);
  const storage = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });

  const fixturePath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../packages/resume-extraction/test-fixtures/scanned-resume.pdf',
  );
  const fixtureBytes = await readFile(fixturePath);

  let createdUserId: string | null = null;
  let createdObjectKey: string | null = null;
  let succeeded = false;

  try {
    const user = await database.user.create({
      data: {
        primaryEmail: `phase3d-ocr-${runId}@runtime.local`,
        passwordHash: 'runtime-acceptance-only',
      },
    });
    createdUserId = user.id;

    const candidate = await database.candidate.create({ data: { userId: user.id } });
    const resume = await database.resume.create({
      data: {
        candidateId: candidate.id,
        title: 'Phase 3D scanned OCR runtime acceptance',
      },
    });
    const resumeVersionId = randomUUID();
    const objectKey = `runtime/phase3d-ocr/${runId}/${resumeVersionId}/original`;
    createdObjectKey = objectKey;

    const resumeVersion = await database.resumeVersion.create({
      data: {
        id: resumeVersionId,
        resumeId: resume.id,
        versionNumber: 1,
        processingState: 'EXTRACTING',
        objectKey,
        originalFilename: 'scanned-resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: fixtureBytes.byteLength,
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

    await storage.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: objectKey,
        Body: fixtureBytes,
        ContentType: 'application/pdf',
      }),
    );

    await database.$transaction(async (transaction) => {
      await transaction.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: 'candidate.resume.security_passed',
          resourceType: 'ResumeVersion',
          resourceId: resumeVersion.id,
          metadata: {
            resumeId: resume.id,
            processingPipelineVersion: resumeVersion.processingPipelineVersion,
            runtimeAcceptanceSeed: true,
          },
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'ResumeVersion',
          aggregateId: resumeVersion.id,
          eventType: 'candidate.resume.security_passed',
          payload: {
            resumeId: resume.id,
            resumeVersionId: resumeVersion.id,
            processingPipelineVersion: resumeVersion.processingPipelineVersion,
            nextStage: 'EXTRACTING',
            runtimeAcceptanceSeed: true,
          },
        },
      });
    });

    console.log('Phase 3D OCR runtime acceptance started.');
    console.log(`resumeVersionId=${resumeVersion.id}`);
    console.log(`fixture=${fixturePath}`);
    console.log(`objectKey=${objectKey}`);

    await waitForParsing(database, resumeVersion.id, timeoutMs);

    const extractions = await database.resumeExtraction.findMany({
      where: { resumeVersionId: resumeVersion.id },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        extractionMethod: true,
        status: true,
        qualityMetadata: true,
        extractorName: true,
        extractorVersion: true,
        documentJson: true,
      },
    });

    const nativeExtraction = extractions.find(
      (extraction) => extraction.extractionMethod === 'NATIVE_PDF',
    );
    const ocrExtraction = extractions.find((extraction) => extraction.extractionMethod === 'OCR');

    assert(
      nativeExtraction?.status === 'COMPLETED',
      'Expected a completed native PDF extraction before OCR.',
    );
    assert(
      readQualityDecision(nativeExtraction.qualityMetadata) === 'OCR_REQUIRED',
      'Expected native extraction quality to route the scanned PDF to OCR_REQUIRED.',
    );
    assert(ocrExtraction?.status === 'COMPLETED', 'Expected a completed OCR extraction.');
    assert(
      containsExpectedOcrText(ocrExtraction.documentJson),
      'OCR extraction did not contain the expected scanned fixture text.',
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
      select: {
        action: true,
        metadata: true,
      },
    });

    assertPublishedOutboxEvent(outboxEvents, 'candidate.resume.security_passed');
    assertPublishedOutboxEvent(outboxEvents, 'candidate.resume.ocr_required');
    assertEvent(outboxEvents, 'candidate.resume.ocr_completed');
    assertEvent(auditEvents, 'candidate.resume.security_passed', 'action');
    assertEvent(auditEvents, 'candidate.resume.ocr_completed', 'action');
    assertNoPrivateMarkers(auditEvents, 'audit events');
    assertNoPrivateMarkers(outboxEvents, 'outbox events');

    console.log('Observed derived extractions:');
    for (const extraction of extractions) {
      console.log(
        `- ${extraction.extractionMethod} ${extraction.status} ${extraction.extractorName}@${extraction.extractorVersion}`,
      );
    }
    console.log(`Outbox events: ${outboxEvents.map((event) => event.eventType).join(' -> ')}`);
    console.log('Scheduler publication assertion passed for extraction and OCR handoffs.');
    console.log('Privacy assertion passed: no known OCR fixture text in audit/outbox metadata.');
    console.log('Phase 3D OCR runtime acceptance PASSED: OCR_REQUIRED -> resume.ocr -> PARSING.');
    succeeded = true;
  } finally {
    const shouldCleanup = succeeded ? !keepOnSuccess : false;
    if (shouldCleanup) {
      if (createdUserId) await database.user.delete({ where: { id: createdUserId } });
      if (createdObjectKey) {
        await storage.send(
          new DeleteObjectCommand({
            Bucket: env.S3_BUCKET,
            Key: createdObjectKey,
          }),
        );
      }
      console.log('Runtime acceptance fixture cleaned up.');
    } else if (createdUserId || createdObjectKey) {
      console.log(
        succeeded
          ? 'Runtime acceptance fixture preserved because PHASE3D_ACCEPTANCE_KEEP=1.'
          : 'Runtime acceptance failed; fixture state was preserved for diagnosis.',
      );
    }

    storage.destroy();
    await database.$disconnect();
  }
}

async function waitForParsing(
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

    if (version.processingState === 'PARSING') return;
    if (version.processingState === 'FAILED_TERMINAL' || version.processingState === 'REJECTED') {
      throw new Error(
        `Resume processing terminated in ${version.processingState}: ${version.failureCode ?? 'UNKNOWN_FAILURE'} ${JSON.stringify(version.failureMetadata)}`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for resume ${resumeVersionId} to reach PARSING. Ensure scheduler, worker, Redis, RustFS, and OCR services are running.`,
  );
}

function readQualityDecision(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const decision = (value as Record<string, unknown>).decision;
  return typeof decision === 'string' ? decision : null;
}

function containsExpectedOcrText(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const text = (value as Record<string, unknown>).text;
  return typeof text === 'string' && PRIVATE_MARKERS.every((marker) => text.includes(marker));
}

function assertPublishedOutboxEvent(
  events: Array<{ eventType: string; publishedAt: Date | null; attemptCount: number }>,
  expected: string,
): void {
  const event = events.find((item) => item.eventType === expected);
  assert(event, `Expected eventType=${expected}.`);
  assert(
    event.publishedAt instanceof Date,
    `Expected ${expected} to be published by the scheduler.`,
  );
  assert(event.attemptCount > 0, `Expected ${expected} publication attemptCount > 0.`);
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
    assert(!serialized.includes(marker), `Private OCR marker leaked into ${label}: ${marker}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exitCode = 1;
});
