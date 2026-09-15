import { parseSchedulerEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import {
  RESUME_EXTRACTION_QUEUE,
  RESUME_OCR_QUEUE,
  type ResumeExtractionJobData,
  type ResumeOcrJobData,
} from '@talent-network/resume-extraction';
import { createLogger } from '@talent-network/observability';
import { RESUME_PARSE_QUEUE, type ResumeParseJobData } from '@talent-network/resume-parsing';
import { RESUME_SECURITY_QUEUE, type ResumeSecurityJobData } from '@talent-network/resume-security';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { dispatchResumeExtractionEvents } from './resume-extraction-outbox-dispatcher.js';
import { dispatchResumeOcrEvents } from './resume-ocr-outbox-dispatcher.js';
import { dispatchResumeUploadEvents } from './resume-outbox-dispatcher.js';
import { dispatchResumeParseEvents } from './resume-parse-outbox-dispatcher.js';

const DISPATCH_INTERVAL_MS = 1_000;

async function main(): Promise<void> {
  const env = parseSchedulerEnv();
  const logger = createLogger({
    service: 'scheduler',
    level: env.LOG_LEVEL,
    environment: env.NODE_ENV,
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const database = createDatabaseClient(env.DATABASE_URL);
  const resumeSecurityQueue = new Queue<ResumeSecurityJobData>(RESUME_SECURITY_QUEUE, {
    connection: redis,
  });
  const resumeExtractionQueue = new Queue<ResumeExtractionJobData>(RESUME_EXTRACTION_QUEUE, {
    connection: redis,
  });
  const resumeOcrQueue = new Queue<ResumeOcrJobData>(RESUME_OCR_QUEUE, {
    connection: redis,
  });
  const resumeParseQueue = new Queue<ResumeParseJobData>(RESUME_PARSE_QUEUE, {
    connection: redis,
  });

  await redis.ping();

  let dispatchInFlight = false;
  const dispatch = async (): Promise<void> => {
    if (dispatchInFlight) return;
    dispatchInFlight = true;
    try {
      const [securityPublished, extractionPublished, ocrPublished, parsePublished] =
        await Promise.all([
          dispatchResumeUploadEvents(database, resumeSecurityQueue),
          dispatchResumeExtractionEvents(database, resumeExtractionQueue),
          dispatchResumeOcrEvents(database, resumeOcrQueue),
          dispatchResumeParseEvents(database, resumeParseQueue),
        ]);
      if (securityPublished > 0) {
        logger.info({ published: securityPublished }, 'Resume upload events dispatched');
      }
      if (extractionPublished > 0) {
        logger.info({ published: extractionPublished }, 'Resume extraction events dispatched');
      }
      if (ocrPublished > 0) {
        logger.info({ published: ocrPublished }, 'Resume OCR events dispatched');
      }
      if (parsePublished > 0) {
        logger.info({ published: parsePublished }, 'Resume parse events dispatched');
      }
    } catch (error: unknown) {
      logger.error({ err: error }, 'Resume outbox dispatch failed');
    } finally {
      dispatchInFlight = false;
    }
  };

  await dispatch();
  const timer = setInterval(() => void dispatch(), DISPATCH_INTERVAL_MS);
  logger.info(
    {
      queues: [
        RESUME_SECURITY_QUEUE,
        RESUME_EXTRACTION_QUEUE,
        RESUME_OCR_QUEUE,
        RESUME_PARSE_QUEUE,
      ],
    },
    'Scheduler runtime ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Scheduler shutting down');
    clearInterval(timer);
    while (dispatchInFlight) await new Promise((resolve) => setTimeout(resolve, 25));
    await resumeSecurityQueue.close();
    await resumeExtractionQueue.close();
    await resumeOcrQueue.close();
    await resumeParseQueue.close();
    await database.$disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  const logger = createLogger({ service: 'scheduler-bootstrap' });
  logger.fatal({ err: error }, 'Scheduler failed to start');
  process.exitCode = 1;
});
