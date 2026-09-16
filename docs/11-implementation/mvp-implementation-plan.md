# MVP Implementation Plan

## Purpose

This document converts the product, architecture, security, data, AI, and UX specifications into an implementation sequence.

The objective is to build the smallest coherent hiring network foundation without creating structural debt that prevents later scale.

## Implementation Philosophy

The MVP is not a disposable prototype.

It should be:

- modular
- typed
- testable
- observable
- secure
- migration-safe
- reusable
- deployable
- documented

At the same time, avoid premature infrastructure such as Kafka, Kubernetes, many microservices, or a dedicated search cluster before measured need.

---

# Proposed Monorepo

```text
apps/
├── web/            Next.js product application
├── api/            NestJS HTTP/API application
├── worker/         BullMQ/background processors
└── scheduler/      recurring/maintenance workflows

packages/
├── config/
├── database/
├── contracts/
├── observability/
├── auth/
├── identity/
├── organizations/
├── candidates/
├── resumes/
├── jobs/
├── applications/
├── pipelines/
├── matching/
├── screening/
├── notifications/
├── verification/
├── audit/
├── ai/
└── ui/
```

Additional product packages are introduced when the MVP genuinely uses them.

Do not create empty domain packages only to match a future diagram.

## Tooling Direction

Recommended initial tooling:

- TypeScript
- pnpm workspaces
- Turborepo or equivalent lightweight task orchestration
- Next.js
- React
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
- S3-compatible object storage
- Zod or equivalent runtime schema validation for contracts/config where appropriate
- structured logging
- OpenTelemetry-compatible tracing strategy where practical

Exact provider selections should remain configurable.

---

# Phase 0 — Repository & Engineering Foundation

Deliverables:

```text
workspace bootstrap
shared TypeScript config
linting
formatting
build/typecheck commands
environment validation
Docker Compose development infrastructure
CI pipeline
structured logging foundation
health/readiness endpoints
test framework
migration workflow
```

Quality gate:

- fresh clone can boot documented local environment
- CI runs typecheck/test/lint/build as applicable
- invalid environment fails fast
- health endpoints distinguish liveness/readiness
- README reflects actual commands

No product features before this gate passes.

---

# Phase 1 — Identity, Sessions & Organization Foundation

Implement:

### Identity

- signup
- login
- logout
- session refresh/rotation
- email verification foundation
- password reset foundation

### Organizations

- create organization
- organization membership
- active workspace selection
- initial roles/permissions
- server-side tenant enforcement

### Audit

- security-sensitive account events
- organization membership changes
- permission-sensitive actions

Quality gate:

- cross-tenant tests prove organization isolation
- session lifecycle tests
- permission tests
- rate limits on authentication surfaces
- secure cookie/CSRF posture documented and tested where relevant

---

# Phase 2 — Candidate Career Passport

Implement structured candidate profile:

- Contact Information
- Professional Summary
- Work Experience
- Education
- Skills
- Certifications
- Awards
- additional/extension sections
- projects/portfolio
- languages/interests
- professional links
- preferences
- compensation expectations
- availability
- location preferences
- privacy/visibility foundation

Introduce profile versioning.

Quality gate:

- profile changes produce historical versions where required
- privacy settings are enforced server-side
- candidate UI uses section-based editing
- schema/API/docs agree
- default core sections remain typed and stable
- additional/custom sections do not require destructive schema redesign

---

# Phase 3 — Resume Intelligence Foundation

Phase 3 is intentionally broader than “upload + regex parser”. It establishes secure resume ingestion first, then evolves into a benchmark-driven document-intelligence system before later matching/search phases depend on its outputs.

Baseline capabilities:

```text
upload authorization
presigned/direct upload
file metadata
validation
malware scan
queue orchestration
native PDF/DOCX extraction
OCR fallback
source-grounded parser
normalized proposal
candidate review
approved Career Passport update
resume version history
```

Verified/active slices before 3G:

```text
3A Resume domain + processing state
3B Private object storage + direct upload
3C Validation + malware scanning
3D Native extraction + OCR fallback
3E Structured parsing + evidence mapping
3F Candidate review + Passport approval baseline
```

## Phase 3G — Resume Intelligence Architecture V2

Phase 3G is required before Resume Intelligence is considered production-mature for diverse real-world CVs.

It introduces:

```text
DocumentGraph V1
structural section detection
record-boundary detection
Career ontology classification
hybrid typed extractors
Source Ledger accounting
record-level reconciliation
quality/confidence/coverage separation
open-world unknown/custom preservation
private References handling
Candidate Review UX V2
benchmark-driven regression gates
semantic/model recovery capability gate
```

The key guarantee is architectural rather than probabilistic:

> meaningful source information may be uncertain or unmapped, but it must not disappear silently.

