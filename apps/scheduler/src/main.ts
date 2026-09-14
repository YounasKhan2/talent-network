import { parseSchedulerEnv } from '@talent-network/config';
import { createLogger } from '@talent-network/observability';
import { Redis } from 'ioredis';

async function main(): Promise<void> {
  const env = parseSchedulerEnv();
  const logger = createLogger({
    service: 'scheduler',
    level: env.LOG_LEVEL,
    environment: env.NODE_ENV,
  });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  await redis.ping();
  logger.info('Scheduler runtime ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Scheduler shutting down');
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
