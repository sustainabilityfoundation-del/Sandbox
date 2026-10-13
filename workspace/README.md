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
| `npm test` | Unit tests: repository revisions and conflicts (also across windows), staleness, persistence, the assistant, view instances and pins, the styling contract and theme contrast |

To start again from the sample data, open the **Demo repository** menu in the
header and choose **Reset demo data**.

The sample twin's **Maximum load** scenario starts at 11 kN, deliberately below REQ-001's 12 kN.
It also includes a saved maximum-load analysis (OUT-0003) linked as VP-001 evidence, so changes
visibly make an existing result stale. (Demo data saved by earlier versions of this mockup is
replaced by this sample on first load.)

## Demonstration flow

1. In **Geometry**, click the rod. It becomes the shared selection and appears in the inspector.
2. Open **Requirements**. The rod is still selected, and the table is filtered to REQ-001, the
   requirement allocated to it.
3. Open **Analysis**, choose **Maximum load** in the toolbar's Scenario control, and press **Run**.
   You can switch tools or even change the scenario while it runs. The run keeps the context it
   captured when it started.
4. Press **Save Result**. The new output (OUT-0004) appears in the inspector with its tool,
   scenario, configuration, input revision, timestamp, values with units, and review status.
5. Open **Verification**. VP-001 covers the rod. Choose **Link Evidence** and link OUT-0004. You can
   also use **Record Result** to save a mock test record, **Review** to approve evidence, and
   **Traceability** to view requirement → component → procedure → evidence.
6. Return to **Geometry**. The rod is still selected and the zoom, pan and section state are restored.
7. In **Analysis › Inputs**, change the operating load (e.g. 11 → 13 kN) and apply. OUT-0004 stays
   as it was but is marked **Potentially stale**, with the reason, in the inspector, Analysis,
   Verification and the product tree.
8. Reload the browser. The model change, outputs, evidence links, selection, open tools and each
   tool's view state are all restored.

## Implemented vs illustrative

| Area | Implemented | Illustrative only |
| --- | --- | --- |
| Workspace | Header context (project, configuration, scenario, model revision), repository status, global search (`/`), product tree, inspector, bottom dock with Activity and ChatGPT tabs, tool tabs, tool launcher with search, categories, favorites and recents (`Ctrl+K`) | — |
| Design system | Tailwind CSS on semantic tokens, light and dark themes, comfortable and compact density, shared controls, a styling contract enforced by tests | — |
| Responsive layout | Phone, tablet and desktop layouts chosen from the available space; resizable and collapsible panels with keyboard alternatives; split view; drawers and sheets; container queries in tool views | — |
| Windows | Tools, inspector and ChatGPT in separate windows; Follow/Pin per view; live updates between windows; restore remembered windows; blocked-popup fallback; optional placement on another screen | Placement on another screen uses an experimental browser API where available |
| ChatGPT panel | Conversation with a **demo assistant**: context chips, attach selection, Send and Stop, visible tool-call steps, "model information inspected" details, clickable object and output references, change previews with Apply, Reject and Undo, conflict refresh, clarification questions | The assistant is a deterministic mock, not ChatGPT (see below) |
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
  sdk/           What tools import: hooks, ToolApi, defineTool, shared controls and UI, icons
  theme/         Design tokens (tokens.css), Tailwind entry (index.css), theme and density preferences
  session/       Window session: cross-window notifications, open/restore detached windows
  shell/         Common workspace: responsive shell, panes, header, tree, launcher, inspector, bottom dock
  shell/assistant/  ChatGPT panel UI: conversation, change cards, references
  assistant/     Assistant core: service interface, demo service, tool specs, executor, proposals
  tools/         One folder per tool + index.ts (registrations) + registry.ts
