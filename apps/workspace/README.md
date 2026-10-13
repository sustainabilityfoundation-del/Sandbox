# Engineering Workspace app (`apps/workspace`)

The workspace shell of the engineering platform: navigation, docking, tool discovery,
subscriptions, the shared context, the inspector, Activity, ChatGPT and window management. It
renders the three tool packages (Requirements, SysML, CAD) through the tool registry and has no
tool-specific code.

The package architecture, development commands, subscription demo and how to add a tool are in
the [repository README](../../README.md). Rules for working on this package are in
[AGENTS.md](./AGENTS.md).

> **Prototype scope.** There is no real backend, no authentication and no CAD kernel. The cloud
> repository is simulated in this browser ("Demo repository"), subscriptions are a client-side
> mock, the CAD geometry is a mock drawing and the SysML notation is illustrative.

## Run it

```bash
npm install
npm run dev                 # http://localhost:5173/workspace/
```

To start again from the sample data, open the **Demo repository** menu in the header and choose
**Reset demo data**.

## Demonstration flow

1. Open **CAD** and click the rod. It becomes the shared selection (ROD-120) and the inspector shows
   it with its SysML and CAD representations.
2. Open **Requirements**. The rod is still selected, so the table is filtered to REQ-001, the
   requirement allocated to it. A SysML element or CAD representation selection is resolved to its
   component the same way.
3. Open **SysML**. The rod's part `rod : Rod` (SYS-003) is highlighted through its explicit
   `represents` link, with its connections and satisfy link in the property panel. Choose **Text**
   for the illustrative textual notation.
4. In **Requirements**, double-click REQ-001 and edit the statement. The SysML text view and the
   inspector show the new statement at once: every tool reads the same repository.
5. In **CAD**, choose **Dimensions**, change the rod diameter and **Apply**. The drawing changes,
   ROD-120's diameter changes in the same transaction (explicit mapping), Activity records the edit,
   and the saved snapshot OUT-0001 becomes *Potentially stale*. **Save snapshot** saves a new
   representation artifact against the rod.
6. Open the **subscription** menu in the header (key icon) and choose **Requirements only**. SysML
   and CAD tabs stay but show why they are locked; the palette, search, direct links (`?tool=cad`),
   detached windows and ChatGPT all refuse to open them. The SysML and CAD data stays in the tree and
   inspector. Choose **All tools** to restore access; nothing was lost.
7. Reload the browser. Model changes, artifacts, selection, open tools and each view's private
   state (camera, filters, scroll) are restored.

## Implemented vs illustrative

| Area | Implemented | Illustrative only |
| --- | --- | --- |
| Shell | Header context (project, configuration, scenario, model revision), repository status, subscription menu, global search (`/`), product tree, inspector, bottom dock with Activity and ChatGPT, tool tabs, command palette (`Ctrl/Cmd+K`) with locked tools, split view | — |
| Subscriptions | Three demo plans; every entry point checks them; locked tools explained; data kept; changes reach every window | Client-side only (see the root README) |
| Requirements | Table, search, status filter, filter by selected component (or its representation), Add, Edit (title, statement, rationale, status, methods), Allocate, Trace, relationships and history tabs | — |
| SysML | Diagram of parts, requirement usages, connections and satisfy links; property panel; Add Part, Add Requirement Reference, Connect; illustrative text notation | Subset of SysML; not SysML v2 compliant; no parser |
| CAD | Selectable mock assembly; pan, zoom, fit; per-view visibility; editable demonstration dimensions mapped to component properties; representation snapshots | Mock geometry; no CAD kernel |
| ChatGPT panel | Conversation with a **demo assistant**; tool-contributed actions; previews with Apply, Reject and Undo; conflict refresh; entitlement checks | The assistant is a deterministic mock, not ChatGPT |
| Windows | Tools, inspector and ChatGPT in separate windows; Follow/Pin per view; live updates; subscription changes apply to every window | Placement on another screen uses an experimental browser API |
| Repository | Async API, atomic batches with placeholders for new objects, per-object revisions, conflict detection, artifact validation and schema versions, activity log, non-destructive upgrade of 0.1 data | No real backend or authentication |

