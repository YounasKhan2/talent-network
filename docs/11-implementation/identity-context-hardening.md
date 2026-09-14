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

Temporary Phase 2 behavior still requiring hardening:

```text
authenticated user
→ visits /career
→ Career Passport may initialize automatically
```

Production target:

```text
authenticated user without Candidate
→ visits career surface
→ explicit career onboarding
→ Create my Career Passport
→ Candidate created
```

## Boundary 1 — Context Resolution Contract

Add a single reusable server capability that can answer:

```text
Who is this authenticated user?
Does Candidate exist?
Which ACTIVE organization memberships are available?
Which permissions apply to each organization?
What context should the UI open by default?
```

Do not encode a permanent `userType`.

Possible implementation shape:

```text
GET /api/v1/account/contexts
```

or extend an appropriate authenticated account endpoint if doing so keeps responsibilities clean.

The response should contain only the data needed for context/navigation decisions.

### Acceptance criteria

- candidate-only state represented
- organization-only state represented
- mixed state represented
- multiple organizations represented
- removed/suspended memberships excluded or clearly non-selectable
- no private Candidate professional data included merely to resolve context

## Boundary 2 — Explicit Onboarding

Add:

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

Refactor `/career` behavior after onboarding is available.

Target behavior:

```text
Candidate exists
→ open Career workspace

Candidate absent
→ career onboarding / explicit creation CTA
```

The API initialization endpoint may remain idempotent, but frontend navigation must not call it just because the route was opened.

### Acceptance criteria

- employer-only user can visit a career URL without silently acquiring Candidate state
- explicit button/action creates Candidate
- repeated explicit initialization remains safe/idempotent

## Boundary 4 — Context-Aware Post-Login Routing

Resolve destination after authentication:

```text
no contexts
→ /onboarding

candidate only
→ Career/candidate home

one organization only
→ employer workspace

mixed or multiple
→ last valid context
```

If last-active context is invalid, fall back safely.

Do not use last-active state as authorization.

## Boundary 5 — Reusable Context Switcher

Replace any organization-only mental model with a context switcher capable of showing:

```text
Personal
  Career

Organizations
  Org A
  Org B

+ Create organization
```

For organization-only users, expose an explicit action to build a Career Passport.

For candidate-only users, expose organization creation/join flows.

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

| Scenario | Expected destination/capability |
| --- | --- |
| No Candidate, no org | onboarding |
| Candidate only | Career |
| One org only | employer workspace |
| Candidate + one org | last valid context or deterministic first-use choice |
| Candidate + many orgs | context switcher + last valid context |
| Many orgs, no Candidate | employer workspace + switcher |
| Removed last-active org | safe fallback |
| Candidate accepts org invite | both contexts preserved |
| Org user explicitly starts Career | Candidate added, org preserved |
| Org user merely opens Career URL | no silent Candidate creation |

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
Identity & workspace context hardening          ← next
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
