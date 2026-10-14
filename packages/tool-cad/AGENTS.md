# AGENTS.md: @ews/tool-cad

CAD tool with **mock geometry**: a parametric side elevation of the actuator assembly. It is not a
CAD kernel. Develop it on its own against the published SDK contract.

## Responsibilities

- Views: canvas with selectable housing, rod and motor; Dimensions panel (edit, apply, save
  representation snapshot); Visibility panel.
- Toolbar: Select, Pan, Zoom in/out, Fit, Dimensions, Visibility.
- Private view state (`CadViewState`): camera, mode, open panel, hidden parts (per view).
- Domain logic (`src/domain.ts`, no React): layout from dimensions, dimension validation, the
  explicit parameter → component property mapping, change builders.
- Assistant contribution (`src/assistant.ts`): `cad.read_representation`, `cad.set_dimension`,
  with the quantity rules for representation dimensions and mapped component properties.

## Explicit mapping (documented, nothing else)

A dimension edit updates the CAD representation and, in the same transaction, the mapped property
of the component it represents: `diameter → diameter`, `outerDiameter → outerDiameter`,
`length → effectiveLength` (or `length`), only if the component has that property
(`PARAMETER_TO_PROPERTY` in `src/domain.ts`). There is no synchronisation with SysML.

## Permitted dependencies

- `@ews/platform-sdk` (incl. `/react`, `/harness`, `/testing`), `@ews/design-system`, React.
- Never: another tool, `apps/workspace`, `@ews/model-service`, storage, React Aria or icon packages
  directly. Relative imports stay inside this package.

## SDK

Built for SDK `^1.0.0`. Entitlement: `tool:cad` (declared, never checked here). Representation
snapshots are saved with `saveArtifact` (kind `cad-representation`, schema version 1, objects
`[component, representation]`, input revisions of both).

## Commands

```bash
npm run dev:cad                 # standalone harness, http://localhost:5183
npm run typecheck -w @ews/tool-cad
npx vitest run packages/tool-cad
npm run check
```

## Design system

`@ews/design-system` components, `AppIcon` semantic names, tokens only (diagram tokens for the
drawing), styles in `src/cad.css` inside `@layer components { … }`. Parts are focusable (Tab,
Enter); every pointer gesture has a button alternative (Zoom, Fit). Always show the
"Mock geometry" tag.

## Model rules

- CAD representations are `cad-representation` objects with a `shape` key and quantity
  parameters; each links to its component with `represents`. Selecting a part selects the
  **component** (shared identity), not the representation.
- Resolve selections with `useResolvedSelection('cad')`; requirements resolve to the
  representations of their allocated components; keep unresolved selections and explain.
- Edits carry base revisions; never write geometry outside `submitChanges`.

## Help and documentation

Owned by this module (root AGENTS.md "Help and documentation", docs/modules/help.md). Write the
CAD user documentation in `help/*.md` (front matter: help_id, title, kind, summary, keywords,
related), export a `HelpManifest` as `help` in the tool definition, map every toolbar item and
assistant action in `contextMappings`, and mark significant controls with `data-help-id`
(`cad.<area>.<item>`). Update the pages with every feature change.

**Not done yet**: CAD ships no help manifest; it is listed in `KNOWN_DOCUMENTATION_GAPS`
(apps/workspace/src/help/help.test.ts). Document the mock-geometry limits explicitly.