Illustrative toolbar controls are shown with a dotted underline.

## How it fits together

```
src/
  platform/      Registry (SDK compatibility), entitlements, store, ToolApi + PlatformHost, sessions
  shell/         Header, panes and tabs, toolbar, command palette, tree, inspector, dock, Activity
  shell/assistant/  ChatGPT panel UI: conversation, change cards, references
  assistant/     Assistant core: service interface, demo service, platform operations, executor, proposals
  session/       Window session: cross-window notifications, detached windows
  showcase/      Development-only component showcase (/workspace/?showcase)
```

- **Shared context** holds the project, configuration, model revision, selection and scenario. It
  is shared by every tool and survives tool switches and reloads. A selection a tool can't show is
  kept; the tool resolves it through explicit relationships or explains why its view is empty.
- **Private view state** (camera, diagram position, filters, scroll, visibility) is stored per view
  instance: the main pane, the split pane and each separate window have their own.
- **Data access** goes only through the repository, via the SDK's ToolApi.
- **Revisions.** Every accepted change creates a new model revision; edits carry the revision they
  were based on and stale edits are rejected.
- **Artifacts are immutable snapshots** with producing tool, objects, configuration, input
  revision, timestamp and artifact schema version. When an input changes they are shown as
  potentially stale, never overwritten. Artifacts from retired tools (Analysis, Verification) are
  kept and shown read-only.

## Replacing the demo repository with a cloud service

1. Implement `EngineeringRepository` (`packages/model-service/src/repository/EngineeringRepository.ts`)
   with calls to your API, for example `submitChanges` → `POST /projects/{id}/changes`.
2. Construct it in `src/main.tsx` in place of `DemoRepository`.

The tools and the SDK don't change. The service should enforce what the demo enforces:
- Atomic change batches, including placeholders for objects created in the batch.
- Revision-based conflict detection.
- Validation of configuration and scenario on saved artifacts.
- Server-side timestamps and IDs.
- An activity or audit log.
- **Entitlement and permission checks on every operation and file access** (see the root README).

`RepositoryError` codes (`unavailable`, `conflict`, `invalid`, `not-found`) are what the UI uses to
show errors.

## ChatGPT panel

The **ChatGPT** tab in the bottom dock is a conversation panel for discussing the engineering
model. It can inspect the model, propose changes and open tools, all through the same
repository interface and validation as the engineering tools. Tools contribute their own
assistant actions; the platform executes and validates them.

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
- **Subscriptions.** Each request offers only the actions of tools in the subscription. A request
  that needs another tool is explained, not attempted. Tool actions are checked again when they run,
  and a preview records the entitlements it needs: if the subscription loses the tool before
  **Apply**, the change is not applied. Tool switches and subscription changes never redirect an
  operation to another tool or context.

Example prompts the demo understands:
1. What requirements apply to the selected component? (Requirements)
2. Set REQ-003 status to approved. / Change the REQ-002 rationale to "…". (Requirements)
3. Change the rod diameter to 28 mm. (CAD: the representation and the mapped ROD-120 property)
4. Add a SysML requirement reference for REQ-003. (SysML: creates an element)
5. Connect the housing to the motor in SysML. (SysML: components resolve to their parts)
6. Open SysML and show the rod. (navigation)
7. Which artifacts are stale?
8. Undo the last model change.

Close variants also work, such as naming a part ("the motor") or another dimension (length).

### Assistant tool interface

The assistant can only request the operations offered with each request. **Platform operations**
(`src/assistant/toolSpecs.ts`) work on the shared twin; **tool actions** come from each tool's
`assistant` contribution and are offered only when the subscription includes the tool. The
application executes everything itself (`executor.ts`):

