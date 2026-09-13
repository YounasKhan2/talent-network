# AGENTS.md

This repository is the single source of truth for the Talent Network project.

These rules apply to humans, AI coding agents, automation agents, and contributors.

## Non-Negotiable Principles

Every change must preserve or improve:

- Scalability
- Reusability
- Maintainability
- Modularity
- Security
- Observability
- Testability
- Accessibility
- Documentation quality

Do not optimize for short-term implementation speed by creating structural debt that will force a rewrite at moderate scale.

## Architecture Rules

1. Prefer clear domain boundaries over cross-module shortcuts.
2. Start with a modular monolith; extract services only when justified by load, deployment isolation, failure isolation, ownership, or regulatory requirements.
3. PostgreSQL remains the transactional source of truth unless an ADR explicitly changes that decision.
4. Redis is for cache, sessions, locks, rate limits, queues, and ephemeral coordination; never make Redis the only source of important business state.
5. Large files must use object storage and signed access patterns.
6. Heavy, retryable, or slow work must be asynchronous.
7. Public APIs and internal events must be versionable and contract-driven.
8. Background jobs must be idempotent where retries are possible.
9. Multi-tenant access must be enforced server-side.
10. Avoid N+1 data-access patterns and chatty frontend APIs.
11. Use purpose-built read models for complex high-volume screens.
12. Infrastructure complexity must be earned by measured need.

## Reusability Rules

- Shared capabilities belong in reusable packages/modules, not copied between apps.
- Reuse domain behavior, validation, contracts, and design tokens where appropriate.
- Do not create a generic abstraction until at least one real reuse case exists.
- Prefer composable primitives over giant configurable components.
- Product-specific behavior must not pollute infrastructure packages.

## AI Rules

- AI must be accessed through a controlled AI gateway/module rather than scattered provider SDK calls.
- Prompts, models, schemas, costs, retries, timeouts, and versions must be observable.
- Structured output must be schema-validated.
- Expensive model inference must be minimized through precomputation, deterministic filtering, caching, and staged reasoning.
- AI may assist, summarize, explain, classify, or prioritize. Humans retain consequential employment decisions.
- AI-generated hiring signal must be explainable and attributable to source evidence when possible.
- Never silently mutate authoritative candidate career data from an AI parse. Candidate approval/review is required for imported resume data.

## UX / Design Rules

The application is a professional operating system, not a generic AI dashboard.

Avoid:

- gratuitous gradient/glow aesthetics
- excessive rounded cards
- glassmorphism everywhere
- decorative dashboards
- huge empty whitespace in dense workflows
- AI sparkle branding on every action

Prefer:

- typography, alignment, spacing, and hierarchy before containers
- dense but calm recruiter tables
- split-pane/detail-drawer workflows
- keyboard-first power-user interactions
- saved views and configurable columns
- progressive disclosure
- minimal chrome
- purposeful motion
- accessible interaction patterns

Design inspiration may be taken from products such as Mercury, Notion, Jira, and Linear, but layouts and visual identity must remain original.

## Security Rules

Every feature must consider:

- authentication
- authorization
- tenant isolation
- data minimization
- privacy
- audit logging
- rate limiting
- file safety
- secrets handling
- abuse/fraud vectors
- retention/deletion requirements

Never trust organization IDs, role claims, permissions, or ownership claims supplied by the client without server-side verification.

## Data Rules

- Prefer normalized transactional data with intentional denormalized read models where justified.
- Version important mutable inputs that affect hiring decisions.
- Preserve historical meaning for submitted applications.
- Add indexes according to query patterns and measured plans, not speculation.
- Use cursor pagination for large/change-heavy collections.
- Search indexes, caches, and analytics stores are projections; they are not authoritative transactional state.

## Documentation Rules

Documentation updates are part of implementation, not follow-up work.

Whenever a change modifies any of the following, update the relevant documentation in the same work:

- architecture
- data model
- API contracts
- event contracts
- user flows
- permissions
- infrastructure
- AI behavior
- security posture
- deployment
- observability
- operational procedures

If the change introduces or reverses a significant technical decision, create or update an Architecture Decision Record under `docs/10-decisions/`.

## README Rules

Keep the root README understandable for a new engineer or agent. It must remain an accurate high-level map of:

- product vision
- system architecture
- repository structure
- documentation entry points
- implementation status
- local-development entry points once code exists

Do not let README examples drift from actual commands or directory structure.

## Definition of Done

A change is complete only when applicable items below are satisfied:

- implementation is modular and typed
- tests pass
- edge cases are considered
- migrations are safe
- permissions are correct
- observability is present
- errors are actionable
- retryable operations are idempotent
- performance implications are understood
- documentation is updated
- diagrams/contracts are updated where relevant
- accessibility is preserved
- no unnecessary vendor coupling was introduced

## Architecture Decision Records

Use ADRs for consequential decisions.

Each ADR should include:

- status
- context
- decision
- alternatives considered
- consequences
- scalability impact
- security impact
- migration/reversal strategy

## Final Rule

Do not knowingly introduce a shortcut that makes the system disposable.

The objective is not premature enterprise complexity; the objective is an architecture that can evolve from MVP to large-scale production without throwing away its foundations.