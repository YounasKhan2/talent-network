import { z } from 'zod';

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

const redisSchema = z.object({
  REDIS_URL: z.string().min(1),
});

const storageSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromEnv.default(true),
});

const apiEnvSchema = commonSchema
  .merge(databaseSchema)
  .merge(redisSchema)
  .merge(storageSchema)
  .extend({
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  });

const workerEnvSchema = commonSchema.merge(databaseSchema).merge(redisSchema).merge(storageSchema);
const schedulerEnvSchema = commonSchema.merge(databaseSchema).merge(redisSchema);

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
export type SchedulerEnv = z.infer<typeof schedulerEnvSchema>;

function parseWithSchema<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv,
  runtime: string,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid ${runtime} environment configuration: ${details}`);
  }

  return result.data;
}

export function parseApiEnv(source: NodeJS.ProcessEnv = process.env): ApiEnv {
  return parseWithSchema(apiEnvSchema, source, 'api');
}

export function parseWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return parseWithSchema(workerEnvSchema, source, 'worker');
}

export function parseSchedulerEnv(source: NodeJS.ProcessEnv = process.env): SchedulerEnv {
  return parseWithSchema(schedulerEnvSchema, source, 'scheduler');
}
