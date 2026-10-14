# AGENTS.md: @ews/tool-requirements

Requirements Management tool. Owner: the Requirements module (see
`docs/specifications/requirements-contracts.md` §1). Specification: [docs/modules/requirements.md](../../docs/modules/requirements.md).

## Responsibilities

- API mode (default): the canonical requirements in the Requirements service, through
  `ToolApi.services.requirements` and the module client from `getModuleClient()`:
  table (search, lifecycle/type/archived filters, configurable columns, cursor pagination, saved
  views, bulk edit), collections (headings, ordering without drag), detail panel (Edit, Trace,
  Reviews, History, Comments, Quality, Verification), traceability matrix, baselines (historical
  read-only view, comparison), quality overview and conventions, import/export.
- Demo mode (only when the host chose `createDemoRequirementsService()`): SDK contract only, labelled.
- No service: explain why; never substitute other data.
- Assistant (`src/assistant.ts`, `src/proposals.ts`): twin-based `requirements.read_for_component`
  and `requirements.update` stay unchanged when no service is connected; with a connected view they
  read the API and record proposals that the view previews with Apply / Reject / Undo
  (`requirements.search`, `requirements.explain_quality` are API-only).
- Verification records stay twin artifacts (ADR-0007), shown for requirements with a twin object.

Not here: persistence (server), subscriptions, navigation, other tools' data.

## Permitted dependencies

`@ews/platform-sdk` (+ `/react`, `/harness` in the harness, `/testing` in tests), `@ews/design-system`,
`@ews/requirements-client`, React. Never another tool, `apps/workspace`, `@ews/model-service`,
`localStorage`, React Aria or icon packages directly.

## Rules

- Every write sends an expected revision (or an idempotency key for creation); conflicts are shown
  with "Load latest (keep my edits)"; failed saves keep all input.
- Committed-change events (SSE) reload visible data; an open form keeps local edits and warns when a
  newer revision exists.
- Lifecycle (approval) is not verification, compliance or modelled satisfaction; collection nesting
  is not derivation or decomposition. Say so where users could confuse them.
- Client-side permission checks are UX only; the server enforces.

## Commands

```bash
npm run dev:api                                   # Requirements API + embedded PostgreSQL (port 8787)
npm run dev:requirements                          # harness on :5181 (?mode=demo, ?user=ada|rui|eli|rho|nia)
npm run typecheck -w @ews/tool-requirements
npx vitest run packages/tool-requirements
npm run check
```
