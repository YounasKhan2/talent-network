# Phase 3C — Resume Validation and Malware Scanning

## Status

**IMPLEMENTED / VERIFICATION PENDING — 2026-09-15**

Phase 3C establishes the security boundary between a successfully stored candidate resume and every downstream extraction/parsing workflow.

A browser filename, extension, or declared MIME type is not trusted as proof of file identity. A resume may advance to extraction only after deterministic structural validation and a trustworthy malware scan.

## Processing flow

```text
candidate.resume.upload_completed
        │
        ▼
Transactional Outbox
        │ scheduler dispatcher
        ▼
BullMQ resume-security queue
        │
        ▼
Resume security worker
        │
        ├── claim UPLOADED → VALIDATING
        │
        ├── read private object from S3-compatible storage
        │
        ├── deterministic validation
        │     ├── invalid → REJECTED
        │     └── valid → SCANNING
        │
        ├── ClamAV INSTREAM scan
        │     ├── CLEAN → EXTRACTING
        │     ├── INFECTED → REJECTED / MALWARE_DETECTED
        │     └── ERROR → FAILED_RETRYABLE
        │                       │
        │                       └── bounded BullMQ retry
        │                              └── exhausted → FAILED_TERMINAL
        ▼
Phase 3D extraction boundary
```

## Deterministic validation

Shared package: `@talent-network/resume-security`.

### PDF baseline

The validator requires:

- recorded byte length to equal the stored object byte length
- configured maximum size not to be exceeded
- `%PDF-` signature
- no detected `/Encrypt` marker
- `%%EOF` trailer in the bounded tail window
- SHA-256 checksum generation after validation

This is an ingestion-security baseline, not a replacement for a full PDF parser. Phase 3D owns content extraction and deeper document interpretation.

### DOCX baseline

DOCX is treated as an OOXML ZIP container rather than a filename extension.

The validator checks:

- ZIP local-header signature
- end-of-central-directory structure
- single-disk archive assumptions for the resume-size envelope
- central-directory bounds and entry count
- local-header offsets
- encrypted ZIP-entry flags
- path-safety constraints
- required `[Content_Types].xml` entry
- required `word/document.xml` entry
- legacy encrypted Office compound-file signature rejection
- SHA-256 checksum generation after validation

ZIP64 markers are rejected in this initial resume envelope. The current product maximum is 10 MiB, so ZIP64 is unnecessary for legitimate resume uploads.

## Malware scanning abstraction

Application/domain code depends on the `MalwareScanner` interface rather than ClamAV directly.

```text
MalwareScanner
└── scan(bytes)
    ├── CLEAN
    ├── INFECTED
    └── ERROR
```

The result records:

- engine
- engine version when available
- detection signature when infected
- scanned byte count
- scan duration

The first adapter is ClamAV using the daemon TCP INSTREAM protocol. Local infrastructure runs ClamAV as an isolated Docker service on port `3310` with a persistent signatures volume.

Environment contract:

```text
CLAMAV_HOST
CLAMAV_PORT
CLAMAV_TIMEOUT_MS
```

## Queue and outbox delivery

Upload completion emits `candidate.resume.upload_completed` inside the same database transaction as the `UPLOADED` transition.

The scheduler polls unpublished matching outbox events and publishes them to the shared resume-security BullMQ queue.

Initial job policy:

- stable job id derived from outbox event id
- 3 attempts
- exponential backoff beginning at 1 second
- bounded completed/failed job retention

An outbox event is marked published only after queue insertion succeeds. Queue insertion failures leave the event unpublished for a later scheduler dispatch attempt.

## Retry and crash recovery contract

Security processing is state-aware and idempotent.

Normal claim:

```text
UPLOADED → VALIDATING
```

Retryable infrastructure failures:

```text
VALIDATING / SCANNING
→ FAILED_RETRYABLE
→ VALIDATING on a later BullMQ attempt
```

Security-specific retryable failure codes currently include:

- `RESUME_OBJECT_READ_FAILED`
- `MALWARE_SCANNER_UNAVAILABLE`

