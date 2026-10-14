# AGENTS.md: @ews/tool-sysml

SysML Modeling tool: a small, editable diagram. Develop it on its own against the published SDK
contract.

## Responsibilities

- Views: diagram (part definitions with nested part usages, requirement usages, connections,
  satisfy links), property panel, illustrative text notation, dialogs for Add Part, Add Requirement
  Reference (existing or new requirement) and Connect.
- Requirements integration (`src/requirements.tsx`): place an existing requirement, create one
  through `services.requirements.create`, show and edit its canonical text through
  `services.requirements.get`/`update`, open it in Requirements. See
  [requirements-sysml-mapping.md](../../docs/specifications/requirements-sysml-mapping.md) §3.
- Toolbar: Select, Add Part, Add Requirement Reference, Connect, Fit, Text.
- Private view state (`SysmlViewState`): diagram position (pan/zoom), text panel, open dialog.
- Domain logic (`src/domain.ts`, no React): diagram model, layout, connection rules, change
  builders, text notation.
- Assistant contribution (`src/assistant.ts`): `sysml.read_model`, `sysml.create_part`,
  `sysml.add_requirement_reference`, `sysml.connect`, with the object and relationship rules.

## Supported constructs (keep this honest)

Supported: part (definition), part usage nested once, requirement usage referencing a shared
requirement, connection between parts, satisfy (part → requirement usage), `represents` link to a
physical component. Not supported: ports, interfaces, items, attributes, actions, states,
constraints, packages, imports, multiplicities. The text view is generated and read-only; it is
**illustrative** and not a SysML v2 parser. Never claim SysML v2 compliance.

## Permitted dependencies

- `@ews/platform-sdk` (incl. `/react`, `/harness` for the harness, `/testing` for tests),
  `@ews/design-system`, React.
- Never: another tool, `apps/workspace`, `@ews/model-service`, storage, React Aria or icon packages
  directly. Relative imports stay inside this package.

## SDK

Built for SDK `^1.3.0` (`RequirementsService` with `projectId` in write options). Entitlement:
`tool:sysml` (declared, never checked here). Twin writes go through `submitChanges`; new elements
use placeholders (`ref: '$part'`) so the element and its links are one atomic batch.

Requirement text belongs to the Requirements service. Use only `usePlatformServices().requirements`
(never `@ews/requirements-client`), show keys with `displayId`, and never store a title or
statement on a `sysml-element`. When the service is missing, explain it and show no copy.
A requirement created through the service appears in the model only after the platform projection
refreshes: wait with `waitForObject` before linking to it, and reuse the idempotency key on retry.
The standalone harness has no Requirements service, so test create and edit in the workspace.

## Commands

```bash
npm run dev:sysml               # standalone harness, http://localhost:5182
npm run typecheck -w @ews/tool-sysml
npx vitest run packages/tool-sysml
npm run check
```

## Design system

`@ews/design-system` components, `AppIcon` semantic names, tokens only, styles in `src/sysml.css`
inside `@layer components { … }`. Diagram elements are focusable (Tab, Enter); connecting uses a
dialog, never dragging. Dialogs keep the user's input when a write fails.

## Model rules

- SysML elements are `sysml-element` objects (`kind`: `part` | `requirement`); nesting uses
  `parentId` to a part definition.
- A part that stands for a physical component links to it with `represents`; never create a
  component. One SysML element per component (the UI and actions refuse a second).
- Resolve selections with `useResolvedSelection('sysml')`; keep unresolved selections and explain.
- No synchronisation with CAD. Only explicit relationships connect the tools.
