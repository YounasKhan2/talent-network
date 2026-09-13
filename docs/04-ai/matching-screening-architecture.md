# Matching & Screening Architecture

## Purpose

Talent Network must rank and organize candidates at scale without turning employment decisions into opaque model outputs. Matching is a structured evidence system first, with semantic and AI assistance layered on top.

## Core Principle

> AI may help prioritize and explain. It must not become the unreviewable authority that decides who is employable.

## Inputs

Matching may use versioned data from:

- job requirements
- candidate Career Passport
- submitted resume version
- screening answers
- assessments
- verified skill evidence
- compensation expectations
- location/work-mode preferences
- availability

Every match result references the versions used to calculate it.

## Match Identity

Conceptually:

```text
candidateProfileVersion
+ submittedResumeVersion
+ jobVersion
+ scoringModelVersion
= match result
```

If the relevant inputs have not changed, the system should reuse the existing result where safe rather than recalculate unnecessarily.

## Pipeline

```text
Candidate + Job
      |
      v
Eligibility / Hard Constraints
      |
      v
Structured Feature Scoring
      |
      v
Semantic Similarity
      |
      v
Evidence / Assessment Confidence
      |
      v
Ranked Candidate Set
      |
      v
AI Explanation for selected subset
      |
      v
Recruiter Review
```

## Stage 1 — Eligibility

Eligibility is deterministic where possible.

Examples:

- required location/work-mode compatibility
- work authorization
- required certification/license
- required language
- availability constraints
- non-negotiable employment type

A failed hard constraint should be represented explicitly, not hidden inside a low score.

Employers must distinguish true requirements from preferences.

## Stage 2 — Structured Relevance

Features may include:

- skill overlap
- relevant experience duration
- role/title similarity
- seniority fit
- industry/domain experience
- education only where justified
- compensation compatibility
- availability
- location/work-mode fit
- assessment results

Weights are configuration/model data, not hardcoded UI constants.

## Stage 3 — Semantic Similarity

Semantic retrieval helps match equivalent experience where keywords differ.

Example:

```text
"Implemented Express REST services"
≈
"Node.js backend API development"
```

Semantic similarity supplements structured features. It does not bypass hard requirements or authorization.

## Stage 4 — Evidence Confidence

Declared skills are not identical to verified evidence.

Conceptual evidence levels:

```text
DECLARED
RESUME_EVIDENCE
PROJECT_EVIDENCE
ASSESSMENT_EVIDENCE
VERIFIED
```

Higher confidence may improve ranking depending on the job rubric.

The evidence model must remain transparent to users and recruiters.

## Stage 5 — AI Explanation

LLM reasoning is applied only after cheaper deterministic and semantic stages reduce the candidate set or when an explanation is requested.

The AI layer may:

- summarize evidence
- describe strengths
- describe uncertainties
- describe conflicts
- suggest interview focus

It must not invent qualifications not present in source evidence.

## Match Result

A match result should be structured.

```text
score: 91
confidence: HIGH
eligibility: ELIGIBLE

components:
  skills: 34/35
  experience: 22/25
  roleRelevance: 14/15
  preferences: 8/10
  evidence: 8/10
  other: 5/5

strengths:
- React requirement satisfied
- Node.js requirement satisfied
- 3 years relevant full-stack experience

uncertainties:
- AWS production exposure unclear

conflicts:
- candidate is Lahore-based
- role requires Karachi hybrid attendance
```

The exact scoring formula is versioned and subject to calibration.

## Score Interpretation

Scores are prioritization tools, not objective truth.

Suggested labels might include:

```text
Recommended
Strong
Possible
Lower Relevance
```

Avoid labels such as "bad candidate" or "AI rejected".

## Screening Questions

Employers can configure structured screening questions.

Question modes:

```text
REQUIRED
PREFERRED
INFORMATIONAL
```

Examples:

- years of production Node.js experience
- hybrid availability
- expected compensation
- notice period
- portfolio/GitHub link
- required license/certification

Required screening criteria should be visible and explainable.

## Blind Screening

The platform should support privacy-conscious initial review that can hide fields such as:

- name
- photo
- date of birth
- gender-signaling fields
- marital status
- exact residential address

Exact behavior depends on product policy and applicable law.

Blind review is a view policy, not destructive data removal.

## Candidate Comparison

Recruiters may compare a small number of candidates using a normalized view of:

- requirement coverage
- relevant experience
- evidence confidence
- assessment results
- compensation
- availability
- location/work mode
- unresolved uncertainties

