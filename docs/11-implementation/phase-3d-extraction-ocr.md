# Phase 3D — Resume Extraction and OCR Fallback

## Status

**3D-A CONTRACTS + PERSISTENCE VERIFIED. 3D-B NATIVE PDF/DOCX EXTRACTION VERIFIED. 3D-C QUALITY ROUTING VERIFIED. 3D-D OCR FALLBACK IMPLEMENTED / APPLICATION-RUNTIME VERIFICATION CURRENT — 2026-09-15.**

Phase 3D begins only after Phase 3C has advanced a candidate-owned ResumeVersion to `EXTRACTING`. Its responsibility is to produce a rebuildable, source-aware document representation for Phase 3E. It does not infer Career Passport fields and never mutates the Passport.

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

The root `pnpm check` is green after the native extraction, quality-routing, OCR processor, OCR dispatcher, HTTP adapter, worker runtime wiring, local OCR sidecar, retry-hardening, and formatting fixes.

Automated evidence includes:

- native PDF/DOCX extraction and deterministic quality routing
- OCR source-identity validation
- OCR persistence as a separate derived `ResumeExtraction`
- `OCR_REQUIRED → PARSING` processor behavior with injected OCR results
- duplicate-delivery idempotency
- metadata-only audit/outbox events
- private-object retry recovery
- transient OCR-service retry recovery
- HTTP adapter timeout/status/response-boundary behavior
- scheduler dispatch with stable OCR job identity

Real local OCR runtime evidence observed on 2026-09-15:

```text
docker compose ps ocr
→ talent-network-ocr-1 ... Up ... (healthy)

pnpm ocr:smoke
→ Local OCR smoke passed.
→ Recognized 332 characters on page 1.
```

The smoke harness generates a genuine image-only PDF and requires Tesseract to recover deterministic resume text. The same scanned fixture was materialized to:

```text
packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

This proves the local HTTP sidecar, PDF rendering, Tesseract invocation, bounded response contract, and scanned-document OCR capability. It does **not** by itself prove the full Talent Network asynchronous state path from a persisted `ResumeVersion` through `OCR_REQUIRED`, scheduler dispatch, OCR worker persistence, and final `PARSING`.

The real native fixture tests execute PDF.js and Mammoth against generated binary PDF/DOCX files. PDF page numbers are truthful, DOCX pagination is not fabricated, source ranges are validated, and sufficient text passes the deterministic quality policy.

PDF.js currently emits a non-failing `standardFontDataUrl` warning for the synthetic PDF fixture. Broader font compatibility remains a runtime-hardening concern for 3D-E rather than a blocker for 3D-B.

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

### 3D-D — OCR fallback 🟡 IMPLEMENTED / APPLICATION-RUNTIME VERIFICATION CURRENT

Implemented and automated-gate verified:

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

Runtime evidence already observed:

- real OCR container built and started successfully
- Docker health check reports `healthy`
- scanned/image-only PDF smoke test passed against real Tesseract
- 332 characters recognized on page 1
- deterministic scanned fixture materialized for application-level acceptance
- complete repository `pnpm check` passed

Still required before `VERIFIED`:

- observe the real application queue/state path `OCR_REQUIRED → candidate.resume.ocr_required → resume.ocr → OCR ResumeExtraction COMPLETED → PARSING`
- confirm private OCR text is absent from application logs/audit/outbox during that real path
- confirm runtime retry/idempotency behavior remains correct if acceptance exposes any integration edge case
- rerun root `pnpm check` after any acceptance fix

### 3D-E — Runtime closure ← CURRENT ACCEPTANCE BOUNDARY

Verify at minimum:

1. real native-text PDF → native extraction → `PARSING`
2. real DOCX → native extraction → `PARSING`
3. scanned/image PDF → `OCR_REQUIRED` → OCR → `PARSING`
4. page/source mapping survives normalization
5. derived text remains candidate-private
6. no raw text appears in audit/outbox/logs
7. retries are idempotent
8. root `pnpm check` is green

Current evidence already satisfies the local OCR-service health/smoke portion of this matrix. The remaining closure item is the persisted application pipeline, not the OCR engine itself.

Local OCR smoke commands:

```bash
docker compose up -d --build ocr
docker compose ps ocr
docker compose exec -T ocr python smoke_test.py
```

To materialize the deterministic scanned fixture for application-level acceptance:

```bash
docker compose exec -T ocr python smoke_test.py --output /tmp/scanned-resume.pdf
docker compose cp ocr:/tmp/scanned-resume.pdf packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

See [`services/ocr/README.md`](../../services/ocr/README.md) for the local service contract and acceptance notes.

## UI boundary

Phase 3D is backend/processing infrastructure. The current Candidate Workspace does **not** yet expose a Resume destination or upload/review page. That UI belongs to **Phase 3F — Candidate Review Workspace**, after structured parsing/evidence mapping in Phase 3E. Runtime closure for 3D must therefore use the real backend/storage/queue path rather than inventing a UI route that is not implemented yet.

## Non-goals

Phase 3D does not identify skills, employers, education, or contact fields; calculate candidate/job match scores; call an LLM to interpret the resume; update Career Passport data; or expose extracted text to recruiters. Those boundaries prevent extraction infrastructure from becoming an opaque parsing or hiring-decision system.
