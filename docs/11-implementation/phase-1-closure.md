# Phase 1 Closure — Identity, Sessions & Organizations

## Status

Phase 1 is **verified complete** for the current product scope.

The implementation establishes the identity, organization tenancy, authorization, audit, transactional-event, and authenticated web-product primitives required by later product domains.

## Verified backend capabilities

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

## Verified web capabilities

- signup and login against cookie-backed API sessions
- protected `/app` entry and authenticated workspace shell
- employer organization onboarding
- email-verification request and token-consume flow
- forgot-password and password-reset flow
- old-password rejection after reset and new-password login
- organization invitation creation, listing, acceptance, and revocation
- invitation continuation through logged-out login/signup flows
- multi-workspace switching
- server-authorized active organization resolution
- permission-aware navigation based on backend-resolved permission bundles
- unauthorized organization-management actions hidden from non-authorized memberships
- account identity and workspace context surface

## Verification evidence

The authoritative local quality gate remains:

```bash
pnpm check
```

The database-backed integration suite exercises real PostgreSQL state and covers:

1. signup creates a durable session, audit event, and outbox event
2. organization creation establishes `ORG_OWNER` membership and events atomically
3. invitation acceptance creates membership, verifies email, and emits events
4. recruiter permission boundaries are enforced
5. cross-organization access is denied
6. session rotation invalidates the replaced session
7. password reset revokes active sessions and accepts the new password
8. audit/outbox writes roll back when the domain transaction fails

Verified repository checks include:

```text
API unit/security tests         passed
Phase 1 DB integration tests    passed
Workspace lint                  passed
Workspace typecheck             passed
Production build                passed
```

Browser verification additionally covered the complete Phase 1 product journeys:

```text
signup → organization onboarding → workspace → logout → login
email verification
password recovery/reset
owner team invitation
logged-out invitation continuation
invitation acceptance
multi-workspace switching
permission-aware owner/recruiter UI
invitation revocation and revoked-token rejection
```

## Security invariants preserved

- raw session, reset, verification, and invitation secrets are not persisted
- browser auth remains cookie-based; session secrets are never placed in `localStorage`
- `localStorage` stores only the preferred active organization id for UX continuity
- `X-Organization-Id` is a stateless workspace selector, not proof of authorization
- backend authorization remains authoritative regardless of client navigation visibility
- UI permissions are rendered from server-resolved permission bundles rather than hard-coded role checks
- invitation acceptance remains bound to the authenticated account email

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

## Handoff

Phase 1 is closed. The next implementation phase is **Phase 2 — Candidate Career Passport**.
