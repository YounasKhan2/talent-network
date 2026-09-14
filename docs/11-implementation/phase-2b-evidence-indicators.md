# Phase 2B — Evidence Indicators

## Status

**Code complete / local quality gate and browser verification pending.**

This slice adds explainable candidate-side evidence semantics without creating false verification claims or a second mutable evidence database.

## Goals

Evidence indicators answer three questions for the candidate and future matching engine:

1. What claim is being evaluated?
2. What supporting material exists for that claim?
3. Has Talent Network independently verified it?

Phase 2B intentionally answers the third question with **no** unless a real verification workflow exists.

## Evidence levels

```text
DECLARED
Candidate supplied the claim.
No independent verification is implied.

SUPPORTED
Candidate supplied the claim and attached supporting material such as a repository,
project URL, credential, professional link, or custom-entry URL.
Supporting material is not equivalent to verification.

VERIFIED
Reserved for future independent verification workflows.
Phase 2B does not derive this level from profile data alone.
```

## Source types

```text
PROFILE
URL
REPOSITORY
CREDENTIAL
FUTURE_VERIFICATION
```

`FUTURE_VERIFICATION` is part of the vocabulary only; Phase 2B does not generate verified indicators.

## Current derivation rules

| Subject           | Rule                                | Result                   |
| ----------------- | ----------------------------------- | ------------------------ |
| Skill             | Candidate entered skill             | `DECLARED`               |
| Experience        | Candidate entered employment        | `DECLARED`               |
| Project           | Repository URL attached             | `SUPPORTED / REPOSITORY` |
| Project           | Project URL attached, no repository | `SUPPORTED / URL`        |
| Project           | No evidence URL                     | `DECLARED`               |
| Certification     | Credential URL attached             | `SUPPORTED / CREDENTIAL` |
| Certification     | Credential ID attached              | `SUPPORTED / CREDENTIAL` |
| Certification     | No credential evidence              | `DECLARED`               |
| Professional link | URL attached                        | `SUPPORTED / URL`        |
| Custom entry      | URL attached                        | `SUPPORTED / URL`        |
| Custom entry      | No URL                              | `DECLARED`               |

## Architectural choice

Evidence indicators are derived from the selected Career Passport version rather than persisted as separate mutable records.

```text
Career Passport version
        ↓
Project / certification / link / claim fields
        ↓
Pure evidence derivation
        ↓
Evidence workspace + future matching input
```

This avoids drift such as a project repository being removed while an old `SUPPORTED` database row remains behind.

Historical application snapshots can derive evidence from the exact frozen Career Passport version they reference.

## Matching contract

Future matching must preserve evidence level separately from eligibility and relevance.

```text
Eligibility / role fit
        ≠
Evidence level
        ≠
Verification status
        ≠
Confidence
```

Required rules:

- missing evidence is not negative evidence
- `SUPPORTED` does not mean `VERIFIED`
- custom-section evidence remains supporting semantic context unless a job rule explicitly models it
- evidence may increase explanation quality without becoming an opaque score multiplier
- verification workflows must record who/what verified the claim, when, and under which method before producing `VERIFIED`

## Candidate UX

Route:

```text
/career/evidence
```

The page exposes:

- total indicators
- declared count
- supported count
- verified count
- per-indicator subject type
- evidence level
- source type
- explanation
- supporting URL when available
- filters by evidence level
- current Passport version reference

The copy explicitly explains that evidence links are supporting material, not Talent Network verification.

## Privacy

Evidence remains candidate-owned Career data.

Organization membership does not grant access to `/career/evidence`. The existing Career workspace guard and Candidate privacy firewall remain authoritative.

Future employer visibility must occur only through intentional hiring-process submission, such as an application snapshot, not because the same user belongs to the employer organization.

## Versioning

Opening or filtering evidence indicators is read-only and must not create a Career Passport version.

Because evidence is derived from the selected Passport snapshot, a professional edit naturally changes evidence state only when that edit creates the next approved Passport version.

## Deferred verification infrastructure

Phase 2B deliberately does **not** add:

- identity-verification provider integration
- employer confirmation of employment
- issuing-authority API verification
- GitHub account ownership verification
- assessment-backed skill verification
- background-check integrations
- generic persisted `EvidenceIndicator` rows

Those capabilities can later produce real `VERIFIED` evidence through an auditable verification domain instead of overloading profile metadata.

## Verification checklist

Before marking this slice verified:

1. `pnpm check` passes.
2. `/career/evidence` loads for a Candidate user.
3. A skill appears as `Declared`.
4. An experience entry appears as `Declared`.
5. A project with repository URL appears as `Supported / Repository`.
6. A project with only project URL appears as `Supported / URL`.
7. A certification with credential evidence appears as `Supported / Credential`.
8. A professional link appears as `Supported / URL`.
9. A custom entry with URL appears as supported.
10. A custom entry without URL remains declared.
11. Verified count remains zero because no independent verification workflow exists yet.
12. Evidence links open correctly.
13. Filtering does not mutate the Passport or increment its version.
14. Mobile/narrow layout remains usable.
15. A user without Career context is still routed through explicit Career onboarding.
