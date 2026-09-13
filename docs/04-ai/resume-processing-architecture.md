# Resume Processing Architecture

## Purpose

Resume ingestion converts untrusted uploaded documents into reviewed, structured candidate data without blocking interactive APIs or silently mutating authoritative career information.

The subsystem must be secure, retryable, idempotent, observable, cost-aware, and independently scalable.

## Core Invariant

> Uploaded documents are untrusted inputs. Parsed output is a proposal until the candidate reviews and approves it.

## High-Level Flow

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

### DOCX

Parse document XML and text structure through a sandboxed/document-safe library.

### OCR fallback

OCR is used only when useful text cannot be extracted reliably.

OCR should be a separately scalable worker pool because it is CPU/latency intensive.

## Extraction Quality Signals

Capture signals such as:

- extracted character count
- text density by page
- percentage of pages with useful text
- detected encoding issues
- OCR confidence
- suspiciously repetitive text
- extraction errors

These determine whether parsing should proceed, retry with another extractor, or require manual intervention.

## Canonical Intermediate Representation

Do not feed arbitrary extractor output directly into every downstream feature.

Normalize extraction into a stable internal document representation, for example:

```text
ResumeDocument
- documentId
- resumeVersionId
- plainText
- sections[]
- pageMap[]
- sourceRanges[]
- extractionMethod
- extractionVersion
- qualitySignals
```

This representation allows parser/model providers to change later without reworking storage and review flows.

## Structured Resume Schema

Parser output should conform to an explicit schema.

Conceptually:

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
```

Each extracted item may include:

```text
value
normalizedValue
confidence
sourceEvidence[]
parserVersion
```

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
```

The product can then highlight what the parser actually found rather than asking the user to trust invisible AI reasoning.

## AI Parsing Strategy

Prefer staged parsing:

1. deterministic preprocessing
2. section detection
3. schema-guided extraction
4. normalization
5. validation
6. targeted AI recovery only where useful

Avoid repeatedly sending the full raw file to expensive models.

If an LLM is used, require schema-constrained output and validate it before persistence.

## Candidate Review

Parsed data is stored as a review proposal.

The candidate can:

- accept
- edit
- reject
- resolve conflicts

Only accepted information becomes part of the authoritative Career Passport version.

Sensitive or uncertain fields may require explicit confirmation before acceptance.

## Versioning

At minimum preserve:

- original resume version
- extraction version
- parser version
- prompt/model version where AI is involved
- candidate review decision
- resulting profile version

This enables reproducibility and future reprocessing.

## Idempotency

Processing jobs use a stable identity, for example:

```text
resumeVersionId + processingPipelineVersion
```

Retries must not generate duplicate profile proposals or duplicate object records.

## Queue Design

Logical queues:

```text
resume.scan
resume.extract
resume.ocr
resume.parse
resume.normalize
resume.finalize
```

Early deployment may run several queues in one worker service, but concurrency and observability remain distinct.

## Backpressure

Large import bursts should not overload OCR or model providers.

Use per-stage concurrency limits.

Example:

```text
scan workers      50
extract workers   50
OCR workers       10
AI parse workers  20
```

Exact values come from load tests and provider quotas.

## Retry Policy

Classify failures:

### Retryable

- temporary object storage failure
- transient parser service timeout
- model provider 429/5xx
- OCR worker crash

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
- tenant/user authorization
- access audit logging where appropriate
- retention/deletion workflows
- data minimization in logs

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

They are rebuildable projections and should reference the source resume version.

## Duplicate Detection

Use checksums to detect exact duplicate uploads.

Potential later heuristics may flag near-duplicate resumes or inconsistent candidate data, but never automatically accuse a user of fraud.

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
- parse success rate
- review approval/edit rate
- stage latency p50/p95/p99
- retry rate
- queue depth
- provider errors
- cost per processed resume

## Scalability Model

Resume processing scales independently from the transactional API.

Growth path:

```text
Stage 1: shared worker deployment
Stage 2: separate resume worker deployment
Stage 3: separate OCR / parser pools
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

## Quality Gate

A resume-processing change is incomplete until it defines:

1. accepted input constraints
2. state transitions
3. retry/idempotency behavior
4. evidence mapping
5. candidate-review impact
6. privacy/retention impact
7. observability
8. cost impact
9. versioning/reprocessing behavior
10. failure/recovery path
