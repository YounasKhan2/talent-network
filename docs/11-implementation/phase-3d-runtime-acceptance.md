# Phase 3D Runtime Acceptance

## Purpose

This runbook closes the remaining Phase 3D extraction/OCR application-runtime boundary without depending on the future Phase 3F Resume UI.

Phase 3B direct upload and Phase 3C validation/malware scanning are already separately verified. This harness therefore starts at the verified Phase 3C → Phase 3D handoff:

```text
candidate.resume.security_passed
→ resume.extract
→ native PDF extraction
→ OCR_REQUIRED
→ candidate.resume.ocr_required
→ resume.ocr
→ local OCR service
→ separate OCR ResumeExtraction
→ PARSING
```

The harness uses the real PostgreSQL database, RustFS object storage, transactional outbox rows, scheduler dispatchers, BullMQ/Redis, worker processors, HTTP OCR adapter, and local Tesseract service.

## Harness

Source:

```text
apps/api/src/runtime/phase3d-ocr-acceptance.ts
```

Root command:

```bash
pnpm test:runtime:phase3d-ocr
```

The harness:

1. creates an isolated temporary User, Candidate, Resume, and ResumeVersion
2. uploads `packages/resume-extraction/test-fixtures/scanned-resume.pdf` to the configured private S3-compatible bucket
3. creates the same durable `candidate.resume.security_passed` handoff emitted by Phase 3C
4. waits for the real scheduler and worker runtime
5. requires native extraction to complete with quality decision `OCR_REQUIRED`
6. requires a separate OCR `ResumeExtraction` to complete
7. requires final ResumeVersion state `PARSING`
8. requires scheduler publication of both extraction and OCR durable handoffs
9. requires `candidate.resume.ocr_completed` audit/outbox evidence
10. asserts known private OCR fixture text does not appear in audit or outbox metadata
11. cleans up the temporary database/object-storage fixture after success

On failure, the fixture is intentionally preserved for diagnosis.

Set `PHASE3D_ACCEPTANCE_KEEP=1` to preserve a successful fixture as well. Set `PHASE3D_ACCEPTANCE_TIMEOUT_MS` to override the default 120-second timeout.

## Prerequisites

The normal `.env` must point to the local PostgreSQL, Redis, RustFS, and OCR services. OCR configuration must include:

```env
OCR_HTTP_ENDPOINT=http://127.0.0.1:4010/v1/recognize
OCR_HTTP_TOKEN=talent-local-ocr-token-change-me
OCR_HTTP_TIMEOUT_MS=60000
```

The scanned fixture must exist at:

```text
packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

Generate it with:

```bash
docker compose exec -T ocr python smoke_test.py --output /tmp/scanned-resume.pdf
docker compose cp ocr:/tmp/scanned-resume.pdf packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

## Run sequence

Terminal A — keep the application runtimes active:

```bash
pnpm dev
```

This must include the scheduler and worker processes connected to the same PostgreSQL and Redis configured in `.env`.

Terminal B — ensure OCR is healthy:

```bash
pnpm ocr:up
docker compose ps ocr
pnpm ocr:smoke
```

Then run the application acceptance:

```bash
pnpm test:runtime:phase3d-ocr
```

Expected terminal shape:

```text
Phase 3D OCR runtime acceptance started.
resumeVersionId=...
state=EXTRACTING
state=OCR_REQUIRED
state=PARSING
Observed derived extractions:
- NATIVE_PDF COMPLETED ...
- OCR COMPLETED ...
Scheduler publication assertion passed for extraction and OCR handoffs.
Privacy assertion passed: no known OCR fixture text in audit/outbox metadata.
Phase 3D OCR runtime acceptance PASSED: OCR_REQUIRED -> resume.ocr -> PARSING.
Runtime acceptance fixture cleaned up.
```

State polling can miss a very short-lived `OCR_REQUIRED` observation, so closure does not depend on seeing that line in the polling output. The persisted native extraction quality decision, published `candidate.resume.ocr_required` outbox row, completed OCR extraction, and final `PARSING` state are the authoritative proof.

## Closure rule

Do not mark Phase 3D-D or 3D-E `VERIFIED` solely because this harness exists.

Verification requires observing a successful real run plus a green root quality gate:

```bash
pnpm check
```

Runtime logs should also be reviewed during the acceptance run to confirm that raw OCR text is not emitted. The harness independently verifies the database audit/outbox privacy boundary, but it does not scrape developer terminal logs.
