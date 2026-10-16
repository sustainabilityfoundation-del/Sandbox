import type { ReactNode } from 'react'
import type { IconName } from '../icons/names'
import type { CommandBarLayout } from './CommandBar'
import { IconButton } from './Button'
import { PanelHeader } from './Frame'
import { Drawer, Sheet } from './Overlays'
import { useViewportLayout } from './commandSurfaces'
import { cx } from './cx'

/*
 * DockPanel: a panel the tool or shell can open beside, under or over the canvas (browser, specification, properties,
 * diagnostics; capability-registry.md `panels`). It promotes the patterns the design system already has: PanelHeader
 * for the header, Drawer for the side panel on a tablet and Sheet on a phone. Desktop docks it inline.
 */

export type DockSide = 'start' | 'end' | 'bottom'
export type DockPanelRole = 'browser' | 'specification' | 'properties' | 'diagnostics' | 'other'

export interface DockPanelProps {
  title: string
  icon?: IconName
  side: DockSide
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  role?: DockPanelRole
  /** Forced layout; default: the viewport. Desktop docks inline, tablet uses a drawer, phone a sheet. */
  layout?: CommandBarLayout
  /** Header controls (IconButtons, MenuButtons) before the close button. */
  actions?: ReactNode
  children: ReactNode
  className?: string
}

const dockedClass: Record<DockSide, string> = {
  start: 'w-72 flex-none border-r border-line',
  end: 'w-80 flex-none border-l border-line',
  bottom: 'h-64 flex-none border-t border-line',
}

export function DockPanel({ title, icon, side, isOpen, onOpenChange, role = 'other', layout, actions, children, className }: DockPanelProps) {
  const mode = useViewportLayout(layout)
  if (mode === 'phone' || (mode === 'tablet' && side === 'bottom')) {
    return (
      <Sheet title={title} isOpen={isOpen} onOpenChange={onOpenChange}>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto" data-panel-role={role}>
          {children}
        </div>
      </Sheet>
    )
  }
  if (mode === 'tablet') {
    return (
      <Drawer side={side === 'start' ? 'left' : 'right'} title={title} isOpen={isOpen} onOpenChange={onOpenChange} actions={actions}>
        <div className="flex min-h-0 flex-1 flex-col" data-panel-role={role}>
          {children}
        </div>
      </Drawer>
    )
  }
  if (!isOpen) return null
  return (
    <aside aria-label={title} data-dock-panel={side} data-panel-role={role} className={cx('ws-dock-panel flex min-h-0 min-w-0 flex-col bg-surface', dockedClass[side], className)}>
      <PanelHeader
        title={title}
        icon={icon}
        actions={
          <>
            {actions}
            <IconButton label={`Close ${title.toLowerCase()}`} icon="close" size="sm" onPress={() => onOpenChange(false)} />
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
    </aside>
  )
}
