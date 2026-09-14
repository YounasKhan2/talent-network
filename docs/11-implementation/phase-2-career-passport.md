# Phase 2 — Candidate Career Passport

## Status

**Phase 2B in implementation — record-management + custom-section slice is code complete / local gate pending.**

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
- versioned custom sections with nested custom entries
- compensation, availability, work-mode, and employment-type preferences
- candidate audit events and transactional outbox events
- authenticated Career Passport API endpoints
- Candidate Career Passport web workspace for every active structured section
- edit / remove / reorder behavior backed by ordered replacement semantics
- profile completeness guidance without hiring-rank gamification
- PostgreSQL integration coverage for version preservation

## Canonical sections vs custom sections

Canonical sections remain first-class structured hiring signals:

```text
Experience
Education
Skills
Projects
Certifications
Languages
Professional Links
Location Preferences
```

Custom sections provide candidate-controlled flexibility for information such as awards, publications, volunteering, research, speaking, patents, open-source work, communities, or other career evidence.

Custom sections do **not** automatically become hard hiring requirements. They are supporting evidence and future semantic context. Matching must keep canonical structured evidence, inferred evidence, and custom-section evidence distinguishable and explainable.

The custom-section model is intentionally structured rather than arbitrary JSON:

```text
CandidateCustomSection
├── title
├── description?
├── sortOrder
└── items[]
    ├── title
    ├── subtitle?
    ├── description?
    ├── startDate?
    ├── endDate?
    ├── url?
    └── sortOrder
```

Both custom sections and nested entries are ordered and versioned.

## Versioning invariant

A Career Passport edit must not rewrite the profile snapshot that may later be attached to an application.

```text
Candidate.currentProfileVersionId
        ↓
Approved profile version N
        ↓ edit / remove / reorder one section
Clone unchanged sections + replace edited section
        ↓
Approved profile version N+1
        ↓
Version N becomes SUPERSEDED
Candidate.currentProfileVersionId → N+1
```

`SUPERSEDED` does not mean deleted. Historical versions remain available for future application snapshot references and explainability.

Every supported Passport section participates in this copy-on-write rule. Replacing projects, for example, must preserve experience, education, skills, certifications, languages, links, locations, custom sections, and overview fields in the new version.

The web interaction layer deliberately uses the same replacement endpoints for add, edit, remove, and reorder operations. There are no mutable per-row Career Passport writes. This keeps one versioning contract across every section.

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

Custom sections remain inside the same Candidate privacy boundary. Organization membership never grants access to them.

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
PUT   /api/v1/candidate/passport/custom-sections
PATCH /api/v1/candidate/settings
```

All mutations use the existing session + CSRF boundary. Candidate ownership is derived from the authenticated session user; the client never supplies a Candidate ID to authorize a write.

The replacement endpoints intentionally accept ordered arrays. Array order becomes persisted `sortOrder`, so add/edit/remove/reorder all share one consistent backend contract.

## Phase 2B validation boundaries

Validation boundaries include:

- bounded collection sizes
- bounded field lengths
- valid URLs for portfolio/repository/credential/professional/custom-entry links
- ISO date-time inputs at the HTTP boundary
- ISO alpha-2-shaped country codes for location preferences
- case-insensitive duplicate rejection for languages
- existing normalized duplicate rejection for skills
- at most 20 custom sections per Passport version
- at most 50 entries per custom section
- server-controlled Candidate ownership and version numbers

The original Phase 2B structured sections required no migration because their tables were included in the initial Phase 2 schema. Custom sections add a dedicated Phase 2B migration because they introduce two new version-owned tables.

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
12. custom sections and nested custom entries are versioned
13. custom-section reorder/edit replacement preserves canonical profile sections
14. privacy changes do not create a professional-profile version
15. Candidate creation/update continues to emit durable events

The repository quality gate must be run locally before this slice is marked verified.

## Candidate web surface

Current route:

```text
/career
```

The visual model remains calm, editorial, section-based, and document-like rather than an employer dashboard.

The UI surfaces:

- professional overview
- experience
- education
- skills
- projects
- certifications
- languages
- links / GitHub / LinkedIn / portfolio
- location preferences
- custom sections
- privacy & discoverability

Experience, education, skills, projects, certifications, languages, links, and location preferences now use explicit record controls for:

- edit
- remove
- move up
- move down

Custom sections support:

- create section
- rename section
- delete section
- reorder sections
- add nested entry
- edit nested entry
- remove nested entry
- reorder nested entries

The same full-replacement API semantics are used for every operation, so each professional edit creates a new approved Passport version and supersedes the previous version.

As defense in depth, the Career page does not contain an implicit `initializeCandidatePassport()` fallback. If Candidate state is absent, it routes back to explicit Career onboarding. The Phase 2A layout guard remains the primary context boundary.

Profile completeness remains guidance rather than a hiring score and must never be exposed as an employer ranking signal.

## Remaining Phase 2B sequence

```text
Backend structured-section expansion             ✅ verified before this slice
Detailed Experience / Education / Project forms  ✅ verified before this slice
Edit / remove / reorder UX                       ✅ code complete / gate pending
Custom sections + nested entries                 ✅ code complete / gate pending
Database migration + integration coverage        ✅ code complete / gate pending
        ↓
Browser verification of complete Career workflow
        ↓
Profile version history + read-only inspection
        ↓
Verification/evidence indicators
        ↓
Formal Phase 2B closure
        ↓
Resume-import handoff into Phase 3
```

Do not collapse Career Passport into a resume editor. The Passport remains structured professional source data; resumes are later presentation artifacts and application-specific evidence.
