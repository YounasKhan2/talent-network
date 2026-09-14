# Admin, Trust & Safety UX Specification

## Goal

The platform operations surface exists to keep the employment marketplace safe, trustworthy, auditable, supportable, and operationally healthy.

It is not a generic admin CRUD panel.

Admin workflows must make sensitive actions explicit, attributable, and difficult to perform accidentally.

## Primary Navigation

```text
Overview
Organizations
Users
Jobs
Moderation
Verification
Risk
Support
AI Operations
Billing
Platform
Audit
```

Access to each area is permission-based.

## Overview

The admin home should surface operational work rather than vanity analytics.

Examples:

- organizations awaiting verification
- suspicious jobs
- user reports requiring review
- failed resume-processing spikes
- email/notification delivery degradation
- AI failure/cost anomalies
- payment/billing failures
- high-risk login or abuse signals

## Organization Review

Organization detail should include:

```text
Company identity
Domain verification
Recruiter accounts
Verification evidence
Active jobs
Hiring activity
Reports / moderation history
Billing state
Risk flags
Audit history
```

Actions may include:

- approve verification
- request more information
- restrict job publication
- suspend organization
- restore organization

High-impact actions require reason capture and audit logging.

## Job Moderation

Job review should expose:

- employer identity
- description
- compensation claims
- external links
- detected risk indicators
- report history
- publication history

Moderation outcomes:

```text
Allow
Request correction
Unpublish
Restrict distribution
Escalate
```

Never silently edit employer job content without preserving original/history.

## Candidate / User Safety

User detail may expose only data appropriate for support/trust roles.

Sensitive candidate data should be progressively disclosed according to permission and operational need.

Admin access to private candidate information must be audited.

## Verification Queue

Verification work should use queue-oriented UX:

```text
Pending
Needs information
Approved
Rejected
Escalated
```

Evidence should be visible alongside the decision action.

Verification type examples:

- email
- phone
- company domain
- recruiter identity
- company registration
- skill assessment
- employment evidence

A verification badge must communicate exactly what has been verified.

## Risk Review

Risk flags are signals, not automatic accusations.

Potential signals:

- duplicate accounts
- unusual application automation
- suspicious job content
- impersonation indicators
- phishing links
- repeated payment/refund abuse
- abnormal export/scraping behavior

Risk UI should show:

```text
Signal
Confidence/severity
Evidence
Related entities
Timeline
Reviewer notes
Decision
```

## Abuse & Reports

Report queue supports categories such as:

- fake job
- harassment
- scam/payment request
- impersonation
- misleading company
- spam
- inappropriate message

Reports should preserve reporter privacy where appropriate.

## Support Workspace

Support should have a unified customer context without bypassing permission boundaries.

Support context may include:

- account state
- organization membership
- recent errors
- relevant billing events
- recent support cases
- safe audit history

Do not expose secrets, raw authentication credentials, or unrelated private data.

## AI Operations

AI Operations should expose system health and governance rather than individual employment decisions.

Suggested views:

- invocation volume
- cost by capability
- error rate
- latency
- provider/model usage
- schema validation failures
- fallback rate
- prompt/config versions
- privacy classification

Drill-down must redact sensitive prompt/input data according to policy.

## Platform Configuration

Platform-level controls may include:

- feature flags
- rollout percentages
- maintenance mode
- supported countries
- job categories
- skill taxonomy
- email templates
- moderation policy configuration

Configuration changes require audit history and, for high-risk settings, approval or confirmation.

## Audit Explorer

Audit log should support filtering by:

```text
Actor
Organization
Action
Entity type
Entity ID
Date range
IP/session metadata where policy permits
```

Audit records are append-oriented and should not be casually editable.

## Sensitive Actions

Actions such as suspension, permanent deletion, verification override, bulk moderation, or billing override must require:

1. clear impact statement;
2. reason;
3. confirmation;
4. audit entry;
5. optional second approval where configured.

## Impersonation / Support Access

If support impersonation is ever implemented, it must be highly constrained:

- explicit permission
- visible session banner
- reason required
- time limit
- no access to prohibited actions
- complete audit trail

Prefer targeted support tooling over broad impersonation.

## Data Deletion / Privacy Requests

Admin privacy workflow should track:

```text
Request received
Identity verification
Scope determined
Retention/legal exceptions
Deletion/export job
Completion
Audit evidence
```

Deletion should be asynchronous and idempotent where it spans multiple stores.

## Operational UX Principles

- queues over scattered CRUD pages
- evidence next to decisions
- safe defaults
- high-impact confirmation
- no hidden automation
- every override attributable
- no cross-tenant leakage in search
- minimal exposure of sensitive data
- clear escalation paths

## Success Criterion

An authorized operator should be able to answer:

> What happened, why was this entity flagged, what evidence exists, what action was taken, who took it, and can that action be safely reversed or escalated?
