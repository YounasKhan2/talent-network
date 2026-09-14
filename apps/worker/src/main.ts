import { S3Client } from '@aws-sdk/client-s3';
import { parseWorkerEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import { createLogger } from '@talent-network/observability';
import { ClamAvScanner } from '@talent-network/resume-security';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  processResumeSecurityJob,
  RESUME_SCAN_QUEUE,
  type ResumeScanJobData,
} from './resume-security-worker.js';

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

  const resumeSecurityWorker = new Worker<ResumeScanJobData>(
    RESUME_SCAN_QUEUE,
    async (job) => {
      await processResumeSecurityJob(job.data, {
        database,
        storage,
        bucket: env.S3_BUCKET,
        scanner,
      });
    },
    {
      connection: redis,
      concurrency: 2,
      lockDuration: 60_000,
    },
  );

  resumeSecurityWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, resumeVersionId: job.data.resumeVersionId }, 'Resume security job completed');
  });
  resumeSecurityWorker.on('failed', (job, error) => {
    logger.error(
      { jobId: job?.id, resumeVersionId: job?.data.resumeVersionId, err: error },
      'Resume security job failed',
    );
  });

  logger.info({ scanner: scannerVersion, queue: RESUME_SCAN_QUEUE }, 'Worker runtime ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutting down');
    await resumeSecurityWorker.close();
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
