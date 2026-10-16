# Design-system components

Import everything from `@ews/design-system`. All components follow the tokens (themes, density) and React Aria's
keyboard and focus behaviour. Conventions: props named after React Aria (`onPress`, `isDisabled`, `isSelected`),
`className` for layout adjustments only, semantic icon names for `icon`.

## Actions

| Component | Use | Key props |
| --- | --- | --- |
| `Button` | Text button. Variants: `filled` (the one primary action in a region), `tonal`, `outlined` (default), `text`, `quiet` (toolbars), `danger` | `variant`, `size` (`md` 32 px, `sm` 28 px), `icon`, `isPending` |
| `IconButton` | Icon-only button with tooltip | `label` (required: accessible name and tooltip), `icon`, `variant`, `size`, `shortcut` (`"Control+K"`: `aria-keyshortcuts` and a hint), `tooltipPlacement` |
| `ToggleButton`, `ToggleIconButton` | Two-state controls (modes, panel toggles) | `isSelected`, `onChange`, `icon`, `label`, `shortcut` |
| `SegmentedControl` | One choice among a few visible options | `label`, `options`, `value`, `onChange`, `size` |
| `MenuButton` + `MenuItem`, `MenuSection`, `MenuSeparator`, `SubmenuTrigger` | Commands in a menu (also overflow menus and context menus) | `label`, `icon`, `text`, `onAction`; `MenuItem`: `icon`, `shortcut`, `description`, `trailing`, `tone` |
| `Kbd` | Keyboard hint | `tone` (`default`, `inverse`, `shell`) |
| `Tooltip` | Tooltip content inside a React Aria `TooltipTrigger` | `placement`, `shortcut` |

### CommandBar and CommandInfoPopover