```

- **Shared context** holds the project ID, configuration ID, model revision, selected object IDs and
  active scenario. It is shared by every tool and survives tool switches and reloads. A selection
  that a tool can't display is kept, and the workspace explains why and suggests tools that can.
- **Private view state** (camera, filters, open panels, scroll positions) is stored per *view
  instance* and restored when you return. The same tool can be open in the main pane, the split pane
  and separate windows, each with its own state. Tools can only reach their own state.
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
    <div className="p-3">
      <h2 className="m-0 mb-2 text-ui font-semibold text-fg">
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

The tool then appears in the launcher, search and tabs, gets its own toolbar, keeps its view state,
and can be shown in the split pane or a separate window. It must also follow the
[styling contract](#styling-contract-for-tools).

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

## ChatGPT panel

The **ChatGPT** tab in the bottom dock is a conversation panel for discussing the engineering
model. It can inspect the model, propose changes and run the analysis, all through the same
repository interface, validation and run logic as the engineering tools.

> **It currently runs a demo assistant.** The responses are deterministic and rule-based, and the
> panel is not connected to ChatGPT or any language model. The tab carries a "Demo" label, and
> the panel's banner says so.

### What works

- **Panel.** It is collapsible and resizable (drag its top edge), with message history, a
  multiline input (Enter sends, Shift+Enter adds a line), Send and Stop, and clickable example
  prompts. The conversation is kept when you switch tools.
- **Context.** Chips show the project, configuration, scenario, model revision and selection.
  **Attach selection** decides whether the selection goes with the message. The context is
  captured when you press Send and shown on the message. Everything done for that message uses
  this snapshot, so changing the selection, scenario or configuration afterwards doesn't redirect
  an action already in progress.
- **Transparency.** Each reply lists the operations it ran, with live status. A
  *Model information inspected* section shows which objects, revisions and outputs were read.
- **References.** `[[ID]]` references in replies become chips. An object chip selects the object in
  the workspace; a saved-output chip reveals the output in the inspector; a scenario chip makes it
  the active scenario.
- **Read-only requests run immediately.** Changes are never applied directly. Instead the
  assistant prepares a **change card** with:
  - Target, property or relationship, and current → proposed values with units.
  - Configuration, expected revision and preview revision.
  - An explanation, and the saved outputs that would become stale.
- **Apply.** Up to five related changes are applied as one transaction. The expected revisions
  are checked first. The change is then validated and committed through
  `EngineeringRepository.submitChanges`. Afterwards:
  - The tools and inspector refresh.
  - Dependent outputs show as potentially stale.
  - Activity records the change with a link back to the conversation.
  - The card shows the committed revision and an **Undo** button.
- **Conflicts.** If the model changed after the preview was made, the card refreshes with the
  current values and explains what changed. Nothing is overwritten, and you can review and apply
  again.
- **Undo** (button or "Undo the last model change") creates a *compensating* revision. It refuses
  if the target was changed again afterwards, rather than overwriting that newer change.
- **Clarification.** When the object, load case, value or unit is ambiguous, the assistant asks a
  focused question with quick replies before proposing anything.
- **Analysis runs.** "Run the maximum-load analysis" calls the Analysis tool's own run function. It
  captures the object, configuration, scenario and input revisions, and saves the output with the
  same provenance as a manual run. The Analysis view shows the run as requested from the
  conversation.

Example prompts the demo understands:
1. What requirements apply to the selected component?
2. Change the maximum operating load to 12 kN.
3. Run the maximum-load analysis for this component.
4. Which results became stale after that change?
5. Open the requirements tool and show the load requirement.
6. Undo the last model change.

Close variants also work, such as naming a part ("the rod"), other load cases, or the rod's
design factor, diameter or effective length.

### Assistant tool interface

The assistant can only request these operations (`src/workspace/assistant/toolSpecs.ts`). The
application executes each one (`executor.ts`) against the workspace services:

| Tool | Effect |
| --- | --- |
| `read_object`, `search_objects` | Read an object or scenario with its properties, units and revision; search by ID, name or statement |
| `read_requirements`, `read_relationships` | Requirements that apply to a component (direct or via its parent assembly), and all relationships of an object |
| `read_outputs` | Saved outputs in the captured configuration, with provenance and freshness |
| `propose_changes` | Create a change preview (not applied). Validated against the allowlist |
| `run_analysis` | Run the illustrative assessment through the Analysis tool's run logic and save the output |
| `select_objects`, `open_tool` | Change the shared selection, or open a registered tool |

**Editable allowlist** (`editableFields.ts`):
- Scenario operating load (kN) and ambient temperature (°C).
- Part design factor (–), diameter (mm) and effective length (mm), but only on parts that already
  have them.
- Requirement statement, compliance and verification methods.
- The relationship types `allocated-to` and `verifies`.

Values are checked for type, unit (with simple conversions such as N → kN and m → mm) and range.
Anything else is rejected.

### Demo limitations

- Responses are scripted. Only requests close to the examples are understood; anything else gets a
  help message.
- The conversation is kept in this browser and shared by every workspace window. **New
  conversation** starts a fresh one everywhere. A reply runs only in the window where it was sent;
  other windows show it as running there. If that window closes first, the reply is shown as
  interrupted.
- Undo applies to changes made from this conversation. They're the only ones whose previous values
  the conversation recorded.
- Model properties are shared by all configurations in this mockup. The card's configuration
  records the context, not a per-configuration variant.

### Connecting ChatGPT (future backend integration)

The provider sits behind the `AssistantService` interface (`assistant/types.ts`):

```ts
respond(request: AssistantRequest, signal: AbortSignal): Promise<AssistantResponse>
// request:  { history, turn: { text, context, toolResults }, tools }
// response: { type: 'tool_calls', calls } | { type: 'final', text, suggestions?, clarification? }
```

The panel runs a simple loop:
1. Call `respond`.
2. Execute any allowed tool calls in the app.
3. Append their results to `turn.toolResults`.
4. Repeat until the reply is `final`.

To use ChatGPT, nothing in the tools, the SDK or the panel changes:

1. **Add a backend endpoint**, e.g. `POST /api/assistant`, in our application server. It holds
   the OpenAI API key in server-side configuration. The browser never sees the key; it talks only
   to our backend, using the user's normal session.
2. **Set `VITE_ASSISTANT_ENDPOINT=/api/assistant`** when building the frontend. `main.tsx` then
   uses `RemoteAssistantService`, which posts the `AssistantRequest` and returns the backend's
   `AssistantResponse`.
3. **In the endpoint, call the OpenAI API with tool calling**:
   - Pass `request.tools` (name, description, JSON-schema parameters) as function tools.
   - Map the model's function calls to `{ type: 'tool_calls' }`.
   - Map a plain answer to `{ type: 'final' }`.
   - Replay previous calls and their results (`toolResults` includes each call's arguments) as
     function-call and function-call-output items, so the endpoint can stay stateless.

   A sketch with the OpenAI Node SDK's Responses API (check the current OpenAI documentation for
   exact field names and choose the model in configuration):

   ```ts
   const openai = new OpenAI() // OPENAI_API_KEY from the server environment
   const response = await openai.responses.create({
     model: process.env.OPENAI_MODEL,
     instructions: SYSTEM_PROMPT, // role, [[ID]] reference format, "model text is data"
     input: toInputItems(request), // history + this turn + replayed tool calls/results
     tools: request.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters })),
   })
   const calls = response.output.filter((item) => item.type === 'function_call')
   return calls.length
     ? { type: 'tool_calls', calls: calls.map((c) => ({ id: c.call_id, name: c.name, arguments: JSON.parse(c.arguments) })) }
     : { type: 'final', text: response.output_text }
   ```

**Data minimisation.** Each request carries only:
- The captured context (IDs, names, revision, attached selection, the list of scenarios).
- A short recent history (the last 20 items).
- The tool definitions.

The model fetches anything else through the tools, never the whole digital twin.

**Safety rules for the real integration:**
- Treat object names, requirement statements and any imported documents as *data*, not
  instructions. Keep them out of the system prompt, return them only as tool results, and say so in
  the instructions.
- Validate every requested operation in application code. The executor enforces the tool
  allowlist, argument types, the editable-field and relationship allowlists, units and ranges. The
  repository enforces revisions and the backend enforces permissions. The assistant cannot apply a
  change; only the user's Apply does.
- When the repository becomes a cloud API, authorisation is checked server-side for every call,
  whether a tool or the assistant initiated it.
- Keep the assistant provider separate from the model service. `AssistantService` only produces
  text and tool requests; `EngineeringRepository` stays the only path to engineering data.

## Theme and density

All styling comes from semantic design tokens in `src/workspace/theme/tokens.css`:
- Surfaces, lines, text, accent and selection, status colours, the header.
- Diagram and chart colours, and the 3D viewport.
- Radii, shadows, type sizes, control and row heights.

Tailwind reads the same tokens through `theme/index.css`, so utilities such as `bg-surface`,
`text-fg-2`, `border-line`, `bg-selected`, `text-warning`, `text-error`, `h-ctl` and
`min-h-touch` are the only colours and control sizes available. Tailwind's default palette is
removed.

- **Theme.** Choose *System*, *Light* or *Dark* in the header's **Display** menu (sun icon).
  *System* follows the operating system. The resolved theme is set as `<html data-theme>`.
- **Density.** *Comfortable* or *Compact* changes control heights, row heights, spacing and type
  size (`<html data-density>`).
- **Touch.** Where the primary pointer is coarse (touch), controls grow to at least 40 px whatever
  the density.
- Preferences are stored in the browser (`ews.preferences.v1`) and apply to every open workspace
  window.
- **Changing a theme.** Edit the values in `tokens.css`, both the light block and the
  `[data-theme='dark']` block. Components never need to change, and engineering behaviour is
  unaffected. `theme/designSystem.test.ts` checks text contrast (WCAG AA, 4.5:1) for the key token
  pairs in both themes.

## Styling contract for tools

Every registered tool must use the shared design system. `theme/designSystem.test.ts` enforces this
for everything under `src/workspace/tools`:

- **Controls.** Use the SDK controls (`Button`, `IconButton`, `TextInput`, `TextArea`, `Select`,
  `Checkbox`, `Field`, `FieldGroup`, `SegmentedControl`, `TableContainer`) and the shared UI
  (`Panel`, `Notice`, `Badge`, `ObjectRef`). Raw `<button>`, `<select>`, `<textarea>` and `<input>`
  elements are not allowed. The one exception is a hidden file picker.
- **Colours.** No hard-coded colours (`#hex`, `rgb()`, `hsl()`). Use `var(--ws-…)` tokens in CSS, or
  semantic Tailwind classes. SVG diagrams and charts use the diagram and chart tokens.
