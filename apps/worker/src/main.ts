import { S3Client } from '@aws-sdk/client-s3';
import { parseWorkerEnv } from '@talent-network/config';
import { createDatabaseClient } from '@talent-network/database';
import {
  HttpResumeOcrEngine,
  RESUME_EXTRACTION_QUEUE,
  RESUME_OCR_QUEUE,
  type ResumeExtractionJobData,
  type ResumeOcrJobData,
} from '@talent-network/resume-extraction';
import { createLogger } from '@talent-network/observability';
import {
  GroundedResumeParser,
  RESUME_PARSE_QUEUE,
  type ResumeParseJobData,
} from '@talent-network/resume-parsing';
import {
  ClamAvScanner,
  RESUME_SECURITY_QUEUE,
  type ResumeSecurityJobData,
} from '@talent-network/resume-security';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { processResumeExtractionJob } from './resume-extraction-worker.js';
import { processResumeOcrJob } from './resume-ocr-worker.js';
import { processResumeParseJob } from './resume-parse-worker.js';
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
  const ocrEngine = env.OCR_HTTP_ENDPOINT
    ? new HttpResumeOcrEngine({
        endpoint: env.OCR_HTTP_ENDPOINT,
        timeoutMs: env.OCR_HTTP_TIMEOUT_MS,
        ...(env.OCR_HTTP_TOKEN ? { bearerToken: env.OCR_HTTP_TOKEN } : {}),
      })
    : null;
  const resumeParser = new GroundedResumeParser();

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

  const resumeOcrWorker = ocrEngine
    ? new Worker<ResumeOcrJobData>(
        RESUME_OCR_QUEUE,
        async (job) => {
          const maxAttempts = job.opts.attempts ?? 1;
          const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
          await processResumeOcrJob(
            job.data,
            {
              database,
              storage,
              bucket: env.S3_BUCKET,
              engine: ocrEngine,
            },
            {
              finalAttempt,
              retryAttempt: job.attemptsMade > 0,
            },
          );
        },
        {
          connection: redis,
          concurrency: 1,
          lockDuration: 120_000,
        },
      )
    : null;

  const resumeParseWorker = new Worker<ResumeParseJobData>(
    RESUME_PARSE_QUEUE,
    async (job) => {
      const maxAttempts = job.opts.attempts ?? 1;
      const finalAttempt = job.attemptsMade + 1 >= maxAttempts;
      await processResumeParseJob(
        job.data,
        {
          database,
          parser: resumeParser,
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

  resumeOcrWorker?.on('completed', (job) => {
    logger.info(
      { jobId: job.id, resumeVersionId: job.data.resumeVersionId },
      'Resume OCR job completed',
    );
  });
  resumeOcrWorker?.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        resumeVersionId: job?.data.resumeVersionId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        err: error,
      },
      'Resume OCR job failed',
    );
  });

  resumeParseWorker.on('completed', (job) => {
    logger.info(
      { jobId: job.id, resumeVersionId: job.data.resumeVersionId },
      'Resume parse job completed',
    );
  });
  resumeParseWorker.on('failed', (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        resumeVersionId: job?.data.resumeVersionId,
        attemptsMade: job?.attemptsMade,
        maxAttempts: job?.opts.attempts,
        err: error,
      },
      'Resume parse job failed',
    );
  });

  const queues: string[] = [RESUME_SECURITY_QUEUE, RESUME_EXTRACTION_QUEUE, RESUME_PARSE_QUEUE];
  if (resumeOcrWorker) queues.push(RESUME_OCR_QUEUE);
  logger.info(
    {
      scanner: scannerVersion,
      queues,
      ocrEnabled: resumeOcrWorker !== null,
      resumeParser: {
        name: resumeParser.name,
        version: resumeParser.version,
      },
    },
    'Worker runtime ready',
  );

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutting down');
    await resumeSecurityWorker.close();
    await resumeExtractionWorker.close();
    await resumeOcrWorker?.close();
    await resumeParseWorker.close();
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
