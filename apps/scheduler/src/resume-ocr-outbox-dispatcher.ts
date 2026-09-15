import type { DatabaseClient } from '@talent-network/database';
import {
  RESUME_OCR_QUEUE,
  resumeOcrJobId,
  type ResumeOcrJobData,
} from '@talent-network/resume-extraction';
import type { Queue } from 'bullmq';

const RESUME_OCR_REQUIRED_EVENT = 'candidate.resume.ocr_required';
const OUTBOX_BATCH_SIZE = 25;

export async function dispatchResumeOcrEvents(
  database: DatabaseClient,
  queue: Queue<ResumeOcrJobData>,
): Promise<number> {
  const events = await database.outboxEvent.findMany({
    where: {
      publishedAt: null,
      eventType: RESUME_OCR_REQUIRED_EVENT,
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
    const payload = readResumeOcrPayload(event.payload);
    if (!payload || payload.resumeVersionId !== event.aggregateId) {
      await database.outboxEvent.update({
        where: { id: event.id },
        data: { attemptCount: { increment: 1 } },
      });
      continue;
    }

    try {
      await queue.add(RESUME_OCR_QUEUE, payload, {
        jobId: resumeOcrJobId(
          payload.resumeVersionId,
          payload.processingPipelineVersion,
          payload.extractionId,
        ),
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
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

function readResumeOcrPayload(payload: unknown): ResumeOcrJobData | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;

  const record = payload as Record<string, unknown>;
  const resumeVersionId = record.resumeVersionId;
  const processingPipelineVersion = record.processingPipelineVersion;
  const resumeExtractionId = record.resumeExtractionId;

  if (typeof resumeVersionId !== 'string' || resumeVersionId.length === 0) return null;
  if (typeof processingPipelineVersion !== 'string' || processingPipelineVersion.length === 0) {
    return null;
  }
  if (typeof resumeExtractionId !== 'string' || resumeExtractionId.length === 0) return null;

  return {
    resumeVersionId,
    processingPipelineVersion,
    extractionId: resumeExtractionId,
  };
}
