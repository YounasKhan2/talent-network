# Phase 2 — Candidate Career Passport

## Status

**Phase 2B in implementation.**

Phase 2 turns authentication identity into a candidate-owned, reusable professional identity that later resume parsing, matching, applications, assessments, and Career Copilot workflows can reference without mutating historical submissions.

Phase 2A identity/workspace hardening is closed. All Phase 2B work must preserve its context, authorization, consent, and Candidate/Organization privacy-firewall invariants.

## Implemented foundation

The Career Passport currently includes:

- one `Candidate` domain identity per authenticated user
- private-by-default visibility and hidden-by-default discoverability
- locale and timezone settings on candidate identity
- immutable-style `CandidateProfileVersion` snapshots
- explicit current-profile pointer on `Candidate`
- copy-on-write profile updates
- versioned experience
- versioned education
- versioned skills
- versioned projects
- versioned certifications
- versioned languages
- versioned professional links
- versioned location preferences
- compensation, availability, work-mode, and employment-type preferences
- candidate audit events and transactional outbox events
- authenticated Career Passport API endpoints
- candidate Career Passport web workspace for the initial sections
- profile completeness guidance without gamified hiring scores
- PostgreSQL integration coverage for version preservation

## Versioning invariant

A Career Passport edit must not rewrite the profile snapshot that may later be attached to an application.

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

Every currently supported Passport section participates in this copy-on-write rule. Replacing projects, for example, must preserve experience, education, skills, certifications, languages, links, locations, and overview fields in the new version.

## Privacy invariant

Candidate visibility is separate from organization authorization.

Initial defaults:

```text
visibility      = PRIVATE
discoverability = HIDDEN
```

Changing Candidate privacy settings must never grant an employer permission to access data it is otherwise not authorized to access.

Canonical cross-context policy:

- [`../06-security/candidate-organization-privacy-firewall.md`](../06-security/candidate-organization-privacy-firewall.md)

## API surface

```text
POST  /api/v1/candidate/passport/initialize
GET   /api/v1/candidate/passport
PATCH /api/v1/candidate/passport/overview
PUT   /api/v1/candidate/passport/skills
PUT   /api/v1/candidate/passport/experience
PUT   /api/v1/candidate/passport/education
PUT   /api/v1/candidate/passport/projects
PUT   /api/v1/candidate/passport/certifications
PUT   /api/v1/candidate/passport/languages
PUT   /api/v1/candidate/passport/links
PUT   /api/v1/candidate/passport/locations
PATCH /api/v1/candidate/settings
```

All mutations use the existing session + CSRF boundary. Candidate ownership is derived from the authenticated session user; the client never supplies a Candidate ID to authorize a write.

The replacement endpoints intentionally accept ordered arrays. Array order becomes persisted `sortOrder`, which gives the later edit/reorder UX one consistent backend contract rather than introducing per-row ordering mutations prematurely.

## Phase 2B backend expansion slice

The first Phase 2B implementation slice activates the schema foundations that already existed for projects, certifications, languages, links, and location preferences.

Validation boundaries include:

- bounded collection sizes
- bounded field lengths
- valid URLs for portfolio/repository/credential/professional links
- ISO date-time inputs at the HTTP boundary
- ISO alpha-2-shaped country codes for location preferences
- case-insensitive duplicate rejection for languages
- existing normalized duplicate rejection for skills
- server-controlled Candidate ownership and version numbers

No new database migration is required for this slice because these entities were deliberately included in the initial Phase 2 schema.

## Integration coverage

The Phase 2 PostgreSQL suite now covers:

1. Candidate initialization is private by default
2. first approved profile version is created atomically
3. overview edits create a new version
4. previous versions become `SUPERSEDED`
5. skill replacement preserves unrelated profile data
6. experience and education remain versioned
7. projects are versioned
8. certifications are versioned while preserving projects
9. languages are versioned
10. professional links are versioned while preserving other sections
11. location preferences are versioned while preserving the complete prior Passport state
12. privacy changes do not create a professional-profile version
13. Candidate creation/update continues to emit durable events

The repository quality gate must be run locally before this slice is marked verified.

## Candidate web surface

Current route:

```text
/career
```

The visual model remains calm, editorial, section-based, and document-like rather than an employer dashboard.

Already surfaced in the current UI:

- professional overview
- experience
- education
- skills
- privacy & discoverability

Next web slice activates:

- projects
- certifications
- languages
- links / GitHub / LinkedIn / portfolio
- location preferences
- richer employment/compensation preferences
- proper edit/remove/reorder interactions instead of append-only helpers
- profile completeness based on meaningful professional evidence rather than arbitrary percentage gaming

## Remaining Phase 2B sequence

```text
Backend domain/API expansion                     ✅ code complete / gate pending
        ↓
Web API contracts + Career sections              ← next
        ↓
Edit / remove / reorder UX
        ↓
Profile version history + read-only inspection
        ↓
Verification/evidence indicators
        ↓
Resume-import handoff into Phase 3
```

Do not collapse Career Passport into a resume editor. The Passport remains structured professional source data; resumes are later presentation artifacts and application-specific evidence.
