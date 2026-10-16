import { useEffect, useState, type ReactNode } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { Icon } from '../icons/AppIcon'
import { commandAccessibleName, type CommandBarCommand, type CommandBarLayout } from './CommandBar'
import { activateCommand, commandStateText } from './commandCore'
import { cx } from './cx'

/*
 * Pieces shared by the command surfaces that render on touch-sized screens (the phone menu sheet, the "Add" sheet, the
 * context bottom sheet): a viewport-driven layout and a list row that explains a planned command in place.
 */

const TABLET_MAX = 840
const PHONE_MAX = 520

/** The layout for the viewport width (phone below 520 px, tablet below 840 px). A host that knows better passes `layout`. */
export function useViewportLayout(forced?: CommandBarLayout): CommandBarLayout {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (forced) return
    const update = () => setWidth(window.innerWidth)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [forced])
  if (forced) return forced
  return width === 0 || width >= TABLET_MAX ? 'desktop' : width < PHONE_MAX ? 'phone' : 'tablet'
}

/** What a planned or unavailable command is, inline (sheets cannot stack a popover): description, status and backlog. */
export function CommandExplanation({ command }: { command: CommandBarCommand }) {
  const { state } = command
  if (state.kind === 'ready' || state.kind === 'partial') return null
  return (
    <div role="note" className="mx-4 mb-2 flex flex-col gap-1 rounded-control bg-surface-2 px-3 py-2 text-ui-sm" data-explanation={state.kind}>
      <span className="inline-flex items-center gap-1.5 text-ui-xs text-fg-3">
        <Icon name={state.kind === 'planned' ? 'info' : 'warning'} size={16} />
        {state.kind === 'planned' ? state.info.status : 'Unavailable'}
      </span>
      {state.kind === 'unavailable' && <span className="text-fg">{state.reason}</span>}
      {command.description && <span className="text-fg-2">{command.description}</span>}
      {state.kind === 'planned' && state.info.backlog.length > 0 && (
        <span className="text-ui-xs text-fg-3">
          Tracked in <span className="font-mono">{state.info.backlog.join(', ')}</span>
        </span>
      )}
    </div>
  )
}

/**
 * A full-width list row (at least 40 px high) for a command. Pressing a ready or partial command invokes it and then
 * calls `onDone`; pressing a planned or unavailable one toggles its explanation under the row and invokes nothing.
 */
export function CommandRow({
  command,
  detail,
  checked,
  onDone,
}: {
  command: CommandBarCommand
  /** Small text under the label (the menu path in search results). */
  detail?: string
  /** A checked menu item: shown with a check mark and announced as pressed. */
  checked?: boolean
  onDone?: () => void
}) {
  const [explain, setExplain] = useState(false)
  const { state } = command
  const interactive = state.kind === 'ready' || state.kind === 'partial'
  const pressable = command.mode === 'toggle' || command.mode === 'tool' || checked !== undefined
  const pressed = checked ?? (interactive || state.kind === 'unavailable' ? !!state.active : false)
  const text = commandStateText(command)
  const name = commandAccessibleName(command)
  return (
    <div data-command-row={command.id} data-state={state.kind}>
      <AriaButton
        aria-label={name}
        aria-disabled={interactive ? undefined : 'true'}
        aria-expanded={interactive ? undefined : explain}
        aria-pressed={pressable && state.kind !== 'planned' ? pressed : undefined}
        aria-keyshortcuts={command.shortcut}
        data-toolbar-id={command.testId ?? command.id}
        onPress={() => {
          if (activateCommand(command, () => setExplain((v) => !v))) onDone?.()
        }}
        className={cx(
          'flex min-h-10 w-full cursor-pointer items-center gap-3 px-4 text-left text-ui outline-none',
          'data-[hovered]:bg-hover data-[pressed]:bg-pressed data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
          state.kind === 'planned' ? 'text-fg-3' : state.kind === 'unavailable' ? 'text-fg-2 opacity-60' : 'text-fg',
        )}
      >
        <Icon name={command.icon ?? 'command'} size={16} className="flex-none" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{command.label}</span>
          {detail && <span className="truncate text-ui-xs text-fg-3">{detail}</span>}
        </span>
        {text && <span className="flex-none text-ui-xs text-fg-3">{state.kind === 'unavailable' ? 'Unavailable' : text}</span>}
        {pressed && interactive && <Icon name="check" size={16} className="flex-none text-accent" />}
      </AriaButton>
      {explain && !interactive && <CommandExplanation command={command} />}
    </div>
  )
}

/** A heading over a group of rows in a sheet. */
export function SheetHeading({ children }: { children: ReactNode }) {
  return <h3 className="m-0 px-4 pb-1 pt-3 text-ui-xs font-medium tracking-wide text-fg-3">{children}</h3>
}
