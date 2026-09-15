# Phase 3C — Resume Validation and Malware Scanning

## Status

**CLOSED / VERIFIED — 2026-09-15**

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

The result records engine, engine version when available, detection signature when infected, scanned byte count, and scan duration.

The first adapter is ClamAV using the daemon TCP INSTREAM protocol. Local infrastructure runs ClamAV as an isolated Docker service on port `3310` with a persistent signatures volume.

Environment contract:

```text
CLAMAV_HOST
CLAMAV_PORT
CLAMAV_TIMEOUT_MS
```

## Queue, retry, and recovery contract

Upload completion emits `candidate.resume.upload_completed` inside the same database transaction as the `UPLOADED` transition. The scheduler publishes it to the shared resume-security BullMQ queue with a stable job id, three attempts, and exponential backoff beginning at one second. An outbox event is marked published only after queue insertion succeeds.

Security processing is state-aware and idempotent. Retryable object-read or scanner failures enter `FAILED_RETRYABLE`; later BullMQ attempts can reclaim that state as well as interrupted `VALIDATING` or `SCANNING` states. Exhaustion converts the failure to `FAILED_TERMINAL`. Guarded conditional transitions prevent duplicate/concurrent deliveries from blindly overwriting already-advanced state.

Security-specific retryable codes currently include:

- `RESUME_OBJECT_READ_FAILED`
- `MALWARE_SCANNER_UNAVAILABLE`

## Rejection and quarantine behavior

Deterministic invalid files are rejected with `RESUME_VALIDATION_*` failure codes. Malware detection uses:

```text
processingState = REJECTED
failureCode = MALWARE_DETECTED
```

The original object remains in private storage for controlled security/retention handling, but normal candidate download authorization is denied for `MALWARE_DETECTED`. This is the Phase 3C logical quarantine boundary. No public object URL is created.

Physical quarantine-bucket movement or timed destruction may be added later if operational/security policy requires it; business/domain code must not depend on a particular object-storage provider layout.

## Audit and event contract

Security success emits `candidate.resume.security_passed` to audit/outbox and advances to `EXTRACTING`. Security rejection emits `candidate.resume.security_rejected`. Exhausted infrastructure failure emits `candidate.resume.security_failed_terminal` and enters `FAILED_TERMINAL`.

Raw resume text or bytes are not placed in audit/outbox payloads.

## Automated coverage

Coverage includes PDF/DOCX validation, corruption/encryption/spoof cases, ClamAV response parsing, retry and crash recovery, infected-file rejection, invalid-file rejection before scanning, scheduler dispatch failure behavior, and API download denial for malware-quarantined resume versions.

The root `pnpm check` was verified green locally on 2026-09-15, including resume-security, scheduler, worker, API, Phase 1/2/2A/2B/3 integration suites, and the final build.

## Runtime closure evidence — 2026-09-15

Phase 3C was closed after real local end-to-end acceptance through the production-shaped browser/direct-storage/queue/worker path.

### Clean PDF

A newly authorized browser upload:

- obtained candidate-owned presigned upload authorization
- uploaded directly from the browser to private RustFS with HTTP 200
- completed through the API and populated `uploadedAt`
- emitted `candidate.resume.upload_completed`
- was dispatched by the scheduler to BullMQ
- was consumed by the worker
- passed deterministic PDF validation
- populated `checksumSha256`
- reached live ClamAV scanning
- advanced from `SCANNING` to `EXTRACTING`
- retained `failureCode = null` and `failureMetadata = null`

The browser CORS path was also hardened and verified using the local RustFS bootstrap policy rather than bypassing direct upload through the API.

### Harmless EICAR antivirus acceptance

A structurally valid PDF containing the standard harmless EICAR antivirus test signature was uploaded through the same real browser flow.

Observed result:

```text
UPLOADED
→ VALIDATING
→ SCANNING
→ REJECTED
```

Durable result:

```text
processingState = REJECTED
failureCode = MALWARE_DETECTED
signature = Eicar-Signature
engine = clamav
```

The ResumeVersion had both `uploadedAt` and a SHA-256 checksum populated. A subsequent candidate download-authorization request returned HTTP 409 with `RESUME_SECURITY_QUARANTINED`, proving logical quarantine prevents normal signed download access.

### Retry evidence

Scanner-unavailable bounded retry and final terminalization are covered by the worker's automated retry tests, including recovery from interrupted security states. This automated evidence was accepted for the infrastructure-failure branch; the clean and infected branches were additionally verified against live RustFS, Redis/BullMQ, PostgreSQL, scheduler, worker, and ClamAV services.

## Closure decision

All Phase 3C closure requirements are satisfied. The security boundary is now considered verified for the MVP envelope.

Known future hardening remains deliberately outside this closure:

- physical quarantine bucket/destruction policy
- scheduler multi-replica claim leasing
- dead-letter handling for permanently malformed outbox payloads
- broader malware-engine/provider redundancy if operational requirements justify it

## Phase boundary

Phase 3C stops at `EXTRACTING`.

It does **not** extract resume text, run OCR, parse candidate claims, or mutate the Career Passport. Those responsibilities belong to Phases 3D–3F.
