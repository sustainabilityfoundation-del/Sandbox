# Engineering Platform (prototype)

A modular engineering workspace built around one **shared digital twin**, with three tools that
are developed as independent packages:

| Tool | Package | What it does |
| --- | --- | --- |
| Requirements Management | `@ews/tool-requirements` | Requirements table, search and filters; statements, rationale, status and allocation to components; relationships and history |
| SysML Modeling | `@ews/tool-sysml` | A small editable diagram of parts, requirement usages, connections and satisfy links, with an illustrative text notation |
| CAD | `@ews/tool-cad` | A selectable mock actuator assembly with pan, zoom, fit, visibility and a few editable demonstration dimensions |

All three work on the same actuator example (ACT-100 with housing HSG-110, rod ROD-120 and motor
MTR-130), through the same repository and stable IDs. The repository also contains the standalone
GLB model viewer (`apps/glb-viewer`) from earlier work.

> **Prototype.** The repository is simulated in the browser, subscriptions are a client-side
> mock, the CAD geometry is a mock drawing (no CAD kernel) and the SysML notation is illustrative
> (not SysML v2 compliant, no parser). See [What is mocked](#what-works-and-what-is-mocked).

## Quick start

```bash
npm install
npm run dev            # workspace: http://localhost:5173/workspace/
```

On Windows PowerShell, use `npm.cmd run dev` if script execution is disabled.

| Command | Purpose |
| --- | --- |
| `npm run dev` | The workspace with all tools (port 5173) |
| `npm run dev:requirements` | Requirements in its standalone harness (port 5181) |
| `npm run dev:sysml` | SysML in its standalone harness (port 5182) |
| `npm run dev:cad` | CAD in its standalone harness (port 5183) |
| `npm run dev:viewer` | The standalone GLB viewer (port 5174) |
| `npm run typecheck` | Type-check every package (`tsc` per workspace) |
| `npm test` | All unit, contract and boundary tests (Vitest) |
| `npm run check` | Type check and tests |
| `npm run build` | Type check, then build the GLB viewer into `dist/` and the workspace into `dist/workspace/` |
| `npm run build:harnesses` | Build each tool's standalone harness (`packages/tool-*/dist-harness`) |
| `npm run preview` | Serve `dist/` (workspace at http://localhost:4173/workspace/) |

## Package architecture

An npm workspaces monorepo. Packages are TypeScript source packages consumed directly by Vite and
TypeScript, so there is no extra build framework; each declares versioned dependencies so it can
later be published and versioned on its own.

```
apps/
  workspace/           @ews/workspace      Shell: navigation, docking, tool discovery, subscriptions,
                                           shared context, inspector, Activity, ChatGPT, windows
  glb-viewer/          @ews/glb-viewer     Standalone GLB viewer (unchanged, not a workspace tool)
packages/
  model-service/       @ews/model-service  Shared twin: typed entities, relationships, artifacts,
                                           repository contract + demo repository (no React)
  design-system/       @ews/design-system  React Aria components, Tailwind tokens, themes,
                                           Phosphor icon registry (AppIcon)
  platform-sdk/        @ews/platform-sdk   Versioned tool contract + SDK; React hooks; standalone
                                           harness with a mock host
  tool-requirements/   @ews/tool-requirements
  tool-sysml/          @ews/tool-sysml
  tool-cad/            @ews/tool-cad
```

Permitted dependencies (enforced by `packages/platform-sdk/src/boundaries.test.ts`):

```
tool-*  ──►  platform-sdk  ──►  model-service
   │              │
   └──────►  design-system  ◄───┘
workspace ──► all of the above (a tool only through its public entry point)
```

- A tool never imports another tool, the workspace, the repository or the model service directly.
  Shared contracts belong in `platform-sdk`; the domain model is re-exported from it.
- `@ews/platform-sdk` (the contract) and `@ews/model-service` are framework-free;
  `@ews/platform-sdk/react` holds the hooks and the tool definition, `@ews/platform-sdk/harness` the
  standalone harness, `@ews/platform-sdk/testing` fixtures for unit tests.
- The workspace renders tools through the registry; there are no tool-specific branches in the
  shell (also checked by the boundary test).

Each package has its own `AGENTS.md` describing its responsibilities, rules and commands; the root
[AGENTS.md](./AGENTS.md) describes ownership and how contract changes are made.

## The tool contract

A tool package exports one definition (`defineTool` from `@ews/platform-sdk/react`):

| Field | Meaning |
| --- | --- |
| `id`, `name`, `description`, `category`, `icon` | Stable ID (persistence, routing, artifact provenance), display data, semantic icon name |
| `version`, `sdkVersion` | The tool's own semver, and the SDK range it was built for (`'^1.0.0'`); the registry refuses incompatible tools |
| `entitlement` | Required subscription entitlement, e.g. `'tool:cad'` |
| `supportedObjectTypes` | Object types the tool can show; other selections are kept and explained |
| `view` | Lazy-loaded React view |
| `toolbar` | Toolbar contribution (buttons, toggles, selects), also listed as commands |
| `initialViewState` | Private state of each new view instance |
| `assistant` | Assistant actions and the fields, relationships and objects they may change |

Through the SDK (`ToolApi` and hooks) a tool can read the shared context; read and select model
objects; query relationships and saved artifacts; submit validated model changes; save artifacts
with provenance; add activity entries; register commands; manage private view-instance state; and
ask the platform to open another tool. The SDK is version 1.0.0; contract changes follow
[packages/platform-sdk/CHANGELOG.md](./packages/platform-sdk/CHANGELOG.md).

## Shared digital twin

| Entity | Type | Notes |
| --- | --- | --- |
| Physical components | `assembly`, `part` | The identity every representation points at |
| Requirements | `requirement` | Statement, rationale, status (draft / in review / approved / obsolete), verification methods |
| SysML elements | `sysml-element` | Parts (definitions and usages) and requirement usages |
| CAD representations | `cad-representation` | Mock shape plus demonstration dimensions |
| Relationships | `allocated-to`, `represents`, `references`, `connects`, `satisfies` | Explicit, typed links |
| Saved artifacts | `OutputRecord` | Producing tool, objects, configuration, input revision, timestamp, artifact schema version |

- A component may have a SysML representation and a CAD representation; both point at it with
  `represents`, so they never become duplicate components. Tools resolve a selection to "their"
  representation through these relationships (`resolveRepresentation`); when none exists the
  selection is kept and the view explains why.
- Project, configuration, revision, selection and scenario are shared and survive tool switches.
  Camera, diagram position, filters, scroll and visibility are private to each view instance.
- **Mapping between tools is explicit and limited.** A CAD dimension edit also updates the mapped
  component property (diameter → diameter, length → effectiveLength or length, outerDiameter →
  outerDiameter) in the same transaction. There is **no** automatic CAD-to-SysML synchronisation.
- **Existing data is kept.** Data saved by version 0.1 is copied to a new storage key and only
  extended: SysML and CAD representations are added for existing components as one new revision
  and recorded in Activity. Nothing is modified or deleted; the old key stays untouched. Objects
  and artifacts from the retired Analysis and Verification tools remain in the tree and inspector
  (read-only).

## Subscription demo

Open the key icon in the header (or **Demo subscription** in the command palette) and choose:

| Plan | Tools |
| --- | --- |
| Requirements only | Requirements |
| Requirements and SysML | Requirements, SysML |
| All tools | Requirements, SysML, CAD |

Tools outside the plan are shown locked, with the reason, in the tabs, the command palette and
search. They can't be opened through navigation, commands, ChatGPT, detached windows or direct
routes (`/workspace/?tool=cad`). Losing access never deletes data: the tool's objects stay in the
product tree and inspector, open tabs and windows show an explanation, and everything is editable
again when the plan includes the tool. Plan changes reach every open window immediately.

> **Security.** These checks run in the browser and only shape the user interface. In production
> every backend operation and file access must check the caller's entitlements and permissions on
> the server, including operations requested by the assistant. Tools declare their entitlement;
> the subscription logic stays in the platform.

## Adding a fourth tool

Example: a *Mass budget* tool.

1. **Create the package** `packages/tool-mass/` by copying a tool package's `package.json`,
   `tsconfig.json`, `vite.config.ts` and `harness/`, then rename it to `@ews/tool-mass` with its own
   harness port.
2. **Define the tool** in `src/index.ts`:

   ```ts
   import { defineTool } from '@ews/platform-sdk/react'
   import { lazy } from 'react'
   import pkg from '../package.json'

   export interface MassViewState { showParts: boolean }

   export const massTool = defineTool<MassViewState>({
     id: 'mass', // stable: persistence, routing, artifact provenance
     name: 'Mass budget',
     description: 'Sums component masses for the selected assembly.',
     category: 'Design',
     icon: 'component', // a semantic name from @ews/design-system/icon-names
     version: pkg.version,
     sdkVersion: '^1.0.0',
     entitlement: 'tool:mass',
     supportedObjectTypes: ['assembly', 'part'],
     view: lazy(() => import('./MassView')),
     initialViewState: { showParts: true },
     toolbar: ({ api, viewState }) => [
       { type: 'button', id: 'parts', label: 'Parts', icon: 'tree', priority: 'primary', active: viewState.showParts,
         onClick: () => api.updateViewState((vs) => ({ ...vs, showParts: !vs.showParts })) },
     ],
   })
   ```

3. **Write the view** with SDK hooks and design-system components only:

   ```tsx
   import { Panel } from '@ews/design-system'
   import { formatValue, isComponent, isQuantity } from '@ews/platform-sdk'
   import { useModel, useSelection, useToolViewState } from '@ews/platform-sdk/react'
   import type { MassViewState } from './index'

   export default function MassView() {
     const model = useModel()
     const { selectedObjects } = useSelection()
     const [viewState] = useToolViewState<MassViewState>()
     const root = selectedObjects.find(isComponent) ?? model.get('ACT-100')
     const parts = root ? model.childrenOf(root.id) : []
     const total = parts.reduce((sum, p) => sum + (isQuantity(p.properties.mass) ? p.properties.mass.value : 0), 0)
     return (
       <div className="p-3">
         <Panel title={`${root?.name}: ${total.toFixed(2)} kg`}>
           {viewState.showParts && parts.map((p) => <div key={p.id}>{p.id} {p.name}: {formatValue(p.properties.mass)}</div>)}
         </Panel>
       </div>
     )
   }
   ```

4. **Run it on its own**: add `"dev:mass": "npm run dev -w @ews/tool-mass"` to the root scripts and
   `npm install`, then `npm run dev:mass`. The harness provides a mock host with the sample twin.
5. **Register it in the workspace**: add `"@ews/tool-mass": "^1.0.0"` to
   `apps/workspace/package.json`, `registerTool(massTool)` in `apps/workspace/src/platform/tools.ts`,
   and add the entitlement to the plans in `apps/workspace/src/platform/entitlements.ts`.
6. **Optionally contribute assistant actions** (`assistant: { actions, editableFields, … }`), named
   `mass.<action>`. The platform offers them only to subscribed users and validates every change.
7. **Check**: `npm run check`. The design-system and boundary tests pick up the new package
   automatically (`packages/tool-*`); add it to the boundary test's allow-list.

## Tests and checks

- **Model service**: revisions and conflicts, atomic batches with placeholders, artifact schema
  versions, the non-destructive upgrade of 0.1 data, representation resolution.
- **Platform**: catalogue (no Analysis or Verification), SDK compatibility, entitlement checks on
  every entry point, data kept when access is lost, shared context across tool switches, private
  view state, artifact provenance.
- **Assistant**: tool actions across the three tools, captured context, undo, actions offered only
  for subscribed tools, apply refused after access is lost, validation.
- **Tools**: domain logic of each tool, against the SDK's sample model.
- **Contracts**: design-system rules for every tool package (shared components, tokens, one icon
  set via the registry) and package boundaries.

## What works and what is mocked

Works end to end in the browser: the three tools on one twin; shared selection and context with
explicit representation resolution; requirement editing that every tool sees; SysML element
creation and linking; CAD dimension edits recorded in Activity and persisted; representation
artifacts with provenance and staleness; subscription gating on every entry point and across
windows; contained tool failures (palette › *Simulate a rendering failure*); ChatGPT previews with
validation, entitlement checks and undo; each tool in its standalone harness; light/dark themes,
densities and phone/tablet/desktop layouts.

Mocked: the repository (browser storage, simulated latency), subscriptions (client-side plans),
the assistant (scripted demo, not ChatGPT), CAD geometry (a parametric drawing), SysML (a small
subset with generated, illustrative notation).

## Before independent production deployment

These boundaries would need to change:

- **Repository and entitlements move server-side.** A backend API implements
  `EngineeringRepository` and enforces authentication, entitlements, permissions, validation,
  revisions and the audit log on every call and file access. Client gating stays for UX only.
- **Assistant actions execute on the server.** Today tool actions run in the browser; in production
  the backend validates and executes them with the same rules, holds the model provider's key and
  never trusts client-side checks.
- **Tool distribution.** Tools are built into the workspace bundle. Shipping them separately needs
  published, versioned packages (the contract already carries versions) and later a loading
  mechanism (remote modules or separately deployed bundles) with integrity checks; tool code would
  then run with the same trust as the shell unless sandboxed.
- **Contract hardening.** The SDK types are the contract; a production SDK needs a published
  changelog, deprecation policy and runtime validation of tool manifests and assistant-action
  arguments (JSON Schema validation instead of the basic checks here).
- **Mappings between tools** (CAD ↔ component, SysML ↔ component) need owned, server-side rules and
  conflict handling once tools are developed and deployed by different teams.
- **Data migrations** become versioned server-side migrations instead of the browser upgrade.

## Standalone GLB viewer

`apps/glb-viewer` is the browser GLB viewer for SolidWorks exports built earlier (see its
[README](./apps/glb-viewer/README.md)). `npm run build` still produces it at the site root and the
workspace under `/workspace/`, so the AWS Amplify configuration (`amplify.yml`) is unchanged.
