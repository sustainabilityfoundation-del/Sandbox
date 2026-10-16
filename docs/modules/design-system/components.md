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

`CommandInfoPopover` (`command`, `triggerRef`, `isOpen`, `onOpenChange`, `onHelp`) is the non-modal explanation (description, status,
backlog IDs, Help); `CommandBar` uses it, and a host may open it from a palette or menu.

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
