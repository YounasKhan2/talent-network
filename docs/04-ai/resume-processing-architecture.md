# Resume Processing Architecture

## Purpose

Resume ingestion converts untrusted uploaded documents into reviewed, structured candidate data without blocking interactive APIs or silently mutating authoritative career information.

The subsystem must be secure, retryable, idempotent, observable, cost-aware, independently scalable, and lossless with respect to meaningful source information.

## Core Invariants

> Uploaded documents are untrusted inputs. Parsed output is a proposal until the candidate reviews and approves it.

> Meaningful document content must never silently disappear. If the system cannot map a source section or record semantically, it must preserve and account for it explicitly.

## High-Level Flow

Current verified baseline:

```text
Client
  |
  | request upload authorization
  v
API
  |
  | signed upload URL
  v
Object Storage
  |
  v
UPLOAD_COMPLETED
  |
  v
Validation / Malware Scan
  |
  +--> rejected -> quarantine / failure state
  |
  v
Document Classification
  |
  +--> native PDF / DOCX -> text extraction
  |
  +--> scanned document -> OCR fallback
  |
  v
Normalization
  |
  v
Resume Parser
  |
  v
Schema Validation
  |
  v
Confidence + Evidence Mapping
  |
  v
Review Workspace
  |
  v
Candidate Approval
  |
  v
New Career Passport Version
```

Phase 3G target flow:

```text
Secure source artifact
      ↓
Format-specific extraction
      ↓
DocumentGraph V1
      ↓
Structural sections + records
      ↓
Career ontology classification
      ↓
Hybrid typed extraction
      ↓
Source Ledger accounting
      ↓
Record reconciliation
      ↓
Quality + confidence + source coverage
      ↓
Candidate Review V2
      ↓
Career Passport
```

The detailed Phase 3G implementation contract lives in [`../11-implementation/phase-3g-resume-intelligence-v2.md`](../11-implementation/phase-3g-resume-intelligence-v2.md).

## State Model

Resume processing should use explicit states rather than implicit booleans.

Suggested states:

```text
UPLOADING
UPLOADED
VALIDATING
SCANNING
EXTRACTING
OCR_REQUIRED
PARSING
READY_FOR_REVIEW
APPROVED
REJECTED
FAILED_RETRYABLE
FAILED_TERMINAL
```

Transitions must be recorded so operators can diagnose failures.

Phase 3G may introduce internal derived-artifact stages for graph/layout/semantic work when that improves observability or scaling, but those stages must not weaken the stable ResumeVersion business-state contract.

## Upload Contract

The API issues a short-lived signed upload authorization containing constraints such as:

- candidate/user ownership
- upload purpose
- maximum size
- allowed MIME/container types
- storage key
- expiration

The browser uploads directly to object storage where possible.

## File Validation

Validate before parsing:

- file size
- MIME type
- extension consistency
- magic bytes/signature
- archive/container validity where relevant
- encryption/password protection
- page count limits
- parser bomb/decompression risks

Do not trust client-supplied MIME type alone.

## Malware Scanning

All uploaded files enter an untrusted zone until malware scanning succeeds.

Rules:

- scanners run in isolated workers
- original file access remains restricted
- failed/suspicious files are quarantined
- scan result and engine version are recorded
- downstream extraction is blocked until scan success

The system should support replacing the malware scanner without changing resume-domain behavior.

## Extraction Strategy

Use deterministic extraction first.

### Native PDF

Extract embedded text and structural metadata where reliable.

Phase 3G expands the required structural output to include, where available:

- page identity
- text blocks/spans
- geometry
- reading order
- font/style signals useful for headings
- annotations/links
- tables or table regions
- column relationships

### DOCX

Parse document XML and structure through a sandboxed/document-safe library.

Preserve:

- paragraphs
- headings/styles
- lists
- tables
- rows/cells
- hyperlinks
- source order

DOCX must not fabricate physical page identity.

### OCR fallback

OCR is used only when useful native text cannot be extracted reliably.

OCR should be a separately scalable worker pool because it is CPU/latency intensive.

Where supported, OCR output should preserve page, word/line geometry, confidence, and reading-order signals rather than only returning plain text.

## Extraction Quality Signals

Capture signals such as:

- extracted character count
- text density by page
- percentage of pages with useful text
- detected encoding issues
- OCR confidence
- suspiciously repetitive text
- extraction errors
- page truncation
- geometry availability
- table/list preservation quality

These determine whether parsing should proceed, retry with another extractor, or require manual intervention.

## Canonical Intermediate Representations

### ResumeDocument baseline

