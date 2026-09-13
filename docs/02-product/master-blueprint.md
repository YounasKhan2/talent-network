# Master Product Blueprint v0.1

## Product Category

Talent Network is being designed as a multi-sided employment operating system combining:

- Talent marketplace
- Applicant Tracking System (ATS)
- Talent CRM
- Resume intelligence
- Explainable candidate-job matching
- Assessments and interview workflows
- Candidate career intelligence
- Trust, verification, and hiring analytics

Initial market focus: Pakistan. The architecture must remain capable of supporting Gulf, remote international, and enterprise hiring later.

## Product Thesis

The hiring problem is increasingly not a lack of applications. It is a lack of usable signal.

Candidates face irrelevant roles, poor visibility, repeated applications, uncertain resume quality, unexplained rejection, employer ghosting, weak proof of capability, fragmented professional profiles, and poor compensation intelligence.

Employers face application overload, weak applicant quality, manual CV screening, inconsistent evaluation, duplicate candidates, unstructured interviews, fragmented tooling, hiring-manager bottlenecks, poor analytics, and weak passive-talent discovery.

The platform should solve both sides through structured, reusable employment data and transparent workflows.

## Product Surfaces

### Candidate Network

- Career Passport
- Resume Intelligence
- Job Discovery
- Match Intelligence
- Applications
- Assessments
- Career Copilot
- Salary Intelligence
- Private Talent Mode

### Employer Hiring OS

- Organization workspace
- Job management
- Applicant tracking
- Resume screening
- Talent search
- Talent pools
- Interview management
- Scorecards
- Assessments
- Offers
- Automations
- Analytics
- Recruitment CRM

### Trust & Marketplace Layer

- Employer verification
- Candidate verification
- Skill evidence
- Fraud/risk review signals
- Employer activity signals
- Job moderation
- Marketplace quality controls

### Platform Operations

- Administration
- Billing
- Moderation
- AI governance
- Audit
- Support
- Analytics
- Feature flags
- Platform configuration

## Core Product Promise

### Candidate

> Apply where you genuinely have a strong chance.

### Employer

> Review relevant people instead of manually screening hundreds of resumes.

### Platform

> Convert fragmented and unstructured employment data into reusable, explainable, structured hiring signal.

## Foundational Architecture

Start as a modular monolith with independently scalable workers.

```text
apps/
├── web/
├── api/
├── worker/
└── scheduler/

packages/
├── auth/
├── identity/
├── organizations/
├── candidates/
├── resumes/
├── jobs/
├── applications/
├── pipelines/
├── talent/
├── matching/
├── screening/
├── assessments/
├── interviews/
├── scorecards/
├── offers/
├── messaging/
├── notifications/
├── search/
├── analytics/
├── automations/
├── billing/
├── verification/
├── audit/
└── ai/
```

Keep domain boundaries strict even while deployment remains simple.

## Recommended Initial Technology Direction

### Frontend

- Next.js
- React
- TypeScript
- TanStack Query for server state
- URL state for search/filter/sort/view state
- Local UI state only where necessary

### Backend

- NestJS
- TypeScript
- Modular domain boundaries

### Persistence

- PostgreSQL as transactional source of truth
- Prisma for productivity, with raw SQL available for performance-critical paths

### Ephemeral Infrastructure

- Redis for sessions, rate limits, locks, cache, queue state, and short-lived coordination

### Files

- S3-compatible object storage
- Direct signed uploads where possible

### Background Processing

- BullMQ/Redis initially
- Evolve only when throughput or operational requirements justify a different event/streaming platform

### Search

- PostgreSQL full text/trigram/structured filters initially
- Dedicated search engine later when real scale or feature requirements demand it

## Core System Principle

Interactive traffic and computational traffic must be separated.

An application submission should not wait for resume parsing, AI inference, notifications, analytics, or matching.

```text
Candidate clicks Apply
        ↓
Validate request
        ↓
Create application
        ↓
Commit transaction
        ↓
Publish events
        ↓
Return success

Async consumers:
- matching
- screening
- notifications
- analytics
- automations
```

## Core Business Events

Examples:

- USER_REGISTERED
- CANDIDATE_PROFILE_UPDATED
- RESUME_UPLOADED
- RESUME_SCAN_COMPLETED
- RESUME_PARSED
- RESUME_REVIEW_APPROVED
- ORGANIZATION_CREATED
- ORGANIZATION_VERIFIED
- JOB_CREATED
- JOB_PUBLISHED
- JOB_UPDATED
- JOB_CLOSED
- APPLICATION_CREATED
- APPLICATION_VIEWED
- APPLICATION_STAGE_CHANGED
- APPLICATION_REJECTED
- MATCH_COMPUTED
- ASSESSMENT_INVITED
- ASSESSMENT_COMPLETED
- INTERVIEW_SCHEDULED
- INTERVIEW_COMPLETED
- OFFER_CREATED
- OFFER_SENT
- OFFER_ACCEPTED
- OFFER_DECLINED
- CANDIDATE_HIRED

