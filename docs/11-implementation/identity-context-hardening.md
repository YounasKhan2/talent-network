# Identity & Workspace Context Hardening Plan

## Why this work is inserted now

Phase 1 established authentication, organizations, memberships, invitations, permissions, and multi-workspace behavior. Phase 2 established the initial Candidate Career Passport slice.

Before Career Passport expands further, Talent Network needs an explicit product boundary for users who may be candidates, organization members, or both.

This is not a new permanent product phase that replaces the MVP sequence. It is a cross-cutting hardening boundary between the existing identity foundation and the remainder of Candidate/Employer product development.

Governing documents:

- [`ADR-0002-user-context-not-account-type.md`](../10-decisions/ADR-0002-user-context-not-account-type.md)
- [`identity-and-workspace-context.md`](../03-architecture/identity-and-workspace-context.md)
- [`onboarding-and-context-switching.md`](../07-design/onboarding-and-context-switching.md)
- [`candidate-organization-privacy-firewall.md`](../06-security/candidate-organization-privacy-firewall.md)

## Current state

Implemented and verified foundations:

- authenticated `User`
- candidate entity and Career Passport
- organization creation and membership
- invitation acceptance/revocation
- role-to-permission bundles
- tenant-aware server authorization
- explicit `/onboarding` intent selection
- explicit Candidate creation from onboarding
- `/career` route guard that never creates Candidate state implicitly in verified navigation flows
- account context discovery contract at `GET /api/v1/account/contexts`
- reusable Career/Organization context switcher
- candidate ↔ organization and organization ↔ organization switching
- client-side last-active context preference with authoritative validation
- stale organization preference fallback
- Phase 2A privacy-firewall integration suite

The remaining closure work is deliberately small: browser revalidation of the final last-active implementation, documentation alignment, and reserving the internal-mobility/self-evaluation seam for the future Applications/ATS phase.

## Boundary 1 — Context Resolution Contract

**Status: implemented and quality-gate verified.**

Reusable authenticated capability:

```text
GET /api/v1/account/contexts
```

It answers:

```text
Who is this authenticated user?
Does Candidate exist?
Which ACTIVE organization memberships are available?
Which permissions apply to each organization?
```

It does not encode a permanent `userType` and does not expose Career Passport professional data.

Current response shape:

```text
user
career
  available
  candidateId
organizations[]
  organizationId
  displayName
  slug
  roleKey
  permissions[]
```

Frontend context resolution consumes this contract instead of probing Candidate existence through the Career Passport endpoint.

### Acceptance criteria

- candidate-only state represented
- organization-only state represented
- mixed state represented
- multiple organizations represented
- removed/suspended memberships excluded through authoritative ACTIVE session membership resolution
- no private Candidate professional data included merely to resolve context

## Boundary 2 — Explicit Onboarding

**Status: implemented and browser verified for core Career activation behavior.**

Route:

```text
/onboarding
```

Primary intents:

```text
Build my career
Hire talent
```

Career action:

```text
explicitly initialize Candidate / Career Passport
```

Hiring action:

```text
pending invitation? → join
otherwise → create organization
```

### Acceptance criteria

- no context → onboarding
- choosing Career explicitly creates Candidate
- choosing Hiring alone does not create Candidate
- valid invitation is preserved across authentication
- copy explains who should choose each option
- copy explains that both contexts can coexist

## Boundary 3 — Stop Implicit Candidate Creation

**Status: implemented and browser verified at the route/context boundary.**

Current behavior:

```text
Candidate exists
→ open Career workspace

Candidate absent
→ /onboarding?intent=career
→ explicit creation action required
```

The API initialization endpoint remains idempotent, but context navigation must never create Candidate state merely because `/career` was opened.

### Acceptance criteria

- employer-only user can visit a Career URL without silently acquiring Candidate state
- explicit button/action creates Candidate
- repeated explicit initialization remains safe/idempotent

## Boundary 4 — Context-Aware Post-Login Routing

**Status: implemented; final last-active browser revalidation pending.**

First-use routing:

```text
no contexts
→ /onboarding

candidate only
→ /career

organization only
→ /app
```

Mixed-context routing uses the last valid UX preference when one exists.

Do not use last-active state as authorization.

## Boundary 5 — Reusable Context Switcher

**Status: implemented, quality-gate verified, and browser verified for switching/accessibility/mobile behavior.**

Shared switcher is used by Career and Hiring layouts and presents:

```text
Personal
  Career

Organizations
  Org A      Owner
  Org B      Recruiter

+ Create or join organization
```

Behavior:

- Career ↔ organization switching does not require logout
- organization ↔ organization switching re-resolves authoritative account contexts
- each organization shows its current role for orientation
- organization-only users can explicitly create Career state through onboarding
- candidate-only users can create or join an organization
- Escape closes the switcher and native focusable menu controls preserve keyboard accessibility

### Acceptance criteria

- candidate ↔ organization switching without logout
- organization ↔ organization switching
- role/permissions update navigation independently per org
- stale membership cannot remain usable
- keyboard accessible
- narrow/mobile viewport remains usable

## Boundary 6 — Last-Active Context Preference

**Status: implemented and repository quality-gate verified; final browser revalidation pending.**

