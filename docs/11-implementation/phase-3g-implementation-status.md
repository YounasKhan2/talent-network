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
3G-H Candidate Review UX V2                   🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
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

## 3G-H implementation scope

3G-H upgrades the candidate-facing resume review workspace so quality and completeness are no longer represented by one misleading confidence percentage.

The stage intentionally remains compatible with the currently persisted Phase 3 runtime proposal. It does not fabricate Source Ledger or structural metrics that are not yet persisted.

The Review V2 experience adds:

- `Claim confidence` as an explicitly claim-level metric
- `Source coverage` as a separate metric from `coverageSummary`
- detected-vs-missed source section visibility
- preserved additional/custom sections surfaced before candidate approval
- References/private third-party data withheld from ordinary displayed content
- an explicit privacy explanation for References
- document-quality and structural-quality cards that truthfully state `Pending V2 runtime` until 3G-J persists those signals
- an explanation that Source Ledger record counts/reconciliation will arrive with the V2 runtime rather than being guessed in the browser
- removal of the old `Overall confidence` summary from the review UI
- no change to candidate authority: Accept/Edit/Ignore remain the only paths that can apply or reject a proposal

### 3G-H quality-model invariant

```text
Claim confidence
!=
Source coverage
!=
Document extraction quality
!=
Structural quality
```

The UI must never use one of these dimensions as a substitute for another.

### 3G-H compatibility invariant

```text
runtime telemetry persisted
→ display measured value

runtime telemetry not persisted
→ display explicit unavailable/pending state
→ never infer or manufacture a score in the browser
```

### 3G-H privacy invariant

```text
References / third-party contact data
→ private-only explanation
→ not rendered as ordinary Career Passport content
→ organization visibility unchanged
```

### 3G-H authority invariant

```text
resume proposal
→ review evidence only

candidate ACCEPT / EDIT
→ may create new RESUME_IMPORT Passport version

candidate IGNORE
→ Passport unchanged
```

3G-H does not alter the server-side approval transaction or authentication identity boundary.

### 3G-H acceptance gate

3G-H is verified only after:

```text
web lint                              PASS
web typecheck                         PASS
web build                             PASS (or documented environment-only blocker)
resume-parsing regression tests       PASS
API Phase 3 review integration        PASS
pnpm format                           no unexpected changes
git status --short                    clean
```

Browser acceptance should confirm:

- no `Overall confidence` label remains
- Claim confidence and Source coverage render independently
- detected/missed coverage sections are visible when coverage exists
- additional/custom sections are visible without exposing References content
- document/structural metrics show pending runtime state rather than fake values
- existing Accept/Edit/Ignore behavior remains intact
- contact data remains clearly separated from login/auth identity

The stage must not be marked verified from code inspection alone.
