import { parseSchedulerEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import { createLogger } from '@talent-network/observability';
import {
  RESUME_SECURITY_QUEUE,
  type ResumeSecurityJobData,
} from '@talent-network/resume-security';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { dispatchResumeUploadEvents } from './resume-outbox-dispatcher.js';

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

  await redis.ping();

  let dispatchInFlight = false;
  const dispatch = async (): Promise<void> => {
    if (dispatchInFlight) return;
    dispatchInFlight = true;
    try {
      const published = await dispatchResumeUploadEvents(database, resumeSecurityQueue);
      if (published > 0) logger.info({ published }, 'Resume upload events dispatched');
    } catch (error: unknown) {
      logger.error({ err: error }, 'Resume outbox dispatch failed');
    } finally {
      dispatchInFlight = false;
    }
  };

  await dispatch();
  const timer = setInterval(() => void dispatch(), DISPATCH_INTERVAL_MS);
  logger.info({ queue: RESUME_SECURITY_QUEUE }, 'Scheduler runtime ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Scheduler shutting down');
    clearInterval(timer);
    while (dispatchInFlight) await new Promise((resolve) => setTimeout(resolve, 25));
    await resumeSecurityQueue.close();
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
