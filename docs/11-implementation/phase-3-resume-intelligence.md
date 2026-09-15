# Phase 3 — Resume Intelligence

## Status

**Phase 3A CLOSED / VERIFIED — 2026-09-15. Phase 3B CLOSED / VERIFIED — 2026-09-15. Phase 3C CLOSED / VERIFIED — 2026-09-15. Phase 3D extraction + OCR fallback is now current.**

Phase 3 turns candidate-owned resume files into reviewed, structured proposals that can safely create a new Career Passport version only after explicit candidate approval.

The phase inherits all Phase 2B identity, privacy, versioning, evidence, and Candidate/Organization isolation guarantees.

## Non-negotiable invariant

> A parsed resume is a proposal. Resume ingestion must never silently mutate the authoritative Career Passport.

```text
Resume upload
  ↓
Private object storage
  ↓
Validation + malware scan
  ↓
Deterministic text extraction
  ↓
OCR fallback when required
  ↓
Schema-constrained parsing
  ↓
Evidence-linked proposal
  ↓
Candidate review
  ↓
Accept / Edit / Ignore
  ↓
New Career Passport version
```

## Phase slices

### Phase 3A — Resume domain and processing contract ✅ VERIFIED

Delivered explicit processing states, Resume/ResumeVersion persistence, candidate ownership, immutable version numbering, failure/retry metadata, audit/outbox foundations, integration coverage, and root quality-gate wiring.

Processing states:

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

### Phase 3B — Private object storage + direct upload ✅ VERIFIED

Delivered provider-neutral S3 storage, local RustFS compatibility, private presigned upload/download authorization, exact upload-completion verification, candidate ownership boundaries, audit/outbox events, and browser-compatible direct-upload CORS bootstrap.

Current HTTP contract:

```text
POST /api/v1/candidate/resumes/upload-authorization
GET  /api/v1/candidate/resumes
GET  /api/v1/candidate/resumes/:resumeId
POST /api/v1/candidate/resumes/upload-complete
POST /api/v1/candidate/resumes/:resumeVersionId/download-authorization
```

Normal resume bytes travel browser → private object storage; the NestJS API does not proxy the upload body.

### Phase 3C — Validation and malware scanning ✅ VERIFIED

Delivered:

- deterministic PDF/DOCX structural validation
- file-size and stored-size enforcement
- encrypted/corrupt/unsupported-file rejection
- SHA-256 generation
- provider-neutral malware-scanner contract
- ClamAV INSTREAM adapter
- isolated BullMQ worker path
- transactional-outbox scheduler dispatch
- bounded retry and terminal failure classification
- interrupted-worker recovery
- guarded duplicate/concurrent state transitions
- malware logical quarantine and signed-download denial
- audit/outbox security events without raw resume content

Runtime acceptance on 2026-09-15 proved both branches through real local services:

```text
Clean browser PDF
→ RustFS HTTP 200
→ UPLOADED + uploadedAt
→ VALIDATING
→ SCANNING + checksumSha256
→ ClamAV CLEAN
→ EXTRACTING
```

```text
Harmless EICAR PDF
→ RustFS HTTP 200
→ UPLOADED + uploadedAt
→ VALIDATING
→ SCANNING + checksumSha256
→ ClamAV Eicar-Signature
→ REJECTED / MALWARE_DETECTED
→ download authorization HTTP 409 / RESUME_SECURITY_QUARANTINED
```

The complete root `pnpm check` was green before runtime closure. Scanner-unavailable bounded retry/final terminalization is covered by automated worker tests.

Detailed closure record: `docs/11-implementation/phase-3c-security-processing.md`.

### Phase 3D — Extraction + OCR fallback ← CURRENT

Deliverables:

- native PDF text extractor
- DOCX extractor
- normalized internal `ResumeDocument` representation
- extraction quality signals
- OCR fallback interface
- page/source mapping
- resource/time limits
- rebuildable derived artifacts
- asynchronous `resume.extract` / `resume.ocr` processing contracts
- idempotent retry/recovery semantics consistent with Phase 3C

OCR is a fallback, not the default path. Clean files enter this slice only from the verified `EXTRACTING` boundary.

### Phase 3E — Structured parsing + evidence mapping

Deliverables:

- explicit ParsedResume schema
- deterministic preprocessing/section detection
- schema-constrained parser adapter
- AI Gateway integration only where useful
- parser/prompt/model/schema version metadata
- field confidence and warnings
- source evidence mapping back to document ranges/pages
- idempotent parse result persistence

