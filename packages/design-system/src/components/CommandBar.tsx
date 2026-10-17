import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Dialog as AriaDialog, Heading, Popover as AriaPopover, TooltipTrigger, type KeyboardEvent as AriaKeyboardEvent } from 'react-aria-components'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Button, ToggleButton, Tooltip } from './Button'
import { Tab, TabList, TabPanel, Tabs, Toolbar, ToolbarGroup, ToolbarSeparator } from './Collections'
import { NumberField, Select } from './Fields'
import { MenuButton, MenuItem, MenuSection } from './Overlays'
import { activateCommand, commandStateText, groupCountText, isAllPlanned, isCommand } from './commandCore'
import { cx } from './cx'

/*
 * CommandBar: the one toolbar component (docs/specifications/capability-registry.md §4). It renders a neutral model
 * (tabs, labelled groups, commands) that the host builds from the capability registry and the tool's runtime toolbar
 * items (`buildCommandModel` in @ews/platform-sdk/react). It does not import the SDK.
 *
 * A command is in one of four states. Planned and unavailable commands stay focusable (aria-disabled, never
 * `disabled`) and open a non-modal explanation instead of acting; a planned command has no `onInvoke` by type.
 */

/** What a command does when pressed, or why it cannot. `planned` and `unavailable` have no `onInvoke`, by type. */
export type CommandState =
  | { kind: 'ready'; onInvoke: () => void; active?: boolean; busy?: boolean }
  | { kind: 'partial'; onInvoke: () => void; limitation: string; active?: boolean; busy?: boolean }
  | { kind: 'unavailable'; reason: string; /** Kept so a disabled toggle still shows its pressed state. */ active?: boolean; onInvoke?: never }
  | { kind: 'planned'; info: { status: string; backlog: string[]; helpId?: string }; onInvoke?: never }

/**
 * How a command behaves. `action` runs once; `toggle` switches a setting on and off (aria-pressed); `tool` arms a
 * tool that stays armed until used or Escape (aria-pressed while armed). The pressed state is `state.active`.
 */
export type CommandMode = 'action' | 'toggle' | 'tool'

export interface CommandBarCommand {
  type?: 'command'
  id: string
  label: string
  icon?: IconName
  mode?: CommandMode
  /**
   * Split button: the command itself is the main part; these children open from the arrow beside it. Each child has
   * its own state (a planned child explains instead of running). Children do not nest.
   */
  split?: CommandBarCommand[]
  /** Plain-language description: the tooltip, the accessible description and the planned popover body. */
  description: string
  /** Keyboard shortcut in `aria-keyshortcuts` form, e.g. "Control+K". */
  shortcut?: string
  helpId?: string
  state: CommandState
  /** Filled call-to-action; always visible on narrow screens. */
  primary?: boolean
  /** 'secondary' commands move into a menu on narrow screens. */
  priority?: 'primary' | 'secondary'
  /** Mock-only control: underlined with a dotted line (not used for planned commands). */
  illustrative?: boolean
  /** Value of `data-toolbar-id` (the tool's own toolbar item ID); defaults to `id`. */
  testId?: string
}

/** Runtime controls that are not commands but belong in the bar (a mode picker, a status text, a divider). */
export interface CommandBarSelect {
  type: 'select'
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  isDisabled?: boolean
}
export interface CommandBarText {
  type: 'text'
  id: string
  text: string
  tone?: 'muted' | 'warning'
}
export interface CommandBarSeparator {
  type: 'separator'
  id: string
}
/** A numeric input with a unit (a dimension, an angle, a count). The value is committed on Enter and on blur. */
export interface CommandBarNumber {
  type: 'number'
  id: string
  label: string
  value: number
  unit?: string
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  isDisabled?: boolean
}
export type CommandBarEntry = CommandBarCommand | CommandBarSelect | CommandBarText | CommandBarSeparator | CommandBarNumber

export interface CommandBarGroup {
  id: string
  /** Accessible group name. An empty label renders the entries flat, without a group wrapper (legacy toolbars). */
  label: string
  icon?: IconName
  commands: CommandBarEntry[]
  /** Choose-one toggles: pressing the active command does not switch it off (the host sets one active). */
  exclusive?: boolean
  /** Show "n of m available" in the group's description (and as a menu header). `true` computes it from the commands. */
  counts?: boolean | { available: number; total: number }
}

