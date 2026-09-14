# ADR-0001 — Modular Monolith First

**Status:** Accepted  
**Date:** 2026-09-14

## Context

Talent Network will contain many domains: identity, organizations, candidates, resumes, jobs, applications, pipelines, matching, screening, assessments, interviews, offers, notifications, analytics, billing, verification, audit, and AI.

The product is expected to evolve toward significant scale, but initial traffic, team size, product-market fit, and operational requirements are unknown.

Starting immediately with many deployable microservices would add network boundaries, distributed transactions, deployment coordination, observability overhead, duplicated infrastructure, local-development friction, and higher operational cost before those costs are justified.

At the same time, building an unstructured monolith would make later scaling and service extraction painful.

## Decision

Start with a **modular monolith** for transactional business capabilities and separate **worker processes** for heavy asynchronous workloads.

Domains must expose explicit module boundaries and avoid direct cross-domain persistence shortcuts.

Initial deployable applications are expected to be conceptually:

- `web`
- `api`
- `worker`
- `scheduler`

Heavy workloads such as resume processing, AI inference, matching, notifications, exports, and analytics may scale independently as workers even while sharing repository packages and core infrastructure.

Services may later be extracted when justified by one or more of:

- independent scaling requirements
- failure isolation
- different runtime requirements
- independent deployment cadence
- clear team ownership boundaries
- security/regulatory isolation
- sustained operational bottlenecks

## Alternatives Considered

### Microservices from day one

Rejected for initial implementation because product boundaries and load characteristics have not yet been validated. The operational cost would exceed the demonstrated benefit.

### Single unstructured monolith

Rejected because the product has many business domains and must remain evolvable.

### Serverless functions for every domain

Rejected as the default architecture because highly fragmented functions can create similar boundary/observability problems while complicating long-running workflows and local reasoning. Serverless may still be used selectively where appropriate.

## Consequences

### Positive

- fast local development
- simpler deployments
- easier transactional consistency
- lower early infrastructure cost
- easier debugging
- domain boundaries can still support later extraction
- worker processes can scale heavy computation independently

### Negative

- architectural discipline must be actively enforced
- a poorly maintained modular monolith can decay into a tightly coupled monolith
- some modules may eventually require extraction work

## Scalability Impact

The architecture supports horizontal scaling of stateless API instances and independent worker concurrency.

Database, queue, search, and compute bottlenecks can be measured before extracting services.

Module contracts should make later service extraction an incremental migration rather than a rewrite.

## Security Impact

Centralized transactional deployment can simplify consistent authentication, authorization, and tenant enforcement initially.

Domain boundaries must not be used to bypass permission checks.

## Reversal / Migration Strategy

A domain can be extracted by:

1. formalizing its public application contract
2. removing direct persistence coupling from consumers
3. moving communication behind commands/events/APIs
4. migrating required data ownership where appropriate
5. deploying the domain independently
6. preserving compatibility during cutover

The modular-monolith boundary is intentionally designed to support this evolution.
