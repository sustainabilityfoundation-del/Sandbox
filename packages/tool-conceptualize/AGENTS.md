# AGENTS.md: @ews/tool-conceptualize

Conceptualize tool. Owner: the Conceptualize module (docs/specifications/conceptualize-contracts.md §2).
Architecture: [docs/modules/conceptualize.md](../../docs/modules/conceptualize.md).

## Responsibilities

- API mode: Concept Explorer (tree, graph, search), Concept Workspace (intent, structure, decisions,
  implementations, evidence, history), Alternative Explorer (comparison, trade study, branching,
  decisions), Integration (link status, notifications), AI collaboration (hypothesis review, next steps,
  provenance), through `ToolApi.services.concepts` and `getConceptsModuleClient()`.
- Demo mode (`createDemoConceptsService()` chosen by the host): SDK read subset only, labelled.
- Assistant (`src/assistant.ts`, `src/ai/generator.ts`): `conceptualize.*` actions; changes are service
  proposals applied by the user with provenance and idempotency keys scoped by conversation.

## Rules

- Never present AI output, assumptions or estimates as facts: show the basis badge everywhere.
- Every write carries an expected revision or an idempotency key; show conflicts, keep input.
- Client-side permission checks are UX only; the server enforces.
- No CAD or SysML editing here; link artifacts by ID and show their status.
- Only `@ews/design-system` components and tokens; CSS in `@layer components` with `@container tool`.

## Commands

```bash
API_PORT=8798 npm run dev:api                   # backend (choose your own ports)
npm run concept:dev                              # harness on :5184 (?mode=demo, ?user=ada|rui|eli|rho|nia)
npx vitest run packages/tool-conceptualize
npm run concept:test:db                          # service and adapter tests on real PostgreSQL
```

## Help and documentation

`help/*.md` (20 topics) and `src/help.ts`: every toolbar item, assistant operation and marked control
(`data-help-id="conceptualize.…"`) is mapped. Update the pages with every feature change.
