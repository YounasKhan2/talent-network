# Phase 2 — Candidate Career Passport

## Status

**Phase 2B CLOSED / VERIFIED — 2026-09-15. Phase 3 Resume Intelligence is now active.**

Phase 2 turns authentication identity into a candidate-owned, reusable professional identity that later resume parsing, matching, applications, assessments, and Career Copilot workflows can reference without mutating historical submissions.

Phase 2A identity/workspace hardening is closed, and Phase 2B has passed the complete repository quality gate plus browser acceptance verification while preserving its context, authorization, consent, and Candidate/Organization privacy-firewall invariants.

## Implemented foundation

The Career Passport includes:

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
- candidate-owned read-only profile version history
- bounded version-history pagination
- derived evidence indicators for candidate claims and supporting material
- profile completeness guidance without hiring-rank gamification
- PostgreSQL integration coverage for version preservation and history ownership
- reusable Candidate Workspace navigation shared by Passport, Evidence, and Version History
- responsive Career/Organization context switching without changing authorization semantics

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

Every supported Passport section participates in this copy-on-write rule. Replacing projects, for example, preserves experience, education, skills, certifications, languages, links, locations, custom sections, and overview fields in the new version.

The web interaction layer deliberately uses the same replacement endpoints for add, edit, remove, and reorder operations. There are no mutable per-row Career Passport writes. This keeps one versioning contract across every section.

Historical versions are exposed through a candidate-only read model. The history UI is read-only and does not provide restore or mutation actions.

### Scale/evolution note

The immutable copy-on-write model is the correct Phase 2 foundation. Before large-scale usage, the implementation should add safeguards such as canonical no-op detection, grouped/draft saves where useful, debounced reorder persistence, version-reason metadata, and retention rules only for unreferenced transient versions. Application-referenced versions must never be deleted or rewritten.

## Evidence semantics

Phase 2B introduces explicit evidence language without pretending that a URL is independent verification.

```text
DECLARED
Candidate-provided claim with no independent supporting artifact attached.

SUPPORTED
Candidate-provided claim with a repository, project URL, credential, professional link,
or custom-entry URL attached.

VERIFIED
Reserved for future independent verification workflows. Phase 2B does not manufacture
verified status from profile data alone.
```

Evidence indicators are derived from the immutable Career Passport snapshot rather than persisted as a second source of truth. This prevents evidence state from drifting away from the underlying project, certification, link, skill, experience, or custom-entry data.

Current derivation rules:

- skills and experience are `DECLARED`
- projects become `SUPPORTED` when a repository URL or project URL exists
- certifications become `SUPPORTED` when a credential URL or credential ID exists
- professional links are supporting evidence
- custom-section entries become `SUPPORTED` when an evidence URL exists
- missing supporting material is not negative evidence
- `VERIFIED` remains zero until a real verification workflow exists

Matching must preserve these levels separately. `SUPPORTED` must not be silently upgraded to `VERIFIED`, and missing evidence must not automatically reduce a candidate's eligibility score.

Evidence inspection itself is read-only and does not create a new professional profile version.

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

Custom sections, version history, and evidence indicators remain inside the same Candidate privacy boundary. Organization membership never grants access to them.

Version-history authorization always resolves from the authenticated `User` to that user's own `Candidate`, then scopes every version query by `candidateId`. The client never supplies a Candidate ID.

## API surface

