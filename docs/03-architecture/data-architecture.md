# Data Architecture

**Status:** Draft v0.1

## Purpose

This document defines how Talent Network stores authoritative business data, historical snapshots, projections, files, derived AI/search data, and analytics while preserving scalability and explainability.

## Core rule

> PostgreSQL is the transactional source of truth. Search indexes, caches, vector representations, analytics stores, and materialized read models are derived projections unless an ADR explicitly changes that rule.

## Data categories

### Authoritative transactional data

Stored in PostgreSQL:

- users
- identities/sessions metadata
- organizations and memberships
- permissions/roles
- candidate Career Passport data
- candidate profile versions
- resume metadata and processing state
- jobs and job versions
- structured job requirements
- applications
- pipeline/stage definitions and history
- screening answers/results
- assessments and attempts
- interviews
- scorecards
- offers
- notification intent/status
- billing state
- verification state
- audit records
- outbox/event records

### Binary/file data

Stored in object storage:

- resumes
- attachments
- generated exports
- company assets
- assessment uploads where allowed
- future report artifacts

Database rows store metadata, ownership, checksum, content type, size, storage key, lifecycle status, and access policy references.

### Ephemeral data

Stored in Redis or equivalent ephemeral systems:

- session cache/state where appropriate
- rate limit counters
- distributed locks
- queue state
- idempotency coordination/cache
- short-lived read caches

Important business truth must survive Redis loss.

### Derived data

Rebuildable projections may include:

- search documents
- embeddings
- vector search indexes
- applicant-list projections
- analytics aggregates
- recommendation candidates

A rebuild strategy must exist for every critical derived store.

## Versioning strategy

Mutable data that influences consequential hiring decisions should preserve version identity.

Initial versioned aggregates:

- Candidate Profile
- Resume
- Job
- Structured Requirements
- Matching/Scoring Model
- Assessment Definition
- Scorecard Template where required
- AI prompt/model configuration where materially relevant

Example conceptual identity:

```text
MatchResult
├── candidateProfileVersionId
├── resumeVersionId?
├── jobVersionId
├── matchingModelVersion
├── computedAt
├── score
├── confidence
└── explanation
```

Historical results must not silently change because a candidate later edits a profile or an employer modifies a job.

## Candidate aggregate

Conceptual model:

```text
User
└── Candidate
    ├── CandidateProfileVersion[]
    ├── Employment[]
    ├── Education[]
    ├── CandidateSkill[]
    ├── Project[]
    ├── Certification[]
    ├── Language[]
    ├── CandidatePreference
    ├── CandidateLocation[]
    ├── PortfolioLink[]
    ├── Resume[]
    └── VerificationEvidence[]
```

Do not force all career data into a single JSON blob. JSON/JSONB may be used selectively for bounded metadata or snapshots, not as a substitute for queryable relational design.

## Resume model

Conceptual model:

```text
Resume
├── id
├── candidateId
├── activeVersionId
└── ResumeVersion[]

ResumeVersion
├── id
├── storageObjectId
├── checksum
├── processingStatus
├── extractionVersion
├── parserVersion
├── extractedTextRef / bounded text representation
├── proposedStructuredData
├── parseConfidence
├── reviewedAt
└── reviewStatus
```

Proposed parsed data is not the same as approved Candidate Profile data.

## Organization / tenancy model

Conceptual model:

```text
Organization
├── OrganizationMember[]
├── Team[]
├── Job[]
├── Pipeline[]
├── TalentPool[]
├── Automation[]
├── BillingAccount
└── OrganizationSetting[]
```

Most employer-owned records should carry `organizationId` directly or have an unambiguous ownership path suitable for efficient authorization queries.

Avoid tenancy designs that require expensive multi-hop joins merely to establish ownership on every request.

## Job aggregate

```text
Job
├── organizationId
├── currentVersionId
├── status
└── JobVersion[]

JobVersion
├── title
├── description
├── employmentType
├── seniority
├── compensation
├── locationPolicy
├── publicationSettings
├── Requirement[]
├── ScreeningQuestion[]
├── assessmentPlanRef
└── pipelineRef
```

Publication and application behavior should resolve against explicit job versions/snapshots where historical meaning matters.

## Application aggregate

```text
Application
├── candidateId
├── organizationId
├── jobId
├── jobVersionId
├── submittedProfileVersionId
├── submittedResumeVersionId
├── currentStageId
├── submittedAt
├── ApplicationStageHistory[]
├── ScreeningAnswer[]
├── MatchResult[]
├── ScreeningResult[]
├── ApplicationActivity[]
└── related interview/offer references
```

`organizationId` is intentionally available on the application for tenancy safety/query efficiency even though it can be derived from Job.

## Hiring pipeline model

Pipelines are configurable entities.

```text
Pipeline
├── organizationId
├── name
└── PipelineStage[]

PipelineStage
├── stableId
├── displayName
├── orderKey
├── category
├── active
└── configuration
```

Avoid encoding employer-specific pipeline semantics into application enums.

Stable stage identity matters when a stage is renamed.

## Match results

Do not store only a final percentage.

Conceptual structure:

