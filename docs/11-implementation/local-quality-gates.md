# Local-First Quality Gates

## Decision

GitHub-hosted CI is **not required** for the current project phase.

The repository must remain fully verifiable without paid GitHub Actions or any other paid CI provider.

The authoritative engineering quality gate is local and reproducible:

```bash
pnpm install
pnpm check
```

`pnpm check` must run, in order:

```text
format check
lint
typecheck
unit tests
Phase 1 database-backed integration tests
build
```

A change must not be considered complete if these checks fail.

## Why

The architecture should not depend on a specific CI vendor or billing setup.

Local verification preserves:

- portability
- developer independence
- reproducibility
- lower operating cost
- easier future migration to GitHub Actions, self-hosted runners, GitLab CI, Buildkite, CircleCI, or another provider

## Required Developer Workflow

Before pushing implementation changes, start the local infrastructure and then run the repository gate:

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm check
```

The Phase 1 integration suite is exposed independently when focused execution is useful:

```bash
pnpm test:integration:phase1
```

That command builds the database package, deploys committed Prisma migrations, and runs the real PostgreSQL Phase 1 integration suite. The suite uses unique per-run users and organizations and cleans up the records it creates.

`pnpm check` remains the single authoritative top-level quality entry point; package-specific commands are implementation details and focused developer tools.

## Database-backed integration requirements

The integration gate requires:

- `DATABASE_URL` configured in the root `.env`
- PostgreSQL reachable at that URL
- committed Prisma migrations deployable against that database

The integration suite must not truncate or reset a developer database. Tests must isolate their own records, use unique identifiers, and clean up only data created by the test run.

## CI Later

A hosted CI system may be added later when practical, but it must execute the same repository-owned commands rather than duplicating validation logic in provider-specific YAML.

Preferred future rule:

```text
CI provider = orchestration only
repository scripts = source of truth
```

This prevents quality rules from becoming coupled to GitHub Actions.

## Branch Protection

Until hosted CI exists, branch protection must not require unavailable remote status checks.

Code-review discipline and local `pnpm check` verification are the current gate.

## Verification Evidence

When a contributor or AI agent completes a substantial implementation phase, the completion summary should state which commands were actually executed and their results.

Never claim a build, test, lint, typecheck, migration, or integration suite passed unless it was actually executed.
