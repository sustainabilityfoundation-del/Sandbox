# AGENTS.md: @ews/tool-sysml-modeler

SysML Modeler tool (ID `sysml-modeler`, entitlement `tool:sysml`). Owner: the SysML agent
(docs/specifications/sysml-program-contracts.md). Architecture: [docs/modules/sysml/ui-architecture.md](../../docs/modules/sysml/ui-architecture.md),
[ai-commands.md](../../docs/modules/sysml/ai-commands.md).

## Rules

- Imports only `@ews/platform-sdk`, `@ews/design-system`, `@ews/sysml-client`, `@ews/sysml-core`
  and React. Never another tool (not even the illustrative `tool-sysml`), `apps/workspace`,
  `@ews/model-service`, React Aria or icon packages.
- Every edit is a typed command sent through `ModelerSession.run` / `revert` (the same commands the
  assistant proposes). No view writes model data any other way.
- Views are projections (`src/projection/*`): computed from the model, never stored. Layout positions
  are view state.
- Design system components and tokens only; light and dark themes; phone, tablet and desktop
  (container queries on `tool`); no essential action depending on hover, right-click or dragging.
- Assistant: reads return data; changes are `ServiceProposal`s built from a dry run with policy
  `reject-new-errors`; every action has an entry in `apps/workspace/src/assistant/capabilities.ts`
  and a help mapping in `src/help.ts`.
- Help: every toolbar item, assistant operation and significant control (`data-help-id`) is mapped in
  `src/help.ts`; update `help/*.md` in the same change as the feature.
- Requirements text is read from `RequirementsService`; the model stores only the UUID and revision
  (`EWS::ManagedRequirement`).

## Run

Harness: `npm run sysml:dev` (port 5200; local mode by default, `?mode=api&user=eli` for the API on
API_PORT, default 8800). Tests: `npx vitest run packages/tool-sysml-modeler`.
