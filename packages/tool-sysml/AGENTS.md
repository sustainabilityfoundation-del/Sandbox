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

## Help and documentation

Owned by this module (root AGENTS.md "Help and documentation", docs/modules/help.md). Write the
SysML Modelling user documentation in `help/*.md` (front matter: help_id, title, kind, summary, keywords,
related), export a `HelpManifest` as `help` in the tool definition, map every toolbar item and
assistant action in `contextMappings`, and mark significant controls with `data-help-id`
(`sysml.<area>.<item>`). Update the pages with every feature change.

**Not done yet**: SysML ships no help manifest; it is listed in `KNOWN_DOCUMENTATION_GAPS`
(apps/workspace/src/help/help.test.ts). Removing it from that list is part of the next SysML sprint.

## Open-source first (mandatory)

Before designing or coding a new engineering capability, search for established open-source implementations. Prefer integration and contribution over recreation. Document the alternatives considered, license implications, integration strategy, and rationale for any custom implementation ([strategy](../../docs/architecture/OPEN_SOURCE_STRATEGY.md), [evaluation template](../../docs/architecture/open-source-evaluation-template.md), root [AGENTS.md](../../AGENTS.md)).
SysML assignment (strategy §10): evaluate existing SysML v2 implementations, modeling frameworks, graph libraries and visualization components; preserve compatibility with the official SysML v2 specifications and published APIs (without claiming compliance, per the root AGENTS.md).
