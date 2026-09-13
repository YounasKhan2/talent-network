# Engineering Principles

These principles govern product, backend, frontend, data, AI, infrastructure, and deployment decisions throughout the lifetime of Talent Network.

## 1. Scale by evidence, not fear

The system must be designed to scale, but infrastructure complexity must be introduced only when measured load, reliability, ownership, or compliance requirements justify it.

This means:

- modular monolith before microservices
- managed PostgreSQL before distributed databases
- Redis/BullMQ before event-streaming infrastructure
- PostgreSQL search before dedicated search clusters
- vertical optimization before premature sharding

The architecture must make later extraction possible without paying the cost too early.

## 2. Reuse business capability, not accidental code

Reusable modules should represent stable concepts such as organizations, permissions, resumes, applications, jobs, matching, notifications, billing, or audit.

Avoid "shared" packages that become dumping grounds.

Prefer explicit contracts between domains.

## 3. Separate source of truth from projections

Authoritative transactional data belongs in PostgreSQL.

Caches, search indexes, read models, analytics stores, and vector representations are rebuildable projections.

The system should remain correct even if a projection must be rebuilt.

## 4. Separate interactive work from heavy work

User-facing API requests should remain fast and predictable.

Heavy tasks belong in asynchronous workers, including:

- malware scanning
- OCR
- document extraction
- resume parsing
- embedding generation
- matching recomputation
- AI summaries
- email delivery
- exports
- analytics aggregation

## 5. Idempotency by default for retryable work

Queues, webhooks, payments, uploads, scheduling, and other retryable actions must tolerate duplicate delivery.

Repeated execution of the same logical command should not create duplicate business effects.

## 6. Design for tenant safety from day one

Organization-owned resources must carry tenant ownership and be accessed through server-side tenant authorization.

Never rely on UI filtering to enforce tenancy.

Tenant isolation applies to:

- transactional reads/writes
- exports
- object storage paths/access
- cache keys
- search filters
- analytics queries
- background jobs
- audit records

## 7. Version important decision inputs

If mutable data can affect hiring decisions, preserve enough version history to explain historical outcomes.

Important examples:

- candidate profile
- resume
- job requirements
- matching/scoring model
- assessment definition
- scorecards
- AI prompt/model configuration where relevant

## 8. Prefer explainable matching

A candidate match score without supporting evidence is insufficient.

Matching should expose strengths, gaps, uncertainties, and conflicts.

AI should not hide deterministic rules or evidence behind opaque conclusions.

## 9. Keep provider coupling behind adapters

External dependencies such as model providers, storage, email, payments, calendars, job boards, and analytics systems must be accessed through internal interfaces/adapters where practical.

Avoid allowing third-party SDK concepts to leak through the whole codebase.

## 10. APIs are products

API design must consider:

- versioning
- pagination
- idempotency
- authorization
- stable errors
- rate limits
- observability
- backward compatibility
- response projections

Avoid endpoints that dump entire aggregate graphs when a targeted read model is more appropriate.

## 11. Frontend performance is architecture

Do not solve complex screens with hundreds of requests.

Use:

- server-state caching
- request deduplication
- prefetching
- virtualized large lists
- cursor pagination
- optimized read models
- selective detail loading
- optimistic updates where safe

The frontend should remain responsive under realistic recruiter datasets.

## 12. Security is part of feature design

Every feature design should answer:

- who can perform this action?
- which tenant owns the data?
- what sensitive data is exposed?
- should this be auditable?
- can this be abused at scale?
- what rate limits apply?
- how is deletion/retention handled?

Security review is not a final deployment step.

## 13. Observability before emergencies

New critical flows should emit useful metrics/logs from their first production release.

Important dimensions include:

- latency
- throughput
- errors
- retry count
- queue depth
- job duration
- DB/query load
- external provider failures
- AI token/cost usage
- tenant/action identity where safe

## 14. Cost is an architectural metric

Track cost-driving operations, especially:

- AI inference
- resume processing
- object storage
- email/SMS
- search infrastructure
- analytics
- egress

Where useful, calculate business-level unit economics such as cost per resume processed, match computed, active employer, and successful hire.

## 15. Documentation evolves with code

Repository documentation is part of system integrity.

No significant architecture or workflow change should land without updating the corresponding documentation and, where appropriate, an ADR.

## 16. Accessibility and usability are non-functional requirements

Complex professional software must support:

- keyboard access
- visible focus
- screen readers
- sufficient contrast
- reduced motion
- non-color-only status communication
- accessible alternatives to drag-and-drop

## 17. Design for replacement

Any infrastructure or vendor choice that is likely to change should have a clear seam.

Examples:

- AI provider
- object storage
- mail provider
- payment gateway
- search provider
- analytics sink

We do not need an abstraction around every library, but critical vendor-dependent business flows should be replaceable.

## 18. Prefer boring infrastructure where boring works

The system becomes complex enough through its product domains.

Infrastructure should remain conventional, observable, and understandable until real constraints require otherwise.

## Architecture Quality Gate

Before introducing a major component or service, document:

1. Problem being solved
2. Expected load/scale
3. Why current architecture is insufficient
4. Alternatives considered
5. Operational cost
6. Failure modes
7. Migration strategy
8. Rollback/reversal strategy
9. Security/privacy impact
10. Ownership and observability plan

If these cannot be answered, the new complexity is probably premature.