# Capability registry and capability-complete toolbars (CT specification)

Status: **architecture accepted by the coordinator** (16 October 2026, [ADR-0074](../decisions/0074-capability-registry-and-toolbars.md)),
implementing the owner's [capability toolbar directive](../architecture/CAPABILITY_TOOLBARS.md). Designed by the architect agent
(CT-1, read-only). Owner decisions listed in §9 are open and do not block CT-2a.

## 0. Starting point

- `CapabilityEntry` (`id`, `module`, `surface`, `label`, `effect`, `status` = implemented|mock|experimental|restricted, `coverage`,
  `aiOperations`, `toolbarItem`, `apiOperations`, `note`) and `ModuleManifest` live in
  `packages/platform-sdk/src/contract/modules.ts` (SDK 1.12.0); `collect()` gathers them; `mergeCapabilities` adds 30 platform entries.
- `capabilityChecks.ts` (`toolbarProblems`, `operationProblems`, `honestyProblems`) already ties runtime toolbar items, assistant
  operations and Requirements operationIds to entries.
- Runtime toolbar items come from `toolbar(ctx) => ToolbarItem[]` (flat, closures); `ToolToolbar.tsx` renders them with overflow.
- **Loophole to close:** in `services/assistant/src/wire.ts`, an operation under a known module prefix that is not in the catalogue
  is classified `propose` by default and allowed.
- Not the registry: `apps/workspace/src/platform/capabilities.ts` (About-page summary). Out of date: `CoverageDialog.tsx` hard-codes
  its module list. ADR-0049 is Accepted.

## 1. Registry contract (SDK 1.13.0, additive)

All new fields are optional; a module opts into the strict rules with `inventory: 1` when its CT-n step is done. The existing
`status` keeps its meaning (maturity and honesty: a mock is never "implemented"). The **implementation state is computed, never
stored.**

```ts
// contract/capabilities.ts (new) + optional fields on CapabilityEntry / ModuleManifest
export type ImplementationState = 'implemented' | 'partial' | 'planned'
export type TestRef = `${string}.test.${'ts' | 'tsx'}::${string}` // repo path :: substring of an it()/test() title

export interface CommandLayout {              // module → tab → group → command
  tabs: { id: string; label: string; contextual?: Prerequisite; groups: { id: string; label: string; icon?: IconName }[] }[]
}
export interface Placement { tab: string; group: string; order: number; priority?: 'primary' | 'secondary' }

export type Prerequisite =
  | { kind: 'project' } | { kind: 'entitlement'; id?: string }
  | { kind: 'service'; service: keyof PlatformServices } | { kind: 'connection'; to: 'ai-account' | 'api' }
  | { kind: 'selection'; types?: ObjectType[]; min?: number; max?: number }
  | { kind: 'module-state'; id: string; text: string }

export interface CapabilityEntry {            // existing fields unchanged
  placement?: Placement; description?: string; icon?: IconName; behaviour?: string
  contract?: { inputs?: string; outputs?: string; ref?: string }  // OpenAPI operationId, SDK type or docs anchor
  limitations?: string[]                       // non-empty ⇒ partial (when bound)
  prerequisites?: Prerequisite[]; helpId?: HelpId
  requirements?: string[]; backlog?: string[]; verifiedBy?: TestRef[]
  entitlement?: string; alternatives?: string[]
}
export interface ModuleManifest { inventory?: 1; commandLayout?: CommandLayout }

export function implementationState(e: CapabilityEntry): ImplementationState {
  const bound = !!(e.toolbarItem || e.aiOperations?.length || e.apiOperations?.length)
  if (!bound) return 'planned'
  return e.limitations?.length || !e.verifiedBy?.length ? 'partial' : 'implemented'
}
```

Bindings are the existing `toolbarItem`, `aiOperations` and `apiOperations`. Concepts are borrowed (no dependency) from VS Code
contribution points, `@lumino/commands` and Eclipse Theia's command registry; licences to be verified in CT-2a's ADR notes.

## 2. Evidence-based status

Adding a binding and a test reference changes the state automatically; removing the test breaks CI. State stays strictly evidence-based: a bound entry without `verifiedBy` is `partial` everywhere (toolbar, palette, AI listing), and `buildCommandModel` takes the `KNOWN_EVIDENCE_GAPS` IDs as `evidenceGaps` only to word the limitation ("Implemented; test evidence not yet linked"), never to override the state. Checks in
`capabilityChecks.ts`, run by `npm run check`:

| Check | Rule |
| --- | --- |
| `bindingProblems` | toolbar item exists in `toolbar()`; each `aiOperation` exists; each `apiOperation` exists in the owning service's OpenAPI (extend from Requirements to all `services/*`) |
| `evidenceProblems` | each `TestRef` resolves to an existing, non-skipped `it`/`test` whose title contains the substring (`.skip`, `.todo`, `.only` rejected); a bound entry without evidence fails unless in `KNOWN_EVIDENCE_GAPS` (may only shrink; starts with today's ~160 entries) |
| tests pass | CI already fails on failing tests; optional later cross-check through the Vitest JSON reporter |
| `plannedProblems` | planned entry has `description` and at least one `backlog` reference (backlog IDs found in `docs/`) |
| `layoutProblems` | `placement` names an existing tab and group; order unique |
| `helpProblems` | `helpId` resolves; planned entries may use the generated capability topic (§5) |

## 3. Runtime availability (separate from state)

```ts
export interface Availability { available: boolean; reason?: string }
export interface AvailabilityContext { context: SharedContext; selection: EngineeringObject[]; services: PlatformServices
  entitlements: string[]; connections: { aiAccount: boolean; api: boolean }; moduleState?: Record<string, Availability> }
export function availability(e: CapabilityEntry, ctx: AvailabilityContext): Availability
```

The host evaluates generic prerequisites; modules supply `module-state` through the runtime item (`disabled` plus a new optional
`ToolbarItem.unavailableReason`). Planned entries are never "available". The same function feeds toolbar, palette and
`list_capabilities`. Entitlements stay enforced on the server (policy `decide`, Apply gateway); client evaluation is UX only.

## 4. Toolbar component

`ToolbarItem[]` stays the runtime half (handlers, active, busy, value); the registry gives hierarchy and metadata.
`buildCommandModel(manifest, entries, items, availCtx)` in `@ews/platform-sdk/react` produces a neutral model; the design system
renders it with `CommandBar` and `CommandInfoPopover` (it does not import the SDK). Hosts (`ToolToolbar`, the harness) use it.

```ts
type CommandState =
  | { kind: 'ready'; onInvoke: () => void; active?: boolean; busy?: boolean }
  | { kind: 'partial'; onInvoke: () => void; limitation: string }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'planned'; info: { status: string; backlog: string[]; helpId?: string } } // no onInvoke, by type
interface CommandBarCommand { id: string; label: string; icon?: IconName; description: string; shortcut?: string; helpId?: string; state: CommandState }
interface CommandBarProps { ariaLabel: string; tabs: { id: string; label: string; groups: { id: string; label: string; commands: CommandBarCommand[] }[] }[]
  compact?: boolean; onHelp?: (helpId: string) => void }
```

| State | Appearance (Focused Canvas: 28 px quiet buttons, 36 px row, no badges) | Tooltip and press |
| --- | --- | --- |
| Ready | as today | as today |
| Partial | 4 px filled dot (`fg-3`) at the icon's top right | "Partial: {limitation}" |
| Planned | icon and label in `fg-3`, 4 px hollow ring | opens non-modal `CommandInfoPopover` (description, "Planned", backlog, help); invokes nothing |
| Unavailable | standard disabled opacity, no ring | opens a popover with the reason |

Planned and unavailable commands use `aria-disabled` and stay focusable; accessible names announce the state ("Fillet, planned";
"Export STEP, partial: geometry only"; "Save, unavailable: open a document first"); description via `aria-describedby`. Keyboard:
React Aria `Tabs` (arrows), `Toolbar` with labelled `ToolbarGroup`s, Enter/Space invoke or open the popover, Escape returns focus,
F1 opens help. One-tab modules show no tab strip; contextual tabs appear only when their prerequisite holds. Tablet: secondary
commands into a per-group `MenuButton`; phone: tabs as a `Select`, each group one menu, primary commands visible. The existing
dotted "illustrative" marker is not reused for planned commands.

## 5. Search

Command palette: a "{Module} capabilities" section from the registry (active module first, all modules once a query is typed),
state as a muted suffix; choosing a planned item opens the info popover and never runs anything. Help: one generated
"Capabilities" topic per module (by tab and group, with states), indexed by search; planned entries point their `helpId` there,
so `KNOWN_DOCUMENTATION_GAPS` does not grow. Coverage dialog: module list from `collect()`, plus an Implementation column.

## 6. AI access

- Platform read operation `list_capabilities({ module?, query?, state?, limit })` (class `read`), evaluated in the browser over the
  same collected registry; returns id, label, module, state, availability and reason, prerequisites, limitations, implemented
  alternatives, helpId and operations.
- One instruction line: check `list_capabilities` before saying something cannot be done; never claim a planned capability ran;
  offer alternatives.
- Server enforcement: `createPolicy({ strict })` returns a new decision `not-implemented` for operation names missing from the
  merged catalogue (closes the loophole in §0); a CI test that every catalogue name is an `aiOperation` of a bound entry and planned
  entries have none; the ADR-0049 Apply gateway already re-validates against each module's OpenAPI. Proposal-preview policy
  unchanged.
- Planned entries are **not** offered as tool definitions (models call what they are offered; the 200-tool cap; offering implies
  executability; a real-operations-only catalogue keeps the server rule simple).

## 7. Guards

`plannedHandlerProblems` renders each tool's `toolbar()` and fails when a runtime item maps to an entry without evidence (outside
the gap list) or exists without an entry; `CommandState` makes `onInvoke` on a planned command a type error. Every OpenAPI
operationId must map to a bound entry with evidence; a guard test refuses 501 / "not implemented" route stubs; the reviewer
checklist adds "no success message or result without an effect"; `honestyProblems` keeps refusing `implemented` for mock modules
and the AI listing reports `maturity: 'mock'`.

