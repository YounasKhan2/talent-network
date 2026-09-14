# Identity & Workspace Context Hardening Plan

## Status

**Phase 2A: CLOSED / VERIFIED — 2026-09-14**

Phase 1 established authentication, organizations, memberships, invitations, permissions, and multi-workspace behavior. The initial Phase 2 slice established the Candidate Career Passport. Phase 2A inserted the privacy and context boundary required before expanding either side of the product.

Governing documents:

- [`ADR-0002-user-context-not-account-type.md`](../10-decisions/ADR-0002-user-context-not-account-type.md)
- [`identity-and-workspace-context.md`](../03-architecture/identity-and-workspace-context.md)
- [`onboarding-and-context-switching.md`](../07-design/onboarding-and-context-switching.md)
- [`candidate-organization-privacy-firewall.md`](../06-security/candidate-organization-privacy-firewall.md)

## Verified outcome

Talent Network does not permanently classify a human as Candidate or Employer. `User` remains the authenticated person; Career and Organization participation are independent contexts that may coexist.

Verified foundations:

- explicit `Build my career` / `Hire talent` onboarding
- Candidate creation only from explicit intent; route navigation does not create Candidate state
- authenticated `GET /api/v1/account/contexts` capability discovery
- reusable Career/Organization context switcher
- Candidate ↔ Organization and Organization ↔ Organization switching without logout
- last-active Career and Organization preference restoration
- authoritative stale-organization fallback
- tenant-aware organization permissions remain server authoritative
- Career ownership remains bound to authenticated `session.userId`
- Candidate/Organization privacy-firewall integration regression gate
- mixed-context invitation and Career-creation invariants
- internal-mobility/self-evaluation seam reserved for Applications/ATS

## Context resolution contract

`GET /api/v1/account/contexts` answers which contexts are currently available without encoding a permanent `userType` or exposing Career Passport professional data.

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

This endpoint is context discovery, not authorization. Candidate operations still resolve ownership from the authenticated user. Organization operations still require ACTIVE membership, tenant scope, and the relevant permission bundle.

## Explicit onboarding and Career activation

```text
Build my career
→ explicit Candidate / Career Passport initialization

Hire talent
├── accept relevant invitation
└── create organization
```

Verified browser behavior:

- logged-out `/career` redirects through authentication
- authenticated organization-only `/career` redirects to explicit Career onboarding
- opening `/career` does not silently create Candidate state
- repeated explicit Candidate initialization remains idempotent

## Context switching and last-active preference

The shared switcher presents personal Career context independently from organization workspaces. The selected context is UX state only.

```text
Personal
  Career

Organizations
  Org A      Owner
  Org B      Recruiter

+ Create or join organization
```

The persisted preference contains no permission claims:

```text
{ kind: 'career' }

or

{ kind: 'organization', organizationId: UUID }
```

Before an organization preference is used, it is validated against current authoritative account contexts.

Final browser verification passed:

```text
Career last active
→ logout/login
→ /career

Org B last active
→ logout/login
→ /app with Org B active

Org B membership removed
→ stale preference rejected
→ another valid org / Career / onboarding
```

Keyboard and narrow/mobile switcher behavior were also browser verified.

## Candidate / Organization Privacy Firewall

Canonical security rule:

> Organization membership never grants direct read access to a member's private Candidate/Career data.

Current integration coverage proves:

- Candidate Passport lookup is bound to the authenticated user identity
- account context discovery exposes capability metadata rather than professional profile data
- Candidate acceptance of an organization invitation preserves Career profile/privacy state
- explicit Career creation for an organization member preserves memberships and permissions
- Candidate privacy changes do not alter organization membership

Future Applications, recruiter search, matching, sourcing, internal mobility, assessments, and analytics must extend this firewall rather than bypass it.

The controlled future boundary is:

```text
Candidate context
    ↓ explicit submission / consent
Application snapshot
    ↓
Organization-owned hiring process
```

The employer should evaluate the candidate-submitted snapshot, not gain unrestricted access to the live private Career workspace.

## Internal mobility / self-evaluation seam

Full internal mobility is intentionally deferred until Applications/ATS exists. Future organization-side application authorization must detect:

```text
actor.userId == application.candidate.userId
```

before allowing actions such as stage movement, scorecard submission, interview feedback, offer actions, or restricted evaluator notes. Organization permissions alone must never allow a mixed-context user to evaluate their own application.

## Future identity seams

No MVP implementation is required yet, but future work must avoid assumptions that block:

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

## Closure test matrix

| Scenario                          | Expected behavior                     | Status                  |
| --------------------------------- | ------------------------------------- | ----------------------- |
| No Candidate, no org              | onboarding                            | ✅ verified             |
| Candidate only                    | Career                                | ✅ verified             |
| One org only                      | employer workspace                    | ✅ verified             |
| Candidate + one org               | restore last valid context            | ✅ browser verified     |
| Candidate + many orgs             | switcher + restore last valid context | ✅ browser verified     |
| Many orgs, no Candidate           | employer workspace + switcher         | ✅ verified             |
| Removed last-active org           | safe authoritative fallback           | ✅ browser verified     |
| Candidate accepts org invite      | both contexts preserved               | ✅ integration verified |
| Org user explicitly starts Career | Candidate added, org preserved        | ✅ integration verified |
| Org user merely opens Career URL  | no silent Candidate creation          | ✅ browser verified     |
| Org membership vs private Career  | no implicit Candidate access          | ✅ integration verified |

## Quality gate

Phase 2A closes with:

- architecture and implementation documentation aligned
- explicit onboarding verified
- implicit Candidate creation blocked at the route/context boundary
- account-context discovery verified
- reusable context switching verified
- last-active restoration and stale fallback browser verified
- Phase 1 authorization regression suite green
- Phase 2 Candidate integration suite green
- Phase 2A privacy-firewall integration suite green
- repository `pnpm check` green

## Next

```text
Phase 2 initial Career Passport foundation      ✅
Phase 2A Identity / Workspace Hardening         ✅ CLOSED
        ↓
Phase 2B Career Passport expansion              ← CURRENT
  projects
  certifications
  languages
  links
  location/preferences
  edit/remove/reorder
  version-history UX
        ↓
Phase 3 Resume Intelligence
```

Phase 2B must preserve every Phase 2A identity, tenant-isolation, explicit-consent, and privacy-firewall invariant.
