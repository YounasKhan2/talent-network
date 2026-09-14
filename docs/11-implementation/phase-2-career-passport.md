# Phase 2 — Candidate Career Passport

## Status

**In implementation.**

Phase 2 turns authentication identity into a candidate-owned, reusable professional identity that later resume parsing, matching, applications, assessments, and Career Copilot workflows can reference without mutating historical submissions.

## Implemented foundation

The first Phase 2 slice introduces:

- one `Candidate` domain identity per authenticated user
- private-by-default visibility and hidden-by-default discoverability
- locale and timezone settings on candidate identity
- immutable-style `CandidateProfileVersion` snapshots
- explicit current-profile pointer on `Candidate`
- copy-on-write profile updates
- versioned experience
- versioned education
- versioned skills
- schema foundations for projects, certifications, languages, links, and location preferences
- compensation, availability, work-mode, and employment-type preferences
- candidate audit events and transactional outbox events
- authenticated Career Passport API endpoints
- candidate Career Passport web workspace
- profile completeness guidance without gamified hiring scores
- Phase 2 PostgreSQL integration coverage

## Versioning invariant

A Career Passport edit must not rewrite the profile snapshot that may later be attached to an application.

Current behavior:

```text
Candidate.currentProfileVersionId
        ↓
Approved profile version N
        ↓ edit one section
Clone unchanged sections + replace edited section
        ↓
Approved profile version N+1
        ↓
Version N becomes SUPERSEDED
Candidate.currentProfileVersionId → N+1
```

`SUPERSEDED` does not mean deleted. Historical versions remain available for future application snapshot references and explainability.

## Privacy invariant

Candidate visibility is separate from organization authorization.

Initial defaults:

```text
visibility      = PRIVATE
discoverability = HIDDEN
```

Changing a candidate privacy setting must never grant an employer permission to access data it is otherwise not authorized to access.

## API surface

```text
POST  /api/v1/candidate/passport/initialize
GET   /api/v1/candidate/passport
PATCH /api/v1/candidate/passport/overview
PUT   /api/v1/candidate/passport/skills
PUT   /api/v1/candidate/passport/experience
PUT   /api/v1/candidate/passport/education
PATCH /api/v1/candidate/settings
```

All mutations use the existing session + CSRF boundary. Candidate ownership is derived from the authenticated session user; the client never supplies a candidate ID to authorize a write.

## Candidate web surface

Initial route:

```text
/career
```

The visual model follows the candidate UX specification: calm, editorial, section-based, and document-like rather than an employer dashboard.

Initial sections:

- professional overview
- experience
- education
- skills
- privacy & discoverability

The database already contains versioned foundations for the remaining Passport sections so later UI/API slices do not require redesigning the profile ownership model.

## Quality gate addition

The root `pnpm check` now includes a Phase 2 PostgreSQL integration suite after the Phase 1 suite.

Phase 2 integration coverage is intended to prove:

1. candidate initialization is private by default
2. first approved profile version is created atomically
3. an overview edit creates a new version
4. the previous version becomes `SUPERSEDED`
5. section replacement preserves unrelated profile data
6. experience and education remain versioned
7. privacy changes do not create a new professional profile version
8. candidate creation/update emits expected durable events

Do not mark this Phase 2 slice verified until the repository quality gate and browser flow have actually been executed locally.

## Next slice

After this foundation is verified:

1. projects
2. certifications
3. languages
4. links / GitHub / LinkedIn / portfolio
5. location preferences
6. richer compensation and employment preferences
7. section edit/remove/reorder UX
8. profile history/read-only version inspection
9. verification indicators
10. resume-import handoff into Phase 3
