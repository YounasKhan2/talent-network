# Employer Workspace UX Specification

## Goal

The employer product must let recruiters and hiring managers process large volumes of candidates quickly without losing context, while preserving fairness, explainability, team collaboration, and auditability.

The product should feel operationally dense but calm.

## Employer Shell

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

Top bar:

```text
Organization switcher
Global search
Create
Command palette
Notifications
User menu
```

Sidebar remains visually quiet. It is navigation, not decoration.

## Overview

The overview is a work queue.

Prioritize:

- candidates awaiting review
- interviews today
- overdue scorecards
- jobs with no recent activity
- offers awaiting action
- automation failures
- stale stages

Avoid a wall of generic charts.

## Jobs List

Jobs table columns may include:

```text
Job
Status
Location / mode
Applicants
Qualified
In review
Interviews
Offers
Owner
Published
Updated
```

Capabilities:

- filter
- sort
- status grouping
- owner grouping
- bulk close/archive where safe
- saved views
- quick create
- duplicate job with controlled field carry-over

## Job Creation

Prefer a structured multi-section editor over an endless wizard.

Sections:

```text
Basics
Role description
Requirements
Compensation
Location / work policy
Screening questions
Pipeline
Assessment
Interview plan
Publishing
```

Allow autosave draft.

AI may assist with JD drafting and requirement structuring, but changes require review.

## Requirements Editor

Requirements are structured objects, not only prose.

Each requirement can expose:

```text
Skill / criterion
Required | Preferred
Minimum experience if relevant
Weight
Evidence preference
Notes
```

The UI must make the screening rubric understandable before candidate review begins.

## Applicant Table

This is a core product surface.

Default columns:

```text
Candidate
Current role
Location
Experience
Match
Key evidence
Assessment
Stage
Applied
Flags
```

Optional columns:

```text
Salary expectation
Availability
Notice period
Source
Owner
Last activity
Education
Specific skill evidence
```

### Table behavior

Must support:

- sticky header
- column resize
- column visibility
- pinned candidate column
- filters
- multi-sort where useful
- saved views
- virtualized rows
- keyboard navigation
- bulk actions
- selectable density
- persistent preferences

### Saved Views

Examples:

```text
Strong matches
Needs review
Assessment complete
Karachi hybrid
Previous finalists
Unreviewed > 48h
```

A saved view stores:

- filters
- sort
- visible columns
- column order
- grouping
- density

## Candidate Triage

The table should show enough signal to make the next action obvious.

Candidate row should not show a magical AI score alone.

Preferred signal:

```text
86 Match
4/5 required criteria supported
2 verified evidence items
1 uncertainty
```

## Candidate Split Pane

Opening a candidate preserves the applicant table.

Suggested tabs/sections:

```text
Overview
Resume
Evidence
Evaluation
Interviews
Activity
```

Header actions:

```text
Move stage
Shortlist
Schedule interview
Send assessment
Message
More
```

### Overview

Contains:

- professional summary
- candidate preferences
- match explanation
- strengths
- uncertainties
- conflicts
- screening answers
- key employment history
- verification states

### Resume

Show original resume with extracted structured data linked where possible.

For sensitive/blind review mode, protected attributes remain hidden until policy permits reveal.

### Evidence

Show why claims are supported:

```text
React — resume + project evidence
NestJS — employment evidence
SQL — assessment verified
AWS — declared only / unverified
```

### Evaluation

Structured scorecard rather than unstructured thumbs-up/down.

### Activity

Chronological audit-like history of recruiter-visible workflow actions.

## Pipeline View

Pipeline is useful for stage movement and workload scanning, but must not replace the high-density table.

Columns represent configured stages.

Support:

- drag with confirmation where consequential
- keyboard/non-drag alternative
- candidate counts
- stage aging
- WIP warnings where configured
- quick filters

Do not load thousands of full candidate cards at once; use virtualization/pagination.

## Bulk Actions

Examples:

- move stage
- add tag
- assign recruiter
- send approved template
- invite assessment
- add to talent pool

High-risk actions such as bulk rejection should require clear review/confirmation and be auditable.

## Screening Panel

Recruiter should see:

```text
Eligibility
Required criteria
Preferred criteria
Evidence
Assessment
Screening answers
Overall recommendation category
```

The recommendation should use categories such as:

```text
Strong fit
Review
Lower relevance
```

Avoid system language such as `AI accepted` or `AI rejected`.

## Blind Review

When enabled, the product may hide:

- name
- photo
- age/date-of-birth indicators
- gender indicators
- marital status
- exact address

Policy may vary by jurisdiction/customer.

The hidden-state UX must clearly indicate that information is intentionally masked.

## Talent Search

Talent search must combine:

- structured filters
- keyword search
- semantic intent
- saved searches/views

Natural-language query example:

> Full-stack engineers in Karachi with React + Node, 2–4 years, available within 30 days.

The system should translate the request into visible/editable filters rather than hiding query interpretation.

## Talent Pools

Pools support reusable sourcing workflows.

Examples:

```text
Strong Graduate Engineers
Senior Backend — Karachi
Previous Finalists
2026 Campus Program
```

Pool membership should not duplicate candidate records.

## Interview Workspace

Interview workflow includes:

- schedule
- participants
- interview kit
- candidate-specific validation questions
- scorecards
- completion state

Interview kit should distinguish:

```text
Role-standard questions
Candidate-specific validation questions
```

## Scorecards

Scorecards must be structured around predefined criteria.

Design goals:

- consistent evaluation
- independent interviewer input where configured
- clear incomplete state
- comment/evidence support
- no silent AI modification

## Offers

Offer UX should eventually support:

- draft
- approvals
- compensation components
- template
- send
- status timeline
- audit

Offer approval state must be visually distinct from candidate decision state.

## Team Collaboration

Support:

- internal notes
- @mentions
- assignments
- scorecards
- activity
- decision ownership

Internal notes must never accidentally appear in candidate-facing surfaces.

## AI Assistance

AI should appear inside relevant workflows:

- candidate summary
- gap explanation
- interview focus
- JD assistance
- communication draft

Consequential output uses:

```text
Generate → Preview → Edit → Approve
```

Each AI summary should expose evidence/source context where possible.

## Empty States

Empty states must teach the next action.

Example for a new job:

```text
No applicants yet.
Share the job, invite candidates from Talent, or review publishing settings.
```

Avoid decorative empty illustrations without actionable guidance.

## Error States

Errors should preserve user work and explain recovery.

Examples:

- save failed → retain unsaved fields locally
- candidate move failed → restore previous stage
- AI unavailable → keep normal recruiter workflow functional
- search unavailable → fall back to limited structured search if possible

## Performance UX

Target perception:

- row selection/detail pane: immediate
- filters: responsive with debounced server query
- table scroll: smooth at thousands of records via virtualization
- stage action: optimistic only if safely reversible
- AI summaries: async state, never blocking base candidate view

## Small-Team Progressive Disclosure

A new employer may initially see:

```text
Jobs
Applicants
Interviews
Talent
```

Advanced capabilities appear as needed:

```text
Automations
Reports
Custom pipelines
Integrations
Advanced permissions
Approvals
```

The product must scale in capability without appearing enterprise-heavy to a 5-person startup.