The comparison screen must preserve source evidence and avoid unsupported summary claims.

## Natural-Language Talent Search

Recruiters may type:

> Find full-stack developers in Karachi with 2–4 years, React and Node, preferably NestJS, available within 30 days, below 250k expected salary.

The system translates this into an inspectable query:

```text
location = Karachi
experience = 2..4 years
requiredSkills = React, Node.js
preferredSkills = NestJS
availabilityWithinDays <= 30
salaryExpectation <= 250000
```

Recruiters can edit the structured filters before or after execution.

Natural language is an input convenience, not the hidden source of truth.

## Candidate-Side Match Intelligence

Candidates may see job-specific explanations such as:

- matched requirements
- missing requirements
- unclear evidence
- work-mode compatibility
- compensation alignment where available

The system must not encourage fabrication or keyword stuffing.

Recommendations should focus on surfacing genuine evidence and improving missing skills.

## Screening Buckets

Recruiter list views may group candidates into buckets derived from ranking thresholds/configuration.

Example:

```text
Recommended      81
Review          146
Lower relevance 615
```

These are workflow conveniences only. Recruiters remain able to inspect candidates outside the top bucket according to policy and permissions.

## Human Decision Ownership

The system should preserve who made consequential decisions.

Examples:

```text
AI ranked candidate #8
Recruiter shortlisted candidate
Hiring manager approved interview
Interviewer submitted scorecard
Offer approver approved offer
```

Do not attribute a human decision to the AI subsystem.

## Fairness and Protected Attributes

Protected/sensitive attributes must not be used as ranking features merely because they are available.

Feature inclusion requires explicit product/legal justification.

Where demographic fairness evaluation is legally and operationally appropriate, it should be separated from production decision features and handled with strict access controls.

## Model Versioning

Store:

- scoring model version
- feature configuration version
- embedding model version where relevant
- AI prompt/model version for explanations
- calculation timestamp

Historical match results must remain interpretable after models evolve.

## Recalculation Strategy

A recalculation is triggered only by relevant changes, such as:

- job requirements changed
- candidate profile version changed
- submitted resume version changed where policy permits recalculation
- assessment completed
- scoring model recalibrated

Bulk model migrations should run asynchronously with rate limits and progress tracking.

## Caching

Cache match results by stable versioned identity.

Do not cache across unauthorized tenant boundaries.

Cache invalidation is driven by version change rather than guessing whether text changed.

## Queue Design

Logical queues:

```text
matching.compute
matching.recompute
screening.evaluate
matching.explain
matching.bulk-migration
```

AI explanations use separate concurrency and cost controls from deterministic scoring.

## Cost Controls

The ranking path should minimize expensive inference:

1. hard filter cheaply
2. structured scoring cheaply
3. semantic retrieval for plausible matches
4. evidence scoring
5. AI reasoning only for selected candidates or on demand

Track cost per:

- match calculated
- explanation generated
- recruiter shortlist reviewed
- successful hire

## Search vs Matching

Search finds candidates likely relevant to a query.

Matching evaluates a specific candidate against a specific job rubric.

They may share features/embeddings but remain distinct concepts and APIs.

## Assessment Integration

Assessment results may contribute to evidence confidence or ranking only when:

- assessment definition is relevant to the role
- result integrity is known
- score/version is available
- employer configuration enables it

Do not make unrelated general assessments universal ranking signals.

## Suspicious/Inconsistent Data

The platform may flag inconsistencies such as:

- conflicting employment dates
- multiple profiles with high identity similarity
- materially inconsistent resume/profile claims

Flags mean "requires review", never automatic fraud accusations.

## Analytics and Calibration

Measure how ranking correlates with outcomes:

- recruiter review
- shortlist
- interview
- offer
- hire
- later quality signals if lawfully available

These metrics help calibrate the model, but historical recruiter behavior is not automatically a fair or correct training label.

## Observability

Track:

- computation latency
- queue depth
- cache hit rate
- score distribution
- eligibility-failure reasons
- explanation generation rate
- AI/provider failures
- cost per calculation
- recalculation volume
- recruiter override/selection patterns

## Quality Gate

A matching change is incomplete unless it documents:

1. input feature
2. business justification
3. data source
4. missing-data behavior
5. weight/calibration impact
6. explainability impact
7. fairness/privacy impact
8. versioning behavior
9. recalculation scope
10. performance/cost impact
11. tests and observability
