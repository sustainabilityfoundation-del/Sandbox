# AGENTS.md: @ews/projects-service

Project Management service: schema `projects`, migrations, Fastify plugin (`/api/projects/v1`), OpenAPI, outbox,
blob store. Owner: the Project Management module (docs/specifications/project-management-contracts.md).
Imports only `@ews/platform-sdk`. Design: docs/modules/projects.

## Rules

- Migrations are append-only (`src/db/migrations/NNNN_*.sql`, checksummed); never rewrite or delete user data
  (ADR-0009). Immutable tables keep their refuse-change triggers.
- Every write goes through `withTransaction` (via `rc.write`), records an audit event with provenance and emits
  outbox events for committed changes only. Consequential writes support `?dryRun=true`; destructive ones need
  `X-Confirm: <project key>`.
- Store references and summaries of other modules' artifacts, never copies of their content. Never delete a
  registry record or module data.
- Membership is written only through the host's `MembershipPort` (platform.project_memberships stays the single
  authorization source). Project settings live in the settings service (port), never in this schema.
- A blank project creates no artifacts in any module. Templates add configuration and planning items only.
- Rules (roles, lifecycle, statuses, link rules, templates) live in `src/domain/rules.ts`; keep the OpenAPI `x-*`
  extensions in step.

## Commands

```bash
npx vitest run --config services/projects/vitest.db.config.ts   # real PostgreSQL (temporary server)
npx vitest run services/projects                                 # unit tests (domain, blob store)
npm run typecheck -w @ews/projects-service
```
