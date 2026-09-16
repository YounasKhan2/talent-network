# Phase 3G Implementation Status

This file is the live implementation checkpoint for Phase 3G while the architecture specification remains the design contract.

## Current status

```text
3G-A Contracts + benchmark vocabulary         ✅ VERIFIED
3G-B Layout-aware DocumentGraph               ✅ VERIFIED
3G-C Structural section/record detection      🟡 FUNCTIONALLY GREEN / FORMAT CLEANUP PENDING
3G-D Source Ledger + reconciliation           🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
3G-E Core typed extractors V2                 ⬜ NOT STARTED
3G-F Extensions + open-world fallback         ⬜ NOT STARTED
3G-G Semantic recovery capability gate        ⬜ NOT STARTED
3G-H Candidate Review UX V2                   ⬜ NOT STARTED
3G-I Benchmark expansion + regression gate    ⬜ NOT STARTED
3G-J Runtime closure                          ⬜ NOT STARTED
```

## Verification evidence

### 3G-A

Verified locally on 2026-09-16:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 35/35 resume-parsing tests passed
- benchmark negative and positive cases behaved as designed
- formatting left the working tree clean

### 3G-B

Verified locally on 2026-09-16:

- contracts build passed
- resume-parsing lint/typecheck/build passed
- 39/39 resume-parsing tests passed
- PDF graph tests passed
- DOCX heading/list/table/cell/link graph tests passed
- OCR graph and uncertainty diagnostics tests passed

### 3G-C

Functionally green locally on 2026-09-16:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 43/43 resume-parsing tests passed
- known and unknown section-boundary tests passed
- multi-record date-anchor grouping passed
- table-row record detection passed
- list-only and ambiguous-prose preservation passed
- `pnpm format` changed only `packages/resume-parsing/src/structural-detection.test.ts`

3G-C remains short of `VERIFIED` until that formatting-only change is committed/pushed and the working tree is clean.

## 3G-D implementation scope

3G-D introduces the Source Ledger and record reconciliation engine over `ResumeStructuralDocumentV1`.

The stage is responsible for proving what happened to every meaningful structural source unit before typed extraction is allowed to claim complete coverage.

It adds:

- one ledger entry for every structural section
- one ledger entry for every structural record
- ledger entries for unsectioned meaningful nodes
- shared taxonomy classification on section/record ledger entries
- default `PRIVATE_ONLY` handling for References
- explicit mapping decisions for `MAPPED`, `PARTIALLY_MAPPED`, `UNMAPPED`, `PRIVATE_ONLY`, and `INTENTIONALLY_IGNORED`
- fail-closed validation for impossible or malformed mapping decisions
- source-coverage calculation that excludes section containers from double counting
- complete/incomplete coverage based on unresolved meaningful records/nodes
- per-section record reconciliation counts
- separate source-accounting completeness from semantic record coverage
- diagnostics for unmapped sections, unmapped records, partial mappings, and private third-party data

### 3G-D invariants

```text
UNMAPPED != UNPROCESSED
```

An `UNMAPPED` source is still accounted for because the system explicitly preserved and surfaced it. An `UNPROCESSED` source prevents complete coverage.

```text
References
→ PRIVATE_ONLY by default
→ accounted for
→ not treated as mapped Career Passport content
```

```text
INTENTIONALLY_IGNORED
→ requires an explicit reason code
```

### 3G-D acceptance gate

3G-D is verified only after:

```text
contracts lint                         PASS
contracts typecheck                    PASS
contracts build                        PASS
resume-parsing lint                    PASS
resume-parsing typecheck               PASS
resume-parsing test                    PASS
resume-parsing build                   PASS
pnpm format                            no unexpected changes
git status --short                     clean
```

The stage must not be marked verified from code inspection alone.
