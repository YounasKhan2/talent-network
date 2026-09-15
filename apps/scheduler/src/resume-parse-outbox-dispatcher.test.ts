import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from '@talent-network/database';
import {
  RESUME_PARSE_QUEUE,
  resumeParseJobId,
  type ResumeParseJobData,
} from '@talent-network/resume-parsing';
import type { Queue } from 'bullmq';
import { dispatchResumeParseEvents } from './resume-parse-outbox-dispatcher.js';

void test('dispatches parse-ready events with stable parse job identity', async () => {
  const fixture = createFixture([
    {
      id: 'event-1',
      aggregateId: 'resume-version-1',
      payload: {
        resumeVersionId: 'resume-version-1',
        resumeExtractionId: 'extraction-1',
        processingPipelineVersion: 'resume-v1',
      },
      publishedAt: null,
      attemptCount: 0,
    },
  ]);

  const published = await dispatchResumeParseEvents(fixture.database, fixture.queue);

  assert.equal(published, 1);
  assert.deepEqual(fixture.addedJobs[0], {
    name: RESUME_PARSE_QUEUE,
    data: {
      resumeVersionId: 'resume-version-1',
      processingPipelineVersion: 'resume-v1',
      extractionId: 'extraction-1',
    },
    options: {
      jobId: resumeParseJobId('resume-version-1', 'resume-v1', 'extraction-1'),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  assert.ok(fixture.events[0]?.publishedAt instanceof Date);
  assert.equal(fixture.events[0]?.attemptCount, 1);
});

void test('rejects malformed or mismatched parse events without publishing', async () => {
  const fixture = createFixture([
    {
      id: 'event-bad',
      aggregateId: 'resume-version-a',
      payload: {
        resumeVersionId: 'resume-version-b',
        resumeExtractionId: 'extraction-1',
        processingPipelineVersion: 'resume-v1',
      },
      publishedAt: null,
      attemptCount: 0,
    },
    {
      id: 'event-missing-extraction',
      aggregateId: 'resume-version-c',
      payload: {
        resumeVersionId: 'resume-version-c',
        processingPipelineVersion: 'resume-v1',
      },
      publishedAt: null,
      attemptCount: 0,
    },
  ]);

  const published = await dispatchResumeParseEvents(fixture.database, fixture.queue);

  assert.equal(published, 0);
  assert.equal(fixture.addedJobs.length, 0);
  assert.equal(fixture.events[0]?.attemptCount, 1);
  assert.equal(fixture.events[1]?.attemptCount, 1);
});

void test('parse queue failure keeps outbox event unpublished for retry', async () => {
  const fixture = createFixture(
    [
      {
        id: 'event-fail',
        aggregateId: 'resume-version-fail',
        payload: {
          resumeVersionId: 'resume-version-fail',
          resumeExtractionId: 'extraction-fail',
          processingPipelineVersion: 'resume-v1',
        },
        publishedAt: null,
        attemptCount: 0,
      },
    ],
    true,
  );

  const published = await dispatchResumeParseEvents(fixture.database, fixture.queue);

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
    data: ResumeParseJobData;
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
    add: (name: string, data: ResumeParseJobData, options: Record<string, unknown>) => {
      if (failQueue) return Promise.reject(new Error('queue unavailable'));
      addedJobs.push({ name, data, options });
      return Promise.resolve({ id: options.jobId });
    },
  } as unknown as Queue<ResumeParseJobData>;

  return { database, queue, events, addedJobs };
}
