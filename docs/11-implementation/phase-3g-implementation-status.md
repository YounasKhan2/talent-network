# Phase 3G Implementation Status

This file is the live implementation checkpoint for Phase 3G while the architecture specification remains the design contract.

## Current status

```text
3G-A Contracts + benchmark vocabulary         ✅ VERIFIED
3G-B Layout-aware DocumentGraph               ✅ VERIFIED
3G-C Structural section/record detection      ✅ VERIFIED
3G-D Source Ledger + reconciliation           ✅ VERIFIED
3G-E Core typed extractors V2                 ✅ VERIFIED
3G-F Extensions + open-world fallback         ✅ VERIFIED
3G-G Semantic recovery capability gate        ✅ VERIFIED
3G-H Candidate Review UX V2                   ✅ VERIFIED
3G-I Benchmark expansion + regression gate    🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
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

### 3G-F

Verified locally on 2026-09-17:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 55/55 resume-parsing tests passed
- typed Projects/Languages/Professional Links/Location Preferences extraction passed
- known extension preservation passed
- unknown `CUSTOM / NEEDS_REVIEW` preservation passed
- References remained `PRIVATE_ONLY`
- technology presentation labels were normalized without losing evidence provenance
- formatting cleanup was committed/pushed and the stage was consolidated into one final commit

### 3G-G

Verified locally on 2026-09-17:

- contracts lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 59/59 resume-parsing tests passed
- semantic recovery remained off when deterministic parsing left no unresolved source
- unresolved candidate-owned source became eligible only when provider/privacy/benchmark/latency/cost controls passed
- third-party-private reference source stayed blocked from remote recovery by default
- provider/benchmark/privacy/latency/cost failures returned explicit fail-closed reason codes
- formatting cleanup was committed/pushed and the stage was consolidated into one final commit

### 3G-H

Verified locally on 2026-09-17:

- web lint/typecheck/build passed
- resume-parsing lint/typecheck/build passed
- 59/59 resume-parsing tests passed
- API lint/typecheck passed
- full Phase 3 integration suite passed 31/31
- Review V2 removed the misleading `Overall confidence` presentation
- Claim confidence and Source coverage are presented independently
- additional/custom sections and private-reference guidance are visible without changing candidate authority
- document/structural quality remain explicit pending-runtime states instead of fabricated browser scores
- formatting cleanup was committed/pushed and the stage was consolidated into one final commit

## 3G-I implementation scope

3G-I converts the Phase 3G benchmark from a single golden-fixture harness into an explicit regression gate while keeping production-readiness claims honest.

The stage adds:

- a seed benchmark matrix spanning PDF, DOCX, scanned/OCR, two-column layout, open-world custom sections, and private References
- fixture metadata that distinguishes `AVAILABLE` artifacts from source-truth contracts that are only `SPECIFIED`
- suite-level fixture pass-rate and source-coverage calculations
- record F1 and field F1 thresholds
- evidence-grounding and unknown-preservation thresholds
- zero-tolerance privacy-violation gating
- a Phase 3G seed policy for immediate regression protection
- a separate production-readiness policy requiring at least 100 real artifact-backed fixtures
- explicit failure reasons when corpus size, artifact backing, quality, coverage, preservation, or privacy gates fail
- a hard rule that the seed suite passing does not imply production readiness

### 3G-I benchmark integrity invariant

```text
synthetic/specification-only fixture contract
→ useful for regression vocabulary and deterministic tests
→ does NOT count as a real artifact-backed production fixture
```

```text
production ready
→ >= 100 artifact-backed legal-safe fixtures
→ record F1 >= 0.95
→ field F1 >= 0.95
→ evidence grounding >= 0.99
→ meaningful-source accounting = 1.00
→ unknown preservation = 1.00
→ privacy violations = 0
```

The project must not manufacture fixture count by cloning generated observations or duplicating the same resume layout.

### 3G-I seed matrix

The seed suite currently describes these distinct regression classes:

- complex five-page PDF
- simple one-page PDF
- table-backed DOCX
- scanned/OCR image resume
- two-column PDF
- open-world custom-section resume
- third-party References/privacy resume

Only artifacts actually stored/available to the benchmark runner count toward `artifactBackedFixtureCount`.

### 3G-I acceptance gate

3G-I is verified only after:

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

Expected regression tests cover:

- seed suite spans multiple formats/layouts/privacy classes
- seed gate passes when every seed fixture and quality invariant passes
- one silent source-record regression fails the suite
- unknown-preservation or privacy regression fails closed
- production readiness remains blocked while the real artifact-backed corpus is below policy

The stage must not be marked verified from code inspection alone.