The parser must never emit an opaque hiring score.

### Phase 3F — Candidate review workspace

Deliverables:

- Resume destination in Candidate Workspace navigation
- resume history/list
- processing progress
- parsed proposal review
- current Passport vs proposed-value comparison
- Accept / Edit / Ignore controls
- uncertain/sensitive-value confirmation
- candidate-approved creation of a new `RESUME_IMPORT` Career Passport version
- traceability from approved profile version back to ResumeVersion + parse result

## State-machine rules

Happy path:

```text
UPLOADING
→ UPLOADED
→ VALIDATING
→ SCANNING
→ EXTRACTING
→ PARSING
→ READY_FOR_REVIEW
→ APPROVED
```

OCR path:

```text
EXTRACTING
→ OCR_REQUIRED
→ PARSING
```

Failures use bounded `FAILED_RETRYABLE` re-entry or `FAILED_TERMINAL`. `APPROVED`, `REJECTED`, and `FAILED_TERMINAL` are terminal states.

## Data ownership

Resume files and processing metadata belong to the Candidate context.

```text
Session
→ User
→ Candidate where Candidate.userId = Session.userId
→ Resume where Resume.candidateId = Candidate.id
→ ResumeVersion
```

Organization membership must not grant access to private resume files, extracted text, parsed proposals, processing history, or review decisions. Future application submission will intentionally share a selected immutable ResumeVersion through an Application snapshot rather than granting live access to the candidate's Resume workspace.

## Versioning contract

A Resume is the logical candidate-owned artifact. A ResumeVersion represents one immutable uploaded source plus rebuildable processing outputs. Stable processing identity remains:

```text
resumeVersionId + processingPipelineVersion
```

Reprocessing must not create duplicate proposals or duplicate Career Passport versions.

## Upload constraints baseline

- PDF and DOCX
- maximum 10 MiB
- presigned PUT TTL 10 minutes
- private download TTL 5 minutes
- no permanently public URLs
- server-created object key
- exact stored byte-length verification
- browser MIME remains advisory until structural validation

These are configuration/product baselines rather than immutable platform limits.

## Queue and idempotency contract

Logical stages remain independently observable even if early deployments share worker processes:

```text
resume.scan
resume.extract
resume.ocr
resume.parse
resume.finalize
```

Retries must be bounded and idempotent.

## Observability contract

Phase 3 instrumentation must evolve to expose uploads, validation failures, malware rejection rate, extraction success/failure, OCR fallback rate, parse success/failure, stage p50/p95/p99, retries, queue depth, review outcomes, and AI/provider usage/cost where applicable.

Raw resume text and sensitive candidate content must not be emitted into ordinary application logs.

## Phase 3 quality gate

Phase 3 is not closed until all of the following are proven:

1. upload authorization is candidate-owned and direct-to-object-storage
2. storage access remains private and time-limited
3. unsupported/malicious files fail safely
4. processing state transitions are explicit and tested
5. retries are idempotent
6. parser output is schema validated and versioned
7. evidence maps parsed claims to source material where practical
8. Candidate review is mandatory before Career Passport mutation
9. approval creates exactly one new `RESUME_IMPORT` profile version
10. raw resume data remains isolated from organization membership
11. local RustFS path is verified without provider-specific domain coupling
12. queue/backlog and processing duration are observable
13. `pnpm check` plus Phase 3 database/browser verification are green

## Current implementation checkpoint

```text
3A Resume domain + state machine             ✅ CLOSED / VERIFIED
3B Private direct object storage             ✅ CLOSED / VERIFIED
3C Validation + malware scanning             ✅ CLOSED / VERIFIED
3D Extraction + OCR fallback                 ← CURRENT
3E Structured parsing + evidence mapping     pending
3F Candidate review + Passport approval      pending
```

Current Phase 3D boundary:

```text
EXTRACTING
   │
   ├── native PDF extraction
   ├── DOCX extraction
   ├── normalized ResumeDocument + source mapping
   ├── quality assessment
   │      ├── sufficient → PARSING
   │      └── insufficient/scanned → OCR_REQUIRED
   │
   └── OCR fallback → PARSING
```

Phase 3D must preserve the same Candidate ownership and privacy firewall. Extracted text is sensitive derived candidate data and must not be exposed to Organization membership or ordinary logs.
