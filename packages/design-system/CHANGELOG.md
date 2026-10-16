# @ews/design-system changelog

## 1.3.0 (16 October 2026): command surfaces (CT-2c1)

Additive; no tool changes are required. Specification: docs/specifications/capability-registry.md, Amendment CT-2c. The design system
still imports no SDK; every surface takes neutral models. No new dependency (React Aria Components only).

- **CommandBar:** `mode` (`action`, `toggle`, `tool`; `aria-pressed` for toggle and armed tool), `split` children rendered by `SplitCommandButton`
  (each child has its own state), `exclusive` groups, `counts` in the group description and menu header, an all-planned group rendered
  as one muted group button with a count ("0 of 6") that opens a menu of its planned commands, a width-driven "More tabs" menu
  (`fitTabs`), a `quick` prop with `QuickBar` as a leading icon-only segment, and a `number` entry. New exports: `CommandMenuButton`,
  `SplitCommandButton`, `QuickBar`, `fitTabs`, `activateCommand`, `groupCounts`, `groupCountText`, `isAllPlanned`, `CommandMode`, `CommandBarNumber`.
- **New components:** `MenuBar` (WAI-ARIA menubar from React Aria `MenuTrigger` and `SubmenuTrigger`; roving arrows, Home, End, Escape,
  mnemonic underlines when `keyTips` is set; sections, submenus, separators and checked items; tablet "Menu" button; phone sheet with
  search first), `ToolPalette` (vertical toolbar, collapsible groups, armed tool, Escape disarms, phone "Add" sheet), `ContextCommands`
  (floating, menu and sheet renderings; 40 px targets in the sheet), `CommandSessionStrip` (title, fields, Preview, OK with
  `okUnavailableReason`, Cancel; Enter and Escape), `DockPanel` (promotes `PanelHeader`, `Drawer` and `Sheet`), and `NumberField` in `Fields`
  (`unit`, `min`, `max`, `step`).
- **Planned entries never run:** the neutral types have no `onInvoke` on a planned or unavailable state, and every surface goes through
  `activateCommand`, which checks the state kind at runtime. Pressing one opens its explanation.
- **Icons:** `icons/names.ts` is split into `icons/names/core.ts`, `glyphs.ts`, `cad.ts` and `sysml.ts` and joined into `ICON_NAMES`; existing
  names and their order are unchanged and `names.ts` still exports `ICON_NAMES`, `IconName` and `isIconName`. New generic names:
  `cmd-create`, `cmd-modify`, `cmd-draw`, `cmd-constrain`, `cmd-pattern`, `cmd-measure`, `cmd-exchange`, `cmd-view`, `sysml-definition`,
  `sysml-usage`, `sysml-relation`, `diagram-tool` (Lucide icons and two `createLucideIcon` glyphs). A module adds its names to its
  domain file in `names/`.
- **Smaller changes:** `ToolbarGroup` accepts `description`; `MenuSection` accepts `flush`, `label`, `selectionMode` and `selectedKeys`
  (checked items); `MenuItem` accepts `tone="muted"`; a command button now passes keys it does not handle on to its parents (an
  `onKeyDown` handler on a React Aria control otherwise stops them).

## 1.2.0 (16 October 2026): CommandBar

Additive; no tool changes are required.

- **New components:** `CommandBar` and `CommandInfoPopover` (capability-aware toolbar: tabs, labelled groups, four command states: ready, partial, planned, unavailable) and the types `CommandState`, `CommandBarCommand`, `CommandBarProps` and related. A planned command has no `onInvoke`, by type. Specification: docs/specifications/capability-registry.md §4.
- `ToggleButton` accepts a `ref`. No new icon names or tokens.

## 1.1.0 (16 October 2026): Focused Canvas foundation

Additive; no tool changes are required. Tools keep their semantic icon names, token names and component props.

- **Tokens:** the approved Focused Canvas palette (`--ws-palette-*`: shell `#202C3D`, shell hover `#304158`, working
  panels `#E8EDF3`, canvas `#FFFFFF`, secondary `#F8FAFC`, accent `#2563EB`, success `#0D9488`, warning `#D97706`,
  error `#DC2626`) mapped to the existing semantic roles in light and dark themes. New roles: `--ws-shell-*` (dark
  frame) with the `.ws-shell-scope` class, `--ws-*-solid` status marks, `--ws-canvas-bg`/`--ws-canvas-grid`
  (`.ws-canvas-surface`), `--ws-statusbar-bg`, `--ws-panel-header-bg`, the type scale `--ws-text-12` … `--ws-text-20`,
  density sizes `--ws-toolbar-h`, `--ws-tabs-h`, `--ws-statusbar-h`, `--ws-rail-w`, `--ws-panel-header-h`. Radii are
  smaller (controls 4 px; `--ws-radius-control`), so buttons are no longer pills. Comfortable density is denser
  (controls 32 px, rows 28 px, header 48 px); compact keeps 12 px as the smallest text.
- **Typography:** IBM Plex Sans and IBM Plex Mono, self-hosted (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`,
  OFL 1.1).
- **Icons:** Lucide (`lucide-react` 1.49.0, ISC) replaces Phosphor behind the same semantic names. `AppIcon` renders
  `data-icon="<name>"`; `weight` now selects a stroke width (`fill` adds a tonal fill). New names: notifications, user,
  project, folder, folder-open, document, maximize, minimize, layout, dock-right, dock-bottom, chevron-left,
  chevron-up, collapse, expand, grip, branch, validate, attach, microphone, voice, and custom engineering glyphs
  sysml-port, cad-sketch, cad-extrude, constraint, trace-derive, trace-satisfy. `ICON_SIZE` gains `nav` (18).
- **Components:** `Kbd`, `shortcutLabel`, `shortcut` on `IconButton`, `ToggleIconButton` and `Tooltip`
  (aria-keyshortcuts plus a hint in the tooltip), `ToolbarGroup`, `PanelHeader`, `CollapsibleSection`, `Breadcrumbs`,
  `StatusBarItem`, `StatusBarSeparator`, `Avatar`. Buttons, menus and fields are more compact (16 px icons).