export interface CommandBarTab {
  id: string
  label: string
  groups: CommandBarGroup[]
}

export type CommandBarLayout = 'desktop' | 'tablet' | 'phone'

export interface CommandBarProps {
  ariaLabel: string
  tabs: CommandBarTab[]
  /** The leading quick-access segment (a fixed set of icon commands, see `QuickBar`). */
  quick?: CommandBarCommand[]
  /** Secondary commands move into group menus (tablet); tabs become a Select and groups menus (phone). Default: measured. */
  layout?: CommandBarLayout
  /** Same as `layout="tablet"` for hosts that only distinguish compact. */
  compact?: boolean
  /** Opens a help topic (the popover's Help button and the F1 key). */
  onHelp?: (helpId: string) => void
  className?: string
}

const TABLET_MAX = 840
const PHONE_MAX = 520

/** The layout a surface uses (forced, or measured from the element's width) and that width (0 until measured). */
export function useBarMetrics(ref: RefObject<HTMLElement | null>, forced: CommandBarLayout | undefined): { layout: CommandBarLayout; width: number } {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  const measured: CommandBarLayout = width === 0 ? 'desktop' : width < PHONE_MAX ? 'phone' : width < TABLET_MAX ? 'tablet' : 'desktop'
  return { layout: forced ?? measured, width }
}

// ---- Tab overflow -------------------------------------------------------------------------------

const MORE_TABS_WIDTH = 104
const TAB_GAP = 4

/** Estimated width of a tab (13 px text plus padding): the strip is laid out before it can be measured. */
function tabWidth(t: CommandBarTab): number {
  return Math.round(t.label.length * 7.4) + 28 + TAB_GAP
}

/**
 * Which tabs fit in `width` pixels; the rest go into the "More tabs" menu. The selected tab is always visible
 * (it takes the last visible slot when it would overflow). A width of 0 (not measured yet) shows every tab.
 */
export function fitTabs(tabs: CommandBarTab[], selectedId: string, width: number): { visible: CommandBarTab[]; overflow: CommandBarTab[] } {
  if (width <= 0 || tabs.reduce((sum, t) => sum + tabWidth(t), 0) + 8 <= width) return { visible: tabs, overflow: [] }
  const room = width - MORE_TABS_WIDTH - 8
  let used = 0
  let count = 0
  for (const t of tabs) {
    if (used + tabWidth(t) > room) break
    used += tabWidth(t)
    count += 1
  }
  count = Math.max(1, count)
  let visible = tabs.slice(0, count)
  const selected = tabs.find((t) => t.id === selectedId)
  if (selected && !visible.some((t) => t.id === selected.id)) visible = [...visible.slice(0, count - 1), selected]
  const ids = new Set(visible.map((t) => t.id))
  return { visible, overflow: tabs.filter((t) => !ids.has(t.id)) }
}

/** The accessible name: the label, then the state in words. */
export function commandAccessibleName(c: CommandBarCommand): string {
  switch (c.state.kind) {
    case 'planned':
      return `${c.label}, planned`
    case 'partial':
      return `${c.label}, partial: ${c.state.limitation}`
    case 'unavailable':
      return `${c.label}, unavailable: ${c.state.reason}`
    case 'ready':
      return c.label
  }
}

function tooltipText(c: CommandBarCommand): string {
  switch (c.state.kind) {
    case 'planned':
      return 'Planned: not available yet'
    case 'partial':
      return `Partial: ${c.state.limitation}`
    case 'unavailable':
      return c.state.reason
    case 'ready':
      return c.description
  }
}

// ---- Info popover -----------------------------------------------------------------------------

/**
 * Non-modal explanation of a planned or unavailable command: what it is, its status, the backlog items that
 * track it and a way to open help. Controlled: the bar opens it when the command is pressed. Escape closes it.
 */