A retry execution may also reclaim an interrupted `VALIDATING` or `SCANNING` state. This covers worker/process interruption after a durable state transition but before the attempt reported a normal retryable failure.

The final exhausted BullMQ attempt converts infrastructure failure to:

```text
FAILED_TERMINAL
```

State transitions use conditional updates so concurrent/duplicate deliveries do not blindly overwrite an already advanced state. Audit/outbox finalization occurs only after the guarded transition succeeds.

## Rejection and quarantine behavior

Deterministic invalid files are rejected with `RESUME_VALIDATION_*` failure codes.

Examples:

- `RESUME_VALIDATION_FILE_EMPTY`
- `RESUME_VALIDATION_FILE_TOO_LARGE`
- `RESUME_VALIDATION_SIGNATURE_MISMATCH`
- `RESUME_VALIDATION_CORRUPT_DOCUMENT`
- `RESUME_VALIDATION_ENCRYPTED_DOCUMENT`
- `RESUME_VALIDATION_UNSUPPORTED_DOCUMENT`

Malware detection uses:

```text
processingState = REJECTED
failureCode = MALWARE_DETECTED
```

The original object remains in private storage for controlled security/retention handling, but normal candidate download authorization is denied for `MALWARE_DETECTED`. This is the Phase 3C logical quarantine boundary. No public object URL is created.

Physical quarantine-bucket movement or timed destruction may be added later if operational/security policy requires it; business/domain code must not depend on a particular object-storage provider layout.

## Audit and event contract

Security success:

- audit: `candidate.resume.security_passed`
- outbox: `candidate.resume.security_passed`
- next state: `EXTRACTING`

Security rejection:

- audit: `candidate.resume.security_rejected`
- outbox: `candidate.resume.security_rejected`
- state: `REJECTED`

Exhausted infrastructure failure:

- audit: `candidate.resume.security_failed_terminal`
- outbox: `candidate.resume.security_failed_terminal`
- state: `FAILED_TERMINAL`

Raw resume text or bytes are not placed in audit/outbox payloads.

## Automated coverage implemented

Shared validator coverage includes:

- valid PDF
- spoofed PDF signature
- encrypted PDF
- structurally valid DOCX ZIP
- truncated DOCX ZIP
- missing required Word document part
- encrypted ZIP entries
- encrypted legacy Office compound document
- recorded-size mismatch

ClamAV adapter coverage includes response parsing for clean/infected/error results.

Worker coverage includes:

- scanner error → `FAILED_RETRYABLE`
- later retry → `EXTRACTING`
- final scanner error → `FAILED_TERMINAL`
- interrupted `SCANNING` retry recovery
- infected scan → `REJECTED` / `MALWARE_DETECTED`
- invalid file rejection before malware scanning

Scheduler coverage includes:

- successful outbox → queue dispatch and publish marking
- malformed payload attempt accounting
- queue failure leaving event unpublished for later retry

API integration coverage includes candidate download denial for malware-quarantined resume versions.

## Verification still required before Phase 3C closure

Phase 3C must not be marked closed until the following are proven locally:

1. `pnpm format` and the complete `pnpm check` are green.
2. PostgreSQL, Redis, RustFS, and ClamAV are healthy locally.
3. Scheduler and worker start successfully with the configured services.
4. A real clean PDF travels through upload → validation → ClamAV → `EXTRACTING`.
5. A harmless EICAR antivirus test signature inside a structurally valid PDF travels through validation → ClamAV and ends as `REJECTED / MALWARE_DETECTED`.
6. The EICAR-rejected ResumeVersion cannot receive a normal private download authorization.
7. A scanner-unavailable path demonstrates bounded retry behavior and terminal classification after the final attempt, or equivalent automated/runtime evidence is accepted.
8. The repository returns to a clean working tree after any lockfile/format normalization.

## Phase boundary

Phase 3C stops at `EXTRACTING`.

It does **not** extract resume text, run OCR, parse candidate claims, or mutate the Career Passport. Those responsibilities belong to Phases 3D–3F.