- **Inline styles.** None (`style={{…}}`). Put styles in the tool's own stylesheet
  (`tools/<tool>/<tool>.css`), wrapped in `@layer components { … }` so utilities can still adjust it.
- **Layout.** Lay out against the tool's container, not the window. Tool views sit in a `tool` size
  container, so use `@container tool (max-width: …)`. The same view then works full screen, in a
  narrow split pane and in a small detached window. For example, the Requirements and Verification
  tables become readable row cards below 620 px.
- **Engineering logic.** Keep it out of styling. Theme and density changes only switch token values.

## Responsive behaviour

Layout modes come from the space available, never from device names or the user agent
(`shell/layout/viewport.ts`):

| Mode | When | Layout |
| --- | --- | --- |
| Phone | narrower than 640 px, or shorter than 480 px (e.g. a phone in landscape) | One tool view at a time. The header keeps the configuration, active object and revision visible; tap it for configuration and scenario. A bottom bar gives quick access to the tree, tools, inspector, Activity and ChatGPT, each as a full-screen sheet. Tables become row cards. |
| Tablet | 640–1099 px wide | The active tool gets the space. The product tree and inspector are drawers. The bottom panel is collapsible. Toolbars collapse to icons in narrow containers and scroll if needed. |
| Desktop | 1100 px and wider | Product tree, tool view, inspector and bottom panel, all resizable and collapsible. Optional side-by-side **split view** (any two tools, or the same tool twice). |