export function CommandInfoPopover({
  command,
  triggerRef,
  isOpen,
  onOpenChange,
  onHelp,
}: {
  command: CommandBarCommand
  triggerRef: RefObject<HTMLElement | null>
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onHelp?: (helpId: string) => void
}) {
  const { state } = command
  const helpId = state.kind === 'planned' ? (state.info.helpId ?? command.helpId) : command.helpId
  return (
    <AriaPopover
      triggerRef={triggerRef}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isNonModal
      placement="bottom start"
      offset={6}
      containerPadding={8}
      className="ws-overlay z-[150] w-72 max-w-[calc(100vw-16px)] rounded-card border border-line bg-surface-2 text-fg shadow-2 outline-none"
    >
      <AriaDialog aria-label={`${command.label}: ${state.kind === 'planned' ? state.info.status : 'unavailable'}`} className="flex flex-col gap-2 p-3 text-ui-sm outline-none">
        <div className="flex items-center gap-2">
          <Heading slot="title" className="m-0 min-w-0 flex-1 truncate text-ui font-medium text-fg">
            {command.label}
          </Heading>
          <span className="inline-flex items-center gap-1 text-ui-xs text-fg-3">
            <Icon name={state.kind === 'planned' ? 'info' : 'warning'} size={16} />
            {state.kind === 'planned' ? state.info.status : 'Unavailable'}
          </span>
        </div>
        {state.kind === 'unavailable' && <p className="m-0 text-fg">{state.reason}</p>}
        {command.description && <p className="m-0 text-fg-2">{command.description}</p>}
        {state.kind === 'planned' && state.info.backlog.length > 0 && (
          <div className="text-ui-xs text-fg-3">
            Tracked in{' '}
            {state.info.backlog.map((b, i) => (
              <span key={b}>
                {i > 0 && ', '}
                <span className="font-mono">{b}</span>
              </span>
            ))}
          </div>
        )}
        {helpId && onHelp && (
          <div>
            <Button size="sm" variant="text" icon="help" onPress={() => onHelp(helpId)}>
              Open help
            </Button>
          </div>
        )}
      </AriaDialog>
    </AriaPopover>
  )
}

// ---- Command button ---------------------------------------------------------------------------

function StateMarker({ kind }: { kind: 'partial' | 'planned' }) {
  return (
    <span
      aria-hidden="true"
      data-marker={kind}
      className={cx('absolute -right-1 -top-1 size-[5px] rounded-full', kind === 'partial' ? 'bg-fg-3' : 'border border-fg-3')}
    />
  )
}

export function CommandButton({
  command,
  onHelp,
  iconOnly,
  exclusive,
  className,
}: {
  command: CommandBarCommand
  onHelp?: (helpId: string) => void
  /** Icon only (the quick bar, floating sets): the label is the accessible name and the tooltip. */
  iconOnly?: boolean
  /** In a choose-one group: pressing the active command keeps it active. */
  exclusive?: boolean
  className?: string
}) {
  const { state } = command
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const descriptionId = `${useId()}-desc-${command.id}`
  const interactive = state.kind === 'ready' || state.kind === 'partial'
  const marked = state.kind === 'partial' || state.kind === 'planned'
  const name = state.kind === 'ready' && !iconOnly ? undefined : commandAccessibleName(command)
  const active = interactive ? state.active : undefined
  const busy = interactive ? state.busy : undefined
  const pressable = command.mode === 'toggle' || command.mode === 'tool'
  const iconName = command.icon ?? (iconOnly ? 'command' : undefined)
  const label = iconOnly ? null : <span className={cx(command.illustrative && 'underline decoration-dotted underline-offset-4')}>{command.label}</span>
  const iconNode = iconName ? (
    <span className="relative inline-flex">
      <Icon name={iconName} size={16} />
      {marked && <StateMarker kind={state.kind as 'partial' | 'planned'} />}
    </span>
  ) : marked ? (
    <span className="relative inline-flex size-4">
      <StateMarker kind={state.kind as 'partial' | 'planned'} />
    </span>
  ) : null
  const common = {
    'aria-label': name,
    'aria-describedby': command.description ? descriptionId : undefined,
    'aria-keyshortcuts': command.shortcut,
    'data-toolbar-id': command.testId ?? command.id,
    'data-state': state.kind,
    'data-mode': command.mode,
    onKeyDown: (e: AriaKeyboardEvent) => {
      if (e.key === 'F1' && command.helpId && onHelp) {
        e.preventDefault()
        onHelp(command.helpId)
      } else {
        // React Aria stops every key an onKeyDown handler does not pass on: surfaces (a palette's Escape) need the rest.
        e.continuePropagation()
      }
    },
  }
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) ref.current?.focus()
  }

  let control: ReactNode
  const squareClass = cx(iconOnly && 'px-1.5 min-w-ctl-sm', className)
  if (interactive && (pressable || active !== undefined) && !command.primary) {
    control = (
      <ToggleButton
        ref={ref}
        size="sm"
        isSelected={!!active}
        onChange={() => {
          if (exclusive && active) return
          state.onInvoke()
        }}
        className={cx(marked && !iconOnly && 'pl-1.5', squareClass)}
        {...common}
        {...(marked ? {} : { icon: iconName })}
      >
        {marked && iconNode}
        {label}
      </ToggleButton>
    )
  } else if (interactive) {
    control = (
      <Button
        ref={ref}
        size="sm"
        variant={command.primary ? 'filled' : 'quiet'}
        isPending={busy}
        onPress={() => state.onInvoke()}
        className={cx(marked && iconName && !iconOnly && 'pl-1.5', squareClass)}
        {...common}
        {...(marked ? {} : { icon: iconName })}
      >
        {marked && iconNode}
        {label}
      </Button>
    )
  } else {
    // Planned and unavailable: aria-disabled and focusable; pressing opens the explanation and invokes nothing.
    control = (
      <Button
        ref={ref}
        size="sm"
        variant="quiet"
        aria-disabled="true"
        aria-pressed={state.kind === 'unavailable' ? (pressable ? !!state.active : state.active) : undefined}
        onPress={() => setOpen(true)}
        className={cx(iconName && !iconOnly && 'pl-1.5', squareClass, state.kind === 'planned' ? 'text-fg-3! data-[hovered]:text-fg-2!' : 'opacity-40')}
        {...common}
      >
        {iconNode}
        {label}
      </Button>
    )
  }

  const tip = tooltipText(command)
  return (
    <>
      {command.description && (
        <span id={descriptionId} className="sr-only">
          {command.description}
        </span>
      )}
      {tip ? (
        <TooltipTrigger delay={500} closeDelay={100}>
          {control}
          <Tooltip placement="bottom" shortcut={command.shortcut?.replace(/Control/g, 'Ctrl').replace(/\+/g, ' ')}>
            {tip}
          </Tooltip>
        </TooltipTrigger>
      ) : (
        control
      )}
      {!interactive && <CommandInfoPopover command={command} triggerRef={ref} isOpen={open} onOpenChange={close} onHelp={onHelp} />}
    </>
  )
}

