import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Dialog as AriaDialog, Heading, Popover as AriaPopover, TooltipTrigger } from 'react-aria-components'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Button, ToggleButton, Tooltip } from './Button'
import { Tab, TabList, TabPanel, Tabs, Toolbar, ToolbarGroup, ToolbarSeparator } from './Collections'
import { Select } from './Fields'
import { MenuButton, MenuItem } from './Overlays'
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
  | { kind: 'unavailable'; reason: string; onInvoke?: never }
  | { kind: 'planned'; info: { status: string; backlog: string[]; helpId?: string }; onInvoke?: never }

export interface CommandBarCommand {
  type?: 'command'
  id: string
  label: string
  icon?: IconName
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
export type CommandBarEntry = CommandBarCommand | CommandBarSelect | CommandBarText | CommandBarSeparator

export interface CommandBarGroup {
  id: string
  /** Accessible group name. An empty label renders the entries flat, without a group wrapper (legacy toolbars). */
  label: string
  icon?: IconName
  commands: CommandBarEntry[]
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

function useBarLayout(ref: RefObject<HTMLElement | null>, forced: CommandBarLayout | undefined): CommandBarLayout {
  const [measured, setMeasured] = useState<CommandBarLayout>('desktop')
  useEffect(() => {
    const el = ref.current
    if (!el || forced || typeof ResizeObserver === 'undefined') return
    const update = () => {
      const w = el.getBoundingClientRect().width
      setMeasured(w === 0 ? 'desktop' : w < PHONE_MAX ? 'phone' : w < TABLET_MAX ? 'tablet' : 'desktop')
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, forced])
  return forced ?? measured
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

function CommandButton({ command, onHelp }: { command: CommandBarCommand; onHelp?: (helpId: string) => void }) {
  const { state } = command
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const descriptionId = `cmd-desc-${command.id}`
  const interactive = state.kind === 'ready' || state.kind === 'partial'
  const marked = state.kind === 'partial' || state.kind === 'planned'
  const name = state.kind === 'ready' ? undefined : commandAccessibleName(command)
  const active = interactive ? state.active : undefined
  const busy = interactive ? state.busy : undefined
  const label = <span className={cx(command.illustrative && 'underline decoration-dotted underline-offset-4')}>{command.label}</span>
  const iconNode = command.icon ? (
    <span className="relative inline-flex">
      <Icon name={command.icon} size={16} />
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
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'F1' && command.helpId && onHelp) {
        e.preventDefault()
        onHelp(command.helpId)
      }
    },
  }
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) ref.current?.focus()
  }

