# Phase 3D — Resume Extraction and OCR Fallback

## Status

**3D-A CONTRACT + PERSISTENCE FOUNDATION IMPLEMENTED / VERIFICATION PENDING — 2026-09-15**

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

Source ranges are offsets into the normalized document/page representation. PDF extractors should preserve page identity. DOCX is logically page-less at the OOXML layer, so page identity must not be fabricated; the normalized representation may use a single logical source unit until a renderer-based page map is deliberately introduced.

## Quality decision

The native extractor reports observations. A separate deterministic quality evaluator decides whether OCR is required. The first policy considers non-whitespace character count, page/text coverage, replacement-character ratio, control-character ratio, and extractor warnings/errors. Thresholds are versioned in the shared extraction package and fixture-tested. Missing text is not treated as malicious; it routes to OCR when appropriate.

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

Prisma now uses its multi-file schema-folder mode. The extraction model is isolated in `prisma/resume-extraction.prisma`, while the database migration owns the FK to `ResumeVersion`. This keeps the source-artifact model from accumulating derived-pipeline concerns while retaining referential integrity.

## Queue contracts

Logical queues:

```text
resume.extract
resume.ocr
```

`candidate.resume.security_passed` is the durable handoff from 3C to extraction. Extraction completion should emit metadata-only events such as `candidate.resume.extraction_completed` or `candidate.resume.ocr_required`; payloads must not contain raw text.

Stable job identity must prevent duplicate processing from creating duplicate derived records.

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

## Resource limits

Extraction must have explicit bounds for maximum source bytes inherited from upload policy, maximum pages, maximum normalized characters, execution timeout, OCR page count, OCR concurrency, and derived artifact size. Limit breaches must use explicit failure codes and must never silently truncate evidence that Phase 3E could mistake for a complete resume.

## 3D implementation slices

### 3D-A — Contracts and persistence foundation ← VERIFICATION PENDING

Implemented:

- shared extraction types and adapter contracts
- deterministic quality-decision contract and tests
- queue/event vocabulary
- `ResumeExtraction` persistence model and migration
- modular Prisma schema-folder configuration
- integration coverage for source immutability, stable execution identity, candidate-scoped ownership lookup, and cascade cleanup

Closure requires the local root quality gate to pass with the new migration and generated Prisma client.

### 3D-B — Native PDF/DOCX extraction ← NEXT

- PDF text/page extraction adapter
- DOCX OOXML text extraction adapter
- normalized whitespace/source blocks
- fixture tests for common resume layouts
- timeout/size/page limits

### 3D-C — Quality routing

- versioned quality policy
- native-text sufficient → `PARSING`
- scanned/insufficient → `OCR_REQUIRED`
- metadata-only audit/outbox events

### 3D-D — OCR fallback

- OCR adapter boundary
- local/provider implementation selected deliberately
- bounded OCR worker path
- OCR result normalization into the same ResumeDocument schema
- `OCR_REQUIRED → PARSING`
- retry/terminal behavior

### 3D-E — Runtime closure

Verify at minimum:

1. real native-text PDF → native extraction → `PARSING`
2. real DOCX → native extraction → `PARSING`
3. scanned/image PDF → `OCR_REQUIRED` → OCR → `PARSING`
4. page/source mapping survives normalization
5. derived text remains candidate-private
6. no raw text appears in audit/outbox/logs
7. retries are idempotent
8. root `pnpm check` is green

## Non-goals

Phase 3D does not identify skills, employers, education, or contact fields; calculate candidate/job match scores; call an LLM to interpret the resume; update Career Passport data; or expose extracted text to recruiters. Those boundaries prevent extraction infrastructure from becoming an opaque parsing or hiring-decision system.
