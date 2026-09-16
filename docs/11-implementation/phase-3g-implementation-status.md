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
3G-I Benchmark expansion + regression gate    ✅ VERIFIED
3G-J Runtime closure                          🟡 IMPLEMENTED / AWAITING LOCAL + RUNTIME VERIFICATION
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
- document/structural quality remained explicit pending-runtime states instead of fabricated browser scores
- formatting cleanup was committed/pushed and the stage was consolidated into one final commit

### 3G-I

Verified locally on 2026-09-17:

- the contracts and resume-parsing quality gate passed
- seed regression tests passed
- silent record-loss, unknown-preservation, and privacy regressions fail closed
- production readiness remains blocked until the real artifact-backed benchmark corpus satisfies policy
- formatting/status gate was green before 3G-J began

## 3G-J implementation scope

3G-J closes the Phase 3G architecture by making the V2 pipeline the production worker path rather than a parallel library implementation.

The runtime path is now:

```text
verified ResumeDocument
→ DocumentGraph V1
→ structural sections + records
→ core typed extraction V2
→ extension/open-world extraction V2
→ Source Ledger + reconciliation
→ document/structural/claim/source quality signals
→ persisted ParsedResume compatibility proposal + sanitized runtimeV2 telemetry
→ Candidate Review V2
→ candidate ACCEPT / EDIT / IGNORE
→ Career Passport
```

The stage adds:

- `ResumeIntelligenceV2Parser` as the production worker parser
- verified source `ResumeDocument` passed directly into the parser instead of reconstructing layout from flattened text
- no silent legacy-parser fallback for V2-owned fields
- persisted `runtimeV2` telemetry inside the versioned private parse proposal
- measured document quality and structural confidence
- Source Ledger accounting and record reconciliation exposed to Candidate Review V2
- sanitized diagnostics without raw source text
- private References represented only by private-source counts/status in the review proposal
- third-party reference names/emails/phones excluded from `parsedJson`
- typed Awards retained in V2 output while an evidence-grounded compatibility Award section preserves the existing Phase 3F import path
- historical pre-3G-J parse results remain readable; Review V2 falls back to their legacy coverage metrics without inventing V2 scores
- worker-level persistence coverage proving V2 telemetry reaches `READY_FOR_REVIEW`
- no new provider, SDK, infrastructure service, database migration, or semantic-recovery network call

### 3G-J runtime ownership invariant

```text
production worker
→ ResumeIntelligenceV2Parser
→ V2 structural pipeline owns extraction

legacy parser classes
→ compatibility/tests only
→ never used as silent field fallback
```

### 3G-J privacy invariant

```text
References source record
→ PRIVATE_ONLY in Source Ledger
→ private count/status may be persisted
→ third-party source text MUST NOT be persisted in review parsedJson
→ MUST NOT become ordinary Career Passport content
```

### 3G-J quality invariant

```text
Claim confidence
!= Document quality
!= Structural confidence
!= Source accounting
```

All four signals are persisted/displayed independently when available.

### 3G-J compatibility invariant

```text
new V2 parse
→ existing ParsedResume review/import boundary preserved
→ runtimeV2 telemetry added

historical parse
→ still reviewable
→ no fake V2 telemetry
```

### 3G-J acceptance gate

3G-J is verified only after the local code gate passes:

```text
contracts lint                         PASS
contracts typecheck                    PASS
contracts build                        PASS
resume-parsing lint                    PASS
resume-parsing typecheck               PASS
resume-parsing test                    PASS
resume-parsing build                   PASS
worker lint                            PASS
worker typecheck                       PASS
worker test                            PASS
worker build                           PASS
web lint                               PASS
web typecheck                          PASS
web build                              PASS
API lint                               PASS
API typecheck                          PASS
API Phase 3 integration                PASS
pnpm format                            no unexpected changes
git status --short                     clean
```

The live runtime gate must also pass with PostgreSQL, Redis, scheduler, and worker running:

```text
pnpm --filter @talent-network/api test:runtime:phase3e-parse
```

Runtime evidence must show:

- parse reaches `READY_FOR_REVIEW`
- persisted parser identity is `resume-intelligence-v2-parser@1`
- `runtimeV2` telemetry is present
- source accounting is explicit
- audit/outbox remain metadata-only
- parsing alone creates no Career Passport version
- duplicate delivery remains idempotent

The complex five-page acceptance resume must then be reprocessed through the actual worker and reviewed in the browser. Before 3G-J can be marked verified, record the observed V2 counts/coverage and confirm:

- four Work Experience records are not silently reduced
- two Education records are accounted for
- three Projects are accounted for
- five Certifications are accounted for
- four Languages are accounted for
- Publications, Patents, Volunteering, Professional Memberships, Interests, Awards, and unknown/additional content remain visible or explicitly accounted for
- three References are private-only and their third-party contact contents are not present in the review proposal payload
- Review V2 displays real Document quality, Structural quality, Source accounting, and reconciliation rather than `Pending V2 runtime`
- any unresolved record is explicitly partial/unmapped instead of disappearing

The stage must not be marked verified from code inspection or unit tests alone.