// ---- Group menus, split buttons, the quick bar ------------------------------------------------

/** Children of a split command listed after it in a menu, labelled "Parent: child". */
function withSplitChildren(commands: CommandBarCommand[]): CommandBarCommand[] {
  return commands.flatMap((c) => [c, ...(c.split ?? []).map((child) => ({ ...child, label: `${c.label}: ${child.label}` }))])
}

/**
 * A button that opens a menu of commands (a group's secondary commands, a split button's children, an all-planned
 * group). Choosing a planned or unavailable command opens its explanation, never runs it.
 */
export function CommandMenuButton({
  commands,
  label,
  text,
  icon,
  header,
  className,
  placement = 'bottom start',
  onHelp,
}: {
  commands: CommandBarCommand[]
  /** Accessible name of the button. */
  label: string
  text?: ReactNode
  icon?: IconName
  /** Menu heading, e.g. the group's "2 of 5 available". */
  header?: string
  className?: string
  placement?: 'bottom start' | 'bottom end'
  onHelp?: (helpId: string) => void
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [info, setInfo] = useState<CommandBarCommand | null>(null)
  const items = withSplitChildren(commands)
  const act = (key: React.Key) => {
    const c = items.find((x) => x.id === key)
    if (c) activateCommand(c, setInfo)
  }
  const rows = items.map((c) => (
    <MenuItem
      key={c.id}
      id={c.id}
      icon={c.icon}
      textValue={commandAccessibleName(c)}
      aria-label={commandAccessibleName(c)}
      description={commandStateText(c) ?? (c.state.kind === 'ready' && c.state.active ? 'On' : undefined)}
    >
      {c.label}
    </MenuItem>
  ))
  return (
    <span ref={anchor} className="inline-flex">
      <MenuButton label={label} icon={icon} text={text} onAction={act} placement={placement} className={className}>
        {header ? <MenuSection title={header}>{rows}</MenuSection> : rows}
      </MenuButton>
      {info && <CommandInfoPopover command={info} triggerRef={anchor} isOpen onOpenChange={(o) => !o && setInfo(null)} onHelp={onHelp} />}
    </span>
  )
}

/**
 * A command with a drop-down of related commands beside it (extrude, then extrude cut). The main part and each child
 * have their own state; a planned child explains instead of running.
 */
export function SplitCommandButton({
  command,
  onHelp,
  exclusive,
  iconOnly,
}: {
  command: CommandBarCommand
  onHelp?: (helpId: string) => void
  exclusive?: boolean
  iconOnly?: boolean
}) {
  const children = command.split ?? []
  if (children.length === 0) return <CommandButton command={command} onHelp={onHelp} exclusive={exclusive} iconOnly={iconOnly} />
  return (
    <span className="inline-flex items-center" data-split={command.id}>
      <CommandButton command={{ ...command, split: undefined }} onHelp={onHelp} exclusive={exclusive} iconOnly={iconOnly} />
      <CommandMenuButton
        commands={children}
        label={`${command.label}: more options`}
        icon="chevron-down"
        className="w-5! min-w-5! px-0!"
        onHelp={onHelp}
      />
    </span>
  )
}

/** A group whose commands are all planned: one muted button with a count ("0 of 6") that lists them. */
function PlannedGroupButton({ group, onHelp }: { group: CommandBarGroup; onHelp?: (helpId: string) => void }) {
  const commands = group.commands.filter(isCommand)
  const count = `0 of ${commands.length}`
  return (
    <span className="inline-flex" data-group-button="planned" data-group={group.id}>
      <CommandMenuButton
        commands={commands}
        label={`${group.label}: ${count} available, planned`}
        icon={group.icon}
        text={
          <span className="inline-flex items-center gap-1.5">
            <span>{group.label}</span>
            <span className="font-mono text-ui-xs">{count}</span>
          </span>
        }
        className="text-fg-3! data-[hovered]:text-fg-2!"
        onHelp={onHelp}
      />
    </span>
  )
}

/**
 * The quick-access segment: a fixed set of icon-only commands that leads the bar. A Toolbar of its own, so it is one
 * tab stop; names, states and tooltips are the same as in the ribbon.
 */
export function QuickBar({ ariaLabel = 'Quick access', commands, onHelp, className }: { ariaLabel?: string; commands: CommandBarCommand[]; onHelp?: (helpId: string) => void; className?: string }) {
  return (
    <Toolbar aria-label={ariaLabel} className={cx('flex-none px-2 py-1', className)}>
      {commands.map((c) => (
        <SplitCommandButton key={c.id} command={c} onHelp={onHelp} iconOnly />
      ))}
    </Toolbar>
  )
}

// ---- Entries and groups ---------------------------------------------------------------------------

export function EntryView({ entry, onHelp, exclusive }: { entry: CommandBarEntry; onHelp?: (helpId: string) => void; exclusive?: boolean }) {
  switch (entry.type) {
    case 'separator':
      return <ToolbarSeparator />
    case 'text':
      return <span className={cx('px-2 text-ui-sm', entry.tone === 'warning' ? 'text-warning' : 'text-fg-3')}>{entry.text}</span>
    case 'select':
      return (
        <Select
          ariaLabel={entry.label}
          size="sm"
          value={entry.value}
          isDisabled={entry.isDisabled}
          onChange={entry.onChange}
          options={entry.options.map((o) => ({ id: o.value, label: o.label }))}
        />
      )
    case 'number':
      return (
        <NumberField
          ariaLabel={entry.label}
          size="sm"
          unit={entry.unit}
          value={entry.value}
          minValue={entry.min}
          maxValue={entry.max}
          step={entry.step}
          isDisabled={entry.isDisabled}
          onChange={entry.onChange}
        />
      )
    default:
      return <SplitCommandButton command={entry} onHelp={onHelp} exclusive={exclusive} />
  }
}

function GroupView({ group, layout, onHelp }: { group: CommandBarGroup; layout: CommandBarLayout; onHelp?: (helpId: string) => void }) {
  if (isAllPlanned(group)) return <PlannedGroupButton group={group} onHelp={onHelp} />
  const entries = group.commands
  const menuWanted = layout !== 'desktop' && group.label !== ''
  const isPrimary = (c: CommandBarCommand) => c.primary || c.priority === 'primary'
  const inMenu = menuWanted
    ? entries.filter(isCommand).filter((c) => (layout === 'phone' ? !isPrimary(c) : c.priority === 'secondary' && !c.primary))
    : []
  const menuIds = new Set(inMenu.map((c) => c.id))
  const visible = entries.filter((e) => !(isCommand(e) && menuIds.has(e.id)))
  const counts = groupCountText(group)
  const description = [group.exclusive ? 'Choose one' : undefined, counts].filter(Boolean).join('. ') || undefined
  const content = (
    <>
      {visible.map((e) => (
        <EntryView key={e.id} entry={e} onHelp={onHelp} exclusive={group.exclusive} />
      ))}
      {inMenu.length > 0 && (
        <CommandMenuButton
          commands={inMenu}
          label={layout === 'phone' ? group.label : `${group.label}: more commands`}
          icon={layout === 'phone' ? group.icon : undefined}
          text={layout === 'phone' ? group.label : undefined}
          header={counts}
          onHelp={onHelp}
        />
      )}
    </>
  )
  return group.label === '' ? (
    content
  ) : (
    <ToolbarGroup label={group.label} description={description}>
      {content}
    </ToolbarGroup>
  )
}

function TabToolbar({ ariaLabel, tab, layout, onHelp }: { ariaLabel: string; tab: CommandBarTab; layout: CommandBarLayout; onHelp?: (helpId: string) => void }) {
  return (
    <Toolbar aria-label={ariaLabel} className="flex-wrap px-2 py-1">
      {tab.groups.map((g, i) => (
        <span key={g.id} className="contents">
          {i > 0 && g.label !== '' && <ToolbarSeparator />}
          <GroupView group={g} layout={layout} onHelp={onHelp} />
        </span>
      ))}
    </Toolbar>
  )
}

const QUICK_WIDTH = 34

/**
 * The capability-aware toolbar. One tab shows no tab strip; several tabs use Tabs (arrow keys) with the tabs that do
 * not fit in a "More tabs" menu, and a phone shows them as a Select. Each tab is a Toolbar of labelled groups; a
 * `quick` segment leads the bar.
 */
export function CommandBar({ ariaLabel, tabs, quick, layout, compact, onHelp, className }: CommandBarProps) {
  const root = useRef<HTMLDivElement>(null)
  const { layout: mode, width } = useBarMetrics(root, layout ?? (compact ? 'tablet' : undefined))
  const [selected, setSelected] = useState(tabs[0]?.id ?? '')
  const tab = tabs.find((t) => t.id === selected) ?? tabs[0]
  useEffect(() => {
    if (tab && tab.id !== selected) setSelected(tab.id)
  }, [tab, selected])
  if (!tab) return null
  const quickWidth = quick && quick.length > 0 ? quick.length * QUICK_WIDTH + 16 : 0
  const { visible, overflow } = fitTabs(tabs, tab.id, width - quickWidth)

  return (
    <div ref={root} className={cx('ws-command-bar flex min-w-0 border-b border-line bg-surface', className)}>
      {quick && quick.length > 0 && (
        <>
          <QuickBar commands={quick} onHelp={onHelp} className="self-start" />
          <ToolbarSeparator />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {tabs.length <= 1 ? (
          <TabToolbar ariaLabel={ariaLabel} tab={tab} layout={mode} onHelp={onHelp} />
        ) : mode === 'phone' ? (
          <>
            <div className="px-2 pt-1">
              <Select ariaLabel={`${ariaLabel} section`} size="sm" value={tab.id} onChange={setSelected} options={tabs.map((t) => ({ id: t.id, label: t.label }))} />
            </div>
            <TabToolbar ariaLabel={ariaLabel} tab={tab} layout={mode} onHelp={onHelp} />
          </>
        ) : (
          <Tabs selectedKey={tab.id} onSelectionChange={(k) => setSelected(String(k))}>
            <div className="flex items-center border-b border-line px-1">
              <TabList aria-label={`${ariaLabel} sections`} className="min-w-0 flex-1">
                {visible.map((t) => (
                  <Tab key={t.id} id={t.id}>
                    {t.label}
                  </Tab>
                ))}
              </TabList>
              {overflow.length > 0 && (
                <MenuButton label="More tabs" text="More tabs" onAction={(k) => setSelected(String(k))} placement="bottom end">
                  {overflow.map((t) => (
                    <MenuItem key={t.id} id={t.id}>
                      {t.label}
                    </MenuItem>
                  ))}
                </MenuButton>
              )}
            </div>
            {tabs.map((t) => (
              <TabPanel key={t.id} id={t.id}>
                <TabToolbar ariaLabel={ariaLabel} tab={t} layout={mode} onHelp={onHelp} />
              </TabPanel>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  )
}
