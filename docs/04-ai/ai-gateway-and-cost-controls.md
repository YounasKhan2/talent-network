# AI Gateway & Cost Controls

## Purpose

All model-backed capabilities in Talent Network must pass through a controlled AI platform boundary. The goal is to make AI features observable, replaceable, secure, testable, and economically sustainable.

## Core Principle

> AI is infrastructure behind product workflows, not a collection of provider SDK calls scattered through the codebase.

## Responsibilities

The AI gateway is responsible for:

- provider/model routing
- prompt/template versioning
- structured output schemas
- validation
- timeouts
- retries
- concurrency limits
- rate limits
- cost tracking
- token accounting
- privacy controls
- redaction where applicable
- fallbacks
- audit metadata
- quality telemetry

## Logical Architecture

```text
Product Domains
  |
  +--> Resume Intelligence
  +--> Matching / Screening
  +--> Job Structuring
  +--> Interview Kit
  +--> Candidate Copilot
  +--> Recruiter Assistant
          |
          v
       AI Gateway
          |
   +------+------+------+
   |             |      |
Provider A   Provider B Local/Other
```

Product modules should call a stable internal capability interface rather than provider-specific SDKs.

## Capability-Oriented Interfaces

Examples:

```text
parseResume(input)
structureJob(input)
explainMatch(input)
summarizeCandidate(input)
generateInterviewKit(input)
draftRecruiterMessage(input)
```

These interfaces define business outputs, not model-specific concepts.

## Provider Adapters

Each provider adapter translates internal requests into provider-specific calls.

Provider SDK types must not leak into domain models.

This allows:

- model replacement
- provider failover
- regional routing
- cost optimization
- testing with deterministic fakes

## Structured Outputs

Production AI workflows should prefer strict structured schemas.

Example:

```text
MatchExplanation
- summary
- strengths[]
- uncertainties[]
- conflicts[]
- evidenceRefs[]
```

All outputs are validated after model execution.

Invalid output is a failed model call, not silently accepted data.

## Prompt Versioning

Every important prompt/template has an explicit version.

Record:

- capability
- prompt version
- model/provider
- schema version
- relevant configuration
- execution timestamp

Historical hiring-related output must remain attributable to the configuration that produced it.

## Model Routing

Do not use the most expensive model for every task.

Routing may consider:

- task complexity
- latency budget
- privacy requirements
- context size
- cost budget
- provider health
- language
- structured-output reliability

Example strategy:

```text
simple classification -> small/cheap model
structured extraction -> reliable schema model
complex explanation   -> stronger model
bulk embeddings       -> dedicated embedding model
```

## Cost Model

Track costs at the smallest useful business unit.

Examples:

```text
cost per resume parsed
cost per job structured
cost per match explanation
cost per recruiter workspace
cost per organization
cost per successful hire
```

Provider invoices alone are not sufficient for product economics.

## Cost Budgets

Capabilities should have configurable budgets.

Examples:

- max context size
- max output tokens
- per-request cost ceiling
- per-user daily allowance
- per-organization monthly allowance
- concurrency limits
- premium-feature entitlements

Requests exceeding policy can degrade gracefully or require explicit user action.

## Staged Reasoning

Expensive reasoning is the last stage.

Example matching path:

```text
hard filters
-> structured score
-> semantic retrieval
-> evidence score
-> selected candidates
-> AI explanation
```

Never send thousands of clearly irrelevant candidates to a reasoning model simply because the feature is labeled AI.

## Precomputation

Reusable representations should be computed once per version where practical.

Examples:

```text
resumeVersion -> parsed profile
profileVersion -> embeddings
jobVersion -> structured requirements
jobVersion -> embeddings
```

Downstream workflows reuse these representations.

## Cache Identity

AI output must be cached only when inputs are stable and versioned.

Conceptually:

```text
capability
+ inputVersion(s)
+ promptVersion
+ modelConfigurationVersion
= cache identity
```

Do not reuse stale output after material input changes.

## Concurrency Control

Separate concurrency by workload.

For example:

```text
resume parse       20 concurrent
match explanation  30 concurrent
copilot chat       15 concurrent
bulk generation     5 concurrent
```

Values are environment-specific and based on quotas/load tests.

