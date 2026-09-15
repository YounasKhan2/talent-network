# Phase 3E — Structured Parsing and Evidence Mapping

## Status

**PHASE 3E CURRENT — CONTRACT / IMPLEMENTATION BOUNDARY ESTABLISHED 2026-09-15.**

Phase 3E starts only after Phase 3D has produced a verified, candidate-private `ResumeDocument` and advanced the source `ResumeVersion` to `PARSING`. Its responsibility is to convert that normalized document into a schema-validated, evidence-linked **proposal** for later candidate review in Phase 3F.

Phase 3E does **not** mutate the Career Passport, approve resume data, expose private resume content to organizations, calculate hiring scores, or make employment decisions.

## Non-negotiable invariant

> A parsed resume is a proposal. Parsing must never silently mutate the authoritative Career Passport.

The authoritative flow remains:

```text
ResumeVersion (PARSING)
        │
        ▼
verified ResumeDocument / ResumeExtraction
        │
        ▼
deterministic preprocessing + section detection
        │
        ▼
schema-constrained parsing
        │
        ▼
normalization + validation
        │
        ▼
evidence/confidence mapping
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

## Inherited boundaries

Phase 3E inherits and must preserve all verified Phase 3A–3D guarantees:

1. `ResumeVersion` is the immutable source artifact identity.
2. `ResumeExtraction` is rebuildable derived candidate-private data.
3. Raw resume text and parsed proposals remain Candidate data; Organization membership grants no access.
4. Raw resume text, model prompts, model responses, and sensitive parsed values must not enter ordinary logs, audit metadata, or outbox payloads.
5. Stable processing identity is based on versioned inputs and parser configuration.
6. Retries are bounded and idempotent.
7. Phase 3E may only consume completed extraction output for the same candidate-owned `ResumeVersion`.
8. Phase 3E ends at `READY_FOR_REVIEW`; candidate approval belongs to Phase 3F.

## ParsedResume contract

`ParsedResume` is a structured proposal, not a Career Passport snapshot and not an employer-facing candidate profile.

Conceptually:

```text
ParsedResume
├── schemaVersion
├── resumeVersionId
├── sourceExtractionId
├── parser
│   ├── name
│   ├── version
│   ├── promptVersion?       # only when an AI-backed parser is used
│   ├── provider?            # metadata only
│   └── model?               # metadata only
├── identityCandidate?
│   ├── fullName?
│   ├── email?
│   ├── phone?
│   └── evidence[]
├── headline?
├── summary?
├── experiences[]
├── education[]
├── skills[]
├── projects[]
├── certifications[]
├── languages[]
├── links[]
├── locations[]
├── warnings[]
└── confidenceSummary
```

Every field/item that represents a claim should support provenance:

```text
ParsedClaim<T>
├── value
├── normalizedValue?
├── confidence
├── evidence[]
│   ├── resumeExtractionId
│   ├── pageNumber?
│   ├── blockIndex?
│   ├── sourceRange
│   │   ├── start
│   │   └── end
│   └── evidenceKind
└── warnings[]
```

Evidence references must point to verified Phase 3D document ranges. Parser output must not invent source locations.

## Sensitive identity fields

Resume identity/contact fields may be useful to the candidate during review but remain sensitive Candidate data.

Rules:

- store only values actually supported by source evidence
- do not expose them through Organization membership
- do not copy them into generic audit/outbox payloads
- do not use them for hiring scores
- uncertain values should require explicit candidate confirmation in Phase 3F
- an AI provider should receive only the minimum data needed for the parsing capability

## Deterministic preprocessing

Before any optional model-backed semantic extraction, Phase 3E should perform deterministic preprocessing over the normalized `ResumeDocument`.

Responsibilities may include:

- canonical whitespace cleanup already consistent with Phase 3D semantics
- block ordering preservation
- section-heading detection
- section span construction
- basic date/token/link/email/phone candidate detection where deterministic
- document chunking for bounded parser inputs
- source-range preservation across every transformation

Preprocessing must never destroy or fabricate evidence coordinates.

## Section detection

Section detection is a helper, not business truth.

Recognized section classes may include:

```text
SUMMARY
EXPERIENCE
EDUCATION
SKILLS
PROJECTS
CERTIFICATIONS
LANGUAGES
LINKS
OTHER
```

Detection should preserve unknown/custom content rather than silently discarding it. Unsupported sections can remain `OTHER` with source spans for later review.

## Parser adapter boundary

The domain must depend on a stable parser capability, not a provider SDK.

Conceptually:

```text
ResumeParser
├── parse(input)
└── ParsedResumeDraft
```

Input should be versioned and bounded:

```text
ResumeParseInput
├── resumeVersionId
├── resumeExtractionId
├── document/schema version
├── preprocessed sections/chunks
└── processingPipelineVersion
```

The adapter returns structured data only. Provider-specific request/response types must not leak into persistence or business services.

## AI Gateway usage

AI is optional and should be introduced only where semantic interpretation materially improves extraction quality.

If a model-backed parser is used, it must go through the Talent Network AI Gateway contract and preserve:

- capability name (`parseResume`)
- input schema version
- output schema version
- prompt/template version
- provider/model metadata
- timeout/retry policy
- token/cost accounting where available
- privacy/data-minimization policy
- strict structured output validation

A malformed or schema-invalid model response is a failed parse attempt; it must never be silently persisted as valid parsed data.

Ordinary unit/integration tests must use deterministic fakes/fixtures rather than require live model calls.

## No hidden AI authority

The parser may infer structure; it may not invent unsupported professional facts.

Rules:

- unsupported claims are omitted or flagged uncertain
- evidence is mandatory where practical for professional claims
- confidence never substitutes for evidence
- parser/model output remains a proposal
- no parsed field is written directly into CandidateProfileVersion tables
- no opaque candidate/job score is emitted in Phase 3E

## Confidence model

Confidence is parser uncertainty metadata, not a hiring quality score.

Suggested normalized range:

```text
0.0 .. 1.0
```

Confidence must be attributable to a parser policy/version. Thresholds used to mark fields as uncertain must be explicit and testable.

Possible review semantics:

```text
HIGH       >= configured high threshold
MEDIUM     >= configured review threshold
LOW        < configured review threshold
```

Exact thresholds belong to a versioned parser policy and may evolve with evaluation data.

## Evidence validation

Before persistence, every evidence reference must be validated against its source `ResumeDocument`:

- referenced extraction belongs to the same `ResumeVersion`
- extraction is completed
- page number is valid when page semantics exist
- source range start/end are within the referenced normalized text/block bounds
- range ordering is valid (`start <= end`)
- evidence text is derivable from the source range rather than stored redundantly in events

Invalid evidence makes the parse result invalid; it must not be downgraded to a warning and accepted silently.

## Persistence

Phase 3E introduces a candidate-owned, versioned derived parse result.

Conceptually:

```text
ResumeVersion 1 ── * ResumeParseResult

