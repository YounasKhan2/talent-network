import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from '@talent-network/database';
import { RESUME_SECURITY_QUEUE, type ResumeSecurityJobData } from '@talent-network/resume-security';
import type { Queue } from 'bullmq';
import { dispatchResumeUploadEvents } from './resume-outbox-dispatcher.js';

void test('dispatches an upload-completed event with a stable BullMQ job id and marks it published', async () => {
  const fixture = createFixture([
    {
      id: 'event-1',
      payload: { resumeVersionId: 'resume-version-1' },
      publishedAt: null,
      attemptCount: 0,
    },
  ]);

  const published = await dispatchResumeUploadEvents(fixture.database, fixture.queue);

  assert.equal(published, 1);
  assert.equal(fixture.addedJobs.length, 1);
  assert.deepEqual(fixture.addedJobs[0], {
    name: RESUME_SECURITY_QUEUE,
    data: { resumeVersionId: 'resume-version-1' },
    options: {
      jobId: 'resume-security-event-1',
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  assert.ok(fixture.events[0]?.publishedAt instanceof Date);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

void test('invalid outbox payload is not published and increments the attempt count', async () => {
  const fixture = createFixture([
    { id: 'event-invalid', payload: {}, publishedAt: null, attemptCount: 0 },
  ]);

  const published = await dispatchResumeUploadEvents(fixture.database, fixture.queue);

  assert.equal(published, 0);
  assert.equal(fixture.addedJobs.length, 0);
  assert.equal(fixture.events[0]?.publishedAt, null);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

void test('queue failure leaves the event unpublished so the scheduler can retry it', async () => {
  const fixture = createFixture(
    [
      {
        id: 'event-fail',
        payload: { resumeVersionId: 'resume-version-fail' },
        publishedAt: null,
        attemptCount: 0,
      },
    ],
    true,
  );

  const published = await dispatchResumeUploadEvents(fixture.database, fixture.queue);

  assert.equal(published, 0);
  assert.equal(fixture.events[0]?.publishedAt, null);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

interface MutableOutboxEvent {
  id: string;
  payload: unknown;
  publishedAt: Date | null;
  attemptCount: number;
}

function createFixture(seed: MutableOutboxEvent[], failQueue = false) {
  const events = seed.map((event) => ({ ...event }));
  const addedJobs: Array<{
    name: string;
    data: ResumeSecurityJobData;
    options: Record<string, unknown>;
  }> = [];

  const database = {
    outboxEvent: {
      findMany: () =>
        Promise.resolve(
          events
            .filter((event) => event.publishedAt === null)
            .map((event) => ({ id: event.id, payload: event.payload })),
        ),
      update: (input: {
        where: { id: string };
        data: { attemptCount?: { increment: number } };
      }) => {
        const event = events.find((candidate) => candidate.id === input.where.id);
        if (!event) throw new Error('Outbox event not found');
        event.attemptCount += input.data.attemptCount?.increment ?? 0;
        return Promise.resolve(event);
      },
      updateMany: (input: {
        where: { id: string; publishedAt: null };
        data: { publishedAt: Date; attemptCount: { increment: number } };
      }) => {
        const event = events.find(
          (candidate) => candidate.id === input.where.id && candidate.publishedAt === null,
        );
        if (!event) return Promise.resolve({ count: 0 });
        event.publishedAt = input.data.publishedAt;
        event.attemptCount += input.data.attemptCount.increment;
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as DatabaseClient;

  const queue = {
    add: (name: string, data: ResumeSecurityJobData, options: Record<string, unknown>) => {
      if (failQueue) return Promise.reject(new Error('queue unavailable'));
      addedJobs.push({ name, data, options });
      return Promise.resolve({ id: options.jobId });
    },
  } as unknown as Queue<ResumeSecurityJobData>;

  return { database, queue, events, addedJobs };
}
