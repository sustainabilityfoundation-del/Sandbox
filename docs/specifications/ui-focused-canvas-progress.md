# Focused Canvas UI: progress

Brief: [ui-focused-canvas.md](ui-focused-canvas.md). Contracts: [ui-focused-canvas-contracts.md](ui-focused-canvas-contracts.md).
Maintained by the ui-ux-design-system agent (worktree `Sandbox-ui`, branch `feature/ui-focused-canvas`, from `main` 314f79f).

- [x] Phase 1 audit, regression checklist and plan (this file)
- [x] Phase 2 design system (design-system 1.1.0)
- [ ] Phase 3 application shell
- [ ] Phase 4 engineering workspace
- [ ] Phase 5 AI assistant panel
- [ ] Phase 6 validation and screenshots

## 1. Audit (16 October 2026, baseline 314f79f)

### 1.1 Frontend architecture

| Layer | Where | Notes |
| --- | --- | --- |
| Design system | `packages/design-system` | React Aria Components for behaviour, Tailwind v4 utilities generated from semantic tokens (`theme/index.css` `@theme inline`, default palette removed), component CSS in `@layer components`. Components: Button, IconButton, ToggleButton, ToggleIconButton, SegmentedControl, Tooltip, Tabs, Toolbar, Table, TextField, SearchField, Select, ComboBox, Checkbox, Panel, ResizeHandle, Toaster, Dialog, Drawer, Sheet, Menu, MenuButton, PopoverButton, Badge, StatusBadge, Notice, EmptyState, LoadingState, Spinner. No package `AGENTS.md`; rules live in root `AGENTS.md` and are enforced by `theme/designSystem.test.ts` |
| Tokens | `theme/tokens.css` | Material 3 direction: light grey app bar (`--ws-header-bg #f0f2f7`), slate-blue accent `#3d5c8f`, pill-shaped controls (`--ws-radius-full`), Roboto Flex declared but not bundled (system fallback). Light and dark themes, comfortable and compact densities (`<html data-theme data-density>`, `preferences.ts`, shared across windows) |
| Icons | `icons/names.ts`, `registry.tsx`, `AppIcon.tsx` | 100 semantic names mapped to Phosphor (duotone for tools and object types, regular for actions, `filled` for selected states); one custom SysML block glyph. `AppIcon.weight` exposes Phosphor's type (unused outside the registry) |
| Shell | `apps/workspace/src/App.tsx`, `src/shell/**` | CSS grid: header row, body grid `[tree | handle | center | handle | inspector]`, phone bottom navigation. Center = `PaneArea` (tool tabs, tool toolbar, tool view, optional split view) over `BottomDock` (Activity and ChatGPT tabs). Tablet and phone turn the side panels into drawers, the dock into a sheet |
| Layout state | `platform/store.ts` (`Layout`, `DEFAULT_LAYOUTS`, `setLayout`) | Two layout classes (spacious for desktop, compact for drawers) persisted per window with the session (`platform/session.ts`), restored with defaults merged, clamped to the viewport (`shell/layout/viewport.ts`) |
| Tool frame | `shell/PaneArea.tsx`, `ToolToolbar.tsx`, `WorkArea.tsx` | Tools contribute `ToolbarItem[]`; the shell renders them with measured overflow into "More actions", tooltips, `data-toolbar-id`, help IDs from `contextMappings`. Tool views mount inside `.ws-tool-host` (`container: tool / inline-size`) |
| Inspector | `shell/Inspector.tsx` | Read-only platform inspector (identity, type, revision, owner, properties, representations, relationships, saved artifacts, concepts, change impact, history). Pin/follow per view instance |
| Explorer | `shell/ProductTree.tsx` (example project), `projects/ProjectExplorer.tsx` (registry-backed projects) | React Aria `Tree`, expandable groups, multi-select (product tree), `onAction` opens the owning tool (explorer). No search/filter; every node renders (React Aria Tree is a collection, not virtualized) |
| Assistant | `shell/assistant/**` (presentation), `assistant/**` (logic, other agent) | Bottom-dock tab: conversation (banner, messages, steps, change cards with Apply/Reject/Undo) left, composer with context chips and examples right. Model selection lives in Settings → AI; `listModels`/`chooseModel` exist in `assistant/connection.ts` |
| Overlays | `CommandPalette` (Ctrl K), `GlobalSearch` (`/`), Help (F1), Settings centre, Baselines, Coverage, Capabilities dialogs | |

