# Candidate / Organization Privacy Firewall

## Purpose

Talent Network allows one authenticated `User` to participate in both a personal Career context and one or more Organization hiring contexts. Those contexts share identity, but they do **not** share data ownership.

The privacy firewall is the security and product boundary that prevents organization membership from becoming implicit access to a person's private Career state.

```text
User
├── Personal / Career
│   ├── Career Passport
│   ├── availability
│   ├── compensation preferences
│   ├── saved/search activity
│   ├── private resumes
│   └── future Career Copilot activity
│
└── Organization memberships
    ├── Org A / Owner
    ├── Org B / Recruiter
    └── Org C / Interviewer
```

A user may legitimately occupy both sides. A founder may be job hunting. A recruiter may maintain a Career Passport. An employee may later apply internally. None of those cases should collapse personal and employer data boundaries.

## Security invariant

> Organization membership never grants direct read access to a member's private Candidate/Career data.

Candidate-owned operations authorize from the authenticated user identity:

```text
session.user.id
→ Candidate where candidate.userId == session.user.id
→ candidate-owned resource
```

Organization-owned operations authorize independently:

```text
session.user.id
+ organizationId
→ ACTIVE OrganizationMember
→ permission bundle
→ organization-owned resource
```

The presence of both relationships on the same `User` must not create an implicit join between them.

## Personal state that remains private

Unless the candidate intentionally shares data through a supported product flow, an organization must not infer or retrieve:

- job searches
- saved jobs
- applications to other organizations
- compensation expectations
- availability / open-to-opportunities state
- Career Passport edits or history
- private resumes
- recruiter discoverability settings
- future Career Copilot activity
- future interview preparation activity

This list is intentionally broader than the current schema so new features inherit the boundary instead of weakening it accidentally.

## Account context discovery is metadata-only

`GET /api/v1/account/contexts` exists to answer navigation/capability questions such as:

```text
Does Career exist?
Which organizations can this user enter?
Which role/permissions apply in each organization?
```

It must not become a shortcut for returning private Career profile fields.

Allowed Career context metadata is intentionally narrow:

```text
career
  available
  candidateId
```

Fields such as headline, compensation, availability, skills, resume content, search activity, or applications do not belong in context discovery.

## Controlled boundary crossing: applications

When applications are implemented, the employer should receive an explicit application snapshot rather than unrestricted access to the candidate's live Career Passport.

```text
Candidate context
      │
      │ explicit apply
      ▼
Application Snapshot
├── Candidate/Profile version
├── Resume version
├── Job version
├── screening answers
└── application-specific evidence
      │
      ▼
Organization hiring context
```

The snapshot is the controlled data-sharing event.

Later edits to the Career Passport must not silently rewrite the historical application input. If the product supports candidate updates after submission, that must be an explicit, audited flow.

## Discoverability is not membership

Future recruiter sourcing/search must also respect this distinction:

```text
Organization membership ≠ Candidate discoverability consent
```

A company employing or collaborating with a user does not automatically gain access to that user's Candidate profile merely because the user is present in the same organization workspace.

Future recruiter search should operate only on candidates whose visibility/discoverability policy permits it, and should expose only the fields permitted by that policy.

## Internal mobility seam

Internal mobility creates a special case where the candidate and the organization may already have a membership relationship.

When application entities exist, authorization must be able to detect:

```text
actor.userId == application.candidate.userId
```

That relationship must be considered before allowing organization-side actions such as:

- moving stages
- submitting scorecards
- writing interview feedback
- making offer decisions
- viewing restricted evaluator notes

A person must never be able to evaluate or advance their own application merely because they also hold recruiter, hiring-manager, owner, or admin permissions in that organization.

The exact policy belongs to the Applications/ATS phase; this document reserves the security seam now.

## Current regression coverage

Phase 2A integration coverage proves the current foundation:

- Career Passport lookup is bound to the owning user identity
- organization ownership does not grant another user's Career Passport
- account-context discovery exposes Career capability metadata but not professional data
- accepting an organization invitation preserves Candidate profile/privacy state
- creating Career for an organization member preserves memberships and permissions
- candidate privacy changes do not alter organization membership

Future application, recruiter-search, matching, and internal-mobility tests must extend this suite rather than replace it.

## Product / marketing claims

Security architecture may support clear user-facing promises, but claims should match implemented behavior.

Safe current/foundational language:

> Your Career identity is personal. Joining a company workspace does not give that company access to your private Career Passport.

Target language once application snapshots and employer access controls are implemented and verified:

> Apply intentionally, share intentionally. Employers see what you submit to their hiring process—not your private career activity elsewhere.

The second statement should not be promoted as a full production guarantee until the Applications/ATS boundary is implemented and regression-tested.

## Non-negotiable implementation rules

1. Never authorize Candidate reads from organization membership alone.
2. Never authorize organization actions from active UI context/local storage.
3. Never include private Career fields in generic account/workspace context responses.
4. Keep candidate privacy/discoverability state independent from organization roles.
5. Treat application submission as an explicit data-sharing boundary.
6. Freeze submitted versions for historical evaluation integrity.
7. Add self-evaluation protections before internal mobility or employee applications ship.
8. Every new cross-context feature must add regression tests for this firewall.
