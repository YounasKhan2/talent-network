# Phase 3G Implementation Status

This file is the live implementation checkpoint for Phase 3G while the architecture specification remains the design contract.

## Current status

```text
3G-A Contracts + benchmark vocabulary         ✅ VERIFIED
3G-B Layout-aware DocumentGraph               ✅ VERIFIED
3G-C Structural section/record detection      🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
3G-D Source Ledger + reconciliation           ⬜ NOT STARTED
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

## 3G-C implementation scope

3G-C introduces a structural detector over `DocumentGraph V1`.

It is intentionally not a typed career parser.

It may use structural heading evidence and the shared heading taxonomy to locate boundaries, but it does not produce `CandidateExperience`, `CandidateEducation`, or other authoritative career entities.

The stage adds:

- `ResumeStructuralDocumentV1`
- stable structural section IDs
- stable structural record IDs
- preamble/unsectioned node preservation
- trusted DOCX heading boundaries
- PDF heading recognition from known heading aliases
- conservative unknown-uppercase heading detection after a trusted section
- deterministic table-row record boundaries
- list-only record boundaries
- repeated date-bearing record anchors for text layouts
- explicit `SECTION_BOUNDARY_UNCERTAIN` and `RECORD_BOUNDARY_UNCERTAIN` diagnostics
- lossless fallback records when exact record splitting cannot yet be proven

### 3G-C acceptance gate

3G-C is verified only after:

```text
contracts build                         PASS
resume-parsing lint                     PASS
resume-parsing typecheck                PASS
resume-parsing test                     PASS
resume-parsing build                    PASS
pnpm format                             no changes
git status --short                      clean
```

The stage must not be marked verified from code inspection alone.
