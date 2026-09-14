# API Architecture

## Purpose

This document defines the API contract standards for Talent Network. The API must remain stable, observable, secure, efficient under high-volume recruiter workloads, and evolvable without forcing frontend rewrites.

## Core Principles

1. REST-first for transactional product APIs.
2. Explicit versioning from the first public surface.
3. Backend-enforced tenancy and authorization.
4. Cursor pagination for large and frequently changing collections.
5. Purpose-built read models for complex product screens.
6. Idempotency for retryable or consequential commands.
7. Stable machine-readable error contracts.
8. No chatty N+1 frontend workflows.
9. Async acknowledgement for long-running processing.
10. Observability and rate limiting are part of the API contract.

## Versioning

All public APIs use a version prefix:

```text
/api/v1/...
```

Breaking changes require a new version or an explicitly compatible migration strategy.

Internal implementation packages may evolve more quickly, but externally consumed contracts must remain stable.

## Resource Design

Prefer domain-oriented resources:

```text
/v1/jobs
/v1/jobs/:jobId
/v1/jobs/:jobId/applications
/v1/applications/:applicationId
/v1/candidates/:candidateId
/v1/talent/search
/v1/interviews
/v1/assessments
/v1/offers
/v1/organizations/:organizationId/members
```

Avoid generic endpoints such as `/data`, `/query`, or `/actions` when a domain resource can communicate intent clearly.

## Commands vs Reads

Reads should be side-effect free.

Consequential state changes should use explicit commands/resources rather than hidden mutations.

Examples:

```text
POST   /v1/jobs/:jobId/publish
POST   /v1/applications/:applicationId/transitions
POST   /v1/applications/:applicationId/shortlist
POST   /v1/interviews
POST   /v1/offers
```

A transition command should validate authorization, business invariants, pipeline rules, and idempotency in one server-side boundary.

## Request Validation

Every request is validated at the edge of the application layer.

Validate:

- schema
- type
- range
- enum values
- identifier shape
- pagination limits
- date/time format
- mutually exclusive fields
- tenant context
- business constraints where appropriate

Do not allow malformed or ambiguous payloads to reach domain services.

## Error Contract

All API errors follow a stable structure.

```json
{
  "error": {
    "code": "APPLICATION_ALREADY_EXISTS",
    "message": "You have already applied to this job.",
    "requestId": "req_...",
    "details": null
  }
}
```

### Error rules

- `code` is stable and machine-readable.
- `message` is user-safe and suitable for product display where appropriate.
- `requestId` enables support/debug correlation.
- `details` may contain structured validation information, never sensitive internals.
- stack traces, SQL, provider secrets, and internal infrastructure metadata must never leak to clients.

## HTTP Semantics

Typical mappings:

```text
200 OK              successful read/update
201 Created         newly created resource
202 Accepted        async operation accepted
204 No Content      successful command without response body
400 Bad Request     malformed input
401 Unauthorized    missing/invalid authentication
403 Forbidden       authenticated but not permitted
404 Not Found       absent or intentionally undisclosed resource
409 Conflict        valid request conflicts with current state
422 Unprocessable   domain validation failure
429 Too Many        rate limit
503 Unavailable     transient dependency/service issue
```

Use consistent semantics rather than feature-specific interpretations.

## Pagination

Large mutable collections use cursor pagination.

Example:

```text
GET /v1/jobs/:jobId/applications?stage=review&sort=match_desc&limit=50&cursor=...
```

Response:

```json
{
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

### Rules

- default limits are conservative
- hard server-side maximums apply
- cursors are opaque
- cursors may encode ordering keys but must be signed/validated if client-tampering would matter
- offset pagination may still be used for small static admin lists where appropriate

## Purpose-Built Read Models

High-density recruiter screens should use optimized projections.

Example applicant row response:

```json
{
  "applicationId": "app_...",
  "candidate": {
    "id": "cand_...",
    "displayName": "Ali Raza",
    "headline": "Backend Engineer",
    "location": "Karachi"
  },
  "match": {
    "score": 92,
    "confidence": "HIGH"
  },
  "stage": {
    "id": "stage_...",
    "name": "Review"
  },
  "experienceYears": 3.2,
  "assessmentScore": 87,
  "appliedAt": "2026-09-14T10:00:00Z"
}
```

The list endpoint should not require separate requests for candidate, match, stage, assessment, and location.

Deep candidate detail is loaded only when needed.

## Field Selection

Avoid generic user-controlled arbitrary projection languages at MVP.

Instead provide purpose-built endpoints/read models for known product workflows.

If partial-field selection is later required for external APIs, define an allowlisted projection model.

## Filtering and Sorting

Filters must map to indexed/queryable fields.

Example:

```text
GET /v1/talent/search
?title=backend-engineer
&skills=nodejs,nestjs
&location=karachi
&experienceMin=2
&experienceMax=4
&availabilityWithinDays=30
&salaryMax=250000
&sort=relevance
```

The backend validates combinations and enforces maximum complexity.

## Idempotency

Required for retryable consequential operations such as:

- job application submission
- payment operations
- interview scheduling
- offer sending
- webhook processing
- bulk import commands
- file-processing initiation

Clients provide an idempotency key where applicable:

```text
Idempotency-Key: <opaque-client-generated-key>
```

The server scopes keys to actor/tenant/operation and safely replays the original result where possible.

## Async Operations

Heavy work returns quickly.

Example:

```text
POST /v1/resumes/:resumeId/process
```

Response:

```json
{
  "status": "QUEUED",
  "operationId": "op_..."
}
```

The client may retrieve operation state or receive an event/notification when processing completes.

Do not keep HTTP connections open while OCR, AI parsing, exports, or matching runs.

## Authentication

Web authentication should prefer secure server-managed sessions/cookies for the first-party product unless an ADR changes this.

External/integration APIs may later use OAuth2, scoped API keys, or signed webhooks.

Authentication and authorization remain separate concerns.

## Authorization

Every tenant-owned request resolves:

```text
actor
organization
resource ownership
permission
entitlement
```

Never trust `organizationId`, role, or permission claims supplied by the browser without server verification.

Resource-not-found responses may intentionally hide cross-tenant existence.

## Rate Limiting

Apply layered rate limits:

- authentication endpoints
- search
- exports
- AI-assisted endpoints
- file upload authorization
- invitations
- webhooks
- public job endpoints
- bulk actions

Rate limits may be actor-, IP-, organization-, endpoint-, and cost-based.

AI endpoints should use budget-aware throttling in addition to request counts.

## Bulk Operations

Bulk commands must have explicit limits and async handling when large.

Examples:

```text
POST /v1/applications/bulk-transition
POST /v1/candidates/bulk-export
```

Large exports run in a worker and produce a secure, time-limited download.

Never synchronously generate huge CSV/PDF files inside request handlers.

## Uploads

The API authorizes uploads but should not proxy large files unnecessarily.

Flow:

```text
Client -> API: request upload session
API -> Client: signed upload URL/key
Client -> Object Storage: upload file
Client/API -> Processing: finalize/queue processing
```

Upload authorization binds expected content type, size, owner, purpose, and expiration.

## Cache Semantics

Private tenant responses are not publicly cacheable.

Public job/company pages may use CDN caching with explicit invalidation/versioning.

API caches are optimization only; authorization is always evaluated independently of cached business data.

## API Observability

Every request should support correlation across services/workers.

Capture:

- request ID
- trace ID where available
- actor ID where safe
- organization ID where relevant
- route template
- status
- duration
- rate-limit outcome
- error code
- downstream dependency timings

Never log raw resumes, passwords, tokens, or unnecessary PII.

## API Performance Budgets

Target initial operating budgets:

```text
normal API p50   < 150 ms
normal API p95   < 500 ms
search p95       < 800 ms
```

These are engineering goals, not guarantees. Async work is excluded from interactive request latency.

## Backward Compatibility

Contract changes should prefer additive evolution:

- add optional fields
- add endpoints
- add enum values only when clients tolerate unknowns
- deprecate before removal
- document migration windows

Breaking semantics require explicit versioning.

## External APIs and Webhooks

Future employer/partner integrations should expose scoped, auditable contracts.

Webhook deliveries include:

- event ID
- event type
- timestamp
- version
- tenant/resource identifiers
- signed payload

Consumers must be able to deduplicate using event ID.

## API Quality Gate

Before a new endpoint is accepted, confirm:

1. correct domain ownership
2. tenant/permission model
3. request/response schema
4. validation rules
5. pagination strategy
6. idempotency requirements
7. error codes
8. rate limits
9. observability
10. performance/query plan
11. privacy exposure
12. documentation/tests

An endpoint is not complete merely because it returns the right JSON.
