# Information Architecture & Route Map

## Purpose

This document defines the product navigation, route hierarchy, workspace boundaries, and contextual-navigation rules before frontend implementation begins.

The goal is to prevent route sprawl, duplicate workflows, and disconnected UI surfaces as the product grows.

## Product Surfaces

Talent Network has four major authenticated product surfaces:

1. Candidate
2. Employer / Recruiter
3. Platform Admin / Trust & Safety
4. Shared account / authentication / billing support surfaces

Public marketing, public jobs, and company pages sit outside the authenticated application shell.

---

# Public Surface

Recommended initial route family:

```text
/
/jobs
/jobs/[slug]
/companies/[slug]
/about
/pricing
/security
/privacy
/terms
```

Public jobs and companies should be indexable where appropriate and use CDN caching.

Authentication:

```text
/auth/login
/auth/signup
/auth/forgot-password
/auth/reset-password
/auth/verify-email
```

---

# Candidate Application

Recommended route namespace:

```text
/app
```

Primary navigation:

```text
Home
Jobs
Applications
Career
Assessments
Messages
```

Secondary utilities:

```text
Notifications
Profile/Account
Privacy
Preferences
Settings
```

## Candidate Routes

```text
/app
/app/jobs
/app/jobs/[jobId]
/app/applications
/app/applications/[applicationId]
/app/career
/app/career/resume
/app/career/resume/import
/app/career/resume/review/[resumeVersionId]
/app/career/profile
/app/career/preferences
/app/career/verification
/app/assessments
/app/assessments/[assessmentId]
/app/messages
/app/messages/[conversationId]
/app/settings
/app/settings/account
/app/settings/privacy
/app/settings/notifications
```

Future:

```text
/app/career/copilot
/app/career/salary
/app/private-opportunities
```

## Candidate Home

Candidate home is a decision surface, not an analytics dashboard.

It should answer:

- What changed?
- Which jobs deserve attention?
- Which application needs action?
- Is my profile/resume incomplete?
- Do I have an interview/assessment approaching?

Suggested modules:

```text
Next action
Recommended jobs
Recent application updates
Upcoming interview/assessment
Career profile completeness
```

Avoid large KPI-card grids.

## Candidate Job Detail

Structure:

```text
Job identity
Company
Compensation / work mode
Match summary
Why you match
Potential gaps / uncertainty
Requirements
Role description
Company information
Application action
```

Match information must not imply guaranteed selection.

## Candidate Application Detail

Should expose a timeline:

```text
Submitted
Viewed
Review / screening status
Assessment
Interview
Decision
```

Only statuses permitted by employer/platform privacy policy should be exposed.

---

# Employer Application

Recommended namespace:

```text
/hire
```

Primary navigation:

```text
Overview
Jobs
Talent
Inbox
Calendar
Reports
Automate
Settings
```

Top-bar utilities:

```text
Organization switcher
Global search
Create
Command palette
Notifications
User menu
```

## Employer Routes

```text
/hire
/hire/jobs
/hire/jobs/new
/hire/jobs/[jobId]
/hire/jobs/[jobId]/applicants
/hire/jobs/[jobId]/pipeline
/hire/jobs/[jobId]/interviews
/hire/jobs/[jobId]/analytics
/hire/jobs/[jobId]/setup

/hire/talent
/hire/talent/pools
/hire/talent/pools/[poolId]
/hire/talent/[candidateId]

/hire/inbox
/hire/inbox/[conversationId]

/hire/calendar
/hire/reports
/hire/automate

/hire/settings
/hire/settings/organization
/hire/settings/team
/hire/settings/roles
/hire/settings/pipelines
/hire/settings/integrations
/hire/settings/billing
/hire/settings/security
/hire/settings/audit
```

Future:

```text
/hire/assessments
/hire/offers
/hire/templates
/hire/referrals
```

## Employer Overview

Overview should focus on operational work, not vanity metrics.

Examples:

- candidates awaiting review
- interviews today
- scorecards overdue
- jobs with unusual drop-off
- offers pending
- stale candidate stages

## Job Workspace

A job is a workspace with local navigation:

```text
Overview
Applicants
Pipeline
Interviews
Analytics
Setup
```

The user should never need to repeatedly return to the global Jobs list to move between these areas.

### Applicants

Primary recruiter table.

URL must encode shareable state where practical:

```text
/hire/jobs/[jobId]/applicants?view=strong-matches&stage=review&sort=match_desc
```

Persisted saved views may resolve to IDs while still allowing readable query state.

### Candidate Detail

Candidate detail usually opens as a routed split pane:

```text
/hire/jobs/[jobId]/applicants?candidate=[applicationId]
```

This preserves:

- filters
- table scroll position
- sorting
- selected rows
- navigation history

Direct links must still be possible.

---

# Talent CRM

Talent is broader than current applicants.

Candidate sources may include:

- current applicant
- sourced
- previous applicant
- referral
- imported
- previous finalist
- event/campus lead
- private talent member

Main Talent route must support search and saved views rather than separate pages for every source.

Example:

```text
/hire/talent?view=backend-karachi
```

Talent pools are explicit collections layered over the wider candidate graph.

---

# Admin / Platform Operations

Recommended namespace:

```text
/admin
```

Primary sections:

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

Routes:

```text
/admin
/admin/organizations
/admin/organizations/[organizationId]
/admin/users
/admin/users/[userId]
/admin/jobs
/admin/jobs/[jobId]
/admin/moderation
/admin/verification
/admin/risk
/admin/support
/admin/ai
/admin/billing
/admin/platform
/admin/audit
```

Admin access must be permission-controlled and strongly audited.

---

# Navigation Rules

## Rule 1 — Global vs Local Navigation

Use global navigation for product domains and local tabs for a selected aggregate/workspace.

Example:

```text
Global: Jobs
Local job workspace: Applicants / Pipeline / Interviews / Analytics / Setup
```

Do not put every possible sub-view into the global sidebar.

## Rule 2 — Preserve Context

Prefer drawers, side panes, tabs, and nested routes when the user is investigating an item inside a larger workset.

Avoid unnecessary full-page navigation that destroys table/search state.

## Rule 3 — URL as Product State

The URL should represent meaningful navigation/search state where shareability and browser history matter.

Use URL state for:

- search terms
- filters
- sort
- tabs
- saved view identifiers
- selected detail records where appropriate

Do not place ephemeral UI state such as tooltip visibility in the URL.

## Rule 4 — No Dead Ends

Every detail view should expose a sensible next action or path back to its originating context.

## Rule 5 — Progressive Complexity

Small-company workspaces should initially show a simpler surface.

Advanced sections may remain hidden until enabled/used:

- Automations
- advanced permissions
- integrations
- approval workflows
- custom fields

---

# Global Search

Global search should eventually search by permission-aware scope:

Employer:

```text
Jobs
Candidates
Applications
Talent pools
Team members
```

Candidate:

```text
Jobs
Applications
Messages
```

Search results must never leak inaccessible tenant or private candidate records.

---

# Responsive Strategy

## Employer

Desktop-first.

Tablet may support review/light management.

Mobile should prioritize:

- notifications
- candidate quick review
- notes
- interview calendar
- approvals

Do not cripple desktop table density to force identical mobile layouts.

## Candidate

Mobile-first enough for:

- job discovery
- job details
- applying
- application tracking
- messaging
- interview/assessment coordination
- profile edits

Large resume review/editing may progressively enhance on larger screens.

---

# Route Ownership

Each route family must have a clear domain owner.

Examples:

```text
/app/jobs                 Job Discovery
/app/applications         Applications
/hire/jobs                Jobs / Hiring
/hire/talent              Talent CRM
/admin/verification       Trust & Verification
```

Cross-domain workflows should orchestrate through application contracts rather than duplicating business logic inside route handlers.
