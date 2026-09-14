# Phase 2B — Career Passport Version History

## Status

**Code complete / local quality gate and browser verification pending.**

This slice exposes immutable Career Passport snapshots to the candidate who owns them. It does not create a restore workflow, employer-access path, or mutable historical state.

## Product behavior

Route:

```text
/career/history
```

The candidate can:

- see newest Passport versions first
- identify the current version
- inspect when a version was approved/created
- see whether the version came from manual editing, system initialization, or a future resume import
- open any historical version as a complete read-only snapshot
- inspect canonical sections and custom sections exactly as they existed in that version
- load older history in bounded pages

Historical snapshots are deliberately read-only. Returning to the Career editor is the only way to create a new professional state.

## API

```text
GET /api/v1/candidate/passport/versions?before=<versionNumber>&limit=<1..50>
GET /api/v1/candidate/passport/versions/:versionNumber
```

The list endpoint defaults to 30 records and caps requests at 50. Pagination uses the monotonically increasing candidate-local `versionNumber` as a stable descending cursor:

```text
first page: versions 90 ... 61
nextCursor: 61

next request:
?before=61&limit=30

second page: versions 60 ... 31
```

This avoids unbounded history reads as a Career Passport accumulates many edits.

## Ownership boundary

Version-history authorization is candidate-owned only:

```text
Authenticated session
      ↓
User.id
      ↓
Candidate where Candidate.userId = User.id
      ↓
CandidateProfileVersion where candidateId = Candidate.id
```

The browser never supplies a `candidateId` for authorization. An organization membership, organization context, recruiter permission, or `X-Organization-Id` value cannot grant access to a candidate's private version history.

A version number is only meaningful inside the authenticated candidate's own history. Asking for a version number that exists for another candidate returns `404` rather than crossing the privacy boundary.

## Snapshot contract

A historical version includes the complete version-owned professional state:

- overview and availability
- compensation preferences
- work-mode and employment-type preferences
- experience
- education
- skills
- projects
- certifications
- languages
- professional links
- location preferences
- custom sections and nested custom entries

Candidate privacy/discoverability settings are intentionally absent because they are identity-level settings, not professional profile-version state.

## UX principles

The history surface is an inspection workspace, not a diff-heavy developer tool.

- warm editorial Career visual language
- compact chronological timeline
- current-version marker
- complete snapshot on selection
- no edit controls inside history
- no restore button in this slice
- external evidence links remain usable
- responsive timeline on narrow screens

The Career context bar links to Version History so the feature remains discoverable without adding another dense sidebar hierarchy.

## Integration coverage

The Phase 2B history integration suite verifies:

1. versions are returned newest-first
2. current version is marked correctly
3. pagination returns a stable `nextCursor`
4. the next page excludes already-returned versions
5. a historical snapshot retains its exact old professional state
6. later edits do not mutate historical snapshots
7. current snapshot exposes the latest ordered data
8. one candidate cannot fetch another candidate's version by guessing its version number

The root `pnpm check` continues to run this through the Phase 2B integration gate.

## Browser verification checklist

Before marking this slice verified:

1. open `/career/history` from the Career workspace
2. current version appears first and is marked `Current`
3. selecting an older version renders without changing the current Passport
4. confirm old Experience / Education / Skills / Projects data reflects that historical version
5. inspect at least one historical custom section
6. confirm no edit/remove/reorder controls exist in history
7. use an evidence link from a historical project/link/custom entry
8. if more than 30 versions exist, load the next page and verify ordering/no duplicates
9. return to `/career`, make a professional edit, reopen history, and verify a new current version appears
10. change only privacy settings and verify professional version count does not increase
11. verify narrow/mobile layout remains usable

After this slice is verified, Phase 2B can move to verification/evidence indicators and final closure audit.
