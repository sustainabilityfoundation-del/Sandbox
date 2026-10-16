# Design system (`@ews/design-system`)

Status: implemented, version 1.1.0 (Focused Canvas). Owner: ui-ux-design-system agent. Package rules:
[packages/design-system/AGENTS.md](../../../packages/design-system/AGENTS.md). Changes:
[CHANGELOG](../../../packages/design-system/CHANGELOG.md). Components: [components.md](components.md). Shell and layout:
[shell.md](shell.md).

Every user interface in the platform (the workspace shell, each tool, tool harnesses and the assistant) uses this
one library. Modules consume it; they do not create competing styles, controls or icon sets.

## 1. Visual direction: Precision Industrial

A dark slate frame (header, navigation rail) around light working panels (explorer, inspector, assistant) and a
bright engineering canvas. Compact, information-dense toolbars; 4 px corners; restrained elevation; no gradients or
decorative cards. Engineering data, not chrome, carries the visual weight.

## 2. Tokens (`theme/tokens.css`)

| Layer | Prefix | Use |
| --- | --- | --- |
| Palette | `--ws-palette-*` | Approved values; used only to define semantic tokens |
| Semantic | `--ws-*` | Surfaces (`bg`, `surface`, `surface-2..4`), text (`text`, `text-2`, `text-3`), lines (`border`, `border-strong`), accent and selection, status (`success`, `warning`, `danger`, `info` with `-soft`, `-border`, `-surface`, `-solid`), diagrams, charts, viewport, radii, shadows, motion |
| Shell | `--ws-shell-*` | Dark frame: `bg`, `hover`, `raised`, `active`, `line`, `text`, `text-2`, `accent`, `focus`. Inside `.ws-shell-scope` the semantic roles are remapped to these |
| Density | `--ws-font-size*`, `--ws-control-h*`, `--ws-row-h`, `--ws-header-h`, `--ws-toolbar-h`, `--ws-tabs-h`, `--ws-statusbar-h`, `--ws-rail-w`, `--ws-panel-header-h` | Set by `<html data-density>` |

Palette mapping (light theme, the default appearance):

| Brief | Token | Role |
| --- | --- | --- |
| Application shell `#202C3D` | `--ws-palette-shell` | `--ws-shell-bg`, `--ws-header-bg` |
| Navigation hover `#304158` | `--ws-palette-shell-hover` | `--ws-shell-hover` |
| Working panels `#E8EDF3` | `--ws-palette-panel` | `--ws-bg` (behind and between panels) |
| Engineering canvas `#FFFFFF` | `--ws-palette-canvas` | `--ws-surface`, `--ws-canvas-bg`, `--ws-diagram-bg` |
| Secondary surfaces `#F8FAFC` | `--ws-palette-secondary` | `--ws-surface-2`, `--ws-statusbar-bg` |
| Primary accent `#2563EB` | `--ws-palette-accent` | `--ws-accent`, `--ws-focus` |
| Validation success `#0D9488` | `--ws-palette-success` | `--ws-success-solid` (marks); text uses `--ws-success` `#0B7468` (AA) |
| Warning `#D97706` | `--ws-palette-warning` | `--ws-warning-solid`; text `--ws-warning` `#9A4A05` |
| Error `#DC2626` | `--ws-palette-error` | `--ws-danger-solid`; text `--ws-danger` `#B91C1C` |

The dark theme redefines every semantic and shell role with the same names. Tailwind exposes only semantic colours
(`bg-surface`, `text-fg-2`, `bg-shell`, `text-success-solid`, …); the default Tailwind palette is removed.

Contrast is tested (`theme/designSystem.test.ts`): text pairs at 4.5:1 and non-text marks (status dots, control
borders, focus rings, the shell accent) at 3:1, in both themes.

## 3. Typography

IBM Plex Sans (400, 500, 600, 400 italic) and IBM Plex Mono (400, 500), self-hosted from `@fontsource` (OFL 1.1).

| Size | Token / class | Use |
| --- | --- | --- |
| 12 px | `--ws-text-12`, `text-12`, `text-ui-xs` | Dense technical labels, metadata, status bar |
| 13 px | `--ws-text-13`, `text-13`, `text-ui-sm` | Toolbars, navigation trees, property fields, tabs |
| 14 px | `--ws-text-14`, `text-ui` (comfortable) | General interface text |
| 15–16 px | `text-15`, `text-16`, `text-title` | Section and panel headings |
| 18–20 px | `text-18`, `text-20`, `text-headline` | Document and project headings |

Weights: 400 body and secondary information, 500 (`font-medium`) labels and selected items, 600 (`font-strong`)
headings and primary labels. Mono (`font-mono`, `.ws-num` with tabular figures) for object IDs, values, parameters,
units and code. Compact density lowers body text to 13 px; nothing goes below 12 px.

## 4. Density

`usePreferences` (`@ews/design-system/preferences`) stores theme (system, light, dark) and density (comfortable,
compact) per browser, applies them to `<html>` and shares them with other workspace windows.

| Token | Comfortable | Compact |
| --- | --- | --- |
| Body / small / extra small text | 14 / 13 / 12 | 13 / 12 / 12 |
| Control / small control | 32 / 28 | 28 / 24 |
| Row | 28 | 24 |
| Header | 48 | 48 |
| Toolbar row / document tabs | 36 / 34 | 32 / 30 |
| Status bar | 26 | 24 |
| Navigation rail | 64 | 56 |

On coarse pointers, interactive targets grow to 44 px (`--ws-touch-target`) whatever the density.

## 5. Icons

- One component: `<AppIcon name="…" size="sm" />` (alias `Icon`). Semantic names (`icons/names.ts`), never glyph
  names. The registry maps them to Lucide (ISC) or to custom engineering glyphs built with Lucide's
  `createLucideIcon`, so stroke, grid and props are identical.
- Sizes: `xs` 14, `sm` 16 (dense toolbars, trees, menus), `nav` 18 and `md` 20 (primary navigation), `lg` 24, `xl` 32.
- One stroke weight (1.75 on the 24 grid). `filled` (selected or active states) adds a tonal fill; active states
  also use a background (`bg-selected`) and, in navigation, an accent indicator.
- Every icon renders `data-icon="<name>"`; decorative unless `label` is given. Icon-only buttons need a label, shown
  as the tooltip with any keyboard shortcut (`IconButton shortcut="Control+K"`).
- Engineering glyphs: `sysml-block`, `sysml-element`, `sysml-port`, `cad-sketch`, `cad-extrude`, `constraint`,
  `trace-derive`, `trace-satisfy`; library icons cover validation (`validate`), relationships (`relationship`, `trace`,
  `link`), requirements and CAD operations. To add one: draw it on the 24-unit grid with 2-unit-equivalent strokes,
  add `createLucideIcon('ews-<name>', nodes)` in `registry.tsx`, add the name to `names.ts`, map it, and run the
  design-system tests.

## 6. Extension points for modules

- Tools contribute toolbar items, commands, settings, help and assistant operations through the SDK; the shell
  renders them with these components, so a new module looks native without its own styling.
- A newly registered or entitled tool appears in module navigation (header and rail), the command palette, document
  tabs and the Help menu from its registration (`registerTool`, `registerPlatformModule`) with its semantic icon;
  no shell edits are needed. See [shell.md](shell.md).
- Tool CSS lives in `@layer components` and lays out against the `tool` container (`@container tool (…)`).
