# CX-001: GitHub Actions workflow for check, database suites and builds

Goal: run the repository's verification on every pull request and push to `main`, so local agents do not all run the
full suites at once.

Paths you may change: `.github/workflows/ci.yml` (new), `docs/codex/README.md` (status row), `README.md` (one line
about CI).

Requirements:
- Ubuntu runner, Node version from the repository (`package.json` engines or the current LTS used by the lockfile).
- `npm ci`, then `npm run check`, `npm run build`, `npm run build:harnesses`.
- Database suites, each as its own step: `npm run req:test:db`, `npm run concept:test:db`, `npm run cad:test:db`,
  `npm run projects:test:db`, `npm run reasoning:test:db`. They start an embedded PostgreSQL themselves
  (`embedded-postgres`); do not add a PostgreSQL service container.
- Steps fail on a non-zero exit code. Cache npm. Concurrency: cancel superseded runs per branch.
- Upload no secrets; no deploy steps; no browser flows.

Acceptance: the workflow file passes `actionlint` if available (otherwise explain); the pull request's own CI run is
green or the failing step is explained with the first error lines.
