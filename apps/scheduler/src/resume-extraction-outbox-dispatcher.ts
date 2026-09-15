import type { DatabaseClient } from '@talent-network/database';
import {
  RESUME_EXTRACTION_QUEUE,
  resumeExtractionJobId,
  type ResumeExtractionJobData,
} from '@talent-network/resume-extraction';
import type { Queue } from 'bullmq';

const RESUME_SECURITY_PASSED_EVENT = 'candidate.resume.security_passed';
const OUTBOX_BATCH_SIZE = 25;

export async function dispatchResumeExtractionEvents(
  database: DatabaseClient,
  queue: Queue<ResumeExtractionJobData>,
): Promise<number> {
  const events = await database.outboxEvent.findMany({
    where: {
      publishedAt: null,
      eventType: RESUME_SECURITY_PASSED_EVENT,
    },
    orderBy: { occurredAt: 'asc' },
    take: OUTBOX_BATCH_SIZE,
    select: {
      id: true,
      payload: true,
      aggregateId: true,
    },
  });

  let published = 0;
  for (const event of events) {
    const payload = readResumeExtractionPayload(event.payload);
    if (!payload || payload.resumeVersionId !== event.aggregateId) {
      await database.outboxEvent.update({
        where: { id: event.id },
        data: { attemptCount: { increment: 1 } },
      });
      continue;
    }

    try {
      await queue.add(RESUME_EXTRACTION_QUEUE, payload, {
        jobId: resumeExtractionJobId(payload.resumeVersionId, payload.processingPipelineVersion),
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });

      const marked = await database.outboxEvent.updateMany({
        where: { id: event.id, publishedAt: null },
        data: {
          publishedAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      published += marked.count;
    } catch {
      await database.outboxEvent.update({
        where: { id: event.id },
        data: { attemptCount: { increment: 1 } },
      });
    }
  }

  return published;
}

function readResumeExtractionPayload(payload: unknown): ResumeExtractionJobData | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const record = payload as Record<string, unknown>;
  const resumeVersionId = record.resumeVersionId;
  const processingPipelineVersion = record.processingPipelineVersion;
  if (typeof resumeVersionId !== 'string' || resumeVersionId.length === 0) return null;
  if (typeof processingPipelineVersion !== 'string' || processingPipelineVersion.length === 0) {
    return null;
  }

  return { resumeVersionId, processingPipelineVersion };
}
