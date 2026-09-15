import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from '@talent-network/database';
import {
  RESUME_EXTRACTION_QUEUE,
  resumeExtractionJobId,
  type ResumeExtractionJobData,
} from '@talent-network/resume-extraction';
import type { Queue } from 'bullmq';
import { dispatchResumeExtractionEvents } from './resume-extraction-outbox-dispatcher.js';

void test('dispatches security-passed events with stable extraction job identity', async () => {
  const fixture = createFixture([
    {
      id: 'event-1',
      aggregateId: 'resume-version-1',
      payload: {
        resumeVersionId: 'resume-version-1',
        processingPipelineVersion: 'resume-v1',
      },
      publishedAt: null,
      attemptCount: 0,
    },
  ]);

  const published = await dispatchResumeExtractionEvents(fixture.database, fixture.queue);

  assert.equal(published, 1);
  assert.deepEqual(fixture.addedJobs[0], {
    name: RESUME_EXTRACTION_QUEUE,
    data: {
      resumeVersionId: 'resume-version-1',
      processingPipelineVersion: 'resume-v1',
    },
    options: {
      jobId: resumeExtractionJobId('resume-version-1', 'resume-v1'),
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  assert.ok(fixture.events[0]?.publishedAt instanceof Date);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

void test('rejects mismatched aggregate identity without publishing', async () => {
  const fixture = createFixture([
    {
      id: 'event-bad',
      aggregateId: 'resume-version-a',
      payload: {
        resumeVersionId: 'resume-version-b',
        processingPipelineVersion: 'resume-v1',
      },
      publishedAt: null,
      attemptCount: 0,
    },
  ]);

  const published = await dispatchResumeExtractionEvents(fixture.database, fixture.queue);

  assert.equal(published, 0);
  assert.equal(fixture.addedJobs.length, 0);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

void test('queue failure keeps event unpublished for retry', async () => {
  const fixture = createFixture(
    [
      {
        id: 'event-fail',
        aggregateId: 'resume-version-fail',
        payload: {
          resumeVersionId: 'resume-version-fail',
          processingPipelineVersion: 'resume-v1',
        },
        publishedAt: null,
        attemptCount: 0,
      },
    ],
    true,
  );

  const published = await dispatchResumeExtractionEvents(fixture.database, fixture.queue);

  assert.equal(published, 0);
  assert.equal(fixture.events[0]?.publishedAt, null);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

interface MutableEvent {
  id: string;
  aggregateId: string;
  payload: unknown;
  publishedAt: Date | null;
  attemptCount: number;
}

function createFixture(seed: MutableEvent[], failQueue = false) {
  const events = seed.map((event) => ({ ...event }));
  const addedJobs: Array<{
    name: string;
    data: ResumeExtractionJobData;
    options: Record<string, unknown>;
  }> = [];

  const database = {
    outboxEvent: {
      findMany: () =>
        Promise.resolve(
          events
            .filter((event) => event.publishedAt === null)
            .map((event) => ({
              id: event.id,
              aggregateId: event.aggregateId,
              payload: event.payload,
            })),
        ),
      update: (input: { where: { id: string }; data: { attemptCount: { increment: number } } }) => {
        const event = events.find((candidate) => candidate.id === input.where.id);
        if (!event) throw new Error('Outbox event not found');
        event.attemptCount += input.data.attemptCount.increment;
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
    add: (name: string, data: ResumeExtractionJobData, options: Record<string, unknown>) => {
      if (failQueue) return Promise.reject(new Error('queue unavailable'));
      addedJobs.push({ name, data, options });
      return Promise.resolve({ id: options.jobId });
    },
  } as unknown as Queue<ResumeExtractionJobData>;

  return { database, queue, events, addedJobs };
}