`CommandBar` is the capability-aware toolbar ([specification §4](../../specifications/capability-registry.md), ADR-0074). It renders a
neutral model (`tabs` → `groups` → `commands`) and does not import the SDK; hosts build the model with `buildCommandModel` from
`@ews/platform-sdk/react` (registry hierarchy and state merged with the tool's runtime toolbar items). With no registry data the model
is one unlabelled group and the bar looks like the plain toolbar.

| Prop | Use |
| --- | --- |
| `ariaLabel` | Name of the toolbar (and, with " sections", of the tab list) |
| `tabs` | `{ id, label, groups: { id, label, icon?, commands }[] }[]`; one tab shows no tab strip; an empty group label renders its entries flat |
| `layout`, `compact` | Force `desktop`, `tablet` or `phone`; default measures the bar's own width (under 840 px tablet, under 520 px phone) |
| `onHelp(helpId)` | Called by the popover's Help button and the F1 key on a command with a `helpId` |

A command has `id`, `label`, `icon?`, `description`, `shortcut?`, `helpId?`, `primary?`, `priority?`, `illustrative?`, `testId?` (the
`data-toolbar-id`) and a `state` (`CommandState`):

| State | Appearance | Press | Accessible name |
| --- | --- | --- | --- |
| `ready` (`onInvoke`, `active?`, `busy?`) | as a quiet toolbar button (toggle when `active` is set) | invokes | the label |
| `partial` (`onInvoke`, `limitation`) | 4 px filled dot at the icon's top right; tooltip "Partial: ..." | invokes | "Export STEP, partial: geometry only" |
| `planned` (`info`, no `onInvoke`) | label and icon in `fg-3`, 4 px hollow ring | opens `CommandInfoPopover`; invokes nothing | "Fillet, planned" |
| `unavailable` (`reason`, no `onInvoke`) | disabled opacity, no ring | opens a popover with the reason | "Save, unavailable: open a document first" |

`planned` and `unavailable` use `aria-disabled` and stay focusable; the description is linked with `aria-describedby`. The union is
type-safe: `onInvoke` on a planned or unavailable state is a compile error. Keyboard: arrow keys move between controls and tabs, Enter
or Space invokes or opens the popover, Escape closes it and returns focus to the command, F1 opens help. Tablet: `secondary`
commands move into a per-group menu; phone: tabs become a `Select`, each group a menu, primary commands stay visible. Non-command
controls (`select`, `text`, `separator` entries) sit in the same groups.

A bound entry without test evidence stays `partial`; `buildCommandModel` accepts an optional `evidenceGaps` set of entry IDs that words its limitation as "Implemented; test evidence not yet linked" and never changes the state.

`CommandInfoPopover` (`command`, `triggerRef`, `isOpen`, `onOpenChange`, `onHelp`) is the non-modal explanation (description, status,
backlog IDs, Help); `CommandBar` uses it, and a host may open it from a palette or menu.

### Command surfaces (1.3.0, [specification Amendment CT-2c](../../specifications/capability-registry.md))

One neutral model (`CommandBarCommand` with its four states) feeds every surface; none imports the SDK. **A planned entry can never
be invoked on any surface**: its state has no `onInvoke` (a compile error to add one), and every surface routes presses through
`activateCommand`, which reads the state kind, so even a handler smuggled past the type is not run. Pressing a planned or
unavailable entry opens its explanation (a popover; inline in sheets). Layouts: `desktop`, `tablet` (below 840 px), `phone` (below
520 px); `MenuBar`, `ToolPalette`, `ContextCommands` and `DockPanel` default to the viewport, `CommandBar` to its own width, and
every one accepts a forced `layout`.

**CommandBar additions**

| Feature | Model | Behaviour |
| --- | --- | --- |
| Mode | `command.mode`: `action` (default), `toggle`, `tool`; pressed state is `state.active` | `toggle` and an armed `tool` expose `aria-pressed`; a planned toggle or tool is never pressed; an unavailable one keeps its pressed state |
| Split button | `command.split`: child commands (no nesting) | the command is the main part, an arrow ("Extrude: more options") opens the children; each child has its own state; the same children are listed after the parent in tablet and phone menus. `SplitCommandButton` is exported |
| Exclusive group | `group.exclusive` | choose-one toggles: pressing the active command keeps it active (the host sets one active); described as "Choose one" |
| Counts | `group.counts`: `true` (computed) or `{ available, total }` | "2 of 5 available" in the group description and as the menu header; ready and partial commands count as available (`groupCounts`, `groupCountText`) |
| All-planned group | a labelled group whose commands are all planned (`isAllPlanned`) | one muted group button with a count ("Simulation 0 of 6", name "Simulation: 0 of 6 available, planned") that opens a menu of its planned commands; choosing one explains it |
| More tabs | automatic | tabs are laid out by estimated width; those that do not fit go into a "More tabs" menu; the selected tab is always visible (`fitTabs`) |
| Quick bar | `CommandBarProps.quick`: commands | `QuickBar`: a leading toolbar of icon-only commands (name and state wording as in the ribbon; icon falls back to `command`) |
| Number entry | `{ type: 'number', id, label, value, unit?, min?, max?, step?, onChange, isDisabled? }` | `NumberField` (new in `Fields`): arrow keys step, Page Up and Down by ten, Home and End jump to the limits, committed on Enter and on blur; the unit is part of the name ("Depth (mm)") |

**MenuBar** (`ariaLabel`, `menus`, `layout?`, `keyTips?`, `menuLabel?`, `onHelp?`): `menus` is `{ id, label, mnemonic?, items }[]`; an item
is `{ kind: 'command', command, checked?, mnemonic? }`, `{ kind: 'submenu', id, label, items }`, `{ kind: 'section', id, title?, items }` or
`{ kind: 'separator', id }`. Desktop is the WAI-ARIA menubar pattern composed from React Aria `MenuTrigger` and `SubmenuTrigger` (no second
behaviour library): one tab stop (roving), Left and Right move between menus and move an open menu, Home and End jump to the first and
last, Down, Enter and Space open, Escape closes and returns focus to the menu. `keyTips` (the host says F10 or a lone Alt tap is
active) underlines mnemonic letters; a menu's mnemonic letter opens it from the bar, and an item mnemonic invokes the item while its
menu is open and key tips are active. Checked items are announced as `menuitemcheckbox` with `aria-checked`. Tablet: one "Menu"
button whose submenus are the menus. Phone: a full-screen sheet with search first (results show the menu path, "File › Export"), rows
at least 40 px.

**ToolPalette** (`ariaLabel`, `groups`, `layout?`, `onDisarm?`, `addLabel?`, `onHelp?`): `groups` is `{ id, label, icon?, collapsed?, commands }[]`.
A vertical `Toolbar` (arrow keys move between tools) of collapsible groups (the header button has `aria-expanded`); a tool in
`mode: 'tool'` shows `aria-pressed` while armed, stays armed until used or disarmed, and Escape in the palette calls `onDisarm(id)`
(the host also binds Escape on its canvas; arming is the host's state). Phone: an "Add" button (named "Add: Line armed" while a tool is
armed) opening a sheet of rows; choosing a ready tool arms it and closes the sheet. `armedTools(groups)` lists the armed tools.

**ContextCommands** (`ariaLabel`, `commands`, `rendering?`, `layout?`, `isOpen?`, `onOpenChange?`, `anchorRef?`, `className?`): the commands for the
selection or view. `rendering` is `floating` (a small icon toolbar; the host positions it with `className`), `menu` (a context menu
anchored to `anchorRef`, opened by right-click, long-press, Shift+F10 or the ContextMenu key in the host) or `sheet` (a bottom sheet
whose rows are at least 40 px high); the default follows the layout (desktop floating, tablet menu, phone sheet,
`contextRenderingFor`). Entries are commands and separators.

**CommandSessionStrip** (`title`, `fields`, `preview?`, `onOk`, `okUnavailableReason?`, `onCancel`): the edit strip while a command is open;
the host shows it in place of the ribbon. Fields are number (new `number` kind with `unit`, `min`, `max`, `step`), select or text
entries. Enter in a field commits it and presses OK (after a tick, so the host has the committed value); Escape cancels. `Preview` is a
toggle (`aria-pressed`). While `okUnavailableReason` is set, OK is `aria-disabled`, named "OK, unavailable: reason", the reason is
shown beside it, and neither a press nor Enter confirms. The strip cannot start a session: the host refuses one for a planned entry.

**DockPanel** (`title`, `icon?`, `side`: `start` | `end` | `bottom`, `isOpen`, `onOpenChange`, `role?`, `layout?`, `actions?`): promotes the shell's
patterns. Desktop docks an `aside` inline with `PanelHeader` and a close button; tablet uses `Drawer` (bottom panels use `Sheet`);
phone uses `Sheet`. `role` (`browser`, `specification`, `properties`, `diagnostics`, `other`) is exposed as `data-panel-role`.

**Icons:** the name list is split by domain in `icons/names/` (`core.ts`, `glyphs.ts`, `cad.ts`, `sysml.ts`) and joined into `ICON_NAMES`
(existing names and order unchanged). 1.3.0 adds the generic family names `cmd-create`, `cmd-modify`, `cmd-draw`, `cmd-constrain`,
`cmd-pattern`, `cmd-measure`, `cmd-exchange`, `cmd-view`, `sysml-definition`, `sysml-usage`, `sysml-relation`, `diagram-tool`; a command
without its own icon falls back to its group's icon, then to the family glyph, then `command`.

## Layout and frame

| Component | Use | Key props |
| --- | --- | --- |
| `PanelHeader` | Header of a docked panel (36 px comfortable) | `title`, `icon`, `actions`, `children` (tabs or a search field under the title row) |
| `CollapsibleSection` | Collapsible group (inspector sections, explorer groups); React Aria Disclosure | `title`, `count`, `actions`, `defaultExpanded` or `isExpanded` + `onExpandedChange` |
| `Breadcrumbs` | Location trail (nav landmark, ordered list); the last item is the current location | `items: { id, label, icon?, onPress? }[]`, `label` |
| `Toolbar`, `ToolbarGroup`, `ToolbarSeparator` | Arrow-key toolbar; labelled groups; separators | `aria-label`; `ToolbarGroup label` |
| `Tabs`, `TabList`, `Tab`, `TabPanel` | Tabs with a 2 px accent indicator | React Aria props |
| `ResizeHandle` | Splitter: drag, arrow keys, Home/End, Enter or double-click resets | `orientation`, `label`, `value`, `min`, `max`, `onChange`, `onReset`, `invert`, `step` |
| `StatusBarItem`, `StatusBarSeparator` | Status bar entries (icon and text; a button when `onPress` is given) | `icon`, `tone`, `label`, `onPress`, `spin`, `testId` |
| `Avatar` | Initials (account, conversation participants) | `name`, `size`, `tone`, `label` |
| `Panel` | Titled content group | `title`, `actions` |

## Overlays

| Component | Use |
| --- | --- |
| `Dialog` | Modal dialog (full screen on phones) with header, body, footer |
| `Drawer` | Side drawer for panels on tablets and phones |
| `Sheet` | Full-height bottom sheet on phones |
| `Popover`, `PopoverButton` | Non-modal content (settings, details) |
| `Toaster`, `useToasts` | Notifications (errors and warnings announced assertively) |

## Fields

`TextField` (single and multi-line, `unit`), `SearchField`, `Select`, `ComboBox`, `Checkbox`, `CheckboxGroup`. Labels
are visible or given as `ariaLabel` for compact toolbar use; inputs use 16 px text on touch screens.

## Status and data

`Badge` (tone, icon), `StatusBadge` (`STATUS` kinds: saving, saved, stale, compliance, review…), `Notice`,
`EmptyState`, `LoadingState`, `Spinner`, `Table` family (React Aria table that turns into labelled cards in narrow
`tool` containers). Shared CSS classes: `.ws-table`, `.ws-mono`, `.ws-num`, `.ws-hint`, `.ws-canvas-surface`,
`.ws-shell-scope`, `.ws-tool-host` (the `tool` container).

## Usage rules

- No raw `<button>`, `<select>`, `<textarea>`, `<input>` in tools and the shell (a hidden file picker is the exception).
- Keep text labels on important actions; icon-only controls only where the meaning is standard (zoom, close,
  panel toggles) and always with a label.
- Do not remove commands to reduce clutter: put infrequent ones in an overflow `MenuButton` (`icon="more"`).
- No essential action may depend on hover, right-click or dragging: context menus and drag handles always have a
  button or keyboard equivalent.