`ResumeDocument` remains the stable extracted artifact used by current Phase 3D/3E behavior.

Conceptually:

```text
ResumeDocument
- documentId
- resumeVersionId
- plainText
- pages[]
- blocks[]
- sourceRanges[]
- nativePdf/nativeDocx metadata where available
- extractionMethod
- extractionVersion
- qualitySignals
```

### DocumentGraph V1

Phase 3G adds a richer derived representation above `ResumeDocument` rather than replacing historical extraction rows.

Conceptually:

```text
DocumentGraph
- schemaVersion
- resumeVersionId
- sourceExtractionId
- nodes[]
- pageIds[]
- hierarchy
- readingOrder
- geometry
- table/list/link relationships
- extraction warnings
```

Typical node kinds:

```text
DOCUMENT
PAGE
REGION
TITLE
HEADING
PARAGRAPH
LIST
LIST_ITEM
TABLE
TABLE_ROW
TABLE_CELL
KEY_VALUE
LINK
IMAGE
OTHER
```

Required properties:

- stable node identity
- source provenance
- truthful page semantics
- hierarchy
- reading order
- geometry where available
- explicit tables/lists/links
- rebuildability from immutable source + versioned extractor configuration

Downstream semantic extractors must consume structural records/graph context rather than assuming one flattened text ordering.

## Structural Understanding

Phase 3G separates document structure from career semantics.

Structural understanding answers questions such as:

```text
Is this block a heading?
Which nodes belong under this heading?
Does this table contain five logical rows?
Which text belongs to the same record?
Are these columns independent reading streams?
Which date is visually aligned with which title?
```

It does not yet decide that a row is a `CandidateCertification` or that a record is `WorkExperience`.

Derived structural artifacts include explicit sections and record boundaries with confidence and source-node membership.

## Career Ontology

Semantic classification uses the shared Career Passport taxonomy.

Default core concepts:

```text
CONTACT_INFORMATION
PROFESSIONAL_SUMMARY
WORK_EXPERIENCE
EDUCATION
SKILLS
CERTIFICATIONS
AWARDS
```

Recognized extensions include Projects, Portfolio, Languages, Interests, Links, Publications, Volunteering, Patents, Research, Courses, Memberships/Affiliations, Open Source, Speaking, Training, Hackathons, Teaching, Community Leadership, and future registry entries.

Unknown/custom content remains valid data. It is preserved with original heading, source structure, classification status, and evidence rather than being discarded or forcibly assigned to the wrong schema.

## Structured Resume Schema

Parser output should conform to an explicit schema.

Current typed baseline includes:

```text
ParsedResume
- identityCandidate
- headline
- summary
- experiences[]
- education[]
- skills[]
- projects[]
- certifications[]
- languages[]
- links[]
- locations[]
- additionalSections[]
```

Each extracted item may include:

```text
value
normalizedValue
confidence
sourceEvidence[]
parserVersion
```

Phase 3G evolves the parser around structural records and Source Ledger accounting while keeping historical parser versions reproducible.

## Hybrid Semantic Extraction

Prefer staged parsing:

1. deterministic high-certainty extraction
2. layout-aware section/record detection
3. career ontology classification
4. schema-guided typed extraction
5. normalization
6. evidence reconciliation
7. targeted semantic/model recovery only for unresolved records
8. candidate review

Avoid repeatedly sending the full raw file to expensive models.

If an LLM or managed document provider is used, require schema-constrained output and validate it before persistence.

A provider must never become the source of truth; Talent Network owns the graph, ontology, evidence, reconciliation, review, and Career Passport contracts.

## Source Ledger

Phase 3G introduces a Source Ledger as the losslessness contract.

Every meaningful section, record, or source node must be accounted for as one of:

```text
UNPROCESSED
CLASSIFIED
MAPPED
PARTIALLY_MAPPED
UNMAPPED
PRIVATE_ONLY
INTENTIONALLY_IGNORED
```

A proposal cannot report complete source coverage while meaningful source content remains `UNPROCESSED`.

Intentional ignore must have an explicit reason code, for example duplicate running footer, decorative separator, page number, or non-career boilerplate.

## Record Reconciliation

For record-oriented sections, the system must compare what exists in the source with what was structured.

At minimum track:

```text
sourceRecordCount
mappedRecordCount
partiallyMappedRecordCount
unmappedRecordCount
```

This avoids misleading states such as `Experience detected` when one of four jobs was silently omitted.

Record reconciliation applies at minimum to Experience, Education, Projects, Certifications, Awards, Publications, Patents, Volunteering, Memberships/Affiliations, Courses, Research records, and References. Skills/Languages may use item-level reconciliation where appropriate.

