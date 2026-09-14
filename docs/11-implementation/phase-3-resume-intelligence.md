# Phase 3 — Resume Intelligence

## Status

**Phase 3A CLOSED / VERIFIED — 2026-09-15. Phase 3B CLOSED / VERIFIED — 2026-09-15. Phase 3C validation and malware scanning is now current.**

Phase 3 turns candidate-owned resume files into reviewed, structured proposals that can safely create a new Career Passport version only after explicit candidate approval.

The phase inherits all Phase 2B identity, privacy, versioning, evidence, and Candidate/Organization isolation guarantees.

## Non-negotiable invariant

> A parsed resume is a proposal. Resume ingestion must never silently mutate the authoritative Career Passport.

The accepted flow is:

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

Delivered:

- explicit processing-state machine
- Resume / ResumeVersion persistence model
- candidate ownership boundaries
- immutable version numbering
- storage-key ownership metadata
- failure/retry metadata
- resume-version history read model foundation
- database integration coverage
- audit/outbox record for upload preparation
- root quality-gate integration

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

The state machine prevents impossible jumps and post-terminal mutation.

Verification evidence:

- full `pnpm check` passed locally on 2026-09-15
- Phase 3 database integration suite passed as part of the root quality gate
- production build passed
- repository returned to a clean `main` working tree after a formatting-only transition-table change
- final formatting-only commit: `1084bcd style(api): format resume processing transitions`

### Phase 3B — Private object storage + direct upload ✅ VERIFIED

Delivered:

- provider-neutral S3 adapter using the AWS S3 SDK
- local RustFS compatibility through generic S3 environment variables
- development/test bucket bootstrap with production fail-closed behavior
- short-lived presigned PUT upload authorization
- server-controlled opaque object keys from the Phase 3A resume domain
- PDF/DOCX MIME allowlist at upload authorization
- 10 MiB initial upload-size ceiling at authorization plus exact stored-size verification on completion
- upload completion verification with S3 `HEAD`
- size and content-type consistency checks before `UPLOADED`
- idempotent `UPLOADED` completion behavior
- private candidate-authorized presigned download URLs
- upload-completed audit/outbox event
- candidate resume list/detail HTTP endpoints
- cross-candidate completion/download authorization regression coverage
- stored-object size mismatch regression coverage

Current HTTP contract:

```text
POST /api/v1/candidate/resumes/upload-authorization
GET  /api/v1/candidate/resumes
GET  /api/v1/candidate/resumes/:resumeId
POST /api/v1/candidate/resumes/upload-complete
POST /api/v1/candidate/resumes/:resumeVersionId/download-authorization
```

Direct-upload flow:

```text
Browser
  │ authenticated + CSRF
  │ POST upload-authorization
  ▼
API
  │ creates Resume / ResumeVersion in UPLOADING
  │ signs PUT for exact private storage key + content type
  ▼
Browser
  │ PUT bytes directly
  ▼
Private S3-compatible object storage / RustFS
  │
  │ browser calls upload-complete with resumeVersionId
  ▼
API
  │ candidate ownership check
  │ HEAD object
  │ size/content-type consistency
  ▼
ResumeVersion = UPLOADED
  │ audit + outbox
  ▼
Phase 3C validation / malware scanning
```

The API does not proxy normal resume bytes through the NestJS process.

Closure evidence — 2026-09-15:

- real PDF upload authorization returned a short-lived presigned PUT URL
- direct RustFS PUT returned HTTP 200
- upload completion verified the stored object and advanced the ResumeVersion to `UPLOADED`
- stored metadata matched the submitted PDF (`application/pdf`, 233,158 bytes)
- private download authorization returned a short-lived presigned URL
- private download succeeded and reproduced the 233,158-byte file
- presigned URLs were treated as temporary secrets and were not persisted in verification notes
- cross-candidate upload-completion authorization was covered by the Phase 3 integration suite
- cross-candidate private-download authorization was covered by the Phase 3 integration suite
- stored-object size mismatch was proven to return a conflict without advancing beyond `UPLOADING`
- matching stored metadata was proven to advance to `UPLOADED`
- upload-prepared and upload-completed audit/outbox evidence was verified
- full root `pnpm check` passed locally with **8/8 tasks successful** after the final hardening changes
- dependency lockfile and formatting normalization were committed and pushed
- final repository working tree was confirmed clean and synchronized with `origin/main`

Security boundary note: the presigned PUT is not itself a trusted file validator. Browser-provided MIME metadata remains advisory, and the upload URL does not replace content-signature, container, corruption, encryption, or malware validation. Those controls begin in Phase 3C.

### Phase 3C — Validation and malware scanning ← CURRENT

Deliverables:

- magic-byte/container validation
- PDF/DOCX allowlist
- file-size enforcement
- encrypted/corrupt/unsupported-file rejection
- scanner adapter contract
- isolated scan worker path
- scan engine/version metadata
- quarantine/rejection behavior
- retry/terminal failure classification

