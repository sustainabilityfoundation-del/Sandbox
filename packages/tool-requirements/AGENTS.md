# AGENTS.md: @ews/tool-requirements

Requirements Management tool. Develop it on its own against the published SDK contract.

## Responsibilities

- Views: requirements table (search, status filter, filter by selected component or its
  representation), detail panel with Edit, Relationships and History tabs.
- Toolbar: Add, Edit, Filter, Allocate, Trace. Commands registered with `useToolCommand`.
- Private view state (`RequirementsViewState`): filters, search, trace columns, open editor.
- Domain logic (`src/domain.ts`, no React): filtering, selection resolution, SysML trace.
- Assistant contribution (`src/assistant.ts`): `requirements.read_for_component`,
  `requirements.update`; editable fields statement, rationale, status; `allocated-to` links.

Not here: subscriptions, navigation, the inspector, persistence, other tools' data views.

## Permitted dependencies

- `@ews/platform-sdk`, `@ews/platform-sdk/react`, `@ews/platform-sdk/harness` (harness only),
  `@ews/platform-sdk/testing` (tests only), `@ews/design-system`, React.
- Never: another tool package, `apps/workspace`, `@ews/model-service`, `localStorage`, React Aria or
  icon packages directly. Relative imports stay inside this package.

## SDK

Built for SDK `^1.0.0` (see `src/index.ts`). Read the model and context with hooks
(`useModel`, `useSelection`, `useSharedContext`, `useActivity`), write with
`useToolApi().submitChanges(...)` (atomic, with base revisions). Entitlement: `tool:requirements`
(declared, never checked here).

## Commands

```bash
npm run dev:requirements        # standalone harness, http://localhost:5181 (from the repo root)
npm run typecheck -w @ews/tool-requirements
npx vitest run packages/tool-requirements
npm run check                   # whole repo, before finishing
```

The harness runs this tool on a mock platform host with the sample actuator twin (its own storage
key; **Reset sample data** restores it). Use the "Select an object" box to simulate selections made
by other tools.

## Design system

Use `@ews/design-system` components and `AppIcon` semantic names; tokens only; styles in
`src/requirements.css` inside `@layer components { … }`, laid out with `@container tool (…)`. Show
`StatusBadge` `unsaved`/`saving` and call `useUnsavedChanges` while editing. Keep the user's input
when a save fails.

## Model rules

- Requirements are `requirement` objects; read them with `readRequirement` (defaults for data
  saved before status and rationale existed). Allocation is `allocated-to` requirement → component.
- A selected SysML element or CAD representation resolves to its component with `componentOf`;
  a SysML requirement usage resolves to the requirement it references.
- Never match by name; never write other tools' entities except through explicit relationships.