## 8. Sequencing and work split

- **CT-2a** (one implementer; can run beside the manifest steps because it touches new files, `modules.ts` and version files; no
  other branch may bump the SDK meanwhile): `contract/capabilities.ts` (types, `implementationState`, `availability`), optional
  fields in `contract/modules.ts`, SDK 1.13.0 (version, package.json, CHANGELOG, version assertions), `react/commandModel.ts`,
  design-system `CommandBar.tsx` and `CommandInfoPopover` with export and `docs/modules/design-system/components.md`, harness uses
  `CommandBar`.
- **CT-2b** (after M6 and F): `capabilityChecks.ts` and tests, fixture with a planned entry, `ToolToolbar.tsx`,
  `CommandPalette.tsx`, `CoverageDialog.tsx`, `toolSpecs.ts` (`list_capabilities`), `policy.ts` (`strict`, off by default),
  `wire.ts` (instruction line), the generated help topic, and a Requirements pilot layout with handlers unchanged.
- **CT-3 onwards, per module:** (1) research in `docs/research/<module>/capability-research.md` with build-versus-integrate and
  licence columns, which is also the module's open-source assessment (OSS-3); (2) hierarchical inventory (existing IDs kept; new IDs
  `<module>.<group>.<command>`); (3) map existing (placement, helpId, verifiedBy, limitations; leave `KNOWN_EVIDENCE_GAPS`);
  (4) register planned (description, backlog, contract reference; no binding); (5) `commandLayout`, `inventory: 1`, phone, tablet,
  desktop; (6) verify `npm run check`, build, the module's DB suite and e2e `demo-d1`. Data and layout only: no handler or
  operation-name changes.
- **Module order:** Requirements (pilot), Conceptualize, SysML Modeler, CAD Modeler, Project Management (headless: palette, help, AI),
  then the platform shell and visualization.

## 9. Owner decisions and risks

- **How much planned scope to show** (owner): recommendation, tabs and groups inline, all-planned groups collapsed into one menu
  per tab; hiding is not allowed by the directive.
- **Illustrative and mock tools** (`tool-cad`, `tool-sysml`) (owner): recommendation, no target inventories; record their
  retirement path (ADR-0027 and the SysML retirement question).
- **`strict` catalogue default** (coordinator): switch on after CT-2b once Project Management's operations are catalogued
  (changes the default-`propose` rule in the M-step recipe).
- **Test reference granularity** (coordinator): title substrings now; `[cap:<id>]` tags in titles if renames prove brittle.
- Risks: inventories of hundreds of entries (keep them data-only, lazily used); the evidence gap list must actually shrink.
- Not verified by CT-1: the licences of the borrowed-concept projects; whether the Help Service can index generated topics
  without an SDK change; CAD Modeler controls outside `toolbar()`.

## Amendment CT-2c: professional structure (16 October 2026)

Status: **accepted by the coordinator**, implementing the owner's decision that toolbars follow the structure and completeness of
the No Magic interface (main menu, main toolbar, context-sensitive palettes, browser, specification and properties panels) in our
design system (owner: "That's what the toolbars shoul be like"; confirmed "yes please do that"). Designed by the architect agent
from the gap lists in [System Model research §3](../research/sysml/capability-research.md) and
[CAD research §3.9](../research/cad/capability-research.md). SDK 1.14.0, design system 1.3.0, all additive. One registry, one
computed state per entry; planned entries can never be invoked on any surface (ribbon, menu, palette, context set, split child,
shortcut, session).

