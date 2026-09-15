import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export const DATABASE_JSON_DB_NULL = Prisma.DbNull;

/**
 * Shared PostgreSQL pool policy for every long-lived Prisma client in the monorepo.
 *
 * Prisma ORM 7 delegates pooling to node-postgres. Its pg defaults use a 10-second
 * idle timeout and no connection timeout, which is too aggressive/unbounded for
 * our long-running API, worker, and scheduler processes. These values deliberately
 * restore conservative, explicit behavior while keeping the pool bounded.
 */
export const DATABASE_POOL_POLICY = Object.freeze({
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 300_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

export function createDatabaseClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    ...DATABASE_POOL_POLICY,
  });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
export type PrismaInputJsonValue = Prisma.InputJsonValue;
