import type { DatabaseClient } from '@talent-network/database';

type EventTransaction = Pick<DatabaseClient, 'auditEvent' | 'outboxEvent'>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

export interface AuditEventInput {
  organizationId?: string;
  actorType: 'USER' | 'SYSTEM' | 'SERVICE';
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: JsonObject;
}

export interface OutboxEventInput {
  organizationId?: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: JsonObject;
}

/**
 * Writes an audit record with the caller's existing transaction client.
 * This helper never opens its own transaction so the audit row commits or
 * rolls back with the domain mutation that caused it.
 */
export async function writeAuditEvent(
  transaction: EventTransaction,
  input: AuditEventInput,
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  });
}

/**
 * Writes a durable outbox event with the caller's existing transaction client.
 * Delivery is intentionally separate from the domain transaction; workers can
 * publish pending outbox rows after commit without coupling domain services to
 * a queue or broker.
 */
export async function writeOutboxEvent(
  transaction: EventTransaction,
  input: OutboxEventInput,
): Promise<void> {
  await transaction.outboxEvent.create({
    data: {
      organizationId: input.organizationId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload,
    },
  });
}