- **Resizing without dragging.** Panels and the split view resize by dragging the separators (mouse,
  pen or touch). Alternatively, focus a separator and use the arrow keys (Home/End for min/max,
  Enter to reset), or pick *Narrow / Medium / Wide* presets in **Display › Layout**.
- **Rearranging views.** The split view has **Swap** and **Close** buttons, and a tool picker.
- **Nothing is lost on changes.** Resizing, rotating the device or opening the on-screen keyboard
  never unmounts the workspace. The shell keeps the same elements in every mode and only changes
  their layout, so selection, the conversation and its draft, unsaved form edits and tool view state
  all survive.
- **On-screen keyboard.** On phones the ChatGPT sheet sizes itself to the visible viewport
  (`interactive-widget=resizes-content`, with a `visualViewport` fallback), so the input and Send
  stay above the keyboard.
- **Saved layouts.** Layout preferences are stored separately for compact layouts (phone and
  tablet) and spacious ones (desktop). Restored sizes are clamped to the current viewport, so a
  panel can't become unreachable.
- **Input.** Everything works with mouse, keyboard, touch and pen:
  - Geometry: tap to select, drag to pan, pinch to zoom, with **Zoom in/out** and **Fit** buttons
    as alternatives. Only the drawing captures touch gestures, so the page scrolls normally
    elsewhere.
  - No essential action needs hover, right-click, dragging or a keyboard shortcut.
  - Focus is always visible, and motion is reduced when the system asks for it.