ResumeParseResult
├── id
├── resumeVersionId
├── sourceExtractionId
├── processingPipelineVersion
├── parserName
├── parserVersion
├── schemaVersion
├── promptVersion?
├── provider?
├── model?
├── status
├── parsedJson / parsedObjectKey
├── evidenceMapJson / evidenceObjectKey
├── confidenceSummary
├── warnings
├── inputChecksumSha256
├── failureCode?
├── startedAt
├── completedAt?
└── createdAt / updatedAt
```

Stable execution identity should prevent duplicate parse records for the same versioned input/configuration.

Recommended identity inputs:

```text
resumeVersionId
+ sourceExtractionId
+ processingPipelineVersion
+ parserName
+ parserVersion
+ schemaVersion
+ promptVersion (when applicable)
```

Parser/provider metadata belongs to the derived result so reprocessing remains reproducible.

## Queue and event contracts

Logical queue:

```text
resume.parse
```

Phase 3D hands off through the persisted `PARSING` state plus a metadata-only durable event/job contract.

Recommended durable flow:

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
ResumeParseResult
        │
        ├── success → candidate.resume.parse_completed
        │             ResumeVersion → READY_FOR_REVIEW
        │
        └── failure → retryable / terminal processing state
```

Outbox payloads should contain identifiers, versions, safe status metadata, and failure codes only—not raw text or parsed sensitive fields.

The exact event naming must remain consistent with existing event architecture and implementation conventions; do not duplicate completion events when a job is redelivered.

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

Terminal parser/contract failure:

```text
PARSING
→ FAILED_TERMINAL
```

Phase 3E must not transition to `APPROVED`; only Phase 3F candidate review can do that.

## Failure classification

Retryable examples:

- temporary private object/storage read failure
- transient parser service timeout
- AI provider 429/5xx
- temporary gateway/provider unavailable

Terminal examples:

- completed extraction missing/invalid for the source version
- evidence references outside source bounds
- parser output repeatedly fails schema validation after bounded policy
- unsupported parser configuration
- permanent provider/configuration error
- derived document exceeds explicit parse limits

Failure records and logs must be sanitized.

## Privacy

Phase 3E data is Candidate-private by default.

Organization membership must not grant access to:

- parsed resume JSON
- evidence maps
- contact details parsed from resumes
- parser warnings
- confidence metadata tied to private resume content
- model prompt/response content
- parse/review history

Future Applications explicitly cross the privacy boundary using immutable submitted versions/snapshots; Phase 3E must not create an implicit organization read path.

## Logging and audit

Allowed ordinary operational metadata includes:

- resumeVersionId
- sourceExtractionId
- parseResultId
- parser/schema/prompt versions
- stage/status
- attempt number
- safe failure code
- duration
- token/cost metadata where safe

Prohibited by default:

- raw resume text
- raw OCR text
- parsed email/phone/address
- full parsed JSON
- model prompts containing resume content
- raw model responses

## Observability

Track at minimum:

- parse attempts/success/failure
- `PARSING → READY_FOR_REVIEW` latency
- retry rate
- schema-validation failure rate
- evidence-validation failure rate
- parser/provider distribution
- AI token/cost metrics when applicable
- queue depth and oldest-job age
- confidence distribution only in privacy-safe aggregate form

## Evaluation seam

Before claiming production parsing quality, establish a versioned evaluation fixture set covering at least:

- conventional native-text resumes
- scanned/OCR resumes
- multi-page experience-heavy resumes
- sparse/fresh-graduate resumes
- reordered/non-standard sections
- missing dates
- overlapping employment dates
- custom sections
- links/contact fields
- malformed/ambiguous content

Evaluate schema validity, field accuracy, evidence attribution, hallucination/unsupported-claim rate, latency, and cost where AI is used.

Evaluation fixtures must not depend on real private user resumes unless an explicit privacy-safe test policy exists.

## Phase 3E implementation slices

### 3E-A — Contracts + persistence ← CURRENT

Deliver:

- `ParsedResume` / `ParsedClaim` / evidence contracts
- parser adapter interface
- parser/evidence policy versions
- `ResumeParseResult` persistence model + migration
- stable execution identity
- candidate-scoped repository/service boundary
- integration tests for ownership, source identity, idempotency, cascade/rebuild semantics

Closure gate:

- contracts compile
- migration applies cleanly
- integration tests prove candidate ownership and duplicate protection
- no Career Passport mutation path exists
- root `pnpm check` green

### 3E-B — Deterministic preprocessing + section detection

Deliver:

- source-preserving section detection
- bounded chunk construction
- deterministic candidate extraction helpers where appropriate
- fixtures for standard and non-standard resume layouts
- explicit unknown/custom-section preservation

Closure gate:

- no source-range drift
- page/block identity preserved
- deterministic fixtures green

### 3E-C — Schema-constrained parser + AI Gateway seam

Deliver:

- provider-neutral parser implementation boundary
- deterministic fake parser for tests
- strict ParsedResume schema validation
- AI Gateway capability seam where semantic parsing is needed
- prompt/model/schema version metadata
- bounded retry/failure mapping
- privacy-safe invocation metadata

Closure gate:

- provider SDK types do not leak into domain/persistence
- invalid structured output fails closed
- ordinary tests require no live AI provider

### 3E-D — Evidence, confidence + proposal validation

Deliver:

- evidence-range validator
- confidence policy/version
- parsed-claim provenance checks
- warnings/uncertainty semantics
- proposal validation prior to persistence/readiness

Closure gate:

- unsupported claims cannot be marked fully grounded
- invalid evidence cannot reach `READY_FOR_REVIEW`
- evidence maps back to real Phase 3D document ranges

### 3E-E — Runtime closure

Deliver/verify:

- scheduler `resume.parse` dispatch
- worker parse consumption
- real persisted `ResumeParseResult`
- metadata-only completion/failure events
- `PARSING → READY_FOR_REVIEW`
- duplicate-delivery idempotency
- retry behavior
- privacy/log inspection
- root `pnpm check`

Runtime acceptance must use the real backend/database/outbox/queue/worker path. A live external AI call is **not** required for Phase 3E runtime closure if the production architecture supports a deterministic/local parser mode or validated test adapter; provider-specific live acceptance belongs to the AI Gateway/provider capability gate when that provider is introduced.

## Phase 3E closure matrix

Phase 3E is not `VERIFIED` until all are proven:

1. completed Phase 3D extraction is the only accepted source
2. ParsedResume output is schema validated
3. parse result persistence is candidate-owned and versioned
4. retries/redelivery are idempotent
5. professional claims carry valid source evidence where practical
6. invalid evidence fails closed
7. parser/provider/prompt/schema versions are attributable
8. raw/private resume content is absent from normal logs/audit/outbox
9. no Organization-membership read path exists
10. no Career Passport mutation occurs
11. success advances exactly to `READY_FOR_REVIEW`
12. root `pnpm check` is green

## Phase 3F handoff

Phase 3F may consume the verified `ResumeParseResult` to render the candidate review workspace.

Phase 3F must preserve these distinctions:

```text
ResumeParseResult = parser proposal
Career Passport   = candidate-approved authority
```

Accept/Edit/Ignore decisions and creation of a `RESUME_IMPORT` CandidateProfileVersion belong to Phase 3F, not this phase.

## Non-goals

Phase 3E does not:

- create or mutate Career Passport versions
- expose private resume/parser data to recruiters
- rank candidates
- calculate match/screening scores
- auto-reject candidates
- infer protected or unsupported personal attributes
- approve parsed claims on behalf of the candidate
- implement the Resume review UI
