# Phase 3F — Candidate Resume Review Workspace

Status: 🟡 **IN PROGRESS — 3F-A verified; 3F-B/3F-C/3F-D implemented and awaiting final local/runtime gate**

## Purpose

Phase 3F is the candidate-owned bridge between rebuildable resume intelligence and the authoritative Career Passport. A parsed resume is always a proposal until the candidate explicitly decides what to do with it.

## Candidate flow

```text
Career → Resumes
  → upload PDF/DOCX to private object storage
  → validation / malware scan
  → native extraction or OCR
  → structured parse proposal
  → READY_FOR_REVIEW
  → compare proposal with current Career Passport
  → Accept / Edit / Ignore
  → optional RESUME_IMPORT Passport version
```

## Privacy boundary

- Resume files, extraction text, parse proposals, review edits, and review decisions are candidate-private.
- Organization workspaces do not receive the private resume artifact or review proposal through Phase 3F APIs.
- Audit/outbox payloads contain identifiers and decision metadata only; they must never contain raw resume text, candidate email/phone values, or the full parsed proposal.
- Contact claims shown in the review workspace are evidence only. Resume approval does not silently change account/login identity.

## Review semantics

### Accept

Accept merges grounded parsed career data into a new approved `CandidateProfileVersion` with `source = RESUME_IMPORT`.

- Existing Passport data is preserved unless the proposal contains an explicit replacement for the supported scalar field.
- Parsed collection values are merged with current Passport collections using stable human-readable dedupe keys so a partial parser proposal cannot silently erase existing candidate state.
- `ResumeVersion.processingState` becomes `APPROVED`.
- `ResumeVersion.approvedProfileVersionId` links the source resume version to the applied Passport version.

### Edit

Edit lets the candidate override reviewable scalar values before approval. The candidate edits are persisted with the review record and the resulting Passport version still uses `RESUME_IMPORT` source provenance.

The initial 3F review editor exposes headline and summary overrides. Structured section editing continues to use the normal Career Passport editor after import; richer per-claim editing can be added without changing the review persistence contract.

### Ignore

Ignore records an explicit candidate decision and moves the resume version to `REJECTED` without creating or changing a Career Passport version.

## Persistence

`ResumeReview` records one human decision per `ResumeVersion` / `ResumeParseResult` pair:

- `resumeVersionId` — unique review identity
- `parseResultId` — unique completed parse proposal identity
- `baseProfileVersionId` — Passport version the candidate reviewed against
- `decision` — `PENDING | ACCEPTED | EDITED | IGNORED`
- `candidateEdits` — private bounded edit payload
- `appliedProfileVersionId` — nullable; populated only when a Passport version is created
- decision/create/update timestamps

`ResumeVersion.approvedProfileVersionId` remains the durable source → authoritative-version provenance link.

## Concurrency and idempotency

- Cross-candidate resume lookup fails closed.
- A finalized review cannot be changed to a different final decision.
- Repeating the same completed decision returns the existing result instead of creating another Passport version.
- Approval checks the candidate's current Passport version before applying; if the Passport changed while the review was open, the request fails with `CAREER_PASSPORT_CHANGED_DURING_REVIEW` rather than overwriting newer candidate state.
- Unique review/profile version constraints provide a second persistence-level guard against duplicate application.

## API

### Read review

`GET /api/v1/candidate/resumes/:resumeId/review`

Returns candidate-owned resume metadata, current processing state, completed parse proposal, current Passport snapshot, and review state. It does not return private object keys or raw extraction text.

### Decide review

`POST /api/v1/candidate/resumes/:resumeId/review/decision`

CSRF-protected candidate-only mutation.

Accept:

```json
{ "decision": "ACCEPT" }
```

Edit:

```json
{
  "decision": "EDIT",
  "edits": {
    "headline": "Reviewed headline",
    "summary": "Reviewed summary"
  }
}
```

Ignore:

```json
{ "decision": "IGNORE" }
```

## UI

`/career/resumes` contains:

- private PDF/DOCX upload
- processing progress
- candidate resume list
- proposal confidence / evidence summary
- private contact claims
- current Passport vs proposal comparison
- detected structured-section counts
- Accept / Edit / Ignore actions
- final decision state and applied Passport provenance

## Quality gate

Before closing Phase 3F:

1. Prisma migration deploy succeeds.
2. API/database/web lint and typecheck are green.
3. Phase 3 integration verifies ownership/privacy plus Ignore, Accept, Edit and duplicate idempotency.
4. Full `pnpm check` is green.
5. Browser acceptance proves upload → processing → review → decision.
6. Accept/Edit create exactly one `RESUME_IMPORT` Passport version and update version history.
7. Ignore creates no Passport version.
8. Raw/private resume content is absent from audit/outbox data.
9. Long-running API remains stable after the PostgreSQL pool hardening.

Do not mark 3F verified until these runtime/browser requirements have been observed.
