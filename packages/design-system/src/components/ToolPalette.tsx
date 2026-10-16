import { useState } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { Icon } from '../icons/AppIcon'
import type { IconName } from '../icons/names'
import { Button } from './Button'
import { SplitCommandButton, type CommandBarCommand, type CommandBarLayout } from './CommandBar'
import { Toolbar } from './Collections'
import { CommandRow, SheetHeading, useViewportLayout } from './commandSurfaces'
import { cx } from './cx'
import { Sheet } from './Overlays'

/*
 * ToolPalette: a vertical Toolbar of tool groups (capability-registry.md, Amendment CT-2c). Groups collapse; a tool in
 * `mode: 'tool'` stays armed (aria-pressed) until it is used or Escape disarms it. On a phone the palette collapses to
 * an "Add" button that opens a sheet. A planned tool is listed, muted and explained, and can never be armed.
 *
 * Arming is the host's state: the palette shows `state.active`, calls `onInvoke` to arm, and calls `onDisarm(id)` when
 * Escape is pressed while the palette has focus (the host also binds Escape on its canvas).
 */

export interface ToolPaletteGroup {
  id: string
  label: string
  icon?: IconName
  /** Start collapsed. */
  collapsed?: boolean
  commands: CommandBarCommand[]
}

export interface ToolPaletteProps {
  ariaLabel: string
  groups: ToolPaletteGroup[]
  /** Forced layout; default: the viewport. A phone shows the "Add" button and sheet. */
  layout?: CommandBarLayout
  /** Escape in the palette: disarm the armed tool. */
  onDisarm?: (commandId: string) => void
  onHelp?: (helpId: string) => void
  /** Text of the phone button. Default "Add". */
  addLabel?: string
  className?: string
}

/** The armed tools (a tool command that is pressed). */
export function armedTools(groups: ToolPaletteGroup[]): CommandBarCommand[] {
  return groups.flatMap((g) => g.commands).filter((c) => c.mode === 'tool' && (c.state.kind === 'ready' || c.state.kind === 'partial') && c.state.active)
}

function PaletteGroup({ group, onHelp }: { group: ToolPaletteGroup; onHelp?: (helpId: string) => void }) {
  const [collapsed, setCollapsed] = useState(!!group.collapsed)
  const panel = `${group.id}-tools`
  const armed = group.commands.some((c) => c.mode === 'tool' && (c.state.kind === 'ready' || c.state.kind === 'partial') && c.state.active)
  return (
    <div role="group" aria-label={group.label} data-palette-group={group.id} className="flex flex-col">
      <AriaButton
        aria-expanded={!collapsed}
        aria-controls={panel}
        onPress={() => setCollapsed((v) => !v)}
        className={cx(
          'flex h-ctl-sm min-h-touch w-full cursor-pointer items-center gap-1.5 rounded-control px-1.5 text-left text-ui-xs font-medium text-fg-2 outline-none',
          'data-[hovered]:bg-hover data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus',
        )}
      >
        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={16} className="flex-none" />
        {group.icon && <Icon name={group.icon} size={16} className="flex-none" />}
        <span className="min-w-0 flex-1 truncate">{group.label}</span>
        {collapsed && armed && <span className="text-accent">armed</span>}
      </AriaButton>
      {!collapsed && (
        <div id={panel} className="flex flex-col gap-0.5 pb-1 pl-2">
          {group.commands.map((c) => (
            <SplitCommandButton key={c.id} command={c} onHelp={onHelp} />
          ))}
        </div>
      )}
    </div>
  )
}

function DesktopPalette({ ariaLabel, groups, onDisarm, onHelp, className }: Pick<ToolPaletteProps, 'ariaLabel' | 'groups' | 'onDisarm' | 'onHelp' | 'className'>) {
  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        const armed = armedTools(groups)[0]
        if (armed && onDisarm) {
          e.preventDefault()
          onDisarm(armed.id)
        }
      }}
    >
      <Toolbar
        aria-label={ariaLabel}
        orientation="vertical"
        className={cx('ws-tool-palette w-48 flex-col items-stretch gap-1 border-r border-line bg-surface p-1 [&_[data-toolbar-id]]:w-full [&_[data-toolbar-id]]:justify-start', className)}
      >
        {groups.map((g) => (
          <PaletteGroup key={g.id} group={g} onHelp={onHelp} />
        ))}
      </Toolbar>
    </div>
  )
}

function PhonePalette({ ariaLabel, groups, addLabel, className }: { ariaLabel: string; groups: ToolPaletteGroup[]; addLabel: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const armed = armedTools(groups)[0]
  const close = () => setOpen(false)
  return (
    <>
      <Button
        variant={armed ? 'tonal' : 'quiet'}
        size="sm"
        icon="add"
        aria-label={armed ? `${addLabel}: ${armed.label} armed` : addLabel}
        aria-haspopup="dialog"
        onPress={() => setOpen(true)}
        className={className}
      >
        {armed ? armed.label : addLabel}
      </Button>
      <Sheet title={addLabel} isOpen={open} onOpenChange={setOpen}>
        <div className="min-h-0 flex-1 overflow-auto pb-4" aria-label={ariaLabel} data-palette-sheet>
          {groups.map((g) => (
            <section key={g.id} aria-label={g.label}>
              <SheetHeading>{g.label}</SheetHeading>
              {g.commands.map((c) => (
                <CommandRow key={c.id} command={c} checked={c.mode === 'tool' ? c.state.kind === 'ready' || c.state.kind === 'partial' ? !!c.state.active : false : undefined} onDone={close} />
              ))}
            </section>
          ))}
        </div>
      </Sheet>
    </>
  )
}

/** The tool palette. Desktop and tablet: a vertical toolbar of collapsible groups. Phone: an "Add" button and sheet. */
export function ToolPalette({ ariaLabel, groups, layout, onDisarm, onHelp, addLabel = 'Add', className }: ToolPaletteProps) {
  const mode = useViewportLayout(layout)
  if (mode === 'phone') return <PhonePalette ariaLabel={ariaLabel} groups={groups} addLabel={addLabel} className={className} />
  return <DesktopPalette ariaLabel={ariaLabel} groups={groups} onDisarm={onDisarm} onHelp={onHelp} className={className} />
}