## Evidence Mapping

A parsed claim should be traceable back to source evidence where practical.

Example:

```text
Experience
Company: Preesoft
Role: Full Stack Developer
Start: 2025-09
End: 2026-08

Evidence:
page 1
source range 842-934
source node ids [...]
```

The product can then highlight what the parser actually found rather than asking the user to trust invisible AI reasoning.

## Quality, Confidence, and Coverage

Do not expose one universal confidence number as proof of complete understanding.

Phase 3G separates:

### Document extraction quality

Did the system successfully read the source artifact?

### Structural confidence

How confident are section boundaries, record boundaries, reading order, columns, and tables?

### Claim confidence

How confident is the system in the semantic meaning of claims it actually emitted?

### Source coverage

How much meaningful source information has been accounted for?

Target review summary:

```text
Document quality        98%
Structural confidence   93%
Claim confidence        94%
Source coverage         89%
Needs review             6 records
```

Percentages must have explicit, testable derivations.

## Diagnostics

Candidate-private diagnostics may include:

```text
UNMAPPED_SECTION
UNMAPPED_RECORD
PARTIALLY_MAPPED_RECORD
READING_ORDER_UNCERTAIN
MULTI_COLUMN_LAYOUT_UNCERTAIN
TABLE_STRUCTURE_UNCERTAIN
SECTION_BOUNDARY_UNCERTAIN
RECORD_BOUNDARY_UNCERTAIN
OCR_LOW_QUALITY
TRUNCATED_INPUT
DUPLICATE_RECORD
CONFLICTING_VALUES
DATE_RANGE_AMBIGUOUS
CONTACT_CONFLICT
PRIVATE_THIRD_PARTY_DATA
```

Raw resume content must not be copied into normal logs merely to report these diagnostics.

## Candidate Review

Parsed data is stored as a review proposal.

The candidate can:

- accept
- edit
- reject/ignore
- resolve conflicts

Only accepted information becomes part of the authoritative Career Passport version.

Phase 3G-H expands review to surface:

- mapped vs unmapped counts
- additional/custom sections
- unresolved records
- source coverage
- claim confidence
- document/structural quality
- source evidence previews where practical
- unknown-section classification
- private-only References treatment

Sensitive or uncertain fields may require explicit confirmation before acceptance.

## References and Third-Party PII

References may contain third-party names, employers, emails, and phone numbers.

Default treatment:

```text
extract privately        yes
preserve evidence        yes
candidate review         yes
auto-import to Passport  no
organization visibility  no
```

A future explicit privacy design is required before such data can become reusable recruiter-visible Passport content.

## Versioning

At minimum preserve:

- original resume version
- extraction version
- DocumentGraph version
- structural-understanding version
- parser version
- ontology/taxonomy version where relevant
- prompt/model/provider version where AI is involved
- candidate review decision
- resulting profile version

This enables reproducibility and future reprocessing.

New derived graph/ledger/parser versions create new derived results; historical results are not rewritten in place.

## Idempotency

Processing jobs use a stable identity, for example:

```text
resumeVersionId + processingPipelineVersion + derivedArtifactVersion
```

Retries must not generate duplicate profile proposals, duplicate graph/ledger artifacts for the same execution identity, or duplicate Career Passport versions.

## Queue Design

Logical queues:

```text
resume.scan
resume.extract
resume.ocr
resume.parse
resume.finalize
```

Phase 3G may split graph/layout/semantic processing into distinct logical queues if load, isolation, or observability measurements justify it.

Early deployment may run several queues in one worker service, but concurrency and observability remain distinct.

## Backpressure

Large import bursts should not overload OCR or model providers.

Use per-stage concurrency limits.

Example only:

```text
scan workers      50
extract workers   50
OCR workers       10
semantic workers  20
```

Exact values come from load tests and provider quotas rather than assumptions.

Expensive semantic/model work should be targeted to unresolved records rather than repeatedly processing the entire document.

## Retry Policy

Classify failures:

### Retryable

- temporary object storage failure
- transient parser service timeout
- model provider 429/5xx
- OCR worker crash
- temporary graph/semantic worker failure

### Terminal

- unsupported format
- encrypted document without password support
- malware detected
- corrupted unrecoverable file
- size/page limits exceeded

Retryable stages use bounded exponential backoff with jitter.

## Dead-Letter Handling

After retry exhaustion, jobs enter a dead-letter/failure state with:

- stage
- failure code
- attempt count
- correlation IDs
- safe diagnostic metadata

Operators can retry after correcting provider/system issues.

## Privacy and Retention

