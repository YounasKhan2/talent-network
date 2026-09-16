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
3G-G Semantic recovery capability gate        🟡 IMPLEMENTED / AWAITING LOCAL VERIFICATION
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

## 3G-G implementation scope

3G-G adds a provider-agnostic capability gate for semantic/model-assisted recovery. It does **not** select or wire a provider into the runtime parser.

The stage exists to prevent a model fallback from becoming an unreviewed accuracy, privacy, latency, cost, or vendor-lock-in dependency.

The capability gate evaluates:

- whether deterministic processing actually left `UNMAPPED` or `PARTIALLY_MAPPED` source
- candidate-owned vs third-party-private source classes
- structured-output support
- model-version pinning
- provider training/data-use posture
- retention guarantees
- regional-processing controls for remote APIs
- documented rate limits
- usage/observability metrics
- Talent Resume Benchmark fixture count
- record F1
- field F1
- evidence-grounding rate
- unknown-section preservation
- meaningful-source accounting
- privacy violations
- p95 latency
- estimated cost per resume

The default gate is intentionally strict. A provider or model is not eligible merely because it can return schema-valid JSON.

### 3G-G privacy invariant

```text
third-party private source
+ remote provider
+ no explicit policy approval
→ BLOCKED
```

References therefore remain ineligible for ordinary remote semantic recovery under the default policy.

### 3G-G fallback invariant

```text
deterministic pipeline resolved the source
→ semantic recovery OFF
```

```text
unresolved source exists
+ provider capability passes
+ benchmark passes
+ privacy passes
+ cost/latency pass
→ source may become eligible for semantic recovery
```

Eligibility is not authority. Any recovered fact must still be schema-validated, evidence-reconciled, surfaced for candidate review where required, and cannot become authoritative Career Passport state without candidate approval.

## Provider/tool research checkpoint

3G-G research reviewed current official documentation for representative managed providers before any integration decision.

### OpenAI API

Relevant official documentation:

- Structured Outputs / JSON Schema: https://platform.openai.com/docs/guides/structured-outputs
- Data controls and API data usage: https://platform.openai.com/docs/guides/your-data

Observed design implications:

- schema-constrained output is available
- API business data is not used for training by default
- retention/ZDR eligibility depends on endpoint/account configuration
- provider capability must therefore be recorded as configuration, not assumed globally

### Anthropic API

Relevant official documentation:

- Data usage and retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data
- API documentation: https://docs.anthropic.com/

Observed design implications:

- commercial API input/output is not used for model training by default
- standard retention and approved zero-data-retention arrangements differ
- any future adoption must bind the exact commercial/privacy configuration used by Talent Network

### Google Gemini / Vertex AI

Relevant official documentation:

- Structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini API terms/data-use guidance: https://ai.google.dev/gemini-api/terms
- Vertex AI generative AI data governance: https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance

Observed design implications:

- structured output does not guarantee semantic correctness
- data handling differs between Gemini API product tiers/configurations and Vertex AI enterprise processing
- workloads requiring stronger retention/regional guarantees must be evaluated against the exact deployment product

### 3G-G provider decision

No provider is adopted in 3G-G.

No new SDK, model, infrastructure dependency, or production network call is introduced.

A later provider decision must supply measured benchmark and operational evidence that satisfies this gate. If no provider passes, the correct runtime behavior is to preserve the unresolved source for review rather than silently degrade privacy or correctness.

### 3G-G acceptance gate

3G-G is verified only after:

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

Expected capability-gate tests cover:

- eligible unresolved candidate-owned source when every control passes
- no semantic recovery when deterministic processing leaves no unresolved source
- third-party-private source blocked from remote recovery by default
- provider/privacy/benchmark/latency/cost weaknesses fail closed with explicit reason codes

The stage must not be marked verified from code inspection alone.