## Resume Intelligence

Resume ingestion is a dedicated subsystem.

```text
Upload authorization
        ↓
Direct object-storage upload
        ↓
File validation
        ↓
Malware scan
        ↓
Text extraction
        ↓
OCR fallback if required
        ↓
Resume parser
        ↓
Field normalization
        ↓
Confidence scoring
        ↓
Sensitive-data classification
        ↓
Candidate review
        ↓
Approved Career Passport update
```

Parsing must never silently mutate authoritative candidate history.

## Career Passport

The candidate profile is a structured, versionable professional graph rather than a PDF wrapper.

```text
Candidate
├── identity
├── headline
├── summary
├── employment[]
├── education[]
├── skills[]
├── projects[]
├── certifications[]
├── languages[]
├── assessments[]
├── portfolios[]
├── links[]
├── preferences
├── compensation
├── availability
├── locations[]
└── verification[]
```

Important claims may carry evidence and verification metadata.

## Job Model

Separate prose description from structured requirements.

```text
Job
├── metadata
├── description
├── employmentTerms
├── compensation
├── locationPolicy
├── requirements[]
├── preferences[]
├── screeningQuestions[]
├── interviewPlan
├── assessmentPlan
├── pipeline
└── publicationSettings
```

Requirements must support concepts such as REQUIRED, PREFERRED, weight, minimum experience, and verification preference.

## Application Model

An application is a historical record and must preserve the profile/resume state relevant at submission time.

```text
Application
├── candidate
├── job
├── submittedProfileVersion
├── submittedResumeVersion
├── currentStage
├── screeningResult
├── matchResult
├── screeningAnswers[]
├── stageHistory[]
├── notes[]
├── scorecards[]
├── interviews[]
├── offers[]
└── activity[]
```

## Hiring Pipelines

Pipeline stages are entities, not hardcoded enum strings.

Default example:

```text
Applied
→ Review
→ Shortlist
→ Assessment
→ Interview
→ Final Interview
→ Offer
→ Hired
```

Enterprise customers must be able to configure additional stages without product rewrites.

## Matching Engine

Do not implement matching as `CV + JD -> LLM -> score`.

Use staged evaluation:

1. Eligibility/hard constraints
2. Structured relevance
3. Semantic similarity
4. Evidence/assessment confidence
5. AI explanation for a reduced candidate set

The score must be versioned, measurable, configurable, and explainable.

Store explanation data, not only a number.

```text
score: 91
confidence: HIGH

strengths:
- Node.js requirement satisfied
- relevant backend experience
- compensation compatible

uncertainties:
- AWS evidence limited

conflicts:
- candidate currently in Lahore
- role requires Karachi hybrid
```

## AI Principles

AI should:

- summarize
- organize
- extract structured information
- identify evidence
- identify uncertainty
- suggest
- rank according to declared criteria
- draft communication

AI must not independently own consequential hiring decisions.

All model access should flow through a controlled AI gateway that handles model routing, prompt versions, schema validation, retries, timeouts, cost tracking, privacy policies, and audit metadata.

## AI Cost Strategy

Avoid repeated full-document inference.

```text
Resume
→ parse once
→ structured profile
→ embeddings/evidence representation
→ reusable stored representation
```

```text
Job
→ structured requirements
→ reusable stored representation
```

Use deterministic filtering and cheap ranking before expensive reasoning.

Cache/reuse match work based on versioned inputs such as candidate profile version, job version, and matching model version.

## Multi-Tenancy

Every employer-owned resource belongs to an Organization.

Tenant authorization must be enforced in backend services and repositories, never only through frontend filters.

Initial roles may include:

- OWNER
- ADMIN
- RECRUITER
- HIRING_MANAGER
- INTERVIEWER
- VIEWER

Internally, authorization should evolve around explicit permissions rather than role names alone.

## Security Baseline

From initial implementation:

- secure authentication/session handling
- CSRF defense where relevant
- rate limiting
- password hashing
- tenant isolation
- signed file access
- malware scanning
- file validation
- audit logging
- secret management
- backup strategy
- encryption in transit
- encryption at rest where supported
- privacy-aware data access

## Search Strategy

Start simple and measurable.

Phase 1:

- PostgreSQL indexes
- full-text search
- trigrams
- structured filtering

Introduce a dedicated search engine only when justified by measured query complexity, scale, ranking needs, or operational requirements.

## Read Models

Complex recruiter screens need purpose-built APIs/read projections.

An applicant table should not trigger separate candidate, match, assessment, and stage calls per row.

