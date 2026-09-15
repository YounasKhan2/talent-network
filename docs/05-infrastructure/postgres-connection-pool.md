# PostgreSQL connection pool policy

Talent Network uses Prisma ORM 7 with `@prisma/adapter-pg`. Prisma 7 delegates connection pooling to `node-postgres`, so pool behavior must be configured explicitly rather than inferred from older Prisma defaults.

## Shared runtime policy

The canonical configuration lives in `packages/database/src/index.ts` and is consumed by every runtime that creates a Prisma client.

```text
max connections per process: 10
connection acquisition timeout: 5 seconds
idle connection lifetime: 5 minutes
TCP keepalive: enabled
keepalive initial delay: 10 seconds
```

This policy applies to API, worker, scheduler, integration/runtime harnesses, and any future service that uses `createDatabaseClient()`.

## Why this is explicit

Prisma ORM 7's PostgreSQL driver adapter inherits `pg` defaults. In particular, `pg` defaults to a 10-second idle timeout and no connection timeout. Talent Network runs long-lived API and background-worker processes, so relying on those defaults creates unnecessary connection churn and makes connection behavior dependent on upstream driver changes.

The explicit policy keeps the pool bounded while restoring conservative long-running-process behavior. TCP keepalive helps the operating system detect dead sockets instead of allowing stale network state to survive indefinitely.

## Safety rules

- Do not create ad-hoc `PrismaClient` or `PrismaPg` instances outside the shared database package.
- Do not add blanket automatic retries around all Prisma operations. Write retries require operation-specific idempotency guarantees.
- Keep Nest application shutdown hooks enabled so `$disconnect()` drains the underlying pool during normal shutdown.
- Size production pools as `per-process pool size × running process count`, leaving headroom under PostgreSQL `max_connections` for migrations, administration, and failover operations.
- Revisit pool size using observed concurrency and pool-wait metrics before increasing `max`.

## Verification

`packages/database/test/database-pool.test.mjs` locks the shared pool policy. Runtime acceptance should also exercise the long-running API after idle periods and repeated candidate/resume reads; short-lived integration tests alone are not sufficient evidence for connection stability.
