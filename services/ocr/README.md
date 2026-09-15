# Local Resume OCR Service

The local OCR sidecar is the default development implementation behind the provider-neutral `ResumeOcrEngine` HTTP boundary.

It exists to close the scanned/image-PDF path without sending private candidate resumes to an external provider during local development.

## Contract

```text
POST /v1/recognize
Content-Type: application/pdf
Authorization: Bearer <OCR_HTTP_TOKEN>
X-Resume-Version-Id: <id>

{
  "pages": [
    { "pageNumber": 1, "text": "..." }
  ],
  "warnings": []
}
```

Health:

```text
GET /health
```

The service never persists source files or recognized text. Uvicorn access logging is disabled so request paths/metadata are not mixed with ordinary application logs. The service must never log request bodies or OCR text.

## Runtime

The service uses:

- PyMuPDF for PDF page rendering
- Tesseract for OCR
- Pillow for image handling
- FastAPI/Uvicorn for the bounded HTTP adapter

The container runs one Uvicorn worker and the service also serializes OCR work through an in-process semaphore. Application-side BullMQ OCR concurrency is separately bounded to `1`.

## Resource boundaries

Default local limits:

```text
source bytes                 10 MiB
PDF pages                    100
normalized OCR characters    500,000
render DPI                   200
Tesseract timeout/page       30 seconds
worker concurrency           1
```

Limit failures are explicit and never silently truncate resume evidence.

## Local configuration

`.env` should contain:

```env
OCR_HTTP_ENDPOINT=http://127.0.0.1:4010/v1/recognize
OCR_HTTP_TOKEN=talent-local-ocr-token-change-me
OCR_HTTP_TIMEOUT_MS=60000
```

The Compose service receives the same token as `OCR_SERVICE_TOKEN`.

Removing `OCR_HTTP_ENDPOINT` disables the application worker's `resume.ocr` subscription without changing the rest of the resume pipeline.

## Smoke verification

Start/rebuild the sidecar:

```bash
docker compose up -d --build ocr
docker compose ps ocr
```

Run the deterministic image-only PDF smoke test inside the container:

```bash
docker compose exec -T ocr python smoke_test.py
```

Expected output includes:

```text
Local OCR smoke passed.
```

To materialize the same synthetic scanned PDF inside the container:

```bash
docker compose exec -T ocr python smoke_test.py --output /tmp/scanned-resume.pdf
docker compose cp ocr:/tmp/scanned-resume.pdf packages/resume-extraction/test-fixtures/scanned-resume.pdf
```

The generated PDF contains rasterized text rather than a native PDF text layer, so native PDF extraction should route it to `OCR_REQUIRED`.

## Phase 3D runtime acceptance

The full acceptance path is:

```text
private scanned PDF
  → validation / malware scan
  → native PDF extraction
  → deterministic quality decision: OCR_REQUIRED
  → candidate.resume.ocr_required outbox event
  → resume.ocr BullMQ job
  → local OCR sidecar
  → separate OCR ResumeExtraction
  → candidate.resume.ocr_completed
  → PARSING
```

Phase 3D-D is not `VERIFIED` until this path has been observed against the real local infrastructure and the repository-wide `pnpm check` remains green.