Persist UX preference only:

```text
{ kind: 'career' }

or

{ kind: 'organization', organizationId: UUID }
```

Rules:

- preference contains no permissions
- preference is client navigation state, not trust state
- organization preferences are checked against current `/account/contexts`
- stale/removed organization IDs are rejected
- fallback resolves safely to another valid organization, Career, or onboarding

Required final browser revalidation:

```text
Career last active
→ logout/login
→ /career

Org B last active
→ logout/login
→ /app with Org B

Org B membership removed
→ stale preference rejected
→ another valid org / Career / onboarding
```

## Boundary 7 — Privacy Firewall

**Status: implemented as an explicit architecture rule and integration regression gate.**

Canonical security document:

- [`candidate-organization-privacy-firewall.md`](../06-security/candidate-organization-privacy-firewall.md)

Core invariant:

> Organization membership never grants direct read access to a member's private Candidate/Career data.

Current Phase 2A integration coverage proves:

- another organization's owner cannot obtain a different user's Career Passport through candidate-owned access paths
- account context discovery returns capability metadata, not professional profile data
- mixed-context Career state survives organization invitation acceptance unchanged
- organization memberships/permissions survive explicit Career creation unchanged
- candidate privacy changes remain independent of membership

Future application, recruiter-search, matching, sourcing, and internal-mobility features must extend this regression suite.

## Boundary 8 — Invitation Mixed-Context Tests

**Status: covered by the Phase 2A privacy-firewall integration suite.**

Verified invariant:

```text
Candidate user
→ accepts invitation
→ organization membership added
→ Candidate profile/privacy unchanged
```

And:

```text
Organization-only user
→ explicitly creates Career Passport
→ memberships/permissions unchanged
```

## Boundary 9 — Internal Mobility Seam

**Status: architecture seam reserved; full implementation intentionally deferred.**

Do not implement internal mobility before Applications/ATS entities exist.

Future application authorization must be able to detect:

```text
actor.userId == application.candidate.userId
```

Before allowing organization-side actions such as:

- stage movement
- scorecard submission
- interview feedback
- offer actions
- restricted evaluator notes

This prevents a user who is both a candidate and an organization member from evaluating or advancing their own application merely because they hold recruiter/admin/owner permissions.

The canonical privacy firewall document records this requirement so the Applications phase must implement it deliberately.

## Boundary 10 — Future Identity Seams

No MVP implementation required yet, but avoid schema/product assumptions that block:

- multiple verified emails per user
- work vs personal email
- Google/Microsoft login
- OIDC/SAML enterprise SSO
- organization ownership transfer
- recruiting/staffing agencies
- client-delegated recruiting scopes
- organization classifications
- scoped suspensions
- separate personal vs organization deletion/retention

## Test Matrix

| Scenario                              | Expected destination/capability | Status                                    |
| ------------------------------------- | ------------------------------- | ----------------------------------------- |
| No Candidate, no org                  | onboarding                      | implemented                               |
| Candidate only                        | Career                          | implemented                               |
| One org only                          | employer workspace              | implemented                               |
| Candidate + one org                   | last valid context              | implemented; browser revalidation pending |
| Candidate + many orgs                 | switcher + last valid context   | implemented; browser revalidation pending |
| Many orgs, no Candidate               | employer workspace + switcher   | implemented                               |
| Removed last-active org               | safe fallback                   | implemented; browser revalidation pending |
| Candidate accepts org invite          | both contexts preserved         | integration verified                      |
| Org user explicitly starts Career     | Candidate added, org preserved  | integration verified                      |
| Org user merely opens Career URL      | no silent Candidate creation    | browser verified                          |
| Org membership vs private Career data | no implicit Candidate access    | integration verified                      |

## Quality Gate

This hardening boundary is complete only when:

- architecture/docs agree
- explicit onboarding exists
- implicit Candidate creation-on-route is blocked
- context-aware routing works
- mixed candidate/organization use is browser-tested
- last-active context restore/stale fallback is browser-revalidated after the final implementation
- existing Phase 1 organization authorization remains green
- Candidate integration tests remain green
- Phase 2A privacy-firewall integration tests remain green
- `pnpm check` passes

Current repository quality gate: **green**, including the Phase 2A privacy-firewall integration suite.

## Sequencing Relative to Phase 2

```text
Phase 2 initial Career Passport foundation      ✅ quality gate green
        ↓
Identity & workspace context hardening
  explicit onboarding                          ✅ verified
  no implicit Candidate creation               ✅ verified at route boundary
  account context API                          ✅ verified
  reusable multi-context switcher              ✅ verified
  last-active context + stale fallback         ✅ code/gate green; browser revalidation pending
  privacy firewall + mixed-context tests       ✅ integration verified
  internal mobility seam                       ✅ documented / intentionally deferred
        ↓
Phase 2 Career Passport expansion               ← next after closure
  projects
  certifications
  languages
  links
  location/preferences
  edit/remove/reorder
  history UX
        ↓
Phase 3 Resume Intelligence
```

This keeps the already-built Candidate domain while preventing temporary development assumptions from becoming permanent identity, authorization, or privacy weaknesses.
