import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { parseApiEnv } from '@talent-network/config';
import { createLogger } from '@talent-network/observability';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const env = parseApiEnv();
  const logger = createLogger({
    service: 'api',
    level: env.LOG_LEVEL,
    environment: env.NODE_ENV,
  });

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');

  await app.listen(env.API_PORT, '0.0.0.0');
  logger.info({ port: env.API_PORT }, 'API listening');
}

bootstrap().catch((error: unknown) => {
  const logger = createLogger({ service: 'api-bootstrap' });
  logger.fatal({ error }, 'API failed to start');
  process.exitCode = 1;
});