No extraction can begin until malware scanning succeeds.

### Phase 3D — Extraction + OCR fallback

Deliverables:

- native PDF text extractor
- DOCX extractor
- normalized internal ResumeDocument representation
- extraction quality signals
- OCR fallback interface
- page/source mapping
- resource/time limits
- rebuildable derived artifacts

OCR is a fallback, not the default path.

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

The first implementation slice established the shared transition contract before workers begin mutating state.

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

Failures:

```text
processing stage
→ FAILED_RETRYABLE
→ bounded re-entry into the failed/retryable processing stage

or

processing stage
→ FAILED_TERMINAL
```

`APPROVED`, `REJECTED`, and `FAILED_TERMINAL` are terminal states.

## Data ownership

Resume files and processing metadata belong to the Candidate context.

Authorization path:

```text
Session
→ User
→ Candidate where Candidate.userId = Session.userId
→ Resume where Resume.candidateId = Candidate.id
→ ResumeVersion
```

Organization membership must not grant access to private resume files, parsed proposals, raw extracted text, processing history, or review decisions.

Future application submission will intentionally share a selected immutable ResumeVersion with an organization through an Application snapshot. It must not grant live access to the candidate's entire Resume workspace.

## Versioning contract

A Resume is the logical candidate-owned artifact. A ResumeVersion represents one immutable uploaded source plus its processing outputs.

Conceptual model:

```text
Resume
├── id
├── candidateId
├── title
├── currentVersionId
└── versions[]

ResumeVersion
├── id
├── resumeId
├── versionNumber
├── processingState
├── objectKey
├── originalFilename
├── mimeType
├── sizeBytes
├── checksumSha256?
├── pipelineVersion
├── failureCode?
├── approvedProfileVersionId?
└── timestamps
```

Reprocessing the same ResumeVersion must not create duplicate proposals or duplicate Career Passport versions.

## Upload constraints baseline

Initial constraints:

- accepted document families: PDF and DOCX
- maximum upload size: 10 MiB
- presigned PUT TTL: 10 minutes
- private download TTL: 5 minutes
- no permanently public URLs
- original file stored privately
- object key is server-created; browser cannot choose a storage location
- browser content type is constrained by the signed request but remains advisory until Phase 3C file-signature validation
- upload completion checks exact stored byte length and reported content type
- encrypted/password-protected document handling belongs to Phase 3C validation

These values are configuration/product baselines, not immutable platform limits; change them through measured load/security work.

## Queue and idempotency contract

Logical stages remain independently observable even if early deployments share one worker process:

```text
resume.scan
resume.extract
resume.ocr
resume.parse
resume.finalize
```

Stable processing identity:

```text
resumeVersionId + processingPipelineVersion
```

Retries must be bounded and idempotent.

## Observability contract

Phase 3 instrumentation must evolve to expose:

- uploads started/completed
- validation failures
- malware rejection rate
- extraction success/failure
- OCR fallback rate
- parse success/failure
- stage duration p50/p95/p99
- retries and dead-letter/failure state
- queue depth
- candidate review accept/edit/ignore rate
- AI/provider usage and cost when parsing uses AI

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

Verified Phase 3A:

```text
Resume processing-state vocabulary       ✅
Allowed transition contract              ✅
Terminal/review-state helpers            ✅
Resume + ResumeVersion persistence       ✅
Candidate-owned service/read foundation  ✅
Audit/outbox upload-prepared event        ✅
Phase 3 database integration coverage    ✅
Root pnpm check                           ✅
Repository clean after verification      ✅
```

Verified Phase 3B:

```text
Provider-neutral S3 adapter                    ✅
RustFS-compatible configuration                ✅
Development bucket bootstrap                   ✅
Presigned direct upload authorization          ✅ real PDF
Direct RustFS PUT                              ✅ HTTP 200
Upload completion HEAD verification            ✅
ResumeVersion → UPLOADED                       ✅
Candidate-authorized private download          ✅
Downloaded object size parity                  ✅ 233,158 bytes
Cross-candidate completion denial              ✅ automated
Cross-candidate download denial                ✅ automated
Stored-object size mismatch regression         ✅ automated
Upload audit/outbox evidence                    ✅ automated
Full root pnpm check                           ✅ 8/8 tasks
Dependency lockfile / formatting               ✅ committed
Clean working tree                              ✅
```

Current Phase 3C boundary:

```text
UPLOADED
   ↓
VALIDATING
   ├── signature/container/size/corruption/encryption checks
   └── invalid → safe terminal/retry classification
   ↓
SCANNING
   ├── scanner adapter + isolated worker execution
   ├── clean → EXTRACTING
   └── malicious/suspicious → quarantine/rejection
```

Normal resume bytes remain browser → private object storage. Validation and scanning consume the private stored object asynchronously; they do not weaken Candidate ownership or expose the artifact to Organization membership.
