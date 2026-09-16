# Phase 3 — Resume Intelligence

## Status

**Phase 3A CLOSED / VERIFIED — 2026-09-15. Phase 3B CLOSED / VERIFIED — 2026-09-15. Phase 3C CLOSED / VERIFIED — 2026-09-15. Phase 3D CLOSED / VERIFIED — 2026-09-15. Phase 3E CLOSED / VERIFIED — 2026-09-16. Phase 3F candidate review workspace is implemented and verified at its current baseline. Phase 3G Resume Intelligence Architecture V2 is PLANNED / ARCHITECTURE REVIEW.**

Phase 3 turns candidate-owned resume files into reviewed, structured proposals that can safely create a new Career Passport version only after explicit candidate approval.

The phase inherits all Phase 2B identity, privacy, versioning, evidence, and Candidate/Organization isolation guarantees.

## Non-negotiable invariant

> A parsed resume is a proposal. Resume ingestion must never silently mutate the authoritative Career Passport.

Phase 3G adds a second invariant:

> Meaningful resume content must never disappear silently. Every meaningful section, record, or source node must be accounted for as mapped, partially mapped, unmapped, private-only, or intentionally ignored.

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

Phase 3G evolves the middle of that flow into a layout-aware document-understanding pipeline while preserving the same authority and privacy boundaries.

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

Delivered deterministic PDF/DOCX structural validation, file-size enforcement, encrypted/corrupt/unsupported-file rejection, SHA-256 generation, provider-neutral malware-scanner contracts, ClamAV INSTREAM integration, isolated BullMQ processing, transactional-outbox dispatch, bounded retry/terminal classification, interrupted-worker recovery, guarded state transitions, quarantine/download denial, and privacy-safe audit/outbox events.

Runtime acceptance on 2026-09-15 proved both clean and EICAR branches through real local services. Detailed closure record: [`phase-3c-security-processing.md`](./phase-3c-security-processing.md).

### Phase 3D — Extraction + OCR fallback ✅ VERIFIED

Phase 3D is closed. It delivered and verified:

- normalized `ResumeDocument` and source-range contracts
- candidate-private derived `ResumeExtraction` persistence
- native PDF.js extraction with truthful page identity
- native DOCX extraction without fabricated pagination
- deterministic quality routing
- observable `OCR_REQUIRED` fallback
- provider-neutral OCR engine boundary
- scheduler and worker queue handoffs
- local FastAPI + PyMuPDF + Tesseract sidecar
- bounded retry/idempotency semantics
- metadata-only audit/outbox behavior
- real scanned-PDF OCR runtime acceptance

The real application runtime verified:

```text
EXTRACTING
→ OCR_REQUIRED
→ PARSING
```

with separate completed derived records:

```text
NATIVE_PDF COMPLETED pdfjs-dist@6.3.289
OCR        COMPLETED http-ocr-service@1
```

and durable event flow:

```text
candidate.resume.security_passed
→ candidate.resume.ocr_required
→ candidate.resume.ocr_completed
```

Scheduler publication for both extraction and OCR handoffs passed. Known OCR fixture text was absent from audit/outbox metadata, and the complete root `pnpm check` passed after runtime acceptance.

Verified Phase 3D baseline:

```text
0621076b31ae91b9ee9dda106d4e04e3fcc3fdb6
```

Detailed closure record: [`phase-3d-extraction-ocr.md`](./phase-3d-extraction-ocr.md). Runtime procedure: [`phase-3d-runtime-acceptance.md`](./phase-3d-runtime-acceptance.md).

### Phase 3E — Structured parsing + evidence mapping ✅ VERIFIED

Phase 3E is closed. It consumes only verified Phase 3D extraction output for the same candidate-owned `ResumeVersion` and converts it into a schema-validated, evidence-linked proposal.

The parser proposal is private Candidate data and never mutates the Career Passport directly.

Verified implementation slices:

```text
3E-A Contracts + persistence                  ✅ VERIFIED
3E-B Deterministic preprocessing + sections   ✅ VERIFIED
3E-C Schema parser + AI Gateway seam          ✅ VERIFIED
3E-D Evidence/confidence validation            ✅ VERIFIED
3E-E Runtime closure                           ✅ VERIFIED
```

Delivered and verified:

- explicit `ParsedResume` / `ParsedClaim` schema
- candidate-owned `ResumeParseResult` persistence with stable execution identity
- deterministic source-preserving preprocessing and section detection
- bounded chunking and deterministic contact/link candidate detection
- provider-neutral parser boundary and AI Gateway seam
- strict structured-output validation
- source evidence references back to Phase 3D document ranges/pages
- evidence/confidence/warning validation before readiness
- metadata-only scheduler/outbox/worker runtime path on `resume.parse`
- deterministic no-AI runtime parser for source-provable contact/link claims
- duplicate-delivery idempotency
- retry/terminal failure semantics
- candidate-private parse persistence
- exact `PARSING → READY_FOR_REVIEW` transition
- zero Career Passport mutation during parsing

Real runtime acceptance on 2026-09-16 verified:

```text
PARSING
→ resume.parse
→ READY_FOR_REVIEW
```

The acceptance fixture emitted two equivalent source completion events and proved they converged on one `ResumeParseResult`. It also proved private parsed values were absent from audit/outbox metadata and no `CandidateProfileVersion` was created by the parser.

A live external AI provider is intentionally not required for this closure. The runtime parser currently uses deterministic source-grounded extraction where facts can be proven; semantic model-backed parsing remains pluggable through the AI Gateway seam and must pass its own provider capability gate before production use.

Detailed contract and closure matrix: [`phase-3e-structured-parsing-evidence.md`](./phase-3e-structured-parsing-evidence.md).

### Phase 3F — Candidate review workspace ✅ CURRENT BASELINE VERIFIED

Delivered baseline capabilities:

- Resume destination in Candidate Workspace navigation
- resume history/list
- processing progress
- parsed proposal review
- current Passport vs proposed-value comparison
- Accept / Edit / Ignore controls
- candidate-approved creation of a new `RESUME_IMPORT` Career Passport version
- traceability from approved profile version back to ResumeVersion + parse result
- candidate-owned Contact Information and Awards import support
- open-world additional-section preservation/import baseline
- private References policy baseline
- browser acceptance for upload → processing → review → approval

**Authority boundary:** `ResumeParseResult` remains a parser proposal. Only explicit candidate review in Phase 3F may create authoritative Career Passport state.

Phase 3F is not the final resume-review UX. Phase 3G-H replaces the current single-confidence presentation with source coverage, structural quality, mapped/unmapped counts, additional-section review, and evidence-linked unresolved-item UX.

### Phase 3G — Resume Intelligence Architecture V2 🟡 PLANNED / ARCHITECTURE REVIEW

Phase 3G exists because a real five-page complex resume demonstrated that high claim confidence can coexist with incomplete document understanding. The current parser correctly recovered identity, summary, links, and several work records, while missing complete Education, Projects, Certifications, Languages, and one Experience record. The architecture must therefore measure and preserve what was not understood rather than only reporting confidence in emitted claims.

Phase 3G introduces:

```text
format-aware extraction
      ↓
DocumentGraph V1
      ↓
structural section + record detection
      ↓
Career ontology classification
      ↓
hybrid typed extraction
      ↓
Source Ledger
      ↓
record reconciliation
      ↓
quality + confidence + source coverage
      ↓
Candidate Review UX V2
      ↓
Career Passport
```

Primary guarantees:

- layout-aware document structure for PDF, DOCX, and OCR flows
- explicit section and record boundaries
- meaningful-source accounting
- mapped / partially mapped / unmapped / private-only states
- record-level source-vs-parsed reconciliation
- separate document quality, structural confidence, claim confidence, and source coverage
- robust typed extraction for the seven default Career Passport sections
- recognized extension-section extraction
- lossless unknown/custom fallback
- private References behavior
- benchmark-driven regression testing
- provider/tool capability gates before adopting new dependencies

Planned slices:

```text
3G-A Contracts + benchmark vocabulary
3G-B Layout-aware DocumentGraph
3G-C Structural section/record detection
3G-D Source Ledger + reconciliation
3G-E Core typed extractors V2
3G-F Extensions + open-world fallback
3G-G Semantic recovery capability gate
3G-H Candidate Review UX V2
3G-I Benchmark expansion + regression gate
3G-J Runtime closure
```

The detailed architecture, acceptance criteria, benchmark strategy, privacy policy, migration rules, and slice gates are defined in [`phase-3g-resume-intelligence-v2.md`](./phase-3g-resume-intelligence-v2.md).

Implementation must not begin until that plan is reviewed and accepted.

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

Phase 3E owns only the `PARSING → READY_FOR_REVIEW` boundary. Phase 3F candidate action owns approval. Phase 3G evolves derived artifacts and review quality without weakening those state/authority rules.

