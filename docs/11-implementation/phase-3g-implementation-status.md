# Phase 3G Implementation Status

This file is the live implementation checkpoint for Phase 3G while the architecture specification remains the design contract.

## Current status

```text
3G-A Contracts + benchmark vocabulary         ✅ VERIFIED
3G-B Layout-aware DocumentGraph               ✅ VERIFIED
3G-C Structural section/record detection      ✅ VERIFIED
3G-D Source Ledger + reconciliation           ✅ VERIFIED
3G-E Core typed extractors V2                 ✅ VERIFIED
3G-F Extensions + open-world fallback         🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
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

### 3G-E

Verified locally on 2026-09-17:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 50/50 resume-parsing tests passed
- deterministic core extraction tests passed for contact, summary, experience, education, skills, certifications, and awards
- ambiguous records remained partial/unmapped instead of inventing missing fields
- graph/structural source mismatch failed closed
- formatting cleanup was committed/pushed and the working tree was clean

## 3G-F implementation scope

3G-F extends the structural V2 extraction pipeline beyond the seven core Career Passport sections while preserving the open-world invariant.

The stage adds:

- typed Project extraction from structural project records
- typed Language extraction with optional proficiency
- typed Professional Link extraction with evidence-grounded HTTP(S) URLs
- typed preferred-location extraction for Location Preferences
- lossless preservation for known extension sections stored as custom sections
- lossless preservation for completely unknown headings as `CUSTOM / NEEDS_REVIEW`
- original source heading, taxonomy type, classification confidence/status, source order, and evidence retention
- private-only preservation of References with `THIRD_PARTY_REFERENCE_DATA`
- recursive record-node traversal so preserved table/list child content remains available
- Source Ledger decisions for typed, preserved, private-only, partial, and unmapped extension records
- fail-closed graph/structure source identity validation
- no new parser dependency and no external provider

### 3G-F open-world invariant

```text
known extension
→ typed extension when a trustworthy typed extractor exists
→ otherwise evidence-grounded additional section
```

```text
unknown heading
→ CUSTOM
→ NEEDS_REVIEW
→ original heading + source content preserved
→ never discarded
```

```text
References
→ preserved privately
→ PRIVATE_ONLY
→ not ordinary Career Passport content
```

### 3G-F acceptance gate

3G-F is verified only after:

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
