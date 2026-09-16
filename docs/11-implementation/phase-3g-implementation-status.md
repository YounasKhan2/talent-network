# Phase 3G Implementation Status

This file is the live implementation checkpoint for Phase 3G while the architecture specification remains the design contract.

## Current status

```text
3G-A Contracts + benchmark vocabulary         ✅ VERIFIED
3G-B Layout-aware DocumentGraph               ✅ VERIFIED
3G-C Structural section/record detection      ✅ VERIFIED
3G-D Source Ledger + reconciliation           ✅ VERIFIED
3G-E Core typed extractors V2                 🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
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

Verified locally on 2026-09-16:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 43/43 resume-parsing tests passed
- known and unknown section-boundary tests passed
- multi-record date-anchor grouping passed
- table-row record detection passed
- list-only and ambiguous-prose preservation passed
- formatting cleanup was committed and the working tree was clean

### 3G-D

Verified locally on 2026-09-16 after the `exactOptionalPropertyTypes` correction:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 47/47 resume-parsing tests passed
- Source Ledger source-preservation tests passed
- mapped/partial/unmapped reconciliation tests passed
- intentional-ignore reason enforcement passed
- invalid mapping decisions fail closed
- formatting produced no remaining changes and the working tree was clean

## 3G-E implementation scope

3G-E introduces deterministic core typed extractors over `DocumentGraph V1` plus `ResumeStructuralDocumentV1`.

It does not replace the production parser yet. Runtime cutover remains a later Phase 3G integration/closure concern.

The stage adds:

- evidence-grounded Contact Information extraction from preserved preamble nodes
- Professional Summary extraction from structural summary records
- Work Experience extraction per structural record
- Education extraction per structural record
- Skills extraction per structural record
- Certification extraction including preserved table-cell records
- Awards extraction as a first-class V2 core result
- explicit Source Ledger decisions for every handled core record/node
- `MAPPED`, `PARTIALLY_MAPPED`, and `UNMAPPED` outcomes based on what can actually be proven
- fail-closed source-identity validation between the graph and structural document
- no external provider and no new third-party parsing dependency

### 3G-E invariants

```text
structural record
→ typed claim only when source evidence exists
```

```text
ambiguous core record
→ PARTIALLY_MAPPED or UNMAPPED
→ never invented completion
```

```text
3G-E output
!=
authoritative Career Passport state
```

Candidate approval remains required before Resume Intelligence can create an authoritative Career Passport version.

### 3G-E acceptance gate

3G-E is verified only after:

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