| Tool | Effect |
| --- | --- |
| `read_object`, `search_objects`, `read_relationships` | Read any object or scenario with properties, revision and relationships; search |
| `read_artifacts` | Saved artifacts in the captured configuration, with provenance, schema version and freshness |
| `propose_changes` | Create a change preview (not applied), validated against the rules of entitled tools |
| `select_objects`, `open_tool` | Change the shared selection, or open a tool (refused outside the subscription) |
| `requirements.read_for_component`, `requirements.update` | Requirements tool: read requirements for a component; propose statement, rationale or status edits |
| `sysml.read_model`, `sysml.create_part`, `sysml.add_requirement_reference`, `sysml.connect` | SysML tool: read the model; propose new parts, requirement usages, connections and satisfy links |
| `cad.read_representation`, `cad.set_dimension` | CAD tool: read a representation; propose a dimension change (with the mapped component property) |

Tool actions only read the model or return a proposal. A proposal goes through the same platform
validation as `propose_changes` and is applied only by the user.

**Allowlist.** Each tool contributes the fields, relationship types and object types the assistant
may change for it; `editableFields.ts` merges the rules of the tools the subscription includes:
- Requirements: statement, rationale and status; `allocated-to` links.
- SysML: new parts and requirement usages; `represents`, `references`, `connects` and
  `satisfies` links; part types.
- CAD: representation dimensions (mm) and the mapped component properties.

Values are checked for type, unit (with simple conversions such as m → mm) and range. Anything
else is rejected. Created objects get their IDs from the repository when the user applies the
preview; undoing a creation is not supported in this prototype (the card explains).

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
- Validate every requested operation in application code. The executor enforces the offered
  operations, the subscription, argument types, the editable-field and relationship allowlists, units and ranges. The
  repository enforces revisions and the backend enforces permissions. The assistant cannot apply a
  change; only the user's Apply does.
- When the repository becomes a cloud API, authorisation is checked server-side for every call,
  whether a tool or the assistant initiated it.
- Keep the assistant provider separate from the model service. `AssistantService` only produces
  text and tool requests; `EngineeringRepository` stays the only path to engineering data.

## Design system

The whole platform (shell, every tool and the ChatGPT panel) uses one component library,
`packages/design-system`, with a restrained Material Design 3 look:

- **Behaviour** comes from [React Aria Components](https://react-spectrum.adobe.com/react-aria/):
  keyboard navigation, focus management, overlays, collections, and mouse, touch and pen input.
- **Appearance** comes from Tailwind CSS utilities and component classes that read semantic design
  tokens (CSS variables). The look is neutral tonal surfaces, one restrained accent and subtle
  elevation.
- **Icons** are [Phosphor](https://phosphoricons.com/) icons behind semantic names (`AppIcon`,
  `packages/design-system/src/icons`). Only the registered icons are bundled.

No other component library or icon set is used; `packages/design-system/src/theme/designSystem.test.ts` checks this.

### Design tokens

Tokens live in `packages/design-system/src/theme/tokens.css`. Change values there; components never hard-code
them.

| Group | Tokens (prefix `--ws-`) | Tailwind utilities |
| --- | --- | --- |
| Surfaces | `bg`, `surface`, `surface-2` … `surface-4`, `inverse-surface` | `bg-canvas`, `bg-surface`, `bg-surface-2` …, `bg-inverse` |
| Text | `text`, `text-2`, `text-3`, `on-accent`, `inverse-text` | `text-fg`, `text-fg-2`, `text-fg-3`, `text-on-accent`, `text-on-inverse` |
| Accent and selection | `accent`, `accent-strong`, `accent-soft`, `accent-border`, `selected`, `selected-text`, `focus` | `bg-accent`, `bg-selected`, `text-selected-fg`, `outline-focus` |
| Borders | `border`, `border-strong` | `border-line`, `border-line-strong` |
| State layers | `state-hover`, `state-pressed` | `bg-hover`, `bg-pressed` |
| Status | `success`, `warning`, `danger`, `info` (each with `-soft`, `-border`, `-surface`) | `text-success`, `bg-warning-soft`, `text-error`, `border-error-line`, … |
| Diagrams | `diagram-*`, `chart-*`, `viewport-*` | used in tool CSS |
| Type | `font-sans`, `mono`, `font-size`, `font-size-sm`, `font-size-xs`, `font-title`, `font-headline`, `weight-*` | `text-ui`, `text-ui-sm`, `text-ui-xs`, `text-title`, `text-headline` |
| Spacing | `space-1` … `space-6` (4 px grid) | Tailwind spacing |
| Shape | `radius-xs` 4, `radius-sm` 6, `radius` 8, `radius-lg` 12, `radius-xl` 20, `radius-full` | `rounded-field`, `rounded-card`, `rounded-sheet`, `rounded-control` |
| Elevation | `shadow-sm`, `shadow`, `shadow-lg` | `shadow-1`, `shadow-2`, `shadow-3` |
| Density | `control-h`, `control-h-sm`, `row-h`, `header-h`, `touch-target` | `h-ctl`, `h-ctl-sm`, `min-h-touch` |
| Motion | `motion-short` 100 ms, `motion-medium` 200 ms, `motion-long` 300 ms, `ease-standard`, `ease-emphasized-*` | `ease-standard`, `duration-[var(--ws-motion-short)]` |

Tailwind's default palette is removed, so only these semantic colours exist (a class such as
`bg-red-500` does not compile to anything).

- **Theme.** *System*, *Light* or *Dark*, chosen in the header's **Display and layout** popover
  (palette icon) or the command palette. The resolved theme is set as `<html data-theme>`.
- **Density.** *Comfortable* (default) or *Compact* changes control heights, row heights and type
  size (`<html data-density>`).
- **Touch.** On a coarse pointer every control grows to a 44 px target, whatever the density.
- **Motion.** Overlays fade and scale, drawers and sheets slide, using the motion tokens. With
  `prefers-reduced-motion` the durations collapse to 1 ms and nothing waits on an animation.
- Preferences are stored in the browser (`ews.preferences.v1`) and applied to every open workspace
  window, including detached ones.
- `packages/design-system/src/theme/designSystem.test.ts` checks text contrast (WCAG AA, 4.5:1) for the key token pairs in both
  themes.

### Components

Import from `@ews/design-system`. Engineering helpers (`ObjectRef`, status badges, `MockTag`) are in
`@ews/platform-sdk/react`.

| Need | Component |
| --- | --- |
| Actions | `Button` (variants `filled`, `tonal`, `outlined`, `text`, `quiet`, `danger`; `isPending`), `IconButton` (needs `label`; shows it as a tooltip), `ToggleButton`, `ToggleIconButton`, `SegmentedControl` |
| Commands and values | `MenuButton` + `MenuItem` / `MenuSection` / `MenuSeparator` / `SubmenuTrigger` for commands; `Select` for picking a value; `ComboBox` for searching a long list |
| Overlays | `PopoverButton`, `Dialog` (modal, full screen on phones), `Drawer` (side panels on tablets and phones), `Sheet` (phone bottom sheet that stays above the keyboard), `Tooltip` |
| Forms | `TextField` (single or multi-line, `unit`, `description`, `errorMessage`), `SearchField`, `Checkbox`, `CheckboxGroup` |
| Collections | `Tabs` / `TabList` / `Tab` / `TabPanel`, `Toolbar`, `Table` with `cards` (rows become labelled cards in narrow containers) |
| Status | `StatusBadge`, `Badge`, `Notice`, `Spinner`, `LoadingState`, `EmptyState`, `useToasts` + `Toaster` |
| Layout | `Panel`, `ResizeHandle` (React Aria has no equivalents) |
| Icons | `AppIcon name="requirements"` (`filled` for selected states, `label` when it conveys meaning on its own). Add a name to `icons/names.ts` and map it in `icons/registry.tsx`. |
| Engineering helpers (`@ews/platform-sdk/react`) | `ObjectRef`, `RefChip`, `RequirementStatusBadge`, `FreshnessBadge`, `ReviewBadge`, `MockTag` |

