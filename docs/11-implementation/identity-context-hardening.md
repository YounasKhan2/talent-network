# Identity & Workspace Context Hardening Plan

## Why this work is inserted now

Phase 1 established authentication, organizations, memberships, invitations, permissions, and multi-workspace behavior. Phase 2 established the initial Candidate Career Passport slice.

Before Career Passport expands further, Talent Network needs an explicit product boundary for users who may be candidates, organization members, or both.

This is not a new permanent product phase that replaces the MVP sequence. It is a cross-cutting hardening boundary between the existing identity foundation and the remainder of Candidate/Employer product development.

Governing documents:

- [`ADR-0002-user-context-not-account-type.md`](../10-decisions/ADR-0002-user-context-not-account-type.md)
- [`identity-and-workspace-context.md`](../03-architecture/identity-and-workspace-context.md)
- [`onboarding-and-context-switching.md`](../07-design/onboarding-and-context-switching.md)

## Current state

Already available:

- authenticated `User`
- candidate entity and Career Passport
- organization creation
- organization membership
- invitation acceptance/revocation
- role-to-permission bundles
- tenant-aware server authorization
- multi-organization switching foundation
- explicit `/onboarding` intent selection
- explicit Candidate creation from onboarding
- `/career` route guard that never creates Candidate state implicitly
- authenticated browser verification for employer-only `/career` redirect behavior
- account context discovery contract at `GET /api/v1/account/contexts`
- reusable Career/Organization context switcher shared by Career and Hiring layouts

Current hardening work is focused on completing last-active context persistence, stale-context recovery, and privacy/mixed-context regression coverage without turning UI context into an authorization boundary.

## Boundary 1 — Context Resolution Contract

**Status: implemented and local quality-gate verified.**

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

**Status: implemented and browser-tested for core Career activation flow.**

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

**Status: implemented and browser-tested.**

Current behavior:

```text
Candidate exists
→ open Career workspace

Candidate absent
→ /onboarding?intent=career
→ explicit creation action required
```

The API initialization endpoint remains idempotent, but frontend navigation no longer calls it merely because `/career` was opened.

### Acceptance criteria

- employer-only user can visit a career URL without silently acquiring Candidate state
- explicit button/action creates Candidate
- repeated explicit initialization remains safe/idempotent

## Boundary 4 — Context-Aware Post-Login Routing

**Status: implemented for deterministic first-use routing; last-active preference remains pending.**

Resolve destination after authentication:

```text
no contexts
→ /onboarding

candidate only
→ /career

one or more organizations
→ /app
```

Mixed/multiple context accounts currently default to Hiring until last-active context persistence is added.

Do not use last-active state as authorization.

## Boundary 5 — Reusable Context Switcher

**Status: implemented; local quality-gate and browser verification pending for latest slice.**

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
- organization selection writes only the existing UI preference key used by the Hiring workspace
- each organization shows its current role for orientation
- organization-only users can explicitly create Career state through onboarding
- candidate-only users can create or join an organization
- Escape closes the switcher and native focusable menu controls preserve keyboard accessibility

The selected organization preference is still treated only as navigation state. The `/app` page resolves the selected organization again through the server-authorized active-context endpoint before using it.

### Acceptance criteria

- candidate ↔ organization switching without logout
- organization ↔ organization switching
- role/permissions update navigation independently per org
- stale membership cannot remain usable
- keyboard accessible

## Boundary 6 — Last-Active Context Preference

Persist only UX preference, for example:

```text
kind: CANDIDATE | ORGANIZATION
organizationId?: UUID
```

Before use, validate against current authoritative state.

Do not cache permissions in this preference.

This may initially be client-side if server persistence adds no near-term product value, provided it never becomes a trust boundary.

## Boundary 7 — Privacy Firewall Tests

Add tests proving that organization membership does not grant implicit Candidate visibility.

Minimum assertions:

- employer membership cannot query another user's private Passport
- mixed-context user's Career state remains personal
- organization context cannot expose external applications/job-search state when those features arrive
- candidate privacy changes remain independent of membership

## Boundary 8 — Invitation Mixed-Context Tests

Verify:

```text
Candidate user
→ accepts invitation
→ organization membership added
→ Candidate unchanged
```

And:

```text
Organization-only user
→ creates Career Passport
→ memberships unchanged
```

## Boundary 9 — Internal Mobility Seam

Do not implement full internal mobility yet.

Add architecture/test notes ensuring future application authorization can detect:

```text
actor.userId == application.candidate.userId
```

so self-evaluation/scorecard/stage-change rules can be enforced later.

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

| Scenario                          | Expected destination/capability                      |
| --------------------------------- | ---------------------------------------------------- |
| No Candidate, no org              | onboarding                                           |
| Candidate only                    | Career                                               |
| One org only                      | employer workspace                                   |
| Candidate + one org               | last valid context or deterministic first-use choice |
| Candidate + many orgs             | context switcher + last valid context                |
| Many orgs, no Candidate           | employer workspace + switcher                        |
| Removed last-active org           | safe fallback                                        |
| Candidate accepts org invite      | both contexts preserved                              |
| Org user explicitly starts Career | Candidate added, org preserved                       |
| Org user merely opens Career URL  | no silent Candidate creation                         |

## Quality Gate

This hardening boundary is complete only when:

- architecture/docs agree
- explicit onboarding exists
- implicit Candidate creation-on-route is removed
- context-aware routing works
- mixed candidate/organization use is browser-tested
- existing Phase 1 organization authorization remains green
- Candidate integration tests remain green
- `pnpm check` passes

## Sequencing Relative to Phase 2

Recommended immediate sequence:

```text
Phase 2 initial Career Passport foundation      ✅ implemented / quality gate green
        ↓
Identity & workspace context hardening
  explicit onboarding                          ✅
  no implicit Candidate creation               ✅
  account context API                          ✅ verified
  reusable multi-context switcher               ✅ code complete / gate pending
  last-active context + stale fallback          ← next
  privacy / mixed-context tests
        ↓
Phase 2 Career Passport expansion
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

This keeps the already-built Candidate domain while preventing the temporary development onboarding behavior from becoming a permanent product assumption.