## Data ownership

Resume files and all extraction/parse/review metadata belong to the Candidate context.

```text
Session
→ User
→ Candidate where Candidate.userId = Session.userId
→ Resume where Resume.candidateId = Candidate.id
→ ResumeVersion
→ ResumeExtraction / ResumeParseResult
```

Organization membership must not grant access to private resume files, extracted text, parsed proposals, processing history, review decisions, DocumentGraph artifacts, Source Ledger entries, or private-only reference data. Future application submission will intentionally share selected immutable versions through an Application snapshot rather than granting live access to the candidate's Resume workspace.

## Versioning contract

A Resume is the logical candidate-owned artifact. A ResumeVersion represents one immutable uploaded source plus rebuildable processing outputs.

Stable processing identities must include versioned source/configuration inputs. Extraction, graph, structural, and parsing outputs must remain reproducible and independently rebuildable.

Reprocessing must not create duplicate proposals or duplicate Career Passport versions.

Phase 3G graph/ledger artifacts are additive derived data and must use expand/contract migration. Historical parse results remain identifiable and are never rewritten in place merely because a new parser/graph version exists.

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

Phase 3G may introduce explicit graph/layout/semantic sub-stages if measured operational value justifies them, but domain behavior must stay provider-neutral and retries must remain bounded and idempotent.

## Observability contract

Phase 3 instrumentation must evolve to expose uploads, validation failures, malware rejection rate, extraction success/failure, OCR fallback rate, parse success/failure, stage p50/p95/p99, retries, queue depth, review outcomes, and AI/provider usage/cost where applicable.

Phase 3G adds graph-build success, section/record detection quality, mapped/partial/unmapped distributions, source coverage, diagnostic frequency, model-fallback rate, candidate correction rate, and benchmark-regression metrics.

Raw resume text, parsed sensitive values, source-node contents, and model prompt/response content must not be emitted into ordinary application logs or metric labels.

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
13. meaningful source content cannot disappear silently after 3G closure
14. source coverage and claim confidence are independently measured after 3G closure
15. benchmark regression gates protect supported document classes after 3G closure
16. `pnpm check` plus Phase 3 database/browser/runtime verification are green

## Current implementation checkpoint

```text
3A Resume domain + state machine             ✅ CLOSED / VERIFIED
3B Private direct object storage             ✅ CLOSED / VERIFIED
3C Validation + malware scanning             ✅ CLOSED / VERIFIED
3D Extraction + OCR fallback                 ✅ CLOSED / VERIFIED
3E Structured parsing + evidence mapping     ✅ CLOSED / VERIFIED
  3E-A Contracts + persistence               ✅ VERIFIED
  3E-B Deterministic preprocessing           ✅ VERIFIED
  3E-C Parser + AI Gateway seam              ✅ VERIFIED
  3E-D Evidence/confidence validation        ✅ VERIFIED
  3E-E Runtime closure                       ✅ VERIFIED
3F Candidate review + Passport approval      ✅ CURRENT BASELINE VERIFIED
3G Resume Intelligence Architecture V2       🟡 PLANNED / REVIEW
  3G-A Contracts + benchmark vocabulary      ⬜ NOT STARTED
  3G-B Layout-aware DocumentGraph            ⬜ NOT STARTED
  3G-C Structural section/record detection   ⬜ NOT STARTED
  3G-D Source Ledger + reconciliation        ⬜ NOT STARTED
  3G-E Core typed extractors V2              ⬜ NOT STARTED
  3G-F Extensions + open-world fallback      ⬜ NOT STARTED
  3G-G Semantic recovery capability gate     ⬜ NOT STARTED
  3G-H Candidate Review UX V2                ⬜ NOT STARTED
  3G-I Benchmark expansion/regression        ⬜ NOT STARTED
  3G-J Runtime closure                       ⬜ NOT STARTED
```

Current authority boundary:

```text
READY_FOR_REVIEW
   │
   ▼
candidate-private ResumeParseResult
   │
   ▼
review current Passport vs proposal
   │
   ├── Ignore
   ├── Edit
   └── Accept
          │
          ▼
new RESUME_IMPORT CandidateProfileVersion
          │
          ▼
APPROVED
```

Phase 3G must preserve this Candidate ownership and privacy firewall. DocumentGraph, Source Ledger, diagnostics, benchmark artifacts containing source-derived data, and semantic model outputs are sensitive derived candidate data and must not be exposed to Organization membership or ordinary logs.
