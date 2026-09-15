# ResumeDocument V2 — PDF.js Layout Preservation

## Status

Implemented in code; local quality gate and real-resume runtime acceptance are still required before this slice is marked verified.

## Why V2 exists

The original native PDF adapter used PDF.js correctly as a parser, but reduced every `TextItem` to only `str` and `hasEOL`. That discarded geometry, font and structure signals before resume preprocessing began. The resulting `ResumeDocument` was therefore text-centric and could not reliably preserve visual relationships such as title/date rows, columns or heading hierarchy.

`resume-document-v2` keeps the source PDF.js text layer and derives layout from it without replacing or mutating the source evidence.

## Architecture boundary

```text
private PDF bytes
  -> PDF.js getDocument
  -> page.getTextContent(includeMarkedContent=true, disableNormalization=true)
  -> page geometry / optional structure tree
  -> immutable PDF.js-derived page evidence
  -> deterministic line reconstruction
  -> ResumeDocument V2
  -> preprocessing / section detection
  -> semantic parser proposal
  -> evidence/confidence validation
  -> candidate review
  -> Career Passport only after explicit candidate decision
```

PDF.js remains the native PDF extraction engine. OCR remains a separate fallback path for PDFs whose native text quality is insufficient.

## Preserved PDF.js text-layer data

For each native PDF page V2 retains:

- page number
- page rotation
- user unit
- page view box
- viewport width, height, rotation and scale
- `TextContent.lang`
- every supported `TextItem` value:
  - text (`str`)
  - direction (`dir`)
  - transform matrix
  - width
  - height
  - font name
  - end-of-line signal
- marked-content boundaries returned by `getTextContent` when available
- `TextContent.styles`, including ascent, descent, vertical orientation and font family
- the optional logical structure tree returned by `getStructTree()`

The structure tree is nullable by design; untagged PDFs must still work through geometry-based reconstruction.

## Derived layout is rebuildable

Raw PDF.js-derived text-layer information is stored separately from derived `lines` and `blocks`. This is deliberate: layout algorithms can improve without needing to re-upload the source resume or pretending old derived interpretations were original evidence.

The current deterministic layout layer:

1. derives X/Y coordinates from the text transform matrix;
2. clusters text items into visual rows using a bounded Y tolerance based on median text height;
3. orders row items by X (with RTL handling);
4. inserts spaces based on geometric gaps rather than blindly appending a space after every PDF item;
5. emits bounding boxes and source PDF item indexes for each reconstructed line;
6. preserves page-local source ranges for evidence mapping.

Column/section semantics are intentionally downstream concerns. The V2 extractor should preserve enough source evidence for those algorithms rather than hard-code resume semantics into PDF extraction.

## What is intentionally not persisted

PDF rendering operator lists are not part of the resume extraction artifact. They represent rendering instructions rather than the text/document evidence needed by the resume parser and would create substantial storage/coupling cost. If a future measured requirement needs a rendering primitive, it must be researched and introduced behind a new versioned contract rather than silently added.

## Schema compatibility

- Historical extraction rows remain `resume-document-v1`.
- New extraction rows default to `resume-document-v2`.
- Worker persistence explicitly writes the actual document schema version, so the relational metadata and `documentJson` cannot silently disagree.
- Parsing preprocessing accepts the source document schema version as data, preserving the ability to read legacy fixtures while V2 becomes the current extraction contract.

## Security / privacy invariants

- Source resume bytes remain in private object storage.
- PDF.js extraction runs inside the worker boundary; source bytes are not exposed to organization workspaces.
- Raw/layout resume data is candidate-private derived data.
- Audit and outbox events contain identifiers, versions, checksums and processing metadata only; no resume body text is emitted.
- Semantic parser output remains a proposal and never mutates the Career Passport without candidate approval.

## Resume deletion lifecycle

Candidate-owned resume deletion purges private source and derived object-storage artifacts before deleting the database aggregate. Database deletion cascades through ResumeVersion -> ResumeExtraction/ResumeParseResult -> ResumeReview. An already-created Career Passport version is historical authoritative profile state and is not deleted with the source resume.

If object-storage deletion fails, the database aggregate remains so the product does not falsely claim the private artifact was erased.

## Required acceptance gate

Before V2 is verified:

1. Prisma schema validates and migration deploys.
2. resume-extraction lint/typecheck/tests/build pass.
3. resume-parsing lint/typecheck/tests pass.
4. worker/API/web typechecks pass.
5. full repository `pnpm check` passes.
6. a real native PDF is uploaded through the normal private pipeline.
7. persisted native extraction reports `resume-document-v2`.
8. persisted page data contains transforms, dimensions, font references, styles and viewport geometry.
9. reconstructed lines preserve visual rows sufficiently for downstream section parsing.
10. date ranges such as `2025 - 2026` are not emitted as phone claims.
11. deleting a test resume removes the source/derived resume data while leaving Passport history intact.

No semantic parser quality claim is implied by completing this extraction slice. Semantic resume parsing is a separate downstream acceptance gate.