## Provider Failure Handling

Classify failures:

- timeout
- rate limited
- transient provider failure
- invalid structured output
- context too large
- policy refusal
- permanent configuration error

Retries use bounded exponential backoff for retryable cases.

Fallback providers/models are capability-specific and must preserve output schema expectations.

## Circuit Breaking

If a provider is failing at high rates, the gateway should reduce traffic or temporarily route elsewhere rather than amplify failure with retries.

Circuit-breaker state belongs to infrastructure/coordination storage, not business truth.

## Privacy

Before sending data to a model, determine:

- what data is necessary
- whether candidate PII is needed
- whether tenant policy allows the provider
- whether regional restrictions apply
- retention/training terms of the provider configuration

Minimize data sent to providers.

Do not log raw sensitive prompts/responses by default.

## Redaction

Some capabilities may operate on de-identified or reduced context.

Example match explanation may not need candidate phone number, email, address, or unrelated personal data.

Redaction policy should be capability-specific.

## Human Review

Consequential AI outputs should support review.

Examples:

- candidate summary: recruiter verifies source evidence
- rejection draft: recruiter edits/approves before sending
- interview kit: interviewer can edit
- resume parse: candidate approves imported data

No model response should silently become a consequential employment action.

## Evidence Grounding

AI outputs about candidate qualifications should reference source evidence where practical.

Example:

```text
Claim: "3 years relevant Node.js experience"
Evidence:
- Experience item #2
- Resume page 1 range 842-934
- Candidate-approved profile version 7
```

If evidence is unavailable, communicate uncertainty rather than invent certainty.

## Evaluation

Each capability needs an evaluation set before production confidence claims are made.

Evaluate dimensions such as:

- schema validity
- extraction accuracy
- hallucination rate
- evidence attribution
- latency
- cost
- language quality
- consistency

For hiring-related features, include edge cases and bias/fairness review where appropriate.

## Testing

Automated tests should use:

- provider fakes/mocks for domain tests
- schema fixtures
- golden examples where appropriate
- contract tests against provider adapters
- failure-mode tests
- cost/token-budget tests

Do not require live model calls for ordinary unit tests.

## Observability

Track per capability:

- requests
- successes/failures
- latency p50/p95/p99
- input/output tokens
- estimated/provider cost
- cache hit rate
- retry rate
- fallback rate
- schema-validation failures
- provider/model distribution

Dimensions may include organization and feature entitlement where safe.

## AI Audit Record

For relevant outputs, store metadata such as:

```text
capability
entityType/entityId
inputVersionRefs
provider
model
promptVersion
schemaVersion
status
cost
latency
createdAt
```

Avoid storing unnecessary raw sensitive content merely for auditability.

## Entitlements

Billing/plan logic should control AI usage through an entitlement layer.

Example:

```text
FREE: limited parsing/matching explanation
PRO: higher limits + advanced features
BUSINESS: organization budgets + analytics
ENTERPRISE: policy controls + negotiated limits
```

Exact pricing is a product decision; architecture supports quotas from the beginning.

## Degradation Strategy

The application should still function when AI is unavailable.

Examples:

- job can still be created manually
- applications still submit
- recruiter pipeline still works
- deterministic matching can still run
- resume can fall back to manual profile entry/review

AI failure must not make the hiring operating system unusable.

## Security

AI tools must not have unrestricted database or infrastructure access.

If future agentic capabilities can perform actions, they require:

- explicit allowlisted tools
- permission checks at action time
- tenant enforcement
- preview/approval for consequential actions
- audit logging
- scoped credentials

Model instructions never override authorization policy.

## Scalability Evolution

```text
MVP
- one gateway module
- one or two providers
- queue-backed heavy workloads

Growth
- independent AI worker pools
- budget service
- provider routing/fallback
- evaluation pipeline

Enterprise
- organization-specific model policies
- regional/provider restrictions
- dedicated capacity where justified
```

## Quality Gate

A new AI capability is not ready until it defines:

1. business purpose
2. human decision boundary
3. required input data
4. schema
5. evidence expectations
6. prompt/model versioning
7. privacy policy
8. failure/degradation behavior
9. cost budget
10. cache/reuse strategy
11. evaluation method
12. observability
13. authorization implications
