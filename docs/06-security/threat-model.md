# Security Threat Model

**Status:** Draft baseline  
**Scope:** MVP through early production  
**Method:** STRIDE-informed, risk-based security model

## Security Objective

Protect candidate data, employer data, hiring decisions, files, credentials, organization boundaries, and platform integrity while preserving a scalable and reusable architecture.

Security is a product requirement, not a deployment-stage checklist.

## Primary Assets

- Candidate identities and contact details
- Career Passport data
- Resume files and extracted content
- Employer organization data
- Jobs, applicants, notes, scorecards, interviews, offers
- Authentication/session state
- Organization membership and permissions
- Assessment results
- AI prompts, outputs, model metadata, and evidence traces
- Billing and subscription state
- Audit logs
- API keys, webhook secrets, service credentials
- Search and analytics projections derived from private data

## Trust Boundaries

```text
Public Internet
   ↓
CDN / WAF
   ↓
Web / API Boundary
   ↓
Authentication + Authorization Boundary
   ↓
Application Domains
   ↓
PostgreSQL / Redis / Object Storage / Queue
   ↓
Workers / AI Providers / Email / External Integrations
```

Every crossing is treated as untrusted until validated.

## Threat Actors

- Anonymous attacker
- Malicious candidate
- Malicious employer/recruiter
- Compromised organization member
- Compromised candidate account
- Credential-stuffing bot
- Scraper / data harvester
- Spam/fraud operator
- Insider with excessive privileges
- Third-party provider compromise
- Supply-chain compromise
- Misconfigured automation or coding agent

## Core Threat Classes

### 1. Authentication Abuse

Threats:

- credential stuffing
- brute force
- session theft
- password reset abuse
- account enumeration
- replayed sessions

Controls:

- strong password hashing
- rate limits by IP/account/device signals
- secure, HttpOnly, SameSite cookies where sessions are used
- session rotation
- reset-token expiry and one-time use
- generic auth failure messages
- optional MFA-ready architecture
- suspicious-login telemetry

### 2. Authorization / Tenant Escape

Threats:

- recruiter accesses another organization
- horizontal IDOR
- role escalation
- client-supplied organizationId trusted by backend
- cross-tenant cache/search leakage

Controls:

- server-resolved organization context
- permission checks in application/service layer
- repository queries scoped by tenant
- organization-aware cache keys
- organization filters in search projections
- authorization tests for every protected resource family
- auditable privileged actions

Rule:

> Possession of a record ID never implies access to the record.

### 3. Candidate Privacy Abuse

Threats:

- unauthorized employer discovery
- contact scraping
- private-profile exposure
- current employer discovers passive candidate
- mass export of candidate data

Controls:

- visibility and discoverability settings
- blocked-organization support
- contact-access permissions
- verified-recruiter gates where applicable
- export permissions, quotas, and audit logs
- download watermark/traceability where appropriate
- private-talent mode policy enforcement server-side

### 4. Resume / File Upload Attacks

Threats:

- malware
- archive bombs
- malformed PDF/DOCX parser exploits
- spoofed MIME type
- oversized files
- path traversal
- active content

Controls:

- direct signed uploads to isolated object path
- extension + MIME + magic-byte validation
- strict size/page limits
- malware scanning before processing
- parser sandbox/isolation where practical
- no execution of embedded macros/scripts
- quarantined state before approval
- signed short-lived read URLs
- object key generation controlled by server

### 5. AI-Specific Threats

Threats:

- prompt injection from resumes or job descriptions
- model output treated as trusted authorization/business logic
- sensitive-data leakage to providers
- hallucinated hiring claims
- model manipulation through adversarial resume content
- runaway cost amplification

Controls:

- AI gateway only
- explicit capability contracts
- schema validation
- source/evidence linking
- content treated as data, not instructions
- prompt templates isolate untrusted text
- no AI-controlled authorization
- no AI-owned final hiring decision
- provider privacy policy controls
- model/cost quotas
- deterministic pre-filtering before inference
- audit model/prompt/version metadata