```text
MatchResult
├── score
├── confidence
├── modelVersion
├── rulesVersion
├── strengths[]
├── gaps[]
├── uncertainties[]
├── conflicts[]
├── componentScores
├── sourceEvidenceRefs[]
└── computedAt
```

This supports explainability, debugging, analytics, model evaluation, and future recomputation.

## Evidence model

Where practical, derived hiring signals should point back to evidence.

Example:

```text
EvidenceReference
├── type: RESUME | PROFILE | ASSESSMENT | SCREENING_ANSWER | PROJECT
├── sourceEntityId
├── sourceVersionId
├── locator / field path
└── confidence
```

Do not duplicate large source documents into match records.

## Audit model

Audit records are append-oriented.

Minimum conceptual fields:

```text
AuditRecord
├── id
├── occurredAt
├── actorType
├── actorId
├── organizationId?
├── action
├── entityType
├── entityId
├── requestId / correlationId
└── bounded metadata
```

Sensitive data should not be copied wholesale into audit metadata.

## Outbox model

Use an outbox table for reliable asynchronous dispatch.

Conceptual fields:

```text
OutboxEvent
├── id
├── eventType
├── aggregateType
├── aggregateId
├── organizationId?
├── payloadVersion
├── payload
├── occurredAt
├── publishedAt?
├── attempts
└── lastError?
```

Outbox retention/archival policy will be defined before production.

## IDs

Use globally unique opaque IDs rather than exposing sequential database identifiers.

The exact ID format (UUIDv7/ULID/etc.) will be decided by ADR before schema implementation.

Requirements:

- safe for public APIs
- sortable where beneficial
- no tenant/business information encoded
- generated without coordination

## Money

Never use floating point for monetary amounts.

Represent:

- integer minor units where currency supports conventional minor units, plus currency code; or
- an exact decimal strategy if required by payment/provider constraints.

All compensation must include currency and period semantics.

Example:

```text
amountMin
amountMax
currency = PKR
period = MONTH
```

## Time

Store canonical timestamps in UTC.

Persist timezone identifiers separately for user-visible scheduling/calendar semantics where needed.

Do not infer interview timezone from current browser location after scheduling.

## Soft delete vs hard delete

Do not add `deletedAt` blindly to every table.

Use deletion semantics according to domain requirements:

- reversible archive for jobs/organization configuration
- retention/deletion workflow for privacy-sensitive candidate data
- immutable audit requirements where lawful
- hard deletion/anonymization where policy requires it

A dedicated retention/privacy specification will define the final behavior.

## Indexing principles

Indexes must reflect actual high-value query patterns.

Likely early indexes include:

```text
Application(jobId, currentStageId, submittedAt DESC)
Application(organizationId, submittedAt DESC)
Application(candidateId, submittedAt DESC)
Job(organizationId, status, createdAt DESC)
Job(status, publishedAt DESC)
OrganizationMember(organizationId, userId)
CandidateSkill(skillId, candidateId)
OutboxEvent(publishedAt, occurredAt)
```

Do not over-index write-heavy tables before query plans justify it.

Use partial indexes where lifecycle/status patterns make them valuable.

## Large-table evolution

Potential future high-volume tables:

- applications
- activity events
- notifications
- audit records
- outbox/events
- analytics facts
- match results

Before partitioning, measure:

- row count
- index size
- vacuum behavior
- write rate
- query latency
- retention needs

Partition only after evidence shows a benefit.

## Read models / denormalization

Transactional normalization should not force slow product screens.

Purpose-built read projections are allowed for:

- applicant list rows
- employer dashboard aggregates
- candidate job recommendations
- search documents
- reporting summaries

Each projection needs:

- source-of-truth definition
- refresh/event mechanism
- consistency expectation
- rebuild strategy

## Search projection

Search documents may intentionally denormalize candidate/job information.

Example candidate search document:

```text
candidateId
privacy/searchability state
current title
normalized skills
experience summary
locations
work preferences
availability
salary expectation bands
assessment/verification summaries
updatedAt
```

Search results must still pass authoritative permission/privacy checks before sensitive data is returned.

## Embeddings/vector data

Embeddings are derived data.

Always store enough metadata to know:

- source entity
- source version
- embedding model/version
- createdAt

Changing embedding models must not destroy transactional business data.

## Analytics data

Initial product analytics may use append-only event records and aggregate tables in PostgreSQL.

When volume/query complexity justifies separation, events can feed a dedicated analytics store.

Do not run expensive historical BI queries directly against latency-sensitive transactional paths.

## Backups and recovery

Before production, define:

- PostgreSQL automated backups/PITR
- object storage versioning/retention as appropriate
- encryption and key policy
- restore procedure
- restore testing cadence
- RPO/RTO targets by environment

A backup is not considered reliable until restoration is tested.

## Data migration rules

Schema changes must be safe for live systems.

Prefer expand/contract migrations for breaking changes:

1. add new compatible structure
2. deploy code that can handle both states
3. backfill asynchronously if needed
4. switch reads/writes
5. verify
6. remove obsolete structure later

Avoid long blocking migrations on large tables.

## Data architecture invariant

> Transactional data must remain understandable, recoverable, historically meaningful where decisions depend on it, and separable from every cache, search engine, vector store, or AI provider we may replace later.
