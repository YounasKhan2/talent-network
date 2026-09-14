# Identity & Workspace Context Architecture

## Purpose

This document defines how Talent Network knows whether an authenticated person is operating as a candidate or inside an organization, how users can participate in both, and how routing, authorization, privacy, invitations, and future enterprise identity should scale without introducing a permanent account-type split.

The governing decision is [ADR-0002 — User Context, Not Account Type](../10-decisions/ADR-0002-user-context-not-account-type.md).

## Core Principle

> A user is a person. Candidate and organization participation are contexts attached to that person, not mutually exclusive account types.

```text
User
├── Candidate?                 personal career context
└── OrganizationMember[]      organization hiring contexts
    └── Organization
```

`User` owns authentication and person-level security state.

`Candidate` owns candidate-side professional identity and privacy state.

`Organization` owns company/team hiring state.

`OrganizationMember` connects a user to an organization with status and authorization.

## Canonical Context States

An authenticated user can be in one of these valid states:

| Candidate | Active organization memberships | Meaning                                 |
| --------- | ------------------------------: | --------------------------------------- |
| No        |                               0 | New account; onboarding intent required |
| Yes       |                               0 | Candidate-only user                     |
| No        |                               1 | Employer-side user with one workspace   |
| No        |                            Many | Employer-side multi-organization user   |
| Yes       |                               1 | Candidate + one hiring workspace        |
| Yes       |                            Many | Candidate + multiple hiring workspaces  |

Do not collapse these states into a single `user.type` field.

## Context Resolution

After authentication, the application resolves capabilities from authoritative server data:

```text
Session
  ↓
User
  ├── Candidate exists?
  └── ACTIVE OrganizationMember records?
```

The result drives navigation, but not authorization.

A future context-resolution response may conceptually expose:

```json
{
  "candidate": {
    "exists": true
  },
  "organizations": [
    {
      "organizationId": "...",
      "name": "CubixByte",
      "roleKey": "ORG_OWNER",
      "permissions": ["..."]
    }
  ],
  "lastActiveContext": {
    "kind": "ORGANIZATION",
    "organizationId": "..."
  }
}
```

The exact transport contract should be introduced only when implementation requires it.

## Context Routing

Recommended post-login routing:

```text
0 contexts
→ /onboarding

Candidate only
→ candidate home / career area

Exactly one organization, no Candidate
→ employer workspace

Candidate + organization(s)
→ restore last valid active context

Multiple organizations, no Candidate
→ restore last valid organization or present workspace chooser
```

If stored last-active state points to an inaccessible or removed organization, ignore it and resolve from current memberships.

## Explicit Context Creation

### Candidate

Candidate identity should be created from explicit user intent, for example:

```text
Build my career
→ Create my Career Passport
→ Candidate created
```

A route visit alone must not silently create Candidate state in the production UX.

### Organization

Organization context is established through:

```text
Hire talent
├── Create organization
└── Accept organization invitation
```

If a valid pending invitation exists for the authenticated identity, invitation acceptance should be the strongest contextual action instead of prompting the person to create an unrelated organization.

## Authorization Boundary

### Candidate routes

Candidate operations authorize ownership from server-side identity:

```text
session.user.id
→ Candidate where userId = session.user.id
→ candidate policy
```

The browser cannot select another candidate identity.

### Organization routes

Organization operations authorize:

```text
session.user.id
+ requested organizationId
→ ACTIVE membership
→ permission bundle
→ resource belongs to same organization
→ allow/deny
```

Never infer organization authority from:

- route visibility
- sidebar state
- `X-Organization-Id` by itself
- local storage
- active context cookies by themselves
- frontend role labels

The existing organization selector/header is a request-context hint only; server membership and permission checks remain authoritative.

## Candidate / Organization Privacy Firewall

Candidate and employer contexts share authentication, not data ownership.

Organization membership must not reveal private candidate behavior.

Examples of personal candidate state that remains private unless intentionally shared:

- job searches
- saved jobs
- external applications
- salary preferences
- candidate availability changes
- Career Passport edits
- recruiter discoverability state
- private resumes
- Career Copilot activity

The employer receives candidate information through explicit hiring flows such as:

- application submission
- candidate-controlled discoverability
- candidate consent to sourcing/contact rules
- later referral/internal mobility workflows

## Application as a Controlled Boundary Crossing

Applications form an important bridge between contexts.

```text
Candidate context
    ↓ explicit apply
Application snapshot
    ↓
Organization-owned hiring process
```

The submitted candidate/profile/resume versions are frozen so later Career Passport edits do not rewrite the employer's historical evaluation input.

This boundary should remain explicit in both schema and authorization.

## Workspace / Context Switcher

A mixed-context user should be able to switch without signing out.

Conceptual UI:

```text
Muhammad Younas

Personal
  Career

Organizations
  CubixByte         Owner
  Another Company   Recruiter

+ Create organization
```

Rules:

- switching context changes navigation and request targeting
- switching never modifies roles or memberships
- unavailable contexts disappear or become inaccessible after revalidation
- context selection should work with keyboard navigation
- candidate context and organization contexts should be visually distinct without feeling like separate accounts

## Last Active Context

Last-active context is UX state, not authority.

Possible persistence fields:

```text
lastActiveContextKind
lastActiveOrganizationId
```

Before using it after login:

1. verify the referenced context still exists
2. verify membership is ACTIVE when organization-scoped
3. fall back to another valid context or onboarding

Do not persist authorization decisions in this preference.

## Invitation Edge Cases

### Existing candidate receives organization invite

```text
User + Candidate
→ invitation accepted
→ OrganizationMember created/reactivated
→ Candidate unchanged
```

### Employer-only user starts Career Passport

```text
User + OrganizationMember
→ explicit Build my career action
→ Candidate created
→ organization memberships unchanged
```

### Invitation while logged out

Preserve the intended invitation route through authentication and verify that the authenticated email/identity is eligible before acceptance.

### Invitation to active member

Do not create duplicate active memberships.

### Invitation for a different email identity

Reject or require identity verification/linking according to invitation policy; do not silently attach organization access to an unrelated authenticated identity.

## Internal Mobility / Self-Conflict

A user may be both an organization member and applicant to a job in that organization.

This is valid for internal mobility, but later policy should prevent self-conflict such as:

```text
evaluate own application
read private evaluator notes about self
submit scorecard for self
move own application through protected stages
```

Authorization should eventually consider actor/application identity relationships, not merely role permission.

## Multi-Organization Edge Cases

The same user can have different roles in different organizations:

```text
CubixByte       ORG_OWNER
Company B       RECRUITER
Company C       INTERVIEWER
```

Permissions are resolved independently per membership.

Organization A must never infer memberships or activity from Organization B unless the user explicitly exposes that information through product policy.

## Leaving an Organization

When membership becomes `REMOVED` or `SUSPENDED`:

- organization access stops immediately according to session/cache policy
- candidate context remains available
- other organization memberships remain available
- organization-owned records remain with the organization
- audit history retains the actor reference according to retention policy

## Organization Ownership

Ownership is an organization membership capability, not a person-level account type.

Future policy should prevent:

- removing the last active owner without transfer/closure
- deleting an account that would orphan an active organization

Owner transfer should create auditable events.

## Organization Classification

Do not encode business logic that assumes every organization is a direct employer.

Future organization classifications may include:

```text
COMPANY
RECRUITING_AGENCY
STAFFING_AGENCY
EDUCATIONAL_INSTITUTION
OTHER
```

This classification should describe organization behavior/eligibility, not replace membership permissions.

## Agency Recruiting Seam

A future recruiting agency may operate for multiple client companies without becoming a normal member of every client's internal workspace.

Potential future model:

```text
Agency Organization
→ Client Relationship
→ delegated requisition scope
```

Do not implement this in the MVP unless demanded by validation customers, but avoid hard-coding direct-employer assumptions into job ownership or recruiter identity.

## Email Identity Evolution

The current user model may begin with a primary email. Architecture should allow eventual evolution to:

```text
User
└── VerifiedEmail[]
    ├── personal primary
    └── work / organization-associated
```

This supports:

- organization domain verification
- invitation matching
- SSO
- job changes
- account recovery

A company email must never become permanent ownership of the person's account.

## External Authentication / SSO Evolution

Future authentication can attach multiple login identities to one `User`:

```text
User
├── Password credential
├── Google identity
├── Microsoft identity
└── Enterprise SSO identity
```

Safe account linking needs explicit verification and takeover protection. Product context remains independent of authentication provider.

## Suspension Semantics

Do not conflate:

```text
UserStatus
OrganizationStatus
MembershipStatus
Candidate visibility/discoverability
```

Examples:

- suspended membership blocks one workspace only
- suspended organization blocks organization operation without disabling personal candidate access
- suspended user blocks global account use
- hidden candidate remains authenticated but undiscoverable

## Deletion / Retention

Personal deletion and organization deletion are separate workflows.

Candidate-owned data may follow personal deletion/privacy policy.

Organization-owned hiring records may require longer retention for audit, legal, fraud, billing, or hiring-decision history.

Do not use destructive cascades that erase a company because an owner deletes their user account.

## Security Tests Required

As this model is implemented, maintain tests for at least:

- new user with no contexts
- candidate-only user
- organization-only user
- candidate + one organization
- candidate + multiple organizations
- membership removed while last-active context points to that organization
- cross-organization authorization denial
- candidate route cannot access another candidate
- organization membership does not expose candidate-private state
- employer-only user does not gain Candidate state by merely visiting a career route
- candidate accepts organization invitation without losing Candidate state
- internal applicant cannot evaluate self when that policy is introduced

## Implementation Sequence

Introduce the context model incrementally:

### Boundary A — Documentation and routing contract

- ADR
- onboarding UX specification
- route/context rules

### Boundary B — Explicit onboarding

- `/onboarding`
- intent selection
- explicit Candidate creation
- create/join organization paths

### Boundary C — Context resolution

- authenticated context summary
- post-login routing
- safe last-active context preference

### Boundary D — Context switcher

- reusable UI
- candidate + multi-org switching
- revalidation after membership changes

### Boundary E — Hardening

- browser/E2E tests
- privacy boundary tests
- invitation mixed-context tests
- stale context recovery

This work should be completed before dependent product areas begin assuming a permanent candidate/employer split.
