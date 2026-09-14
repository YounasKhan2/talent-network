import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from './generated/prisma/client.js';

export function createDatabaseClient(connectionString: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
export type PrismaInputJsonValue = Prisma.InputJsonValue;
export type PrismaNullableJsonValueInput = Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
