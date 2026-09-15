# Phase 3E — Structured Parsing and Evidence Mapping

## Status

**PHASE 3E CLOSED / VERIFIED — 2026-09-16.**

Phase 3E consumes only a completed, candidate-private Phase 3D `ResumeExtraction` for the same `ResumeVersion` and converts it into a schema-validated, evidence-linked **proposal** for candidate review in Phase 3F.

Phase 3E does **not** mutate the Career Passport, approve resume data, expose private resume content to organizations, calculate hiring scores, or make employment decisions.

## Non-negotiable invariant

> A parsed resume is a proposal. Parsing must never silently mutate the authoritative Career Passport.

Verified flow:

```text
ResumeVersion (PARSING)
        │
        ▼
completed ResumeExtraction / ResumeDocument
        │
        ▼
deterministic preprocessing + section detection
        │
        ▼
schema-constrained parser
        │
        ▼
evidence + confidence validation
        │
        ▼
ResumeParseResult
        │
        ▼
READY_FOR_REVIEW
        │
        ▼
Phase 3F candidate review
```

## Verified implementation slices

```text
3E-A Contracts + persistence                  ✅ VERIFIED
3E-B Deterministic preprocessing + sections   ✅ VERIFIED
3E-C Schema parser + AI Gateway seam          ✅ VERIFIED
3E-D Evidence/confidence validation            ✅ VERIFIED
3E-E Runtime closure                           ✅ VERIFIED
```

## 3E-A — Contracts + persistence ✅ VERIFIED

Delivered:

- `ParsedResume`, `ParsedClaim<T>`, evidence and parser metadata contracts
- provider-neutral `ResumeParser.parse(input)` boundary
- parser/evidence/schema/prompt version identities
- candidate-private `ResumeParseResult` persistence
- stable parse execution identity
- candidate-owned source-resolution boundary
- ownership, source-binding, idempotency, rebuild and cascade integration coverage

Stable execution identity:

```text
resumeVersionId
+ sourceExtractionId
+ processingPipelineVersion
+ parserName
+ parserVersion
+ schemaVersion
+ promptVersion
```

`ResumeParseResult` remains derived/rebuildable state. It is not an authoritative Career Passport snapshot.

## 3E-B — Deterministic preprocessing + section detection ✅ VERIFIED

Delivered:

- source-preserving preprocessing policy `resume-preprocess-v1`
- section classes:
  - `SUMMARY`
  - `EXPERIENCE`
  - `EDUCATION`
  - `SKILLS`
  - `PROJECTS`
  - `CERTIFICATIONS`
  - `LANGUAGES`
  - `LINKS`
  - `OTHER`
- unknown/custom uppercase sections preserved as `OTHER`
- bounded chunk construction
- deterministic email/phone/URL candidate detection
- exact page/block/source-range propagation
- truthful page-less DOCX semantics (`pageNumber: null`)
- fail-closed behavior when an oversized fragment cannot be split without source-range drift

Preprocessing does not create business truth. It preserves source structure for later parser/evidence use.

## 3E-C — Schema parser + AI Gateway seam ✅ VERIFIED

Delivered:

- strict runtime validation for `ParsedResume`
- deterministic parser adapter for tests
- `GatewayResumeParser` capability seam
- provider-neutral AI Gateway request/response contracts
- trusted execution metadata binding
- prompt/schema/parser/provider/model attribution
- privacy-safe AI invocation metadata
- retryability classification for transient provider failures
- fail-closed invalid structured-output handling

No provider SDK types leak into persistence or business services.

A live AI provider is intentionally **not** a Phase 3E dependency. The architecture allows model-backed semantic parsing later through the AI Gateway without changing the core parsing/persistence contract.

## 3E-D — Evidence + confidence validation ✅ VERIFIED

Every parsed claim carries:

```text
ParsedClaim<T>
├── value
├── normalizedValue?
├── confidence
├── evidence[]
│   ├── resumeExtractionId
│   ├── pageNumber
│   ├── blockIndex?
│   ├── sourceRange
│   └── evidenceKind
└── warnings[]
```

Validation proves:

- evidence references the expected `ResumeExtraction`
- source ranges are ordered and bounded
- page/block/source coordinates map to real preprocessing fragments
- confidence values remain within `0..1`
- low-confidence claims require explicit review warnings
- aggregate confidence summary agrees with actual claims
- invalid evidence fails closed before `READY_FOR_REVIEW`

Confidence is uncertainty metadata for candidate review. It is not a hiring score.

## 3E-E — Runtime closure ✅ VERIFIED

Delivered:

- logical `resume.parse` queue contract
- stable BullMQ job identity
- scheduler dispatch from metadata-only Phase 3D completion events
- worker parse consumption
- deterministic runtime parser for source-provable contact/link claims
- persisted `ResumeParseResult`
- bounded retry/terminal behavior
- duplicate-delivery idempotency
- metadata-only completion/failure events
- exact `PARSING → READY_FOR_REVIEW` transition
- zero Career Passport mutation

Durable runtime path:

```text
candidate.resume.extraction_completed
or candidate.resume.ocr_completed
        │
        ▼
scheduler validates aggregate/version identity
        │
        ▼
resume.parse
        │
        ▼
worker loads candidate-private ResumeExtraction
        │
        ▼
preprocess + parse + validate proposal
        │
        ▼
ResumeParseResult COMPLETED
        │
        ▼
candidate.resume.parse_completed
        │
        ▼
READY_FOR_REVIEW
```

## Runtime acceptance evidence

Real local runtime acceptance passed on **2026-09-16** using PostgreSQL, Redis/BullMQ, the scheduler and worker processes.

Observed state path:

```text
PARSING
→ READY_FOR_REVIEW
```

The acceptance harness also proved:

1. two equivalent source completion events converged on **one** `ResumeParseResult`
2. parsed private values were absent from audit/outbox metadata
3. no `CandidateProfileVersion` was created during parsing
4. the runtime fixture cleaned up after success

This is the required real-system proof for the Phase 3E runtime boundary; ordinary unit tests alone were not used as closure evidence.

## Runtime parser policy at closure

The runtime currently uses a conservative deterministic parser where claims can be directly proven from source coordinates, including contact/link candidates.

It deliberately does **not** pretend to understand ambiguous experience, education or other semantic structure without a parser capable of grounding those claims.

Target architecture remains:

```text
deterministic extraction first
        │
        ├── source-provable claim → parse locally
        │
        └── semantic ambiguity → optional AI Gateway capability
```

A future live AI provider must pass its own capability/privacy/evaluation gate before being considered production-ready. Browser clients must never call an AI provider directly and the original unrestricted upload is not sent directly from the browser to AI.

## Privacy boundary

Phase 3E data is Candidate-private by default.

Organization membership grants no read path to:

- parsed resume JSON
- evidence maps
- parsed contact details
- parser warnings
- private confidence metadata
- model prompts/responses
- parse/review history

Ordinary audit/outbox/log metadata may contain identifiers, versions, parser metadata, stage/status and safe failure codes, but not raw resume text or sensitive parsed values.

## State transitions

Success:

```text
PARSING
→ READY_FOR_REVIEW
```

Retryable failure:

```text
PARSING
→ FAILED_RETRYABLE
→ bounded re-entry to PARSING
```

Terminal failure:

```text
PARSING
→ FAILED_TERMINAL
```

Phase 3E never transitions to `APPROVED`.

## Closure matrix

Phase 3E closure proves:

1. completed Phase 3D extraction is the accepted source
2. `ParsedResume` output is schema validated
3. parse persistence is candidate-owned and versioned
4. duplicate delivery is idempotent
5. claims use validated source evidence where produced
6. invalid evidence fails closed
7. parser/prompt/schema/provider metadata is attributable
8. private resume values stay out of normal audit/outbox metadata
9. no Organization-membership read path is introduced
10. no Career Passport mutation occurs
11. success advances exactly to `READY_FOR_REVIEW`
12. focused parser/scheduler/worker tests are green
13. root repository quality gate was green on the verified implementation before runtime acceptance
14. real scheduler/Redis/BullMQ/worker acceptance passed

## Phase 3F handoff

Phase 3F now owns the candidate-facing review workflow.

It must preserve:

```text
ResumeParseResult = parser proposal
Career Passport   = candidate-approved authority
```

Phase 3F responsibilities:

- Resume workspace navigation
- upload/history/status surfaces
- parsed proposal review
- current Passport vs proposed-value comparison
- Accept / Edit / Ignore decisions
- explicit confirmation for uncertain/sensitive values
- creation of a normal `RESUME_IMPORT` CandidateProfileVersion only after candidate approval
- traceability back to the source ResumeVersion and parse result
- browser acceptance for upload → processing → review → approval

## Non-goals

Phase 3E does not:

- create or mutate Career Passport versions
- expose private resume/parser data to recruiters
- rank candidates
- calculate matching/screening scores
- auto-reject candidates
- infer protected or unsupported personal attributes
- approve parsed claims on behalf of the candidate
- implement the Resume review UI
