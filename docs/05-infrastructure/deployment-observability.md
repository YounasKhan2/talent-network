# Deployment & Observability Architecture

**Status:** Planning baseline

## Goal

Provide a production path that is simple enough for an early team, scalable enough for marketplace growth, and replaceable enough to avoid provider lock-in.

## Deployable Units

Initial production:

```text
web
api
worker
scheduler
```

Worker runtime may expose multiple queue consumers from one codebase while allowing independent deployment/concurrency later:

```text
worker-resume
worker-matching
worker-ai
worker-notifications
worker-search
worker-analytics
```

These are logical scaling units, not mandatory separate services on day one.

## Production Topology

```mermaid
flowchart TD
    USER[Users] --> EDGE[DNS / CDN / WAF]
    EDGE --> WEB[Next.js Web]
    WEB --> API[Stateless NestJS API]

    API --> PG[(Managed PostgreSQL)]
    API --> REDIS[(Managed Redis)]
    API --> OBJ[(S3-compatible Object Storage)]
    API --> QUEUE[Durable Job Queue]

    QUEUE --> W1[Resume Workers]
    QUEUE --> W2[Matching Workers]
    QUEUE --> W3[AI Workers]
    QUEUE --> W4[Notification Workers]

    W1 --> PG
    W2 --> PG
    W3 --> PG
    W4 --> PG

    API --> MAIL[Email Provider]
    W3 --> MODEL[AI Provider(s)]

    API --> OTEL[Telemetry]
    WEB --> OTEL
    W1 --> OTEL
    W2 --> OTEL
    W3 --> OTEL
    W4 --> OTEL
```

## Environment Strategy

### Local
- Docker Compose for PostgreSQL, Redis, object-storage emulator
- API, workers, scheduler, and web run locally
- seeded deterministic development data

### Preview / PR
- isolated web deployment where practical
- shared or ephemeral non-production backend depending cost
- never production data

### Staging
- production-like topology
- sanitized/synthetic data
- migrations exercised before production
- integrations use sandbox/test credentials

### Production
- managed stateful infrastructure
- horizontal API/web scaling
- independently tunable workers
- backups, alarms, secrets, audit

## Configuration

Use validated typed environment configuration.

Rules:
- fail startup on invalid required configuration
- secrets never committed
- no environment-specific business logic branches unless explicit
- public frontend config separate from secrets
- secret rotation possible without code changes

## Database Deployment

Use managed PostgreSQL.

Requirements:
- automated backups
- point-in-time recovery when affordable/available
- encrypted connections
- connection pooling
- monitoring
- migration safety

Migration approach:
1. additive changes first
2. deploy compatible code
3. backfill asynchronously if large
4. switch reads/writes
5. remove old structure in later release

Avoid destructive schema changes coupled to a single deployment.

## Redis

Use managed Redis for:
- queue backend initially
- rate limits
- ephemeral cache
- locks
- session/state where appropriate

Redis data loss must not corrupt authoritative business state.

## Object Storage

Requirements:
- private bucket by default
- signed short-lived access
- separate prefixes/buckets for environment
- lifecycle rules for temporary derivatives
- no public resume URLs

## Deployment Safety

Production deploy must support:
- health/readiness probes
- graceful shutdown
- worker drain
- rollback
- migration compatibility
- feature flags for risky capabilities
- AI capability kill switches

## CI Pipeline

At minimum:

```text
Install
→ Lint
→ Typecheck
→ Unit tests
→ Integration tests
→ Build
→ Security/dependency checks
→ Migration validation
```

Later:
- contract tests
- E2E smoke tests
- load smoke tests
- container/image scanning

## Release Strategy

Prefer small reversible releases.

Use:
- feature flags
- expand/contract migrations
- progressive rollout where platform supports it
- explicit rollback notes for consequential releases

## Observability Standard

Every deployable unit must emit:
- structured logs
- metrics
- traces where useful
- correlation/request IDs
- version/build metadata

OpenTelemetry-compatible instrumentation is preferred so telemetry backend remains replaceable.

## Logging

Structured JSON logs in production.

Recommended fields:
- timestamp
- severity
- service
- environment
- requestId/traceId
- route/operation
- duration
- actorId when safe
- organizationId when safe
- resource type/id when useful
- error code

Never log secrets or raw sensitive resume content by default.

## Core Metrics

### API
- request rate
- p50/p95/p99 latency
- error rate
- status codes
- rate-limit hits

### PostgreSQL
- connections
- pool saturation
- query latency
- slow queries
- lock waits
- CPU/storage
- replica lag later

### Redis
- memory
- command latency
- connection count
- evictions
- queue-specific health

### Queues
- depth
- oldest job age
- processing duration
- success/failure/retry
- DLQ count

### Resume Pipeline
- upload success/failure
- malware rejects
- scan duration
- extraction duration
- OCR rate
- parse duration
- review approval rate

### Matching
- compute duration
- candidates evaluated
- cache/reuse rate
- model version
- failure rate

### AI
- requests by capability/model
- latency
- token/input-output usage where applicable
- cost estimate
- schema validation failure
- fallback usage
- provider error/throttle rate

### Business
- applications/job
- qualified/shortlisted/interviewed/offered/hired
- employer response time
- time to first review
- time to hire

## SLO Evolution

Initial SLOs should be modest and measurable.

Example future targets:
- API availability 99.9% once business need warrants
- application submission success >99.9% excluding invalid requests
- queue jobs processed within capability-specific latency windows

Do not claim contractual SLOs until operational history supports them.

## Alerts

Alert on user/business impact, not noise.

Examples:
- application create error spike
- auth failure anomaly
- DB saturation
- queue oldest-age threshold
- resume pipeline stalled
- AI cost/runaway invocation anomaly
- email delivery failure spike
- object upload failure
- search latency/error threshold

## Runbooks

Before production, create runbooks for:
- database unavailable
- Redis/queue unavailable
- object storage unavailable
- AI provider degraded
- email provider degraded
- malware scanner unavailable
- queue backlog runaway
- compromised account/session
- credential rotation
- bad migration rollback

## Backup / Recovery

Define RPO/RTO before launch based on business requirements.

Minimum:
- scheduled DB backups
- restore test procedure
- object-store durability/versioning policy where appropriate
- configuration/secrets recovery process

Backups that have never been restored in testing are not considered proven.

## Cost Controls

Track infrastructure unit economics:
- cost per active employer
- cost per application
- cost per resume processed
- cost per AI-assisted match
- storage per candidate

Autoscaling requires max bounds to avoid accidental spend explosions.

## Vendor Portability

Keep seams around:
- hosting
- object storage
- email
- AI providers
- payments
- search
- telemetry

Portability does not mean lowest-common-denominator abstractions; it means business logic does not depend directly on provider-specific concepts without an adapter boundary.