Use one optimized list endpoint with the exact summary projection required by that screen, then load deeper details on demand.

## Pagination

Prefer cursor pagination for high-volume, frequently changing collections such as applications, jobs, and talent search.

## Analytics

Capture business events from the beginning.

Initial analytics can use PostgreSQL aggregate/read tables. Later, event streams can feed ClickHouse or a warehouse if volume and reporting complexity justify it.

## Notifications

Notifications are queued and retryable.

Initial channels:

- email
- in-app

Future channels may include push, SMS, and WhatsApp depending on product need and compliance.

## Automation Engine

Future employer workflows may support rules such as:

```text
WHEN candidate enters Assessment
THEN send assessment invitation
```

or:

```text
WHEN all interview scorecards are complete
THEN notify hiring manager
```

Automation should operate on domain events and explicit conditions/actions.

## UI / UX Philosophy

The application should feel like a professional operating environment, not an admin template.

Visual direction:

**Editorial precision × operational density**

Borrow principles—not layouts—from mature products such as Mercury, Notion, Jira, and Linear.

### Avoid

- generic AI gradients and glow
- excessive rounded cards
- glassmorphism everywhere
- decorative dashboards
- giant empty areas in recruiter workflows
- cards where hierarchy/spacing would work better

### Prefer

- typography
- alignment
- controlled spacing
- split-pane workflows
- dense tables
- saved views
- keyboard actions
- inline editing
- configurable columns
- progressive disclosure
- minimal chrome
- restrained motion

## Employer UX

Recruiter workflows are desktop-first and high-density.

Tables must support, as appropriate:

- resizing
- sorting
- filtering
- grouping
- saved views
- bulk selection
- sticky headers
- virtualization
- keyboard navigation
- configurable columns

Candidate details should commonly open in a drawer/split pane so list context is preserved.

## Candidate UX

Candidate surfaces should be more editorial and comfortable than employer ATS screens.

The candidate home should answer:

- What changed?
- Which jobs matter?
- What should I do next?
- Where are my applications?

Avoid turning the candidate dashboard into a collection of generic KPI cards.

## Progressive Complexity

Simple customers should not be forced to see enterprise complexity.

A small team may need only:

- Job
- Applicants
- Interview
- Hire

Larger customers may later enable:

- custom pipelines
- approvals
- custom fields
- automations
- webhooks
- advanced permissions
- SSO/SCIM
- retention controls

## MVP Scope

### Candidate

- authentication
- Career Passport
- resume import and review
- job discovery
- job details
- match explanation
- applications
- application tracking

### Employer

- organization setup
- verification foundation
- job creation
- structured requirements
- publication
- applicant list
- candidate detail drawer
- resume screening
- pipeline
- shortlisting
- basic interview scheduling

### Platform

- admin
- moderation
- email notifications
- audit foundation
- analytics events
- billing foundation

### MVP AI

- resume parsing
- job requirement structuring
- match explanation
- candidate summary
- optional JD drafting assistance

Do not launch with dozens of AI agents.

## Later Product Evolution

### V1

- talent search
- talent pools
- assessments
- scorecards
- interview kits
- team collaboration
- saved applicant views
- employer analytics
- candidate Career Copilot
- stronger verification

### V2

- workflow automations
- referrals
- offer management
- advanced talent CRM
- salary intelligence
- private talent network
- calendar integrations
- Slack/Teams integrations
- university/campus workflows

### Enterprise

- SSO
- SCIM
- advanced RBAC
- approval workflows
- custom fields
- custom retention
- enterprise APIs
- webhooks
- HRIS integrations
- advanced analytics
- stronger regional/security controls

## Explicit Non-Goals for Initial Product

Do not initially build:

- payroll
- attendance
- generic HRIS
- employee performance management
- full LMS
- native video interview infrastructure
- custom LLM
- custom search engine
- Kubernetes without proven need
- Kafka without proven need
- premature microservices

## Success Metrics

Marketplace:

- qualified applications per job
- candidate response rate
- employer response rate
- time to first review

Employer:

- review time saved
- shortlist rate
- interview conversion
- time to hire

Candidate:

- application → viewed
- application → shortlist
- application → interview
- application → offer

Business:

- employer activation
- job publication rate
- paid conversion
- revenue per account
- retention
- cost per successful hire facilitated

## Product North Star

The platform should ultimately answer:

> Find candidates who genuinely satisfy these hiring requirements, explain why, show the evidence, let the team evaluate them consistently, automate repetitive work, preserve every decision, measure outcomes, and improve future matching.

Candidate north star: **Opportunity with context.**

Employer north star: **Signal without noise.**

Platform north star: **A trusted employment graph connecting people, evidence, opportunities, and hiring outcomes.**