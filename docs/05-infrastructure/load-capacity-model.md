# Load & Capacity Model

**Status:** Planning baseline  
**Purpose:** Define scale assumptions before implementation so APIs, queues, data models, and infrastructure evolve intentionally.

These are engineering planning assumptions, not market forecasts.

## Design Principle

Scale for plausible growth without paying hyperscale costs on day one.

The system should progress through measurable thresholds rather than architecture fashion.

## Capacity Tiers

| Tier | Registered Candidates | Organizations | Active Jobs | Annual Applications | Typical Architecture |
|---|---:|---:|---:|---:|---|
| Prototype | 1k | <100 | <500 | <25k | single API + worker + managed DB |
| Early Production | 10k | 250 | 2k | 100k | horizontally scalable API/workers |
| Growth | 100k | 2k | 10k | 1M | worker isolation + stronger caching/search |
| Large Marketplace | 1M | 10k+ | 50k+ | 3–10M | dedicated search + replicas + analytics platform |

## Traffic Shape

Hiring traffic is bursty rather than uniform.

Typical spikes:
- newly published popular job
- graduate/MTO campaign
- employer bulk import
- email notification campaign
- assessment deadline
- large talent search/export
- resume reprocessing
- matching model recomputation

The architecture must absorb spikes through queues and backpressure rather than force synchronous scaling everywhere.

## Stress Scenario A — Viral Job

Assumption:
- 20,000 applications in 24 hours
- peak 2,500/hour
- burst 100–300 submissions/minute

Synchronous request path should perform only:
1. authenticate/authorize
2. validate job/application eligibility
3. enforce uniqueness/idempotency
4. create application transaction
5. write outbox event
6. return success

Resume parsing, matching, notifications, analytics, and AI remain asynchronous.

## Stress Scenario B — Graduate Campaign

Assumption:
- 50,000 applicants
- several jobs sharing one campaign
- employer dashboard repeatedly filtering the same large applicant corpus

Required behaviors:
- cursor pagination
- indexed job/stage/status filters
- purpose-built applicant list projection
- saved views
- async exports
- bulk stage movement using bounded batches
- aggregate counters precomputed or incrementally maintained

## Stress Scenario C — Resume Processing

Suppose 10,000 resumes arrive over a short campaign.

Pipeline:

```text
Upload
→ Scan Queue
→ Extraction Queue
→ Parse Queue
→ Normalize
→ Candidate Review
```

Worker concurrency should be independently tunable per stage.

Example planning model:
- scan: 50 concurrent light workers
- extraction: 20–50 depending on CPU/memory
- OCR: small isolated expensive pool
- AI parse: provider-budget constrained pool

Exact numbers must be load-tested, not hardcoded as architecture.

## Stress Scenario D — Matching

Do not compute expensive full matching for all candidate/job pairs.

For 1M candidates and 50k jobs, Cartesian evaluation is impossible and unnecessary.

Use staged candidate retrieval:

```text
Eligibility constraints
→ indexed structured candidate retrieval
→ lexical/semantic candidate set
→ deterministic scoring
→ evidence scoring
→ expensive AI explanation only for top/visible subset
```

This bounds cost by actual recruiter/candidate interaction.

## API Performance Targets

Initial engineering targets:

| Operation | Target |
|---|---|
| CDN-served public content | <100ms where region/cache allows |
| Typical API p50 | <150ms |
| Typical API p95 | <500ms |
| Search p95 | <800ms |
| Application submit p95 | <700ms excluding client upload |
| Interactive table action perceived feedback | ~100ms optimistic where safe |

These are objectives, not promises; production SLOs will be established from measurements.

## Database Capacity Strategy

### First
- correct schema
- bounded queries
- appropriate composite indexes
- query-plan inspection
- connection pooling
- pagination
- projection endpoints

### Then
- larger managed DB
- read replica for suitable read workloads
- materialized/derived read models
- archival policies

### Much Later If Needed
- partition very high-volume tables
- split workload-specific databases
- isolate enterprise tenants only where justified

Do not shard before evidence requires it.

## High-Growth Tables

Expected fast-growing entities:
- applications
- application stage history
- activities
- audit events
- notifications
- outbox events
- matching results
- AI invocation records
- analytics events

These require deliberate indexes, retention, archival, and potentially partitioning at later scale.

## Queue Capacity Rules

Track per queue:
- incoming rate
- completion rate
- backlog depth
- oldest job age
- retry rate
- failure rate
- p50/p95 job duration

Autoscale workers from backlog/age/throughput where platform supports it.

Never autoscale purely from CPU for queue workloads.

## Backpressure

When downstream providers or expensive processors are saturated:
- accept durable user action if safe
- queue derived computation
- show processing state
- reduce non-essential AI work
- cap concurrency
- defer bulk recomputations
- prioritize interactive/high-value workloads

## Search Scaling

Phase 1:
- PostgreSQL full-text + trigram + structured indexes

Trigger dedicated search evaluation when one or more become true:
- search p95 cannot meet target after DB optimization
- ranking features outgrow relational query ergonomics
- faceting/aggregation becomes too costly
- candidate corpus/search concurrency materially affects transactions
- semantic/hybrid retrieval becomes core and high-volume

Search remains a projection, not source of truth.

## Object Storage Planning

If average resume file = 500 KB:
- 10k resumes ≈ 5 GB
- 100k ≈ 50 GB
- 1M ≈ 500 GB

Store originals plus only required derivatives. Avoid unnecessary duplicated converted files.

## AI Capacity & Cost

AI capacity is bounded separately from web capacity.

Controls:
- global budget
- per-tenant budget
- per-capability concurrency
- fallback models
- cached/versioned results
- deterministic shortlisting before inference
- batch/background processing where latency is non-critical

A traffic surge must not create an uncontrolled AI spend surge.

## Load Testing Plan

Before production milestones, test:

### API
- authentication
- job discovery
- applicant listing
- application submission
- stage changes

### Database
- realistic dataset sizes
- concurrent recruiter filters
- application insertion bursts
- audit/outbox write overhead

### Queues
- worker crash/retry
- duplicate jobs
- provider throttling
- backlog recovery

### Files
- concurrent signed uploads
- large valid files
- malicious/invalid files

### Matching
- candidate retrieval at 10k/100k/1M scale simulation

## Scale Gates

Any infrastructure upgrade must document:
1. measured bottleneck
2. current p95/p99 or throughput
3. target
4. proposed change
5. expected cost increase
6. rollback plan

The default answer to future scale is not automatically 'microservice'.