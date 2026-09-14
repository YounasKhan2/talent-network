import type { DatabaseClient } from '@talent-network/database';
import {
  RESUME_SECURITY_QUEUE,
  type ResumeSecurityJobData,
} from '@talent-network/resume-security';
import type { Queue } from 'bullmq';

const RESUME_UPLOAD_COMPLETED_EVENT = 'candidate.resume.upload_completed';
const OUTBOX_BATCH_SIZE = 25;

export async function dispatchResumeUploadEvents(
  database: DatabaseClient,
  queue: Queue<ResumeSecurityJobData>,
): Promise<number> {
  const events = await database.outboxEvent.findMany({
    where: {
      publishedAt: null,
      eventType: RESUME_UPLOAD_COMPLETED_EVENT,
    },
    orderBy: { occurredAt: 'asc' },
    take: OUTBOX_BATCH_SIZE,
    select: {
      id: true,
      payload: true,
    },
  });

  let published = 0;
  for (const event of events) {
    const resumeVersionId = readResumeVersionId(event.payload);
    if (!resumeVersionId) {
      await database.outboxEvent.update({
        where: { id: event.id },
        data: { attemptCount: { increment: 1 } },
      });
      continue;
    }

    try {
      await queue.add(
        RESUME_SECURITY_QUEUE,
        { resumeVersionId },
        {
          jobId: `resume-security-${event.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 1_000,
          removeOnFail: 5_000,
        },
      );

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

function readResumeVersionId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>).resumeVersionId;
  return typeof value === 'string' && value.length > 0 ? value : null;
}
