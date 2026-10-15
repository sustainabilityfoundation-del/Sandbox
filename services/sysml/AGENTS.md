# AGENTS.md: @ews/sysml-service

SysML Modeler repository and API (PostgreSQL schema `sysml`, Fastify plugin hosted by `@ews/api` at
`/api/sysml/v1`). Owner: the SysML agent. Architecture: [docs/modules/sysml/api-and-integration.md](../../docs/modules/sysml/api-and-integration.md),
ADR-0033, ADR-0034.

## Rules

- Only this package reads or writes schema `sysml`; other modules use the HTTP API.
- Migrations are append-only (`src/db/migrations/NNNN_*.sql`); `commits` and `element_versions` are
  append-only (triggers). Never rewrite history; undo is a compensating commit.
- Every write goes through `SysmlRepository.transact` / `revert` / `rawCommit`, which validate with
  `@ews/sysml-core`. No route writes tables directly.
- Writes require a version check (`baseCommitId` or If-Match) and accept `Idempotency-Key`.
- Authorization: `tool:sysml` entitlement plus membership of the project's platform project; readers
  read, editors/reviewers/administrators write. Errors never expose SQL or stack traces.
- Mark platform extensions as such in the route spec (`alignment: 'extension'`); aligned endpoints
  follow the Systems Modeling API paths and JSON shapes.

## Tests

`npm run req:test:db` (runs `services/*/test` on a disposable real PostgreSQL), including the HTTP
contract suite of `@ews/sysml-client`.
