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
- Assistant (`src/assistant.ts`): **headless** (integration milestone 1, C9). Operations take the
  service from `AssistantActionContext.services.requirements` and the project from
  `ctx.captured.projectId`, never from a mounted view; the module client comes from
  `getModuleClient(service, projectId)` (API mode only). `requirements.update` returns a
  `service-proposal` (platform preview, Apply, Undo) whose Apply makes the editor's own write
  (`saveRequirementEdit`: module client in API mode, SDK service in demo mode) with the base revision,
  so the server refuses the same input identically on both paths. `requirements.search` works in
  both modes; `requirements.explain_quality` needs API mode. Without a service the twin-based
  behaviour of `read_for_component` and `update` is unchanged. Tests:
  `src/assistant.test.ts` (demo, no view), `services/api/test/assistant.test.ts` (real API: every
  operation headless, validation parity, cross-project writes refused).
- Verification records stay twin artifacts (ADR-0007), shown for requirements with a twin object.

Not here: persistence (server), subscriptions, navigation, other tools' data.

## Permitted dependencies

`@ews/platform-sdk` (+ `/react`, `/harness` in the harness, `/testing` in tests), `@ews/design-system`,
`@ews/requirements-client`, React. Never another tool, `apps/workspace`, `@ews/model-service`,
`localStorage`, React Aria or icon packages directly.

## Rules

- Planned navigation/filter work is specified in
  [requirements-navigation-filtering.md](../../docs/specifications/requirements-navigation-filtering.md).
  Reuse existing pagination/filters; agree sidebar and SDK work with the coordinator. Filter the
  full authorized query before paging, keep implementation and verification distinct, and expose
  manual/AI filtering through the same typed criteria. Do not mark this planned work implemented.

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

## Help and documentation

Owned by this module (root AGENTS.md "Help and documentation", docs/modules/help.md). Write the
Requirements Management user documentation in `help/*.md` (front matter: help_id, title, kind, summary, keywords,
related), export a `HelpManifest` as `help` in the tool definition, map every toolbar item and
assistant action in `contextMappings`, and mark significant controls with `data-help-id`
(`requirements.<area>.<item>`). Update the pages with every feature change.

Current manifest: `src/help.ts` (18 topics, one tutorial); controls marked: statement field, save button.