```text
POST  /api/v1/candidate/passport/initialize
GET   /api/v1/candidate/passport
GET   /api/v1/candidate/passport/versions?before=<versionNumber>&limit=<1..50>
GET   /api/v1/candidate/passport/versions/:versionNumber
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

Version-history list reads are bounded: default page size 30, maximum 50. Descending pagination uses candidate-local `versionNumber` as the stable cursor.

The Phase 2B Evidence workspace derives indicators from `GET /candidate/passport`; no evidence write endpoint was introduced in this phase.

## Validation boundaries

Phase 2B validation includes:

- bounded collection sizes
- bounded field lengths
- valid URLs for portfolio/repository/credential/professional/custom-entry links
- ISO date-time inputs at the HTTP boundary
- ISO alpha-2-shaped country codes for location preferences
- case-insensitive duplicate rejection for languages
- normalized duplicate rejection for skills
- at most 20 custom sections per Passport version
- at most 50 entries per custom section
- server-controlled Candidate ownership and version numbers
- positive-integer history cursors and version numbers
- history page size capped at 50

The original structured sections required no additional Phase 2B migration because their tables were included in the initial Phase 2 schema. Custom sections added dedicated version-owned tables. Version history and evidence indicators required no additional schema migration because they read the existing immutable profile-version model.

## Integration coverage

The Phase 2 PostgreSQL suites verify:

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
11. location preferences preserve the complete prior Passport state
12. custom sections and nested custom entries are versioned
13. custom-section reorder/edit replacement preserves canonical profile sections
14. privacy changes do not create a professional-profile version
15. Candidate creation/update continues to emit durable events
16. history lists versions newest-first
17. history pagination produces a stable next cursor without overlap
18. historical snapshots remain unchanged after later edits
19. current snapshot exposes the latest ordered state
20. one candidate cannot fetch another candidate's version by guessing a version number

The final repository quality gate passed formatting, lint, typecheck, unit tests, Phase 1 integration, Phase 2 integration, Phase 2A privacy-firewall integration, Phase 2B editor/version-history integration, and production builds. Final browser acceptance also passed.

## Candidate web surface

Verified routes:

```text
/career
/career/evidence
/career/history
```

The visual model remains calm, editorial, section-based, and document-like rather than an employer dashboard.

The global Candidate Workspace navigation is product-level navigation:

```text
Career Passport
Evidence
Version history
```

The existing Passport rail remains local section navigation:

```text
Overview
Experience
Education
Skills
Projects
Certifications
Languages
Links
Locations
Custom
Privacy
```

The Career editor surfaces professional overview, experience, education, skills, projects, certifications, languages, links, location preferences, custom sections, and privacy/discoverability controls.

Experience, education, skills, projects, certifications, languages, links, and location preferences expose explicit edit/remove/move-up/move-down controls. Custom sections additionally support create, rename, delete, section reorder, nested entry add/edit/remove, and nested entry reorder.

The Version History workspace provides newest-first history, current-version marking, source labels, complete read-only snapshot inspection, canonical/custom-section rendering, external evidence links, bounded pagination, and responsive layout.

The Evidence workspace provides declared/supported/verified counts, per-signal level and subject/source type, plain-language derivation explanations, supporting links, an explicit non-verification warning, filtering, and the current Passport version reference.

As defense in depth, the Career page does not contain an implicit `initializeCandidatePassport()` fallback. If Candidate state is absent, it routes back to explicit Career onboarding. The Phase 2A layout guard remains the primary context boundary.

Profile completeness remains guidance rather than a hiring score and must never be exposed as an employer ranking signal.

## Phase 2B closure

```text
Backend structured-section expansion             ✅ verified
Detailed Experience / Education / Project forms  ✅ verified
Edit / remove / reorder UX                       ✅ verified
Custom sections + nested entries                 ✅ verified
Database migration + integration coverage        ✅ verified
Browser verification of Career editor            ✅ verified
Profile version history + read-only inspection   ✅ verified
Evidence indicators                              ✅ verified
Candidate Workspace navigation shell              ✅ verified
Career ↔ Organization context switching          ✅ verified
Responsive/browser acceptance                    ✅ verified
Repository quality gate                          ✅ verified
Formal Phase 2B closure                          ✅ CLOSED / VERIFIED
```

Detailed implementation notes:

- [`phase-2b-version-history.md`](./phase-2b-version-history.md)
- [`phase-2b-evidence-indicators.md`](./phase-2b-evidence-indicators.md)
- [`phase-2b-closure-audit.md`](./phase-2b-closure-audit.md)

## Phase 3 handoff

Phase 3 — Resume Intelligence is now active.

```text
Resume upload
→ object storage
→ malware scan
→ native text extraction
→ OCR fallback when required
→ structured parsing
→ proposed Career Passport changes
→ candidate review
→ Accept / Edit / Ignore
```

Do not collapse Career Passport into a resume editor. The Passport remains structured professional source data; resumes are presentation artifacts and application-specific evidence. Resume parsing must never silently mutate the Passport.
