# Onboarding & Context Switching UX

## Purpose

This document defines how Talent Network explains candidate and organization usage to people, how a new account selects an initial goal, how invitations alter onboarding, and how one person can later switch between personal career and organization workspaces without creating duplicate accounts.

The architecture is governed by [ADR-0002 — User Context, Not Account Type](../10-decisions/ADR-0002-user-context-not-account-type.md).

## UX Principle

Do not ask users to understand internal data models.

The product should ask what they want to do now:

```text
Build my career
Hire talent
```

Do not present a permanent account-type decision such as:

```text
Candidate
Employer
Organization
```

The user can add the other context later.

## Primary Onboarding Screen

Recommended heading:

> How do you want to use Talent Network?

### Build my career

Recommended description:

> Create your Career Passport, discover relevant opportunities, understand your matches, manage applications, and keep your professional profile reusable across your career.

Recommended guidance:

Choose this if you are:

- looking for a job or internship
- a student or fresh graduate preparing for opportunities
- already employed but exploring better opportunities
- a freelancer or contractor looking for work
- maintaining your professional profile, resumes, or applications

Primary action:

```text
Build my career →
```

### Hire talent

Recommended description:

> Create or join a hiring workspace to publish jobs, review candidates, manage pipelines, schedule interviews, and collaborate with your team.

Recommended guidance:

Choose this if you are:

- a founder or company owner
- a recruiter or HR professional
- a talent acquisition specialist
- a hiring manager
- an interviewer
- a recruitment or staffing professional

Primary action:

```text
Hire talent →
```

### Reassurance copy

Show close to both choices:

> **Need both?** Your account can have a Career Passport and belong to one or more organizations. You can switch workspaces anytime.

This line prevents the user from treating onboarding as an irreversible identity decision.

## Do Not Add a Third “Both” Card

Do not show:

```text
Build my career
Hire talent
Both
```

A third choice increases decision complexity without creating a distinct product flow.

A user who needs both should start with the task they are trying to perform now and add the second context later.

## Invitation-Aware Onboarding

A pending valid organization invitation changes the hiring path.

Example:

```text
You've been invited to join
CubixByte
Hiring Manager

[Join CubixByte]
```

If an invitation is the reason the person arrived, accepting it should be more prominent than "Create organization".

If the user also wants a Career Passport, they can add it after joining without a second account.

## New Account Routing

After authentication and required email verification:

```text
No Candidate + no ACTIVE organization memberships
→ /onboarding
```

Onboarding should not create product entities until the person takes the corresponding explicit action.

## Career Onboarding

Choosing **Build my career** leads to a short, progressive flow rather than one giant profile form.

Recommended initial sequence:

```text
1. Confirm career intent
2. Create Career Passport
3. Basic professional headline / status
4. Privacy default explanation
5. Enter Career workspace
```

Default privacy should remain conservative. A newly created Candidate should not become recruiter-searchable by accident.

Recommended reassurance:

> Your Career Passport starts private. You choose when recruiters can discover you.

The fuller profile can then be completed section-by-section inside the Career workspace.

## Hiring Onboarding

Choosing **Hire talent** leads to:

```text
Pending invitation exists?
├── Yes → Join invited organization
└── No
    ├── Create organization
    └── Enter invitation / join flow when available
```

Organization creation should explain that the creator becomes an owner/admin-capable member according to the server policy.

Do not imply that creating an organization verifies the company. Verification is a separate trust state.

## Existing User Adding Another Context

### Candidate-only user

Expose actions such as:

```text
+ Create hiring workspace
Join organization
```

### Organization-only user

Expose:

```text
Build my Career Passport
```

This action must be explicit. Merely visiting a candidate URL must not create Candidate state.

## Context Switcher

Recommended structure:

```text
Muhammad Younas

PERSONAL
  Career

ORGANIZATIONS
  CubixByte           Owner
  Company B           Recruiter
  Company C           Interviewer

+ Create organization
```

The labels should communicate context and organization role without overwhelming the user with authorization terminology.

### Switcher behavior