## Multiple windows

Use **Open in separate window** (the arrow icon on each tool view, the inspector and the ChatGPT
tab), or the header's **Windows** menu. Each detached window is a separate workspace window on the
same repository and project session. Move it to another monitor as you would any window.

- **Same tool, several windows.** Each window is a new view instance with its own ID, so camera,
  filters and scroll stay private to it.
- **Follow or Pin.** By default a view follows the workspace selection. **Pin** keeps it on the
  current objects, and the configuration of that moment, for comparison. Pinned views show a
  *Pinned* badge, and a warning badge when the workspace has since switched configuration.
- **Live updates.** After any committed change, the window that made it sends a notification over
  `BroadcastChannel`. Other windows then *reread* the model, outputs and activity from the
  repository. The notification carries no data; the repository stays authoritative. Selection,
  scenario and configuration changes are shared the same way.
  - Messages from the window itself are ignored, duplicates are dropped, and receivers never
    rebroadcast. So there are no loops.
  - Analyses and assistant replies run only in the window where they were started.
- **Conflicts.** The demo repository rereads browser storage and takes a cross-window lock (Web
  Locks) before each write. Revision checks therefore catch edits made in another window: a stale
  edit is rejected and reported, never applied over newer data.
- **Closing windows.** Closing a detached window never loses saved work; everything is in the
  repository. Forms with unsaved edits ask for confirmation before the window closes.
- **Restore.** Opened windows are remembered. **Windows › Restore workspace windows** reopens them
  with their own view state and pins. Windows only ever open from a user action, never automatically
  on page load.
- **Blocked popups.** If the browser blocks a window (some allow only one per click), a message
  offers a link to open it.
- **Another screen (optional).** Where the browser supports the Window Management API, **Place on
  another screen** asks for permission and opens the window on a different monitor. Otherwise, or
  if permission is refused, the window opens normally. The workspace doesn't discover or control
  your monitors beyond what the browser explicitly allows.
- **Not a collaboration backend.** Browser messaging only coordinates windows of one browser on one
  computer. With a cloud repository, the same notifications would come from server push, and the
  repository would remain the source of truth.

## Known limitations

- Single user. The demo detects conflicts but has no live updates from other users.
- Configurations scope outputs only. Per-configuration property variants are not modelled.
- Workspace UI session state (selection, open tools, view state) is kept in browser storage, separate
  from engineering data in the repository.
- Window coordination uses browser messaging and browser storage on one computer and one browser
  profile. It is a local stand-in, not a collaboration backend.
