# Engineering Workspace (interface mockup)

A working interface mockup of a multidisciplinary engineering workspace built
around a **shared digital twin**. Every tool works on the same engineering
objects, identified by stable IDs, and saves its outputs against them. Switching
tools changes the view but keeps the engineering context.

> **Mockup scope.** There is no real backend, no authentication, and no real
> solver. The cloud repository is simulated by an asynchronous service that
> stores its data in this browser. It is labelled "Demo repository" in the UI.
> The structural calculation is an illustrative Euler-buckling check, labelled
> "Demo calculation".

## Run it

```bash
npm install
npm run dev                 # open http://localhost:5173/workspace/
```

| Command | Purpose |
| --- | --- |
| `npm run build` | Type-check and build both pages into `dist/` (workspace at `dist/workspace/`) |
| `npm run preview` | Serve the build at http://localhost:4173/workspace/ |
| `npm test` | Unit tests, including repository revisions, conflicts, staleness and persistence |

To start again from the sample data, open the **Demo repository** menu in the
header and choose **Reset demo data**.

## Demonstration flow

1. In **Geometry**, click the rod. It becomes the shared selection and appears in the inspector.
2. Open **Requirements**. The rod is still selected, and the table is filtered to REQ-001, the
   requirement allocated to it.
3. Open **Analysis**, choose **Maximum load** in the toolbar's Scenario control, and press **Run**.
   You can switch tools or even change the scenario while it runs. The run keeps the context it
   captured when it started.
4. Press **Save Result**. The new output (OUT-0003) appears in the inspector with its tool,
   scenario, configuration, input revision, timestamp, values with units, and review status.
5. Open **Verification**. VP-001 covers the rod. Choose **Link Evidence** and link OUT-0003. You can
   also use **Record Result** to save a mock test record, **Review** to approve evidence, and
   **Traceability** to view requirement → component → procedure → evidence.
6. Return to **Geometry**. The rod is still selected and the zoom, pan and section state are restored.
7. In **Analysis › Inputs**, change the operating load (e.g. 12 → 13 kN) and apply. OUT-0003 stays
   as it was but is marked **Potentially stale**, with the reason, in the inspector, Analysis,
   Verification and the product tree.
8. Reload the browser. The model change, outputs, evidence links, selection, open tools and each
   tool's view state are all restored.

## Implemented vs illustrative

| Area | Implemented | Illustrative only |
| --- | --- | --- |
| Workspace | Header context (project, configuration, scenario, model revision), repository status, global search (`/`), collapsible product tree, inspector and activity panel, tool tabs, tool launcher with search, categories, favorites and recents (`Ctrl+K`) | — |
| Geometry | Select (Shift-click to add), Pan (drag), wheel zoom, Fit, labels, outline of components linked to a selected requirement or procedure | **Section** (draws a cut line only), **Measure** (shows model property values, not measured geometry) |
| Requirements | Table, Add, Edit (title, statement, methods, compliance, allocation), Filter by selected component, status filter, Link (allocation editor), Trace columns | — |
| Analysis | Scenario (shared), Inputs (operating load is editable), Run (async, captures context), Compare, Save Result | The calculation itself is a demo |
| Verification | Procedure list filtered by selection, Record Result (mock test record), Link and Unlink Evidence, Review (submit, approve, reject), Traceability, separate statuses for analysis completion, test result, requirement compliance and review approval | **Add Procedure** |
| 3D Model Viewer | The standalone GLB viewer as a tool: open or drop a GLB, standard views, wireframe, grid, node tree. Nodes named with object IDs (e.g. `ROD-120 Rod`) sync selection both ways with the twin | Loaded GLB files stay in memory and are not saved to the repository |
| Repository | Async API, latency, atomic change batches, per-object revisions, stale-edit conflicts, output validation, activity log, browser persistence, simulated outage (in the repository menu) | No real backend or authentication |

Illustrative toolbar controls are shown with a dotted underline.

## How it fits together

```
src/workspace/
  domain/        Types, model index, units, output freshness (no React)
  repository/    EngineeringRepository interface, DemoRepository, sample digital twin
  sdk/           What tools import: hooks, ToolApi, defineTool, shared UI, icons
  shell/         Common workspace: header, tree, tabs, launcher, toolbar host, inspector, activity
  tools/         One folder per tool + index.ts (registrations) + registry.ts
```

- **Shared context** holds the project ID, configuration ID, model revision, selected object IDs and
  active scenario. It is shared by every tool and survives tool switches and reloads. A selection
  that a tool can't display is kept, and the workspace explains why and suggests tools that can.
- **Private view state** (camera, filters, open panels, scroll positions) is stored per tool ID and
  restored when you return. Tools can only reach their own state.
- **Data access** goes only through the `EngineeringRepository` interface. Tools use the SDK and never
  touch browser storage or another tool's state.
- **Revisions.** Every accepted change creates a new model revision. Each object and scenario records
  the revision at which it last changed. Edits carry the revision they were based on, and the
  repository rejects stale edits with a conflict.
