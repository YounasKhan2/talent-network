import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export const DATABASE_JSON_DB_NULL = Prisma.DbNull;

export function createDatabaseClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
export type PrismaInputJsonValue = Prisma.InputJsonValue;