Planned 3G sequence:

```text
3G-A Contracts + benchmark vocabulary
3G-B Layout-aware DocumentGraph
3G-C Structural section/record detection
3G-D Source Ledger + reconciliation
3G-E Core typed extractors V2
3G-F Extensions + open-world fallback
3G-G Semantic recovery capability gate
3G-H Candidate Review UX V2
3G-I Benchmark expansion + regression gate
3G-J Runtime closure
```

Detailed contract: [`phase-3g-resume-intelligence-v2.md`](./phase-3g-resume-intelligence-v2.md).

Phase 3 quality gate:

- upload endpoint never proxies large files unnecessarily
- malicious/unsupported files fail safely
- retries are idempotent
- parse output is schema-validated and versioned
- candidate must approve authoritative profile mutation
- original resume remains versioned/traceable
- queue backlog and processing duration are observable
- source evidence remains traceable
- unknown/custom sections remain preserved
- References remain private by default
- claim confidence is not presented as source coverage
- meaningful source accounting is measurable
- benchmark regressions are visible before production release
- new model/provider/tool adoption passes capability/privacy/cost/licensing review first

The initial production implementation may use one semantic/document provider behind adapters only if benchmark evidence justifies it. No provider owns the Career Passport, evidence, graph, taxonomy, or review contracts.

---

# Phase 4 — Employer Organization & Job Management

Implement:

- organization profile
- verification-state foundation
- job drafts
- structured requirements
- required/preferred criteria
- compensation
- location/work-mode policy
- screening questions
- pipeline selection
- publish/unpublish/close
- public job page

Quality gate:

- draft/published lifecycle tested
- job version history preserves matching inputs
- public projections never leak internal settings
- tenant authorization tested
- job pages support appropriate caching/SEO

---

# Phase 5 — Job Discovery

Candidate features:

- job search
- structured filters
- cursor pagination
- job detail
- candidate-safe company information
- basic recommendation retrieval

Initial search remains PostgreSQL-backed unless load measurements justify otherwise.

Quality gate:

- indexed query patterns reviewed
- no client-only filtering over limited result sets
- URL represents meaningful filter/search state
- mobile candidate UX works

---

# Phase 6 — Applications

Implement:

```text
apply
submitted profile snapshot
submitted resume version
screening answers
application stage
stage history
candidate application timeline
employer applicant list
```

Application creation must use idempotency protection.

Quality gate:

- duplicate submissions cannot create duplicate application business effects
- historical submission context is preserved
- candidate cannot access employer-internal data
- employer cannot access applications outside tenant/job authorization

---

# Phase 7 — Matching & Screening V1

Implement staged engine:

```text
hard eligibility
structured requirement matching
experience/role relevance
preference compatibility
basic semantic representation
candidate evidence
versioned scoring result
AI explanation for selected results
```

Do not implement an LLM-only score.

Recruiter UI:

- match indicator
- strengths
- gaps
- uncertainties
- conflicts
- source evidence

Quality gate:

- deterministic scoring tests
- versioned model/config
- reproducible results from versioned inputs
- AI explanation does not change underlying deterministic outcome silently
- failures degrade to non-AI screening

---

# Phase 8 — Recruiter Applicant Workspace

Implement employer UX specification:

- applicant table
- purpose-built list endpoint
- filters
- sort
- cursor loading
- configurable columns foundation
- split candidate detail
- stage move
- shortlist
- internal notes
- activity

Later enhancements such as advanced saved views can build on this foundation.

Quality gate:

- no N+1 API pattern per table row
- table remains usable on realistic dataset fixture
- detail opens without losing list context
- keyboard basics work
- authorization checked for every row/action

---

# Phase 9 — Interviews & Notifications

MVP interview scope:

- interview create/schedule
- participants
- candidate-safe interview details
- basic status
- email/in-app notification

Calendar provider integration may follow after internal scheduling model is stable.

Quality gate:

- timezone behavior tested
- notification sends are queued/idempotent
- failed delivery observable/retryable
- sensitive internal notes never appear candidate-side

---

# Phase 10 — Admin / Verification / Moderation Foundation

Implement only necessary operational tooling:

- users lookup
- organizations lookup
- verification queue
- jobs moderation
- audit explorer foundation
- support-safe account context

Quality gate:

- admin permissions separate from organization permissions
- sensitive access is audited
- high-impact moderation actions require reasons
- no unrestricted generic database editor

---

# Phase 11 — Billing Foundation

Before paid launch:

- plans/entitlements model
- subscription provider adapter
- webhook verification
- idempotent billing events
- feature entitlement checks
- billing audit events

Provider-specific logic remains behind adapter boundary.

---

# Cross-Cutting Work Required in Every Phase

## Tests

Use the appropriate mix of:

- unit tests
- integration tests
- API contract tests
- authorization/tenant isolation tests
- queue/idempotency tests
- browser/E2E critical journeys

Critical business rules should not depend only on E2E coverage.

## Observability

Every critical flow adds:

- structured logs
- error metrics
- latency metrics
- business events
- relevant queue metrics
- trace/correlation identifiers where useful

## Security

Each feature reviews:

- authentication
- authorization
- tenancy
- privacy
- abuse/rate limits
- audit requirements
- sensitive fields
- retention/deletion implications

## Documentation

Update in the same change when modifying:

- API
- schema
- events
- workflows
- architecture
- permissions
- infrastructure
- AI behavior
- benchmark/quality expectations

For Phase 3G specifically, each verified slice must update the 3G architecture/status document in the same development cycle. A slice is not marked `VERIFIED` from code inspection alone.

---

# Database Migration Rules

Production migrations must be compatible with rolling deployments where possible.

Prefer expand/contract:

```text
1. add compatible structure
2. deploy compatible readers/writers
3. backfill asynchronously if required
4. switch reads/writes
5. observe
6. remove deprecated structure later
```

Avoid destructive rename/drop in the same release as consumer changes for high-risk tables.

---

# Feature Flag Strategy

Use flags for risky/incremental capabilities such as:

- new matching models
- AI explanation versions
- new resume parser/DocumentGraph pipeline
- semantic recovery providers
- blind review
- experimental job ranking
- paid feature rollout

Flags are not permanent architecture substitutes and must have owners/cleanup plans.

---

# Performance Fixtures

Before launch, maintain realistic generated fixtures for:

- jobs with 1k+ applicants
- large talent pools
- candidates with long career histories
- resumes with multiple pages
- complex PDF/DOCX layouts
- scanned resumes
- resumes with tables/columns/text boxes
- long academic/research CVs
- processing queue bursts

Use these fixtures for table/render/API/load validation.

Phase 3G additionally maintains a ground-truth Resume Intelligence Benchmark for section, record, field, evidence, reading-order, unknown-preservation, source-accounting, and privacy metrics.

---

# CI/CD Gates

Minimum pre-merge/deploy gates should evolve toward:

```text
typecheck
lint
unit tests
integration tests
schema/migration validation
build
security/dependency checks
critical E2E smoke tests
benchmark regression checks where stable
```

Production deploy must have health verification and rollback capability.

---

# MVP Release Readiness

MVP is not considered ready merely because screens render.

Required categories:

### Product

- candidate can create/review Career Passport
- candidate can import complex resumes without silent meaningful-data loss
- employer can create/publish job
- candidate can discover/apply
- recruiter can review/shortlist/manage stage
- match explanation is understandable
- candidate can track application

### Security

- tenancy tests pass
- private candidate data controls work
- file upload threat controls work
- third-party reference data remains private by default
- admin permissions audited

### Reliability

- worker retries tested
- idempotency tested
- backup/restore procedure documented
- provider failure has graceful behavior
- unresolved semantic extraction degrades to preserved/unmapped data rather than silent loss

### Performance

- applicant list load tested
- job search load tested
- application burst tested
- resume queue burst tested
- complex-resume processing latency measured

### Operations

- alerts/dashboards exist
- moderation/admin tooling exists
- deployment/rollback runbook exists
- incident ownership defined

### Documentation

- architecture and API docs match implementation
- README local/deployment instructions work
- ADRs updated for deviations
- Phase 3G benchmark and verified-slice status match actual runtime evidence

---

# Explicitly Deferred Beyond MVP

Unless required by validation customers, defer:

- advanced talent CRM
- reusable assessments marketplace
- sophisticated scorecards
- offer approvals
- referrals
- salary intelligence
- private talent marketplace
- workflow automation builder
- Slack/Teams integrations
- SSO/SCIM
- HRIS integrations
- campus/university portals
- native mobile apps
- dedicated search cluster
- event streaming platform
- Kubernetes

The architecture keeps seams for these features without paying their complexity now.

---

# Implementation Sequence Summary

```text
0 Engineering foundation
        ↓
1 Identity + Organizations + Permissions
        ↓
2 Candidate Career Passport
        ↓
3 Resume Intelligence
   └─ 3G Resume Intelligence Architecture V2 before production maturity
        ↓
4 Employer + Jobs
        ↓
5 Job Discovery
        ↓
6 Applications
        ↓
7 Matching / Screening
        ↓
8 Recruiter Applicant Workspace
        ↓
9 Interviews + Notifications
        ↓
10 Admin / Verification / Moderation
        ↓
11 Billing foundation
        ↓
Production hardening / MVP launch
```

This order intentionally establishes authoritative data, document-understanding quality, and security boundaries before dependent AI and workflow features.
