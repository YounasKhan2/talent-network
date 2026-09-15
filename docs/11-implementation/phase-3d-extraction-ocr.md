# Phase 3D — Resume Extraction and OCR Fallback

## Status

**PHASE 3D VERIFIED / CLOSED — 2026-09-15.**

All Phase 3D slices are verified:

- **3D-A — Contracts and persistence foundation ✅ VERIFIED**
- **3D-B — Native PDF/DOCX extraction ✅ VERIFIED**
- **3D-C — Quality routing ✅ VERIFIED**
- **3D-D — OCR fallback ✅ VERIFIED**
- **3D-E — Runtime closure ✅ VERIFIED**

Phase 3D begins only after Phase 3C has advanced a candidate-owned `ResumeVersion` to `EXTRACTING`. Its responsibility is to produce a rebuildable, source-aware document representation for Phase 3E. It does not infer Career Passport fields and never mutates the Passport.

## Invariants

1. `ResumeVersion` remains the immutable source artifact identity.
2. Extraction outputs are derived, versioned data and may be rebuilt from the private source object.
3. Raw extracted text is private Candidate data. Organization membership grants no access.
4. Raw resume text must not enter ordinary logs, audit metadata, or outbox payloads.
5. Native extraction is attempted before OCR.
6. OCR is selected by deterministic quality signals, not by an LLM.
7. Phase 3D ends at `PARSING`; semantic field interpretation belongs to Phase 3E.
8. Retries must be bounded and idempotent by `resumeVersionId + processingPipelineVersion + extractorVersion`.

## Pipeline

```text
EXTRACTING
   │
   ├── PDF native extractor
   ├── DOCX native extractor
   │
   ▼
ResumeDocument
   │
   ├── pages / blocks / source ranges
   ├── normalized text
   └── quality signals
          │
          ├── sufficient native text → PARSING
          │
          └── insufficient/scanned → OCR_REQUIRED
                                      │
                                      ▼
                                  OCR adapter
                                      │
                                      ▼
                                ResumeDocument
                                      │
                                      ▼
                                   PARSING
```

## ResumeDocument contract

`ResumeDocument` is a document representation, not a candidate profile.

Conceptually:

```text
ResumeDocument
├── schemaVersion
├── resumeVersionId
├── sourceMimeType
├── extractionMethod: NATIVE_PDF | NATIVE_DOCX | OCR
├── extractor
│   ├── name
│   └── version
├── text
├── pages[]
│   ├── pageNumber
│   ├── text
│   └── blocks[]
│       ├── text
│       └── sourceRange
└── quality
    ├── characterCount
    ├── nonWhitespaceCharacterCount
    ├── pageCount
    ├── pagesWithText
    ├── replacementCharacterRatio
    ├── controlCharacterRatio
    └── decision
```

Source ranges are offsets into the normalized document/page representation. PDF extractors preserve page identity. DOCX is logically page-less at the OOXML layer, so page identity is not fabricated; the current normalized representation uses a single logical source unit with `pageNumber: null`.

## Quality decision

The native extractor reports observations. A separate deterministic quality evaluator decides whether OCR is required. The policy considers non-whitespace character count, page/text coverage, replacement-character ratio, control-character ratio, and extractor warnings/errors. Threshold boundaries are fixture-tested. Missing text is not treated as malicious; it routes to OCR when appropriate.

Verified routing:

```text
sufficient native text → PARSING
insufficient/scanned-like native text → OCR_REQUIRED
```

## Persistence

Derived extraction output is deliberately separate from `ResumeVersion`.

```text
ResumeVersion 1 ── * ResumeExtraction

ResumeExtraction
├── id
├── resumeVersionId
├── extractionMethod
├── extractorName / extractorVersion
├── schemaVersion / pipelineVersion
├── status
├── qualityMetadata
├── documentJson / documentObjectKey
├── textChecksumSha256
├── failureCode
├── startedAt / completedAt
└── timestamps
```

The database FK cascades derived rows with their immutable source version. Stable execution identity is enforced by a unique key across `resumeVersionId + pipelineVersion + extractorName + extractorVersion + extractionMethod`, so duplicate delivery cannot create duplicate derived records. PostgreSQL may hold bounded normalized JSON during MVP; the optional `documentObjectKey` keeps the contract ready for large private artifacts in provider-neutral object storage.

Prisma uses multi-file schema-folder mode. The extraction model is isolated in `prisma/resume-extraction.prisma`, while the database migration owns the FK to `ResumeVersion`.

## Queue contracts

Logical queues:

```text
resume.extract
resume.ocr
```

`candidate.resume.security_passed` is the durable handoff from 3C to extraction. Native extraction completion emits metadata-only events such as `candidate.resume.extraction_completed` or `candidate.resume.ocr_required`; payloads must not contain raw text.

The OCR scheduler dispatcher converts `candidate.resume.ocr_required` into a stable `resume.ocr` job identity carrying `resumeVersionId + processingPipelineVersion + source extraction identity`. Duplicate delivery must not create duplicate derived records or duplicate completion events.