  let control: ReactNode
  if (interactive && active !== undefined && !command.primary) {
    control = (
      <ToggleButton ref={ref} size="sm" isSelected={active} onChange={() => state.onInvoke()} className={cx(marked && 'pl-1.5')} {...common} {...(marked ? {} : { icon: command.icon })}>
        {marked && iconNode}
        {label}
      </ToggleButton>
    )
  } else if (interactive) {
    control = (
      <Button ref={ref} size="sm" variant={command.primary ? 'filled' : 'quiet'} isPending={busy} onPress={() => state.onInvoke()} className={cx(marked && command.icon && 'pl-1.5')} {...common} {...(marked ? {} : { icon: command.icon })}>
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
        onPress={() => setOpen(true)}
        className={cx(command.icon && 'pl-1.5', state.kind === 'planned' ? 'text-fg-3! data-[hovered]:text-fg-2!' : 'opacity-40')}
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

// ---- Entries and group menus --------------------------------------------------------------------

function EntryView({ entry, onHelp }: { entry: CommandBarEntry; onHelp?: (helpId: string) => void }) {
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
    default:
      return <CommandButton command={entry} onHelp={onHelp} />
  }
}

/** A group's commands in a menu. Choosing a planned or unavailable command opens its explanation, never runs it. */
function GroupMenu({ group, commands, label, onHelp }: { group: CommandBarGroup; commands: CommandBarCommand[]; label: string; onHelp?: (helpId: string) => void }) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [info, setInfo] = useState<CommandBarCommand | null>(null)
  const act = (key: React.Key) => {
    const c = commands.find((x) => x.id === key)
    if (!c) return
    if (c.state.kind === 'ready' || c.state.kind === 'partial') c.state.onInvoke()
    else setInfo(c)
  }
  return (
    <span ref={anchor} className="inline-flex">
      <MenuButton label={label} icon={label === group.label ? group.icon : undefined} text={label === group.label ? group.label : undefined} onAction={act} placement="bottom start">
        {commands.map((c) => (
          <MenuItem
            key={c.id}
            id={c.id}
            icon={c.icon}
            textValue={commandAccessibleName(c)}
            aria-label={commandAccessibleName(c)}
            description={c.state.kind === 'planned' ? 'Planned' : c.state.kind === 'partial' ? `Partial: ${c.state.limitation}` : c.state.kind === 'unavailable' ? c.state.reason : undefined}
          >
            {c.label}
          </MenuItem>
        ))}
      </MenuButton>
      {info && <CommandInfoPopover command={info} triggerRef={anchor} isOpen onOpenChange={(o) => !o && setInfo(null)} onHelp={onHelp} />}
    </span>
  )
}

function isCommand(e: CommandBarEntry): e is CommandBarCommand {
  return e.type === undefined || e.type === 'command'
}

function GroupView({ group, layout, onHelp }: { group: CommandBarGroup; layout: CommandBarLayout; onHelp?: (helpId: string) => void }) {
  const entries = group.commands
  const menuWanted = layout !== 'desktop' && group.label !== ''
  const isPrimary = (c: CommandBarCommand) => c.primary || c.priority === 'primary'
  const inMenu = menuWanted
    ? entries.filter(isCommand).filter((c) => (layout === 'phone' ? !isPrimary(c) : c.priority === 'secondary' && !c.primary))
    : []
  const menuIds = new Set(inMenu.map((c) => c.id))
  const visible = entries.filter((e) => !(isCommand(e) && menuIds.has(e.id)))
  const content = (
    <>
      {visible.map((e) => (
        <EntryView key={e.id} entry={e} onHelp={onHelp} />
      ))}
      {inMenu.length > 0 && (
        <GroupMenu
          group={group}
          commands={inMenu}
          label={layout === 'phone' ? group.label : `${group.label}: more commands`}
          onHelp={onHelp}
        />
      )}
    </>
  )
  return group.label === '' ? content : <ToolbarGroup label={group.label}>{content}</ToolbarGroup>
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

/**
 * The capability-aware toolbar. One tab shows no tab strip; several tabs use Tabs (arrow keys), and a phone shows
 * them as a Select. Each tab is a Toolbar of labelled groups.
 */
export function CommandBar({ ariaLabel, tabs, layout, compact, onHelp, className }: CommandBarProps) {
  const root = useRef<HTMLDivElement>(null)
  const mode = useBarLayout(root, layout ?? (compact ? 'tablet' : undefined))
  const [selected, setSelected] = useState(tabs[0]?.id ?? '')
  const tab = tabs.find((t) => t.id === selected) ?? tabs[0]
  useEffect(() => {
    if (tab && tab.id !== selected) setSelected(tab.id)
  }, [tab, selected])
  if (!tab) return null

  return (
    <div ref={root} className={cx('ws-command-bar flex min-w-0 flex-col border-b border-line bg-surface', className)}>
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
          <TabList aria-label={`${ariaLabel} sections`} className="border-b border-line px-1">
            {tabs.map((t) => (
              <Tab key={t.id} id={t.id}>
                {t.label}
              </Tab>
            ))}
          </TabList>
          {tabs.map((t) => (
            <TabPanel key={t.id} id={t.id}>
              <TabToolbar ariaLabel={ariaLabel} tab={t} layout={mode} onHelp={onHelp} />
            </TabPanel>
          ))}
        </Tabs>
      )}
    </div>
  )
}