### Merged gaps and decisions

| # | Gap | Decision |
| --- | --- | --- |
| U1 | Main menu from the registry | Accept: `CommandLayout.menus` references whole ribbon groups (no double declaration); default one menu per tab |
| U2 | Vertical or floating palette with tool groups per context | Accept `palettes`, rendered by the tool through SDK hooks |
| U3 | Context by view type or sub-object selection | Accept prerequisite `{ kind: 'context' }`; tools report context IDs at runtime |
| U4 | Armed tools, toggles, checked items | Accept `mode: 'action' \| 'toggle' \| 'tool'` (a tool stays armed until used or Escape) |
| U5 | Selection toolbar and context menus | Accept one `contextSets` model, rendered floating, as a context menu (right-click, long-press, Shift+F10) and in the Edit menu |
| U6 | Feature-edit strip (OK, Cancel, Preview, numeric fields) | Accept `CommandSession` and a `number` toolbar item; the host refuses a session for a planned entry |
| U7 | Split buttons | Accept `Placement.splitOf` |
| U8 | Exclusive toggle groups | Accept `exclusive` on a group |
| U9 | Shortcuts | Accept `shortcut` on the entry, bound for the active tool; checks refuse duplicates and reserved keys (Ctrl+K, F1, F10) |
| U10 | Panel layout | Accept declarative `panels` hints; docking and perspectives deferred |
| U11 | User customisation | Deferred until after CT-3 for System Model and CAD (needs a per-user override store); keys are capability IDs, so compatible |
| U12 | Collapsing all-planned groups | Resolved by the owner's choice to show the full scope: all-planned tabs stay real tabs; an all-planned group renders as one muted group button with a count ("0 of 6") opening its planned commands; menus always list every entry; collapsing only when width requires. Replaces the §9 recommendation |
| U13 | "n of m available" counts | Accept as a computed group description and menu header |
| U14 | More than about 8 tabs | Accept a width-driven "More tabs" menu |
| U15 | Large ribbon buttons and group launchers | Reject (Focused Canvas: 28 px quiet buttons) |
| U16 | About 77 CAD and the SysML icon names | Accept, staged: about 12 generic family names in design system 1.3.0; fallback `entry.icon` → `group.icon` → `'command'`; `names.ts` split into `names/<domain>.ts` |
| U17 | Quick-access toolbar | Accept `quick` placement (fixed set) |

**Coordinator decision (package ownership exception):** in CT-3 steps a module agent may add its own semantic icon names in
`packages/design-system/src/icons/names/<domain>.ts` and their mappings; the registry test still requires a mapping for every
name. No other design-system edits by module agents.

### Contract sketch (SDK 1.14.0)

```ts
export type Prerequisite = /* existing */ | { kind: 'context'; id: string }
export interface AvailabilityContext { /* existing */ contexts?: string[] }  // 'diagram:general', 'sketch', 'selection:edge'
export type CommandMode = 'action' | 'toggle' | 'tool'
export interface Placement { /* existing */ splitOf?: string }
export type SurfacePlacement =
  | { surface: 'palette'; palette: string; group: string; order: number }
  | { surface: 'context'; set: string; order: number }
  | { surface: 'quick'; order: number }
export interface CapabilityEntry { placements?: SurfacePlacement[]; mode?: CommandMode; shortcut?: string }
export type MenuNode =
  | { kind: 'group'; tab: string; group: string } | { kind: 'palette'; palette: string } | { kind: 'context'; set: string }
  | { kind: 'command'; id: string } | { kind: 'submenu'; label: string; mnemonic?: string; items: MenuNode[] }
  | { kind: 'panels' } | { kind: 'separator' }
export interface MenuDef { id: string; label: string; mnemonic?: string; items: MenuNode[] }
export interface PaletteDef { id: string; label: string; when?: Prerequisite
  groups: { id: string; label: string; icon?: IconName; collapsed?: boolean }[] }
export interface ContextSetDef { id: string; label: string; when: Prerequisite[] }
export interface PanelDef { id: string; role: 'browser' | 'specification' | 'properties' | 'diagnostics' | 'other'
  label: string; side: 'start' | 'end' | 'bottom'; defaultOpen?: boolean; helpId?: HelpId }
export interface CommandLayout { /* tabs; groups gain exclusive?: boolean */ menus?: MenuDef[]; quick?: true
  palettes?: PaletteDef[]; contextSets?: ContextSetDef[]; panels?: PanelDef[] }
// Runtime half
export type ToolbarItem = /* existing */ | { type: 'number'; id: string; label: string; value: number; unit?: string
  min?: number; max?: number; step?: number; onChange: (v: number) => void; disabled?: boolean } // button gains mode?
export interface CommandSession { capabilityId: string; title: string; fields: ToolbarItem[]
  preview?: { on: boolean; onChange: (on: boolean) => void }; onOk: () => void; okUnavailableReason?: string; onCancel: () => void }
export interface ToolRuntime { contexts?: string[]; session?: CommandSession | null
  panels?: Record<string, { open: boolean; toggle: () => void }> }
// ToolDefinition.runtime?(ctx): ToolRuntime; react: useCommandModel(), usePalette(id?), useContextSet(id)
```

