# Phase 2B — Closure Audit

## Status

**Implementation complete; final local quality gate and browser verification required before Phase 2B is marked CLOSED / VERIFIED.**

Phase 2B closes the Career Passport expansion and the first candidate-workspace information architecture. It must leave Phase 3 Resume Intelligence with stable identity, privacy, versioning, evidence, and navigation contracts.

## Closure scope

Phase 2B includes:

- structured Career Passport sections
- detailed candidate-controlled editing
- ordered add / edit / remove / reorder semantics
- custom sections with nested entries
- immutable-style professional profile versions
- candidate-owned version history
- derived evidence indicators
- Candidate / Organization privacy firewall preservation
- reusable Candidate Workspace navigation shell
- responsive candidate navigation
- workspace-context switching preserved inside the candidate shell

## Candidate Workspace information architecture

The Phase 2B shell exposes only implemented destinations:

```text
Candidate Workspace
└── Career
    ├── Career Passport
    ├── Evidence
    └── Version history
```

The global Candidate Workspace navigation is product-level navigation. The existing Career Passport rail remains section-level navigation for the Passport editor:

```text
Global Candidate navigation
    ↓
Career Passport
    ├── Overview
    ├── Experience
    ├── Education
    ├── Skills
    ├── Projects
    ├── Certifications
    ├── Languages
    ├── Links
    ├── Locations
    ├── Custom sections
    └── Privacy
```

Do not move Passport sections into the global sidebar. Future product-level destinations such as Resume, Job Matches, Applications, Career Copilot, and Settings must join the global Candidate Workspace navigation only when their product slices exist.

`/career` remains the current Career Passport route in Phase 2B. A future candidate Home surface may become the default `/career` destination when the dashboard has real application/job/resume data; Phase 2B does not create an empty dashboard merely to satisfy route aesthetics.

## Architecture audit

### Identity and ownership

- `User` remains authentication/person identity.
- `Candidate` remains the private professional identity owned by that User.
- Organization membership does not convert Career data into organization-owned data.
- Candidate reads and writes derive ownership from the authenticated session user.
- Browser-supplied Candidate IDs are not authorization inputs.

### Versioning

- Professional mutations create a new immutable-style approved Passport version.
- Previous versions are superseded rather than rewritten.
- Historical snapshots remain candidate-owned and read-only.
- Privacy/discoverability changes do not create professional profile versions.
- Application snapshots can later pin an exact Passport version without depending on the candidate's future edits.

### Evidence

- `DECLARED` means candidate-provided claim.
- `SUPPORTED` means supporting material is attached.
- `VERIFIED` is reserved for a real independent verification process.
- URLs do not manufacture verification.
- Missing evidence is not negative evidence.
- Evidence derivation is read-only and does not create Passport versions.

### Privacy firewall

- Private Career activity remains isolated from organization membership.
- Evidence and version history remain inside Candidate context.
- Employer access must later cross the boundary through an intentional application or discoverability contract, never through membership alone.

### Navigation

- Candidate Workspace shell is shared by `/career`, `/career/evidence`, and `/career/history`.
- Career Passport section navigation remains local to the Passport editor.
- Workspace context switching remains available without logout.
- Mobile layout collapses global navigation without duplicating product routes.

## Required local quality gate

Before closure, run from the repository root:

```powershell
pnpm check
git status
```

Required result:

- formatting passes
- lint passes
- typecheck passes
- unit tests pass
- Phase 1 integration suite passes
- Phase 2 integration suite passes
- Phase 2A privacy-firewall suite passes
- Phase 2B editor + version-history suites pass
- production builds pass
- working tree is clean

## Required browser verification

Verify with a candidate that also has at least one organization membership when possible:

1. `/career` loads inside the Candidate Workspace shell.
2. Career Passport is selected in the global navigation.
3. Passport inner section rail still navigates Overview through Privacy.
4. `/career/evidence` loads and Evidence is selected globally.
5. `/career/history` loads and Version history is selected globally.
6. Workspace switcher can move Career → Organization → Career without logout.
7. Candidate-only account still renders the shell correctly.
8. Evidence filters work and opening/filtering evidence does not increment Passport version.
9. Version history remains read-only.
10. Professional edit creates exactly one new profile version.
11. Privacy-only edit does not create a professional profile version.
12. Narrow/mobile viewport exposes all three Candidate destinations and the context switcher.
13. Back/forward browser navigation preserves correct active navigation state.
14. No Candidate private professional data appears in the organization workspace merely because the same User is a member.

## Closure decision

Phase 2B may be marked **CLOSED / VERIFIED** only after the local gate and browser checks above pass.

After closure, Phase 3 begins with the Resume Intelligence pipeline:

```text
Upload
  ↓
Object storage
  ↓
Malware scan
  ↓
Text extraction
  ↓
OCR fallback
  ↓
Structured parsing
  ↓
Proposed Career Passport changes
  ↓
Candidate review
  ↓
Accept / Edit / Ignore
```

Resume parsing must never silently mutate the Career Passport.
