# ADR-0002 — User Context, Not Account Type

- Status: Accepted
- Date: 2026-09-14
- Owners: Product / Architecture / Identity

## Context

Talent Network serves people who may participate in more than one employment context at the same time.

A person can be:

- a candidate maintaining a Career Passport
- an owner of one organization
- a recruiter in another organization
- an interviewer for a third organization
- a candidate applying for a role while still participating in an employer workspace

A permanent `User.type = CANDIDATE | EMPLOYER` model would make these legitimate cases difficult or impossible without account duplication, migrations, or special-case authorization.

The platform already models `User`, `Candidate`, `Organization`, and `OrganizationMember` as separate concepts. This ADR makes that separation an explicit product and architecture rule.

## Decision

`User` represents the authenticated human identity. Candidate and organization participation are independent contexts attached to that user.

```text
User
├── Candidate?                       personal career context
└── OrganizationMember[]            zero or more hiring contexts
    └── Organization
```

Talent Network MUST NOT use a mutually exclusive candidate/employer account type as the authoritative identity or authorization model.

A user may have:

- no product context yet
- candidate context only
- one or more organization contexts only
- candidate context plus one or more organization contexts

## Product Language

The onboarding UI describes intent, not database entities.

Primary choices:

- **Build my career**
- **Hire talent**

The UI must explain that both can be used from the same account.

Do not ask users to make a permanent choice between "Candidate" and "Organization".

## Context Creation

Candidate context is created only after an explicit career action such as:

```text
Create my Career Passport
```

Visiting a candidate route alone must not silently convert an employer-only user into a candidate.

Organization context is created through either:

- creating an organization
- accepting an organization invitation

An invitation must never require converting or replacing an existing candidate account.

## Authorization Rule

Active UI context is navigation state, not authorization.

Every protected server operation must independently authorize from durable state.

Candidate operation:

```text
session user
→ Candidate.userId == session.userId
→ operation-specific policy
```

Organization operation:

```text
session user
→ active OrganizationMember for requested organization
→ permission bundle
→ resource / tenant scope
```

Client-provided context identifiers, selected workspace state, route prefixes, or browser storage never grant access.

## Context Switching

A user with multiple contexts may switch between them without signing out.

Conceptual selector:

```text
Personal
  Career

Organizations
  CubixByte
  Another Company

+ Create organization
```

The product may persist the last active context for routing convenience, but the server must re-authorize every request.

## Privacy Boundary

Organization membership grants zero implicit access to the member's personal candidate activity.

An organization must not learn, solely from membership, that a member:

- is looking for another job
- changed career preferences
- changed salary expectations
- searched for roles
- applied elsewhere
- enabled recruiter discoverability

Candidate information crosses into an employer-owned hiring process only through an explicit product action or policy, such as submitting an application or intentionally becoming discoverable under the configured visibility rules.

## Internal Mobility / Conflict of Interest

The architecture must allow an organization member to also become an applicant to a role in the same organization.

Future authorization may restrict the person from:

- evaluating their own application
- viewing private scorecards about themselves
- viewing decision notes about themselves
- using organization permissions to bypass candidate-facing visibility rules

These controls are not required for the initial Career Passport implementation, but domain design must not make them impossible.

## Multi-Organization Membership

A user may belong to many organizations simultaneously. Each membership is independently statused, permissioned, audited, and tenant-scoped.

Leaving one organization must not delete or disable the user's personal account, Candidate identity, or memberships in other organizations.

## Organization Types

Do not assume every organization is permanently a direct employer.

The model should be able to evolve toward organization classifications such as:

- company
- recruiting agency
- staffing agency
- educational institution
- other

Agency/client relationships are deferred; the architecture should not force agency recruiters to become direct members of every client organization.

## Email Identity Evolution

The current account may use one primary email, but long-term identity should be able to support multiple verified emails per user for:

- personal email
- work-domain verification
- organization invitations
- SSO identities
- account recovery
- job changes

Do not couple permanent user identity to one employer email domain.

## Authentication Provider Evolution

Future password, Google, Microsoft, OIDC, SAML, or enterprise SSO identities should resolve to the same underlying human `User` where safely linked. Authentication method does not define product context.

## Suspension Scope

Different suspension scopes must remain distinguishable:

- user suspension: blocks the person globally
- organization suspension: blocks organization operation
- membership suspension: blocks only one user's access to one organization
- candidate visibility changes: affect discoverability, not authentication

## Deletion and Ownership

Deleting a personal account must not implicitly delete an organization.

Before an organization owner can leave/delete their account, product policy may require ownership transfer or organization closure. Historical organization records may require retention independent of the person's candidate data.

## Organization Ownership

Organization ownership is membership authority, not a special user type.

The platform should eventually enforce at least one active owner per active organization and require ownership transfer before the final owner leaves.

## Consequences

### Positive

- one login can support career and hiring use cases
- no account duplication for recruiter/candidate overlap
- clean tenant boundaries
- future multi-org, agency, SSO, and internal-mobility flows remain possible
- candidate privacy remains independent of employer membership
- authorization stays resource- and permission-based

### Costs

- routing is context-aware
- onboarding needs an intent-selection state
- UI needs a context/workspace switcher
- tests must cover combinations of candidate and organization state
- some future flows need conflict-of-interest rules

These costs are preferred over permanent account-type coupling.

## Rejected Alternatives

### Permanent `User.type`

Rejected because one person can legitimately be both a candidate and an employer-side user.

### Separate candidate and employer accounts

Rejected because it creates duplicate identities, fragmented security/recovery, poor invitation UX, and difficult cross-context transitions.

### Trust the selected workspace from the client

Rejected because UI state is not an authorization boundary.

## Required Follow-Up

1. Add explicit post-auth onboarding for users with no context.
2. Replace implicit Career Passport creation-on-route with explicit creation intent.
3. Add context-aware login routing.
4. Add a reusable workspace/context switcher.
5. Persist last-active context only as a UX preference.
6. Preserve server-side authorization for every candidate and organization operation.
7. Add browser/integration coverage for candidate-only, organization-only, and mixed-context users.
8. Keep future multi-email, SSO, internal-mobility, ownership-transfer, and agency seams documented.