- **Outputs are immutable snapshots.** Each records its output ID, producing tool, linked object IDs,
  configuration, scenario, input model revision, the revisions of the inputs it used, timestamp,
  result values with units, and review status. When any recorded input changes, the output is shown
  as *potentially stale*; it is never overwritten or relabelled as current.
- **Context isolation.** The repository rejects outputs for unknown configurations or scenarios.
  Views show outputs for the active configuration only and label each with its scenario. An
  analysis run captures its configuration, scenario, object and input revisions when it starts,
  so its result is saved under that context even if you switch tools or scenarios before it ends.

## Adding a tool

A new tool needs **its own module and one registration line**. The workspace has no tool-specific
code. For example, a mass budget tool:

```ts
// src/workspace/tools/mass-budget/index.ts
import { lazy } from 'react'
import { Icons, defineTool } from '../../sdk'

export interface MassBudgetViewState {
  showParts: boolean
}

export const massBudgetTool = defineTool<MassBudgetViewState>({
  id: 'mass-budget', // stable: used for persistence and output provenance
  name: 'Mass Budget',
  description: 'Sums component masses for the selected assembly.',
  icon: Icons.analysis,
  category: 'Analysis',
  supportedObjectTypes: ['assembly', 'part'],
  view: lazy(() => import('./MassBudgetView')), // loaded on first use
  initialViewState: { showParts: true },
  toolbar: ({ api, viewState }) => [
    {
      type: 'button',
      id: 'parts',
      label: 'Show parts',
      active: viewState.showParts,
      onClick: () => api.updateViewState((vs) => ({ ...vs, showParts: !vs.showParts })),
    },
  ],
})
```

```tsx
// src/workspace/tools/mass-budget/MassBudgetView.tsx
import { formatValue, isQuantity, useModel, useSelection, useToolViewState } from '../../sdk'
import type { MassBudgetViewState } from './index'

export default function MassBudgetView() {
  const model = useModel()
  const { selectedObjects } = useSelection()
  const [viewState] = useToolViewState<MassBudgetViewState>()
  const root = selectedObjects.find((o) => o.type === 'assembly') ?? model.get('ACT-100')
  const parts = root ? model.childrenOf(root.id) : []
  const total = parts.reduce((sum, p) => sum + (isQuantity(p.properties.mass) ? p.properties.mass.value : 0), 0)

  return (
    <div style={{ padding: 12 }}>
      <h2>
        {root?.name}: {total.toFixed(2)} kg
      </h2>
      {viewState.showParts && (
        <ul>
          {parts.map((p) => (
            <li key={p.id}>
              {p.id} {p.name}: {formatValue(p.properties.mass)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

```ts
// src/workspace/tools/index.ts
import { massBudgetTool } from './mass-budget'
registerTool(massBudgetTool)
```

The tool then appears in the launcher, search and tabs, gets its own toolbar, and keeps its view
state.

SDK summary (`src/workspace/sdk`):

| Need | Hook / API |
| --- | --- |
| Read or change selection | `useSelection()`, `api.select(ids)` |
| Shared context | `useSharedContext()`, `api.getContext()`, `api.setScenario(id)` |
| Model objects and relationships | `useModel()` (`get`, `childrenOf`, `linked`, `linkedObjects`, `scenario`, …) |
| Submit model changes | `api.submitChanges(changes, summary)` |
| Save and retrieve outputs | `api.saveOutput(...)`, `useOutputs(filter)` (includes freshness), `api.setReviewStatus(...)` |
| Private view state | `useToolViewState()`, `api.updateViewState(...)`, `useRestoredScroll(key)` |
| Activity messages | `api.log(message, { kind, objectIds })` |

`useToolApi()` returns the same API inside a view. It is also passed to the toolbar contribution.
It is safe to use from asynchronous work that outlives the view.

Tools that are expensive to rebuild can set `keepMounted: true`. The view then stays mounted
(hidden) after first use, as the 3D Model Viewer does.

## Replacing the demo repository with a cloud service

1. Implement `EngineeringRepository` (`src/workspace/repository/EngineeringRepository.ts`) with
   calls to your API, for example `submitChanges` → `POST /projects/{id}/changes`.
2. Construct it in `src/workspace/main.tsx` in place of `DemoRepository`.

The tool views and the SDK don't change. The service should enforce what the demo enforces:
- Atomic change batches.
- Revision-based conflict detection.
- Validation of configuration and scenario on saved outputs.
- Server-side timestamps and IDs.
- An activity or audit log.

Authentication and authorisation would be added in the repository implementation and the API.
`RepositoryError` codes (`unavailable`, `conflict`, `invalid`, `not-found`) are what the UI uses to
show errors.

## Known limitations

- Single user. The demo detects conflicts but has no live updates from other users.
- Configurations scope outputs only. Per-configuration property variants are not modelled.
- Workspace UI session state (selection, open tools, view state) is kept in browser storage, separate
  from engineering data in the repository.
- Designed for desktop screens (minimum width 1024 px).