### 6. Scraping / Enumeration

Threats:

- job scraping at abusive volume
- candidate harvesting
- API enumeration
- resume/contact database extraction

Controls:

- endpoint-specific rate limits
- pagination caps
- anti-automation signals where appropriate
- access-based candidate search
- response minimization
- no raw sequential identifiers in public URLs where avoidable
- export quotas
- abnormal-access detection

### 7. Job / Employer Fraud

Threats:

- fake companies
- fake jobs
- phishing links
- payment scams
- impersonated recruiters

Controls:

- company/recruiter verification states
- domain verification
- moderation workflow
- suspicious-link scanning
- reporting mechanisms
- objective trust signals
- risk flags do not automatically accuse users of fraud

### 8. Injection

Threats:

- SQL injection
- command injection
- template injection
- XSS
- header injection

Controls:

- parameterized ORM/query APIs
- tightly reviewed raw SQL
- output encoding
- CSP
- no shell execution from untrusted input
- schema validation at API boundaries
- HTML sanitization where rich text is supported

### 9. CSRF / Cross-Origin Abuse

Controls:

- SameSite cookies
- CSRF tokens where required
- strict CORS allowlist
- origin checks for sensitive actions
- no wildcard credentialed CORS

### 10. Queue / Worker Abuse

Threats:

- forged jobs
- cross-tenant job payloads
- duplicate execution
- poisoned queue messages
- infinite retry storms

Controls:

- queue payload schema validation
- trusted producer boundaries
- resolve tenant/resource ownership again in worker
- idempotency keys
- bounded retries
- dead-letter handling
- poison-message telemetry

### 11. Webhook / Integration Abuse

Controls:

- signed webhook verification
- replay protection
- timestamps/nonces where available
- idempotent consumers
- minimal scopes for third-party tokens
- encrypted credential storage
- token rotation support

### 12. Billing Abuse

Threats:

- forged entitlement state
- replayed payment webhooks
- unauthorized plan upgrade

Controls:

- billing provider webhook verification
- server-owned entitlement computation
- idempotent billing events
- audit changes
- never trust frontend billing state

### 13. Logging / Observability Leakage

Never log:

- passwords
- reset tokens
- auth secrets
- full session tokens
- payment secrets
- raw sensitive resume text by default

PII in logs must be minimized and purpose-driven.

## Data Classification

### Highly Sensitive

- authentication secrets
- identity verification material
- private candidate contact data
- private resumes
- compensation expectations where private
- offer data

### Sensitive

- application history
- interview feedback
- scorecards
- recruiter notes
- assessments

### Public / Intentionally Published

- published jobs
- public company profiles
- candidate data explicitly configured as public

Classification influences access, retention, logging, export, and AI-provider rules.

## Secure Defaults

- deny by default
- least privilege
- private candidate data by default
- signed short-lived file access
- bounded pagination
- explicit organization membership
- server-side permission evaluation
- human approval for consequential AI actions

## Security Tests Required

At minimum:

- cross-tenant access tests
- role/permission matrix tests
- direct-object-reference tests
- upload validation tests
- malware rejection path
- signed URL expiry
- rate-limit tests
- CSRF/CORS tests where applicable
- webhook signature/replay tests
- queue idempotency tests
- AI schema validation and prompt-injection test corpus

## Incident Readiness

Production must support:

- account/session revocation
- organization-member revocation
- secret rotation
- webhook-key rotation
- audit search
- feature/AI capability kill switches
- queue pausing
- provider failover/disablement
- suspicious account suspension

## Review Rule

Every new major capability must answer:

1. What new sensitive data exists?
2. Who can read/write it?
3. What tenant owns it?
4. Can it be exported?
5. Can it be processed by AI?
6. Can it be abused at scale?
7. What is audited?
8. What is the failure/incident containment strategy?