Resume files contain sensitive personal information.

Controls must include:

- signed/time-limited file access
- encryption in transit
- restricted object access
- candidate authorization
- access audit logging where appropriate
- retention/deletion workflows
- data minimization in logs
- Candidate/Organization privacy firewall for all graph/ledger/model-derived artifacts

Raw resume content must never be emitted into ordinary application logs.

## Storage Layout

Object keys should be opaque and non-guessable.

Conceptual layout:

```text
resumes/{candidateId}/{resumeVersionId}/original
resumes/{candidateId}/{resumeVersionId}/derived/...
```

Do not expose raw bucket keys directly as permanent public URLs.

## Derived Artifacts

Derived artifacts may include:

- normalized text
- preview rendering
- page thumbnails
- OCR text
- extraction metadata
- DocumentGraph
- structural sections/records
- Source Ledger
- diagnostics
- parse proposals

They are rebuildable projections and should reference the immutable source resume version and the versions/configuration that generated them.

## Duplicate Detection

Use checksums to detect exact duplicate uploads.

Potential later heuristics may flag near-duplicate resumes or inconsistent candidate data, but never automatically accuse a user of fraud.

## Benchmark and Evaluation

Phase 3G requires a permanent Talent Resume Benchmark rather than relying on ad hoc manual examples.

Dataset strategy begins with deliberately diverse privacy-safe fixtures and grows toward production-representative coverage.

Ground truth should include:

- sections
- section boundaries
- records
- field values where practical
- source evidence
- private-only regions
- intentionally ignored regions

Metrics include:

```text
section precision / recall / F1
record precision / recall / F1
field precision / recall / F1
exact-value accuracy
normalized-value accuracy
evidence-grounding accuracy
record-boundary accuracy
reading-order accuracy
unknown-section preservation rate
meaningful-source accounting rate
privacy leakage rate
```

Architectural targets:

```text
unknown-section preservation  100%
meaningful-source accounting   100%
cross-candidate privacy violations 0
organization exposure of private References 0
```

Semantic extraction accuracy improves iteratively and is protected by regression thresholds as the benchmark grows.

## Provider / Tool Adoption Gate

Before introducing a new OCR, layout, ML, LLM, embedding, parsing, database, queue, or infrastructure dependency, research and document:

- capability required
- official integration guidance
- TypeScript/NestJS/worker fit
- privacy/security
- licensing
- cost
- maintenance
- deployment/resource needs
- concurrency/scaling
- failure modes
- version stability
- lock-in/exit strategy
- testability
- benchmark performance

All providers must sit behind Talent Network-owned abstractions.

## Performance Targets

Interactive upload authorization should remain fast.

Processing is asynchronous and should expose progress.

Product target examples:

```text
native text resume: seconds-to-low-minutes
OCR resume: longer asynchronous path
bulk imports: queued with visible progress
```

Exact SLAs should be measured in production rather than guessed.

## Observability

Track:

- uploads started/completed
- malware rejection rate
- extraction success rate
- OCR fallback rate
- DocumentGraph build success/failure
- structural detection latency
- parse success rate
- mapped/partial/unmapped rates
- source coverage distribution
- diagnostic code frequency
- model fallback rate
- candidate correction rate
- review approval/edit rate
- stage latency p50/p95/p99
- retry rate
- queue depth
- provider errors
- cost per processed resume
- benchmark regression trends

## Scalability Model

Resume processing scales independently from the transactional API.

Growth path:

```text
Stage 1: shared worker deployment
Stage 2: separate resume worker deployment
Stage 3: separate OCR / layout / semantic pools
Stage 4: provider-specific or regional processing where justified
```

No API rewrite should be required during these transitions.

## Security Boundary

File parsing libraries and OCR/document tooling should be treated as a higher-risk execution surface.

Prefer:

- isolated containers/processes
- resource limits
- no unnecessary network access
- temporary filesystem cleanup
- CPU/memory/time limits
- patched parser dependencies

Any external semantic/document provider must pass a data-handling/privacy review before receiving resume content.

## Quality Gate

A resume-processing change is incomplete until it defines:

1. accepted input constraints
2. state transitions
3. retry/idempotency behavior
4. evidence mapping
5. source-accounting impact
6. candidate-review impact
7. privacy/retention impact
8. observability
9. cost impact
10. versioning/reprocessing behavior
11. failure/recovery path
12. benchmark impact
13. diagnostics/coverage behavior

Phase 3G closure additionally requires the detailed Definition of Done in [`../11-implementation/phase-3g-resume-intelligence-v2.md`](../11-implementation/phase-3g-resume-intelligence-v2.md).
