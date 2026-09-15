import { S3Client } from '@aws-sdk/client-s3';
import { parseWorkerEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import {
  RESUME_EXTRACTION_QUEUE,
  type ResumeExtractionJobData,
} from '@talent-network/resume-extraction';
import { createLogger } from '@talent-network/observability';
import {
  ClamAvScanner,
  RESUME_SECURITY_QUEUE,
  type ResumeSecurityJobData,
} from '@talent-network/resume-security';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { processResumeExtractionJob } from './resume-extraction-worker.js';
import { processResumeSecurityJob } from './resume-security-worker.js';

async function main(): Promise<void> {
  const env = parseWorkerEnv();
  const logger = createLogger({
    service: 'worker',
    level: env.LOG_LEVEL,
    environment: env.NODE_ENV,
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
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
  const scanner = new ClamAvScanner({
    host: env.CLAMAV_HOST,
    port: env.CLAMAV_PORT,
    timeoutMs: env.CLAMAV_TIMEOUT_MS,
  });

  await redis.ping();
  const scannerVersion = await scanner.getVersion();

  const resumeSecurityWorker = new Worker<ResumeSecurityJobData>(
    RESUME_SECURITY_QUEUE,
    async (job) => {
      const maxAttempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
      await processResumeSecurityJob(
        job.data,
        {
          database,
          storage,
          bucket: env.S3_BUCKET,
          scanner,
        },
        {
          finalAttempt,
          retryAttempt: job.attemptsMade > 0,
        },
      );
    },
    {
      connection: redis,
      concurrency: 2,
      lockDuration: 60_000,
    },
  );

  const resumeExtractionWorker = new Worker<ResumeExtractionJobData>(
    RESUME_EXTRACTION_QUEUE,
    async (job) => {
      const maxAttempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
      await processResumeExtractionJob(
        job.data,
        {
          database,
          storage,
          bucket: env.S3_BUCKET,
        },
        {
          finalAttempt,
          retryAttempt: job.attemptsMade > 0,
        },
      );
    },
    {
      connection: redis,
      concurrency: 2,
      lockDuration: 60_000,
    },
  );

  resumeSecurityWorker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, resumeVersionId: job.data.resumeVersionId },
      'Resume security job completed',
    );
  });
  resumeSecurityWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        resumeVersionId: job?.data.resumeVersionId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        err: error,
      },
      'Resume security job failed',
    );
  });

  resumeExtractionWorker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, resumeVersionId: job.data.resumeVersionId },
      'Resume extraction job completed',
    );
  });
  resumeExtractionWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        resumeVersionId: job?.data.resumeVersionId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        err: error,
      },
      'Resume extraction job failed',
    );
  });

  logger.info(
    {
      scanner: scannerVersion,
      queues: [RESUME_SECURITY_QUEUE, RESUME_EXTRACTION_QUEUE],
    },
    'Worker runtime ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutting down');
    await resumeSecurityWorker.close();
    await resumeExtractionWorker.close();
    await database.$disconnect();
    storage.destroy();
    await redis.quit();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  const logger = createLogger({ service: 'worker-bootstrap' });
  logger.fatal({ err: error }, 'Worker failed to start');
  process.exitCode = 1;
});