- selecting `Career` moves to the candidate shell
- selecting an organization moves to the employer shell scoped to that organization
- current context is clearly marked
- inaccessible/removed memberships are not usable
- switching does not sign the user out
- the switcher is keyboard accessible
- organization permissions determine which employer navigation items appear

## Candidate Shell Guidance

Candidate UX is personal and calmer.

Primary concepts eventually include:

```text
Home
Jobs
Applications
Career
Assessments
Messages
```

Career wording should explain that Career Passport is the reusable professional source of truth, while a resume is one presentation derived from it.

## Employer Shell Guidance

Employer UX is operational and organization-scoped.

Primary concepts eventually include:

```text
Overview
Jobs
Talent
Inbox
Calendar
Reports
Settings
```

The organization name should remain visible enough that multi-organization users always know which company they are acting for.

## Guidance When Users Choose the Wrong Path

Never trap the user or demand account recreation.

If someone enters Career first but needs to hire:

```text
Workspace switcher
→ + Create organization
```

If someone enters Hiring first but wants personal career tools:

```text
Workspace switcher / account menu
→ Build my Career Passport
```

## Privacy Guidance for Dual-Context Users

A person who belongs to a company may also use Talent Network privately as a candidate.

The product should communicate this clearly where trust matters:

> Your employer workspace does not receive access to your private Career activity just because you are a member of that organization.

Organization membership must not expose personal job searches, external applications, salary preferences, or recruiter-discoverability choices.

## Internal Mobility Guidance

If internal applications are supported later, the UI should distinguish them from ordinary employee access.

A user should understand that applying to their own organization does not grant them access to private evaluation material.

Potential copy:

> Your application is evaluated through the hiring process. Your organization role does not give you access to private evaluation notes or decisions about your own application.

## Organization Verification Guidance

Hiring onboarding should avoid implying immediate trust certification.

Possible state communication:

```text
Organization created
Verification: Unverified
```

Later verified organizations may gain trust signals or additional capabilities according to policy.

## Multi-Organization UX

For users in several organizations:

- show organization name and role in the switcher
- preserve the last valid organization for convenience
- never merge candidates/jobs across tenants into one ambiguous employer view
- show a clear organization indicator on destructive or high-impact actions
- revalidate context after membership changes

## Stale Context Recovery

If the last active organization is no longer accessible:

```text
last active org unavailable
→ select another valid org if appropriate
→ otherwise Career if available
→ otherwise /onboarding
```

Do not show a broken workspace indefinitely.

## Small-Screen Behavior

Candidate context switching should remain easily reachable on mobile.

Employer mobile surfaces may be reduced to essential actions, but organization identity and context switching must remain visible enough to avoid acting in the wrong tenant.

## Accessibility

The intent cards and context switcher must support:

- keyboard focus
- meaningful labels
- visible selected state
- screen-reader distinction between personal and organization contexts
- no color-only indication of current context

## Browser Journeys to Verify

### Journey A — Brand-new career user

```text
signup
→ verify email
→ onboarding
→ Build my career
→ explicitly create Career Passport
→ private/hidden defaults
→ Career workspace
```

### Journey B — Brand-new organization owner

```text
signup
→ verify email
→ onboarding
→ Hire talent
→ create organization
→ employer workspace
→ no Candidate created
```

### Journey C — Candidate accepts recruiter invitation

```text
existing Candidate
→ invitation link
→ authenticate if needed
→ accept invitation
→ Candidate remains intact
→ organization appears in switcher
```

### Journey D — Employer adds Career context

```text
organization-only user
→ Build my Career Passport
→ explicit creation
→ Career added to switcher
→ organization membership unchanged
```

### Journey E — Multi-organization switching

```text
Career
↔ CubixByte
↔ Company B
```

Verify permissions/navigation independently for each organization.

### Journey F — Removed membership

```text
lastActiveContext = Company B
membership removed
→ next resolution rejects stale context
→ safe fallback
```

## Anti-Patterns

Do not:

- permanently label the whole account Candidate or Employer
- require separate login credentials for career and hiring
- silently create Candidate state on route visit
- treat active workspace selection as permission
- expose candidate-private activity to employers because of membership
- assume one user belongs to only one organization
- assume every organization is a direct employer
- force users to recreate accounts when their job/career role changes