## Extractor interfaces

Native extractors implement a common adapter boundary:

```text
ResumeExtractor
├── supports(mimeType)
└── extract(input)
    └── ResumeExtractionResult
```

OCR uses a separate adapter because its cost, resource envelope, page-image inputs, provider options, and operational failure modes differ materially from native extraction.

```text
ResumeOcrEngine
└── recognize(input)
    └── ResumeExtractionResult
```

Do not hide OCR inside the PDF extractor; the `OCR_REQUIRED` state must remain observable.

## Local OCR implementation

The development implementation is a local HTTP sidecar under `services/ocr`:

```text
ResumeOcrEngine
   ↓
HttpResumeOcrEngine
   ↓
POST /v1/recognize
   ↓
FastAPI sidecar
   ├── PyMuPDF page rendering
   ├── Tesseract OCR
   └── page-level JSON response
```

The sidecar is intentionally provider-neutral from the worker's perspective. A managed provider can replace the local service later without changing the worker state machine or persistence contract.

Local privacy properties:

- resume bytes stay on the developer machine / local Docker network
- the OCR service never persists source files or recognized text
- Uvicorn access logging is disabled
- request bodies and OCR text must never enter logs
- the worker persists OCR output only in candidate-private derived storage

Runtime configuration:

```env
OCR_HTTP_ENDPOINT=http://127.0.0.1:4010/v1/recognize
OCR_HTTP_TOKEN=talent-local-ocr-token-change-me
OCR_HTTP_TIMEOUT_MS=60000
```

Removing `OCR_HTTP_ENDPOINT` disables `resume.ocr` consumption without changing native extraction.

## Resource limits

Extraction has explicit bounds for maximum source bytes, maximum pages, maximum normalized characters, execution timeout, OCR page count, OCR concurrency, and derived artifact size. Limit breaches must use explicit failure codes and must never silently truncate evidence that Phase 3E could mistake for a complete resume.

Local OCR defaults:

```text
source bytes                 10 MiB
PDF pages                    100
normalized OCR characters    500,000
render DPI                   200
Tesseract timeout/page       30 seconds
BullMQ OCR concurrency       1
```

Transient OCR HTTP failures (`network`, `timeout`, `429`, `5xx`) are retryable through the existing bounded BullMQ attempts. Recognition/contract errors and insufficient OCR quality are terminal rather than looping back into OCR indefinitely.

## Verified evidence — 2026-09-15

Phase 3D was closed against repository baseline commit:

```text
0621076b31ae91b9ee9dda106d4e04e3fcc3fdb6
chore(phase3d): format OCR runtime acceptance
```

### Automated and integration evidence

The complete repository gate `pnpm check` passed after runtime acceptance. It includes formatting, linting, typechecking, package tests, Phase 1/2/2A/2B/3 integration suites, and the full monorepo build.

Phase 3D-specific automated evidence includes:

- native PDF/DOCX extraction and deterministic quality routing
- real PDF.js PDF fixture extraction with truthful page semantics
- real Mammoth DOCX fixture extraction without fabricated pagination
- page/source normalization and source-range checks
- OCR source-identity validation
- OCR persistence as a separate derived `ResumeExtraction`
- `OCR_REQUIRED → PARSING` processor behavior
- duplicate extraction-delivery idempotency
- duplicate OCR-delivery idempotency
- metadata-only audit/outbox events
- private-object retry recovery
- transient OCR-service retry recovery
- terminal insufficient-OCR-quality behavior
- HTTP adapter timeout/status/response-boundary behavior
- scheduler dispatch with stable extraction and OCR job identities

### Real OCR service evidence

```text
docker compose ps ocr
→ talent-network-ocr-1 ... healthy

pnpm ocr:smoke
→ Local OCR smoke passed.
→ Recognized 332 characters on page 1.
```

The smoke harness generated a genuine image-only PDF and required Tesseract to recover deterministic resume text. The scanned fixture was materialized to:

