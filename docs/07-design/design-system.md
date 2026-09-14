# Design System Specification

## Product Design Positioning

Talent Network must feel like a professional operating environment for employment and hiring, not a generic SaaS dashboard and not an AI demo.

Visual direction:

**Editorial precision × operational density**

The system should combine:

- the calm hierarchy of Notion
- the operational clarity of Jira
- the financial-product discipline of Mercury
- the command density and responsiveness associated with Linear

These are principles, not templates. The visual identity must remain original.

## Core Design Principles

1. Information before decoration.
2. Typography before containers.
3. Alignment before borders.
4. Density without clutter.
5. Progressive disclosure over permanent complexity.
6. Context preservation over page-hopping.
7. Evidence before AI claims.
8. Keyboard workflows are first-class.
9. Accessibility is part of component design.
10. Motion communicates state; it does not decorate.

## Prohibited Patterns

Avoid:

- glowing AI orbs
- purple/blue AI gradients as primary identity
- glassmorphism-heavy product UI
- oversized rounded cards everywhere
- dashboard pages made entirely of cards
- giant whitespace inside operational surfaces
- decorative charts without decisions attached
- sparkle icons on every AI feature
- modal-over-modal workflows
- arbitrary shadows and elevation
- excessive empty hero-like space inside authenticated product areas

## Layout System

### Product Shell

Desktop employer shell:

```text
┌──────────────┬──────────────────────────────────────────────────────┐
│ Sidebar      │ Top Bar                                              │
│              ├──────────────────────────────────────────────────────┤
│ Overview     │                                                      │
│ Jobs         │ Main workspace                                       │
│ Talent       │                                                      │
│ Inbox        │                                                      │
│ Calendar     │                                                      │
│ Reports      │                                                      │
│ Automate     │                                                      │
│ Settings     │                                                      │
└──────────────┴──────────────────────────────────────────────────────┘
```

Candidate product shell should be lighter and less operationally dense.

## Grid & Spacing

Use a 4px base spacing system.

Recommended scale:

```text
1 = 4px
2 = 8px
3 = 12px
4 = 16px
5 = 20px
6 = 24px
8 = 32px
10 = 40px
12 = 48px
16 = 64px
```

Do not create arbitrary spacing values unless a documented layout need exists.

## Density Modes

Support two density modes in recruiter surfaces:

- Comfortable
- Compact

Density affects row height, control height, spacing, and metadata visibility without changing information architecture.

## Typography

Typography must prioritize legibility at high information density.

Suggested semantic scale:

```text
11–12px  metadata / table secondary text
13px     dense controls / table body
14px     primary body text
16px     emphasized body / section labels
20–24px  workspace titles
28–32px  rare product-level titles
```

Use tabular numerals for:

- match scores
- salaries
- counts
- analytics
- time/duration data

## Color Model

Use semantic tokens rather than component-local hex values.

Token families:

```text
surface.canvas
surface.primary
surface.secondary
surface.elevated
surface.inverse

text.primary
text.secondary
text.muted
text.inverse

border.default
border.strong
border.focus

accent.primary
accent.hover
accent.subtle

status.success
status.warning
status.danger
status.info
status.neutral
```

Visual direction:

- warm neutral canvas
- near-white primary surfaces
- deeper neutral navigation/sidebar
- near-black primary text
- graphite secondary text
- quiet borders
- one disciplined brand accent

Status should never rely on color alone.

## Radius & Elevation

Use restrained radii.

Recommended tiers:

```text
radius.sm    controls/tags
radius.md    popovers/menus
radius.lg    selective panels only
```

Avoid large pill-shaped surfaces unless the content is truly a pill/tag/filter.

Shadows should communicate layering, not style.

## Core Primitives

Reusable base primitives should include:

- Button
- IconButton
- Input
- Textarea
- Select
- Combobox
- Checkbox
- Radio
- Switch
- Tabs
- Tooltip
- Popover
- DropdownMenu
- CommandMenu
- Dialog
- Drawer
- Sheet
- Toast
- Banner
- Breadcrumb
- Pagination/CursorControls
- Table
- VirtualList
- Skeleton
- EmptyState
- ErrorState
- Badge
- Avatar
- Divider
- InlineEditableField

## Hiring-Specific Components

Domain components should be composed from primitives rather than becoming an unrelated second design system.

Examples:

- CandidateRow
- CandidateIdentity
- MatchIndicator
- EvidenceBadge
- RequirementMatrix
- PipelineStage
- PipelineBoard
- CandidateDrawer
- ResumeViewer
- ResumeReviewDiff
- ScreeningQuestionResult
- AssessmentResult
- Scorecard
- InterviewTimeline
- ActivityFeed
- TalentPoolPicker
- VerificationMark
- JobStatus
- OrganizationBadge
- SalaryRange
- PrivacyIndicator
- AIExplanationPanel

## Tables

Recruiter tables are a primary product surface, not a fallback component.

They must support, where appropriate:

- sticky headers
- column resizing
- column visibility
- sorting
- multi-filtering
- saved views
- grouping
- bulk selection
- keyboard navigation
- virtualized rows
- inline edits
- row actions
- pinned columns
- density switching
- persistent user preferences

A candidate row should expose enough signal to triage without opening every profile.

## Split View

Opening a candidate should generally preserve list context.

Pattern:

```text
Applicant Table           Candidate Detail
─────────────────────┬──────────────────────────
Candidate A          │ Profile
Candidate B          │ Match explanation
Candidate C    ←     │ Resume
Candidate D          │ Activity
Candidate E          │ Interviews
                     │ Notes
```

The drawer/pane should be deep-linkable and browser-history aware.

## Command Palette

Global command interface should support:

- navigate
- search candidates/jobs
- create job
- open recent records
- change workspace
- run permitted actions

Suggested shortcut: `⌘K` / `Ctrl+K`.

## Keyboard Patterns

Power-user examples:

```text
J / K   previous/next candidate
S       shortlist
R       reject
I       schedule interview
N       add note
E       open evaluation
/       focus search
Esc     close current layer
```

Shortcuts must not interfere with typing contexts and must be discoverable.

## AI Presentation

AI should appear as embedded assistance, not a separate visual universe.

Good pattern:

```text
Candidate summary
Strong backend alignment based on Node.js/NestJS evidence.

Uncertainty
AWS production experience could not be verified.

Sources
Resume · Project evidence · Assessment

Suggested interview focus
Validate cache invalidation and deployment ownership.
```

Consequential AI actions should follow:

```text
Generate → Preview → Edit → Approve
```

## Motion

Motion durations should remain short and functional.

Use motion for:

- drawer transitions
- list insert/remove
- state changes
- reordering
- feedback
- contextual continuity

Avoid decorative scroll choreography inside the product application.

Respect `prefers-reduced-motion`.

## Accessibility

Mandatory:

- visible focus states
- semantic landmarks
- accessible table semantics
- keyboard support
- screen-reader names
- non-color-only states
- contrast compliance
- drag-and-drop alternatives
- reduced motion
- touch targets appropriate for candidate mobile workflows

## Component Governance

A new component should be created only when:

1. existing primitives cannot express the pattern cleanly;
2. the pattern appears in multiple places or is a stable domain concept;
3. accessibility/state behavior can be centralized;
4. duplication would otherwise become structural.

Do not create a configurable mega-component to predict future requirements.
