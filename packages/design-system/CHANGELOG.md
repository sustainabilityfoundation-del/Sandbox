# @ews/design-system changelog

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
