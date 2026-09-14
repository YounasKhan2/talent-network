# Phase 1 Closure — Identity, Sessions & Organizations

## Status

Phase 1 backend foundation is **verified complete** for the current product scope.

The implementation establishes the identity, organization tenancy, authorization, audit, and transactional-event primitives required by later product domains.

## Verified capabilities

- email/password signup and login
- opaque HttpOnly session cookies
- readable CSRF cookie + double-submit validation
- session rotation
- logout and session revocation
- email verification with hashed one-time tokens
- password reset with hashed one-time tokens
- password reset revokes existing sessions
- authentication rate limiting backed by Redis
- fail-closed rate limiting when Redis is unavailable
- organization creation with automatic `ORG_OWNER` membership
- role-to-permission bundles
- server-side organization authorization
- stateless active organization context using `X-Organization-Id`
- organization invitations with one-time tokens
- invitation acceptance bound to authenticated email
- organization membership activation
- append-oriented audit events
- transactional outbox events
- audit/outbox rollback with the parent transaction
- tenant isolation at authorization boundaries

## Verification evidence

The local quality gate now includes database-backed Phase 1 integration tests:

```bash
pnpm check
```

The verified integration suite exercises real PostgreSQL state and covers:

1. signup creates a durable session, audit event, and outbox event
2. organization creation establishes `ORG_OWNER` membership and events atomically
3. invitation acceptance creates membership, verifies email, and emits events
4. recruiter permission boundaries are enforced
5. cross-organization access is denied
6. session rotation invalidates the replaced session
7. password reset revokes active sessions and accepts the new password
8. audit/outbox writes roll back when the domain transaction fails

The most recent verified run completed with:

```text
API unit/security tests        17 passed / 0 failed
Phase 1 DB integration tests    8 passed / 0 failed
Workspace lint                 passed
Workspace typecheck            passed
Production build               passed
```

## Intentional non-goals

Phase 1 does not attempt to solve later product domains prematurely. The following belong to later phases:

- candidate career passport
- resume ingestion and object storage
- jobs and job versioning
- applications
- matching and screening
- recruiter applicant workspace
- interviews and scorecards
- billing

## Web handoff

The backend foundation is now being connected to the web product through:

- credentialed browser API client
- CSRF-aware mutation requests
- signup/login screens
- authenticated workspace entry
- organization onboarding
- permission-aware workspace shell foundations

The next domain phase after this product-shell work is **Phase 2 — Candidate Career Passport**.
