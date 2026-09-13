import { parseWorkerEnv } from '@talent-network/config';
import { createLogger } from '@talent-network/observability';
import Redis from 'ioredis';

async function main(): Promise<void> {
  const env = parseWorkerEnv();
  const logger = createLogger({ service: 'worker', level: env.LOG_LEVEL, environment: env.NODE_ENV });
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  await redis.ping();
  logger.info('Worker runtime ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Worker shutting down');
    await redis.quit();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  const logger = createLogger({ service: 'worker-bootstrap' });
  logger.fatal({ error }, 'Worker failed to start');
  process.exitCode = 1;
});