Interaction rules the components already follow:

- Every control works with mouse, keyboard, touch and pen. Nothing essential depends on hover,
  right-click or dragging.
- Menus, selects, comboboxes and popovers support the arrow keys, close with Escape, return focus
  to their trigger and stay inside the viewport. Modals (dialogs, drawers, sheets and the command
  palette) contain focus.
- Focus is always visible (`data-focus-visible`). Disabled, selected, hovered, pressed and pending
  states each have their own style.
- An icon-only button always has an accessible name and a tooltip. Important or unfamiliar actions
  show a text label.
- Keyboard shortcuts are scoped (`src/platform/shortcuts.ts`). Single-key shortcuts never fire while you type
  in a field, ChatGPT or a combobox, or while a dialog is open. `Ctrl/Cmd+K` always opens the
  command palette.

### Status indicators

`StatusBadge` gives each model state its own words and icon, so states stay distinct and never rely
on colour alone:

| Concern | States |
| --- | --- |
| Editing | Unsaved changes · Saving… · Saved · Save failed |
| Long-running work | Running · Failed · Interrupted |
| Artifacts | Inputs unchanged · Potentially stale |
| Compliance (does the design meet the requirement?) | Compliant · Non-compliant · Not assessed |
| Review (has a person approved the result?) | Draft · In review · Approved · Rejected |

Errors are shown next to what failed, say what to do next (often with a **Try again** action), and
keep what the user typed.

### Workspace controls

- **Command palette.** Open it with the **Commands** button in the header (or **Tools** in the tab
  bar and the phone navigation bar), or press `Ctrl/Cmd+K`. It lists favourites, recent tools and
  every registered tool by category, read from the tool registry; tools outside the subscription
  are listed locked with the reason. It also lists the active tool's toolbar actions and the
  commands its view registered (`useToolCommand`), workspace commands, the demo subscription plans
  and a demo command that simulates a tool rendering failure.
- **Toolbars.** Each tool contributes toolbar items; the workspace renders them. Primary actions
  stay visible. Other actions move into a **More actions** menu, in their original order, when the
  toolbar is too narrow (for example in split view). Below 520 px, buttons show icons only, and the
  label remains the accessible name and tooltip.
- **Tool switching** keeps the selection, configuration, scenario, the conversation and each view's
  private state.

### Styling a tool

The rules for tool packages are in [packages/tool-requirements/AGENTS.md](../../packages/tool-requirements/AGENTS.md)
(the same for every tool) and are enforced by
`packages/design-system/src/theme/designSystem.test.ts` for every `packages/tool-*` package: shared
components and `AppIcon` only, design tokens only, no inline styles, styles in
`@layer components { … }`, container queries against the `tool` container, toolbar priorities,
and `StatusBadge` for unsaved and saving states.

### Component showcase

With `npm run dev`, open http://localhost:5173/workspace/?showcase. It shows every component in
light and dark themes and both densities, with all control states, menus, overlays, forms, status
indicators and a responsive table. The showcase is only available in development builds.

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
  Enter to reset), or pick *Narrow / Medium / Wide* presets in **Display and layout**.
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
  - CAD: tap or Tab + Enter to select, drag to pan, pinch or scroll to zoom, with **Zoom in/out**
    and **Fit** buttons as alternatives. Only the drawing captures touch gestures.
  - SysML: elements are selected by tap or Tab + Enter; connections are made in a dialog, never by
    dragging.
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
