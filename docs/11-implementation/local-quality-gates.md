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
tests
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

Before pushing implementation changes:

```bash
pnpm install
pnpm check
```

For infrastructure-backed flows:

```bash
cp .env.example .env
docker compose up -d
pnpm check
```

When product integration tests are introduced, the quality command must remain the single top-level entry point and delegate to the appropriate package test suites.

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

Never claim a build, test, lint, or typecheck passed unless it was actually executed.