Design system 1.3.0 adds `MenuBar`, `QuickBar`, `ToolPalette`, `ContextCommands`, `CommandSessionStrip`, `SplitCommandButton` and
`DockPanel` (promoting the shell's side panel, header, drawer and sheet) over neutral models; `CommandBar` gains mode, split,
exclusive groups, group buttons with counts and tab overflow.

### Shell, keyboard and accessibility

- Desktop: the menu bar sits in the location bar's leading slot (`PaneArea.tsx`), before the breadcrumbs: no new row, no tab strip;
  the rail stays the only tool switcher; menus follow the active tool; a split pane gets one "Menu" button. The quick bar leads the
  CommandBar row. Palettes and context sets render inside the tool (`.ws-tool-host`) through SDK hooks; the shell renders menu bar,
  quick bar, ribbon and session strip. While a session is open the ribbon is replaced by the strip (Enter OK, Escape Cancel; other
  commands unavailable with "Finish or cancel the current edit").
- Tablet: the menu bar collapses to one "Menu" button with submenus. Phone: a full-screen sheet with search first; the palette as
  an "Add" sheet; context sets as a bottom sheet with targets of at least 40 px.
- Keyboard: F10 or a lone Alt tap focuses the menu bar with mnemonic underlines (two-step key tips; Alt+letter is not intercepted);
  Shift+F10 and the ContextMenu key open the context set; Escape disarms an armed tool; shortcuts go through the same state check
  (a planned shortcut opens its explanation).
- Accessibility: WAI-ARIA menubar pattern composed from React Aria `MenuTrigger` and `SubmenuTrigger` (no second behaviour library;
  Radix and Ariakit menubars considered and not adopted); palettes as a vertical `Toolbar` with `aria-pressed` for the armed tool;
  accessible names keep the state wording.

### AI

`list_capabilities` adds `surfaces` (menu path, palette, set, shortcut) and matches menu paths in `query`. Operations, catalogue,
`strict` and proposal preview unchanged; arming and edit sessions are UI only, never operations; planned entries are not tools.

### Work order (replaces the §8 ordering)

F → CT-2b (unchanged, Requirements pilot) → CT-2c → CT-3 System Model and CT-3 CAD (owner focus) → Conceptualize, Project
Management. CT-2c has three steps:

- **CT-2c1** design system 1.3.0: components, icon split, generic icons. Can run beside CT-2b while it owns `CommandBar.tsx`.
- **CT-2c2** SDK 1.14.0: contract, `commandModel` projections with a per-manifest static index, `commandHooks`, harness, checks
  (menu and palette references, shortcuts, `splitOf` cycles, every entry reachable from a menu). **Done** (branch `feature/ct-2c2-sdk`; `packages/platform-sdk/CHANGELOG.md` 1.14.0; checks in `contract/layoutChecks.ts`, run by `capabilityChecks.surfaceProblems`).
- **CT-2c3** shell: menu bar slot, quick bar, session strip, F10 and Alt, shortcuts, panel toggles, palette search by menu path,
  `toolSpecs` surfaces, shell docs, help, e2e.

CT-3 for System Model and CAD each split into (a) data (inventory, layout, menus, palettes, context sets, panels, domain icons) and
(b) runtime (contexts, palette arming, CAD session strip, selection contexts); (b) relaxes "no handler changes" to allow runtime
wiring, with operation names unchanged.

### Risks

Density on small screens (owner walkthrough on a phone needed); about 200 entries per module (static index once per manifest,
per-render state only, lazy menus; a 250-entry model test counts operations, not time); Firefox handling of F10 and the Alt tap
unverified; z-index of floating sets inside tools; menubar library licences not verified (none adopted).