### 1.2 Current layout (desktop, 1600 x 1000)

Header 56 px (light): brand, project switcher, configuration select, scenario select, model revision, search,
Commands, Baselines, Subscription, Services, Windows, Display, repository status, Settings, Help. Below: product tree
(248 px) | tool tabs + panel toggles + toolbar (48 px row) + tool view | inspector (320 px). Bottom dock (280 px open by
default) with Activity and ChatGPT. No navigation rail, no status bar, no module navigation besides tabs and the palette;
the canvas gets about 60% of the width and 55% of the height.

### 1.3 Constraints and hooks to preserve

- Committed browser flows (`tests/e2e/flows/*.mjs`) select: `.ws-app`, `header.ws-header` (text "Demo data"),
  `[data-testid="model-revision"]`, `[role="tab"][data-tool-id]`, `.ws-tab-main[data-tool-id]`, `.ws-pane-main`,
  `.ws-pane-tabs`, `.ws-toolbar`, `[data-toolbar-id]`, `.ws-view-controls`, `.ws-tree`, `.ws-tree-item[data-object-id]`,
  `.ws-tree-group`, `.ws-inspector`, `.ws-inspector-body`, `.ws-insp-object[data-inspected-id]`, `.ws-insp-statement`,
  `.ws-dock`, `.ws-activity-row`, `[data-dock-tab="assistant"]` (opens the assistant; `.ws-dock-demo` inside it in demo
  mode), `.as-*` assistant classes, `.ws-mobile-nav` (text "ChatGPT"), `.ws-launcher`, `.ws-overlay`, `.ws-detached`,
  buttons named Baselines, Subscription:…, Requirements service:…, Help, Settings, More actions, Open in separate window.
  The `icons` check in `platform.mjs` identifies registry icons by Phosphor's `viewBox="0 0 256 256"`; it must change with
  the approved icon library (to an equally strict registry marker).
- Help IDs (`data-help-id`) and tutorial anchors; `contextMappings` already name `platform.header.baselines`,
  `.subscription`, `.services` and `ai.panel`, which no control carries yet (to add).
- Shortcuts: Ctrl/Cmd K (palette), `/` (search), F1 (help), Enter / Shift+Enter in the composer, arrow keys and
  Home/End/Enter on splitters, React Aria keyboard models for tabs, trees, toolbars and menus.
- `designSystem.test.ts`: no hard-coded colours in shell, SDK and tool code; no raw controls; tool CSS in
  `@layer components`; one component library and icon set (currently forbids `lucide`: to update with the decision);
  WCAG AA contrast pairs per theme.
- Tool container-query contract: `.ws-tool-host { container: tool / inline-size }`.
- Detached windows (tool, inspector, assistant) reuse the shell components.

## 2. Regression checklist (before implementation)

Each item is checked in the running application and, where marked, by a committed flow.

