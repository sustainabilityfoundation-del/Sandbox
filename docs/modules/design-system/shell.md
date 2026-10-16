# Application shell and layout

Status: implemented (Focused Canvas phase 3 and 4). Owner: ui-ux-design-system agent. Code:
`apps/workspace/src/App.tsx` (layout), `apps/workspace/src/shell/**`. User help:
`apps/workspace/help/platform/layout.md` (`platform.layout`).

## 1. Layout

```
┌──────────────────────────────── header (48 px, dark slate) ────────────────────────────────┐
│ brand · project · configuration · scenario · baselines · modules · search · ⌘K · 🔔 · …    │
├──────┬──────────┬─┬──────────────────────────────────┬─┬───────────┬─┬────────────────────┤
│ rail │ explorer │▏│ location trail · panel toggles    │▏│ inspector │▏│ AI Assistant        │
│ 84/52│ (resize) │▏│ contextual toolbar (36 px)        │▏│ (resize)  │▏│ (right dock,        │
│ px   │          │▏│ engineering canvas (.ws-work)     │▏│           │▏│  resize, collapse)  │
│      │          │▏├──────────────────────────────────┤▏│           │▏│                     │
│      │          │▏│ bottom panel: Activity ·          │▏│           │▏│                     │
│      │          │▏│ Validation · (assistant if docked)│▏│           │▏│                     │
├──────┴──────────┴─┴──────────────────────────────────┴─┴───────────┴─┴────────────────────┤
│ status bar (26 px): save · configuration · revision · validation · background · module · selection │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

`.ws-body` is one CSS grid with eight explicit columns (rail, explorer, gutter, canvas, gutter, inspector, gutter,
assistant); hidden panels get zero width and are `inert`, so their state survives. Gutters are 4 px `ResizeHandle`s
in the working-panel colour (`--ws-bg`), keyboard operable.

| Mode (`useViewportMode`, by available space) | Layout |
| --- | --- |
| desktop (≥ 1100 px) | All columns; assistant right or bottom; rail labels from 1440 px |
| tablet | Rail (icons) and canvas; explorer and inspector are drawers; assistant in the bottom panel |
| phone | Canvas; explorer, inspector, Activity and the assistant from the bottom navigation (sheets and drawers) |

## 2. Components

| Area | Component | File |
| --- | --- | --- |
| Header | `Header` (brand, `ContextFields`, `BaselinesMenu`, `ModuleNav`, `GlobalSearch`, palette, `Notifications`, `SubscriptionMenu`, `ServicesMenu`, `WindowsMenu`, `DisplaySettings`, `SettingsButton`, `HelpMenu`, `Account`); `.ws-shell-scope` | `shell/Header.tsx` |
| Navigation rail | `NavigationRail` (`RailItem`), explorer toggle, modules from the registry, assistant, layout menu | `shell/Rail.tsx` |
| Explorer frame | `SidePanel` + `PanelHeader` + `ExplorerFilter`; `ProductTree` (filter, virtualized above 400 objects) or `ProjectExplorer` | `shell/ShellParts.tsx`, `shell/ProductTree.tsx`, `projects/ProjectExplorer.tsx` |
| Canvas container | `PaneArea` (location bar: `ContextBreadcrumbs`, `PanelToggles`, split view), `ToolToolbar`, `ToolViewHost` (`.ws-tool-host`, the `tool` container) | `shell/PaneArea.tsx`, `shell/ToolToolbar.tsx`, `shell/WorkArea.tsx` |
| Inspector frame | `Inspector` | `shell/Inspector.tsx` |
| Assistant | `AssistantDockPanel` (right) or the bottom panel's tab; presentation in `shell/assistant/**`, logic in `assistant/**` | `shell/ShellParts.tsx`, `shell/BottomDock.tsx` |
| Bottom panel | `BottomDock` (Activity, Validation, assistant) | `shell/BottomDock.tsx`, `shell/ValidationPanel.tsx` |
| Status bar | `StatusBar`, `SaveStatus` | `shell/StatusBar.tsx` |
| Layout state | `Layout` in `platform/store.ts`; presets and docking helpers | `shell/layout/presets.ts`, `shell/layout/viewport.ts` |

## 3. Layout preferences, presets and persistence

`Layout` (per layout class: `spacious` for desktop, `compact` for drawers) holds `treeOpen`, `inspectorOpen`,
`activityOpen`, `dockTab` (`activity`, `validation`, `assistant`), `dockHeight`, `treeWidth`, `inspectorWidth`,
`split`, and the additive Focused Canvas fields `assistantDock` (`right` or `bottom`), `assistantOpen`,
`assistantWidth`, `railExpanded` and `canvasMaximized`. It is persisted with the window session
(`platform/session.ts`); older sessions merge with the defaults. Sizes are clamped to the viewport
(`clampLayout`). Engineering data is never part of it.

Presets (`PRESETS` in `shell/layout/presets.ts`) are partial layouts: Engineering (default), AI-assisted, Review.
`currentPreset(layout)` recognises them; otherwise the layout is custom. Helpers: `applyPreset`, `showAssistant`
(idempotent: opens the assistant wherever it is docked), `dockAssistant`, `showDockTab`, `restoreDefaultLayout`.
Entry points: rail layout menu, Display and layout, command palette, tab-bar toggles.

## 4. Extension points for modules

- **Navigation:** a tool registered with `registerTool` (and allowed by the subscription) appears in the rail, the
  header module navigation, the command palette and the Help menu (there are no document tabs; see section 6), with its semantic icon and
  name. Platform modules without a view (`registerPlatformModule`) contribute assistant operations, help and
  settings. No shell edits.
- **Canvas:** the tool's `view` renders inside `.ws-tool-host` (`container: tool / inline-size`); it chooses its own
  rendering technology (SVG, canvas, WebGL, DOM). The canvas background is `--ws-canvas-bg`; `.ws-canvas-surface`
  gives the dot grid if a tool wants it.
- **Toolbar:** tools return `ToolbarItem[]`; the shell renders them at 28 px in a 36 px row, keeps primary items
  visible, moves the rest into "More actions", shows tooltips with titles and sets `data-help-id` from the help
  manifest. Group related items with separators.
- **Inspector, Activity, Validation and status bar** read the shared model, outputs and context; modules feed them
  through the SDK (writes, artifacts), not through UI code.

## 5. Rules for the shell

- No tool-specific branches; everything comes from the registry, the SDK and the shared context.
- Keep committed browser-flow hooks stable (`docs/specifications/ui-focused-canvas-progress.md` §1.3) and keep help
  IDs when markup changes.
- Every icon button has a label (tooltip) and, when it has one, its shortcut.

## 6. Owner decisions

**16 October 2026: one set of tool tabs.** The owner said: "The user interface has duplication of tabs on the left of
the screen and the top of the workspace. have the UI agent Remove the top of the workspace tabs and have the ones on
the left."

- The two sets were the navigation rail's module entries (left; one per registered tool, active one highlighted, lock
  and Demo markers) and the tab strip above the canvas (open tools, lock and Demo markers, an "Open tools" menu with
  Close per tool, and an add button that opened the palette). Both switched the active tool.
- The top strip is removed. The rail is the only way to switch tools (`[data-rail-tool]`, `aria-current="page"`).
  The bar above the canvas remains as a location bar: breadcrumbs, split view button and panel toggles.
- Moved, not lost: closing a tool is the palette command "Close <tool>" (one per open tool, Ctrl+K); opening is the rail or
  the palette; locked and Demo states are on the rail entries and in the breadcrumbs. Tools never showed unsaved
  markers on the tabs, so none moved. Tool views that keep their state still stay mounted while hidden.
- Phone has no rail: tools switch through **Tools** (the palette) in the bottom navigation.
- AGENTS.md says a module appears in "navigation, document tabs, the command palette and help"; "document tabs" no longer
  exists and the wording needs changing (the coordinator owns that file).