```text
packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

### Real application-runtime acceptance

The real application runtime was executed with PostgreSQL, Redis, RustFS, OCR, scheduler, and worker active against the same environment.

Command:

```bash
pnpm test:runtime:phase3d-ocr
```

Observed persisted state path:

```text
EXTRACTING
→ OCR_REQUIRED
→ PARSING
```

Observed derived extractions:

```text
NATIVE_PDF COMPLETED pdfjs-dist@6.3.289
OCR        COMPLETED http-ocr-service@1
```

Observed durable event path:

```text
candidate.resume.security_passed
→ candidate.resume.ocr_required
→ candidate.resume.ocr_completed
```

The acceptance harness verified scheduler publication for both extraction and OCR handoffs. It also verified that known OCR fixture text was absent from audit/outbox metadata. The successful fixture was cleaned up after the run.

This proves the persisted asynchronous application path:

```text
candidate.resume.security_passed
→ resume.extract
→ native PDF extraction
→ OCR_REQUIRED
→ candidate.resume.ocr_required
→ resume.ocr
→ real HTTP OCR/Tesseract
→ separate OCR ResumeExtraction
→ candidate.resume.ocr_completed
→ PARSING
```

The runtime acceptance initially exposed only an operational setup requirement: scheduler and worker are host Node processes and must be running alongside the Docker infrastructure. Once those runtimes were active, the same acceptance harness passed without an architecture or processing-code change.

PDF.js currently emits a non-failing `standardFontDataUrl` warning for the synthetic native PDF fixture. It does not invalidate the verified extraction semantics; broader font compatibility remains a future runtime-hardening concern rather than a Phase 3D closure blocker.

## 3D implementation slices

### 3D-A — Contracts and persistence foundation ✅ VERIFIED

- shared extraction types and adapter contracts
- deterministic quality-decision contract and tests
- queue/event vocabulary
- `ResumeExtraction` persistence model and migration
- modular Prisma schema-folder configuration
- integration coverage for source immutability, stable execution identity, candidate-scoped ownership lookup, and cascade cleanup

### 3D-B — Native PDF/DOCX extraction ✅ VERIFIED

- PDF.js native text/page extraction adapter
- Mammoth DOCX text extraction adapter
- normalized whitespace/source blocks
- real generated binary fixture tests
- truthful PDF page identity and page-less DOCX semantics
- source-size boundaries and explicit unsupported-MIME failures

### 3D-C — Quality routing ✅ VERIFIED

- versioned deterministic quality policy
- inclusive threshold-boundary tests
- native-text sufficient → `PARSING`
- scanned/insufficient/corrupted-looking → `OCR_REQUIRED`
- metadata-only audit/outbox events
- duplicate-delivery idempotency and bounded storage-read retry coverage

### 3D-D — OCR fallback ✅ VERIFIED

- provider-neutral `ResumeOcrEngine`
- stable `resume.ocr` queue/job identity
- scheduler outbox dispatcher
- provider-neutral OCR worker processor
- source extraction identity/eligibility validation
- separate OCR `ResumeExtraction` persistence
- metadata-only audit/outbox completion/failure events
- bounded retry/terminal behavior
- transient service-unavailable retry semantics for network/timeout/429/5xx failures
- HTTP OCR adapter with response/time/size/page limits
- optional worker runtime subscription
- local FastAPI + PyMuPDF + Tesseract OCR sidecar
- deterministic scanned-PDF smoke harness
- real persisted `OCR_REQUIRED → resume.ocr → PARSING` runtime acceptance
- scheduler publication verified for extraction and OCR handoffs
- runtime audit/outbox privacy assertion passed

### 3D-E — Runtime closure ✅ VERIFIED

Closure matrix:

1. real native-text PDF → native extraction → `PARSING` ✅
2. real DOCX → native extraction → `PARSING` ✅
3. scanned/image PDF → `OCR_REQUIRED` → OCR → `PARSING` ✅
4. page/source mapping survives normalization ✅
5. derived text remains candidate-private ✅
6. no raw text appears in audit/outbox metadata; runtime service logging is configured to avoid body/text emission ✅
7. retries and duplicate deliveries are bounded/idempotent ✅
8. root `pnpm check` is green ✅

Phase 3D is therefore closed. Phase 3E may consume the verified `ResumeDocument`/`ResumeExtraction` boundary for structured parsing and evidence mapping without changing Phase 3D ownership, privacy, or source-identity semantics.

## Runtime commands

Local OCR smoke:

```bash
docker compose up -d --build ocr
docker compose ps ocr
docker compose exec -T ocr python smoke_test.py
```

Materialize the deterministic scanned fixture:

```bash
docker compose exec -T ocr python smoke_test.py --output /tmp/scanned-resume.pdf
docker compose cp ocr:/tmp/scanned-resume.pdf packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

Keep scheduler and worker runtimes active during application acceptance:

```bash
pnpm --filter @talent-network/scheduler dev
pnpm --filter @talent-network/worker dev
```

Then:

```bash
pnpm test:runtime:phase3d-ocr
pnpm check
```

See [`phase-3d-runtime-acceptance.md`](./phase-3d-runtime-acceptance.md) for the deterministic application-runtime acceptance procedure and [`services/ocr/README.md`](../../services/ocr/README.md) for the local OCR service contract.

## UI boundary

Phase 3D is backend/processing infrastructure. The current Candidate Workspace does **not** yet expose a Resume destination or upload/review page. That UI belongs to **Phase 3F — Candidate Review Workspace**, after structured parsing/evidence mapping in Phase 3E. Runtime closure for 3D therefore uses the real backend/storage/queue path rather than inventing a UI route that is not implemented yet.

## Non-goals

Phase 3D does not identify skills, employers, education, or contact fields; calculate candidate/job match scores; call an LLM to interpret the resume; update Career Passport data; or expose extracted text to recruiters. Those boundaries prevent extraction infrastructure from becoming an opaque parsing or hiring-decision system.
