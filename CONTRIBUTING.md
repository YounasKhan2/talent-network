# Contributing

Talent Network is being developed as a long-lived, scalable product. Contributions must preserve architectural integrity, security, documentation quality, and future evolvability.

## Before changing code

Read:

- `README.md`
- `AGENTS.md`
- relevant documents under `docs/`
- relevant ADRs under `docs/10-decisions/`

Do not begin by coding around an existing architecture decision you have not inspected.

## Change workflow

For meaningful work:

1. Understand the product requirement and affected domains.
2. Identify security, tenancy, performance, data, and AI implications.
3. Update or create the architecture/product documentation if the design changes.
4. Implement behind clear domain boundaries.
5. Add or update tests.
6. Add observability for critical flows.
7. Validate performance implications for high-volume paths.
8. Update API/event contracts and diagrams where relevant.
9. Add an ADR for consequential decisions.
10. Keep the root README accurate when repository structure or major system behavior changes.

## Pull request expectations

A substantial PR should explain:

- problem being solved
- implementation approach
- affected domains
- data/migration impact
- API/event changes
- security/authorization impact
- performance/scalability impact
- observability changes
- testing performed
- documentation updated
- rollback or migration considerations when applicable

## Engineering standards

Prefer:

- explicit types
- small cohesive modules
- dependency inversion at external-provider boundaries
- idempotent background work
- predictable errors
- safe database migrations
- cursor pagination for large mutable collections
- transactional integrity for business-critical changes
- purpose-built read models for dense application screens

Avoid:

- duplicated business logic
- provider SDK calls scattered through domain code
- hidden cross-domain writes
- giant utility modules
- unbounded list endpoints
- N+1 database patterns
- synchronous heavy AI/file work inside request-response flows
- frontend-only authorization
- undocumented architecture changes

## Documentation is part of the PR

If code changes system behavior while docs still describe the previous behavior, the change is incomplete.

## Architecture decisions

Create an ADR when changing or introducing decisions with long-lived impact, including:

- persistence technology
- queue/event technology
- service boundaries
- tenancy strategy
- auth model
- major search architecture
- major AI architecture
- infrastructure/deployment model
- data-retention strategy
- significant vendor coupling

## Definition of Done

A change is not done merely because it compiles or works locally.

Where applicable it must also be secure, tested, observable, documented, accessible, performant enough for its expected load, and consistent with repository architecture rules.