| # | Workflow | How it is checked |
| --- | --- | --- |
| R1 | Requirements: create, edit, filter, validate, lifecycle, verification record | `integration`, `platform` (edit propagates to inspector), `help` (tutorial), manual |
| R2 | SysML (mock) diagram selection, failure isolation and reload; SysML Modeler editing, text, diagram, persistence | `platform` §9, `sysml-modeler` (includes viewport resizes) |
| R3 | CAD (mock) dimensions → component property mapping; CAD Modeler sketches, features, volumes, persistence, deep link, units | `platform` §7, `cad-modeler`, `cad-modeler-persistence`, `cad-d1` |
| R4 | Conceptualize concepts, alternatives, trade studies, decisions, implementations | `conceptualize` |
| R5 | Projects: Project Home, new project, switcher, explorer, reopen | `projects` |
| R6 | Configuration and scenario context, baselines create/compare, revision history | `platform`, `vision` |
| R7 | Subscriptions: locked tools, data kept, menus follow | `platform`, `help` |
| R8 | Assistant: conversation, proposals, Apply/Reject/Undo, coverage dialog, transcript, reopened proposals, connection line | `platform`, `coverage`, `ai-headless`, `ai-fake-provider`, `demo-d1` (fake provider) |
| R9 | Cross-module selection: tree → tools → inspector, pin/follow, split view, detached windows | `platform`, `vision`, manual |
| R10 | Help: menu, F1, Help Centre, tutorials, phone | `help` |
| R11 | Persistence: layout and session survive reload; engineering data only in repositories | manual, new layout tests |
| R12 | Phone and tablet: drawers, sheet, bottom navigation, no horizontal overflow | `help`, `coverage`, `projects`, manual |
| R13 | Accessibility: labelled icon buttons, keyboard splitters, focus rings, contrast | `platform` icons check, `designSystem.test.ts`, manual |

## 3. Implementation plan

1. **Design system** (`packages/design-system`): palette as semantic tokens (`--ws-shell-*` for the dark slate shell, working
   panels `#E8EDF3`, canvas `#FFFFFF`, secondary `#F8FAFC`, accent `#2563EB`, success `#0D9488`, warning `#D97706`, error
   `#DC2626`, with AA-checked text variants) in light and dark themes; existing token names kept and remapped; tighter
   radii (precision, not pills); type scale 12/13/14/15-16/18-20 and density (comfortable, compact) on tokens;
   IBM Plex Sans and Mono self-hosted from `@fontsource/ibm-plex-*` (OFL 1.1); Lucide (`lucide-react`, ISC) behind the
   unchanged semantic registry with a custom-icon interface for engineering glyphs; new foundational components
   (`IconButton` shortcut hints, `ToolbarGroup`, `OverflowMenu`, `PanelHeader`, `CollapsibleSection`, `StatusBar` items,
   `Kbd`); `packages/design-system/AGENTS.md` and `docs/modules/design-system/` component documentation.
2. **Shell**: dark 48 px header (brand, project, configuration, scenario, module navigation from the registry, search and
   commands, notifications, account menus); 64 px navigation rail (explorer, modules, assistant, settings; collapsible,
   tooltips); explorer frame with search filter; dock layout with assistant right or bottom, collapsible and resizable
   explorer, inspector, assistant, bottom panel, canvas maximize, three presets (Engineering, AI-assisted, Review),
   reset, persistence in the existing layout preferences (additive fields); 26 px status bar.
3. **Workspace frame**: document tabs, 36 px toolbar row with 28 px controls through the shared Toolbar components,
   breadcrumbs, canvas container keeping `.ws-tool-host`, inspector frame with collapsible sections and tabs.
4. **Assistant presentation**: conversational bubbles, rounded composer with plus (attachments disabled until
   CR-PM-SDK-4), microphone (feature flag off, documented), send, model selector over the existing connection API,
   Chat/Context/Tools tabs, states. Logic in `apps/workspace/src/assistant` untouched.
5. **Validation**: check, builds, harness builds, all flows, screenshots 1920x1080 and 1366x768 in both themes.

## 4. Log

- 16 Oct 2026: audit, checklist and plan.
- 16 Oct 2026, phase 2: palette tokens (light and dark, shell scope, status solid/text variants, type scale, density
  sizes), IBM Plex Sans and Mono self-hosted, Lucide behind the semantic registry with custom engineering glyphs,
  compact controls, new components (Kbd, shortcut tooltips, ToolbarGroup, PanelHeader, CollapsibleSection,
  Breadcrumbs, StatusBarItem, Avatar), package AGENTS.md, CHANGELOG, docs/modules/design-system. The header uses the
  dark shell scope already. Checks: design-system tests 332 passed; npm run check 1161 passed, 1 timed out
  (tool-sysml-modeler CodeMirror completion, 5 s under full-suite load; passes alone, 16/16); npm run build and
  npm run build:harnesses pass. The platform flow's icon check now identifies registry icons by data-icon instead of
  Phosphor's viewBox (the library changed; the check is as strict).
