# Phase 2B — Closure Audit

## Status

**CLOSED / VERIFIED — 2026-09-15**

Phase 2B closes the Career Passport expansion and the first candidate-workspace information architecture. It leaves Phase 3 Resume Intelligence with stable identity, privacy, versioning, evidence, and navigation contracts.

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

The global Candidate Workspace navigation is product-level navigation. The Career Passport rail remains section-level navigation for the Passport editor:

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

Do not move Passport sections into the global sidebar. Future product-level destinations such as Resume, Job Matches, Applications, Career Copilot, and Settings join the global Candidate Workspace navigation only when their product slices exist.

`/career` remains the Career Passport route at Phase 2B closure. A future candidate Home surface may become the default `/career` destination when the dashboard has real application/job/resume data; Phase 2B intentionally does not create an empty dashboard merely to satisfy route aesthetics.

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
- Candidate and Organization workspace headers remain distinct but visually consistent.
- The Career context selector opens within the viewport and does not overflow below or outside the sidebar.
- Mobile/narrow layout keeps all implemented Candidate destinations reachable.

## Verified local quality gate

The repository root quality gate was run successfully after the final Phase 2B implementation and UI fixes:

```powershell
pnpm check
git status
```

Verified result:

- formatting passed
- lint passed
- typecheck passed
- unit tests passed
- Phase 1 integration suite passed
- Phase 2 integration suite passed
- Phase 2A privacy-firewall suite passed
- Phase 2B Career editor suite passed
- Phase 2B immutable version-history suite passed
- production builds passed
- working tree clean and synchronized with `origin/main`

The final formatting-only workspace-context-switcher change was committed and pushed after the green quality gate. No functional code changed after that successful gate.

## Verified browser acceptance

The final browser acceptance pass is complete. Verified behaviors include:

1. `/career` loads inside the Candidate Workspace shell.
2. Career Passport is selected in the global navigation.
3. Passport inner section rail navigates Overview through Privacy.
4. `/career/evidence` loads and Evidence is selected globally.
5. `/career/history` loads and Version history is selected globally.
6. Workspace switcher moves Career → Organization → Career without logout.
7. Candidate-only account renders the shell correctly.
8. Evidence filters work and evidence viewing/filtering does not increment Passport version.
9. Version history remains read-only.
10. Professional edits create exactly one new profile version.
11. Privacy-only edits do not create a professional profile version.
12. Narrow/mobile viewport exposes all implemented Candidate destinations and context switching.
13. Browser back/forward navigation preserves correct active navigation state.
14. Organization membership does not expose private Candidate professional data.
15. Organization context header is present and preserved.
16. Candidate context popup remains fully visible inside the viewport.

## Closure decision

**Phase 2B is CLOSED / VERIFIED.**

No additional Career Passport feature is required before Phase 3 begins. Future improvements such as no-op version detection, grouped/draft saves, richer version-reason metadata, and retention rules for unreferenced transient versions are scale/evolution work and do not invalidate the Phase 2B architecture.

## Phase 3 handoff — Resume Intelligence

Phase 3 is now the active implementation phase.

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

Phase 3 must preserve these Phase 2B invariants:

- resume parsing never silently mutates the Career Passport
- parsed data is a proposal until candidate approval
- imported professional changes create normal versioned Passport state
- private Career data remains isolated from Organization membership
- future applications pin immutable Career Passport and resume versions
- evidence provenance remains distinguishable from independent verification
