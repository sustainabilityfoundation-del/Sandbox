import { useState, type ReactNode } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { useConversation } from '../assistant/conversation'
import { DEFAULT_LAYOUTS, useWorkspaceStore, type Layout } from '../platform/store'
import { openInSeparateWindow, openOnAnotherScreen, restoreWorkspaceWindows } from '../session/windows'
import { isWindowOpen, screenPlacementSupported } from '../session/windowSession'
import { usePreferences, type DensityPreference, type ThemePreference } from '@ews/design-system/preferences'
import { getTool, getTools } from '../platform/registry'
import {
  Button,
  Dialog,
  Drawer,
  Icon,
  IconButton,
  MenuButton,
  MenuItem,
  MenuSection,
  PopoverButton,
  SegmentedControl,
  Select,
  StatusBadge,
  cx,
  useToasts,
  type IconName,
} from '@ews/design-system'
import type { ViewportMode } from './layout/viewport'

// ---- Side panel ----------------------------------------------------------------------------

/**
 * Product tree and inspector container: a grid column on desktop, a modal
 * drawer (focus contained, Escape closes, focus returns) on tablets and phones.
 */
export function SidePanel({
  side,
  title,
  open,
  mode,
  onClose,
  actions,
  children,
}: {
  side: 'left' | 'right'
  title: string
  open: boolean
  mode: ViewportMode
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  if (mode !== 'desktop') {
    return (
      <Drawer side={side} title={title} isOpen={open} onOpenChange={(o) => !o && onClose()} actions={actions} fullWidth={mode === 'phone'}>
        {children}
      </Drawer>
    )
  }
  return (
    <aside className={cx('ws-side', `ws-side-${side}`, open && 'is-open')} aria-label={title} aria-hidden={!open} inert={!open}>
      <div className="ws-pane-title">
        <span>{title}</span>
        <span className="flex items-center gap-0.5">
          {actions}
          <IconButton label={`Hide ${title.toLowerCase()}`} icon={side === 'left' ? 'panel-left' : 'panel-right'} size="sm" onPress={onClose} />
        </span>
      </div>
      <div className="ws-side-body">{children}</div>
    </aside>
  )
}

// ---- Phone navigation ---------------------------------------------------------------------------

type Destination = 'tree' | 'tools' | 'inspector' | 'activity' | 'assistant'

/** Bottom navigation on phones (M3 navigation bar): one destination open at a time. */
export function MobileNav({ onOpenLauncher }: { onOpenLauncher: () => void }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const current: Destination | null = layout.treeOpen ? 'tree' : layout.inspectorOpen ? 'inspector' : layout.activityOpen ? layout.dockTab : null

  const go = (d: Destination) => {
    if (d === 'tools') return onOpenLauncher()
    const closeAll: Partial<Layout> = { treeOpen: false, inspectorOpen: false, activityOpen: false }
    if (current === d) return setLayout(closeAll)
    if (d === 'tree') setLayout({ ...closeAll, treeOpen: true })
    else if (d === 'inspector') setLayout({ ...closeAll, inspectorOpen: true })
    else setLayout({ ...closeAll, activityOpen: true, dockTab: d })
  }

  const items: { id: Destination; label: string; icon: IconName; badge?: number }[] = [
    { id: 'tree', label: 'Tree', icon: 'tree' },
    { id: 'tools', label: 'Tools', icon: 'tools' },
    { id: 'inspector', label: 'Inspect', icon: 'info' },
    { id: 'activity', label: 'Activity', icon: 'history' },
    { id: 'assistant', label: 'ChatGPT', icon: 'assistant', badge: pending },
  ]

  return (
    <nav className="ws-mobile-nav" aria-label="Workspace navigation">
      {items.map((item) => {
        const selected = current === item.id
        return (
          <AriaButton
            key={item.id}
            aria-pressed={item.id === 'tools' ? undefined : selected}
            onPress={() => go(item.id)}
            data-nav={item.id}
            className="ws-mobile-nav-item group outline-none data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-focus"
          >
            <span className={cx('relative grid h-8 w-16 place-items-center rounded-full transition-colors duration-[var(--ws-motion-medium)] ease-standard', selected ? 'bg-selected text-selected-fg' : 'group-data-[hovered]:bg-hover')}>
              <Icon name={item.icon} size={22} />
              {!!item.badge && (
                <span className="ws-nav-badge" aria-label={`${item.badge} change previews awaiting review`}>
                  {item.badge}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </AriaButton>
        )
      })}
    </nav>
  )
}

// ---- Display settings ------------------------------------------------------------------------

const PRESETS = {
  tree: { Narrow: 210, Medium: 248, Wide: 340 },
  inspector: { Narrow: 260, Medium: 320, Wide: 440 },
  dock: { Small: 180, Medium: 280, Large: 420 },
} as const

function nearest<K extends keyof typeof PRESETS>(key: K, value: number): string {
  const entries = Object.entries(PRESETS[key]) as [string, number][]
  return entries.reduce((best, cur) => (Math.abs(cur[1] - value) < Math.abs(best[1] - value) ? cur : best))[0]
}

function PresetRow<K extends keyof typeof PRESETS>({ label, preset, value, onChange }: { label: string; preset: K; value: number; onChange: (v: number) => void }) {
  const options = Object.keys(PRESETS[preset]).map((o) => ({ value: o, label: o }))
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ui-sm">{label}</span>
      <SegmentedControl
        label={`${label} size`}
        size="sm"
        value={nearest(preset, value)}
        onChange={(name) => onChange((PRESETS[preset] as Record<string, number>)[name])}
        options={options}
      />
    </div>
  )
}

/** Theme, density and layout. Layout presets are the non-drag alternative for resizing. */
export function DisplaySettings({ mode }: { mode: ViewportMode }) {
  const theme = usePreferences((s) => s.theme)
  const density = usePreferences((s) => s.density)
  const setTheme = usePreferences((s) => s.setTheme)
  const setDensity = usePreferences((s) => s.setDensity)
  const layout = useWorkspaceStore((s) => s.layout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const setLayout = useWorkspaceStore((s) => s.setLayout)

  return (
    <PopoverButton label="Display and layout" icon="display" title="Display and layout" triggerClassName="text-header-fg">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <h3 className="m-0 text-ui-xs font-medium text-fg-3">Theme</h3>
          <SegmentedControl<ThemePreference>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light', icon: 'theme-light' },
              { value: 'dark', label: 'Dark', icon: 'theme-dark' },
            ]}
          />
        </section>
        <section className="flex flex-col gap-1.5">
          <h3 className="m-0 text-ui-xs font-medium text-fg-3">Density</h3>
          <SegmentedControl<DensityPreference>
            label="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: 'comfortable', label: 'Comfortable', icon: 'density-comfortable' },
              { value: 'compact', label: 'Compact', icon: 'density-compact' },
            ]}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-ui-xs font-medium text-fg-3">Layout ({layoutClass === 'spacious' ? 'wide screens' : 'narrow screens'})</h3>
          {mode === 'desktop' && (
            <>
              <PresetRow label="Product tree" preset="tree" value={layout.treeWidth} onChange={(treeWidth) => setLayout({ treeOpen: true, treeWidth })} />
              <PresetRow label="Inspector" preset="inspector" value={layout.inspectorWidth} onChange={(inspectorWidth) => setLayout({ inspectorOpen: true, inspectorWidth })} />
            </>
          )}
          {mode !== 'phone' && (
            <PresetRow label="Bottom panel" preset="dock" value={layout.dockHeight} onChange={(dockHeight) => setLayout({ activityOpen: true, dockHeight })} />
          )}
          {mode === 'desktop' && (
            <Select
              label="Second view (split)"
              value={layout.split?.toolId ?? 'off'}
              onChange={(v) => setLayout({ split: v === 'off' ? null : { toolId: v, ratio: layout.split?.ratio ?? 0.5 } })}
              options={[{ id: 'off', label: 'Off' }, ...getTools().filter((t) => !t.singleInstance).map((t) => ({ id: t.id, label: t.name }))]}
            />
          )}
          <Button size="sm" variant="text" icon="reset" onPress={() => setLayout(DEFAULT_LAYOUTS[layoutClass])} className="self-start">
            Reset layout
          </Button>
        </section>
      </div>
    </PopoverButton>
  )
}

// ---- Windows menu ---------------------------------------------------------------------------

/** Commands for separate windows; remembered windows are managed in a dialog. */
export function WindowsMenu() {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const detachedViews = useWorkspaceStore((s) => s.detachedViews)
  const forget = useWorkspaceStore((s) => s.forgetDetached)
  const push = useToasts((s) => s.push)
  const [manageOpen, setManageOpen] = useState(false)
  const tool = getTool(activeToolId)
  const placement = screenPlacementSupported()

  const run = (key: React.Key) => {
    switch (key) {
      case 'tool':
        if (tool) openInSeparateWindow('tool', tool.id)
        break
      case 'inspector':
        openInSeparateWindow('inspector')
        break
      case 'assistant':
        openInSeparateWindow('assistant')
        break
      case 'tool-screen':
        if (tool) void openOnAnotherScreen('tool', tool.id)
        break
      case 'restore': {
        const result = restoreWorkspaceWindows()
        push({
          tone: result.blocked ? 'warning' : 'success',
          title: 'Restore workspace windows',
          body: `${result.opened} opened, ${result.alreadyOpen} already open${result.blocked ? `, ${result.blocked} blocked by the browser (use the links)` : ''}.`,
        })
        break
      }
      case 'manage':
        setManageOpen(true)
        break
    }
  }

  return (
    <>
      <MenuButton label="Windows" icon="windows" onAction={run} className="text-header-fg">
        <MenuSection title="Open in separate window">
          {tool && (
            <MenuItem id="tool" icon="open-window">
              {tool.name}
            </MenuItem>
          )}
          <MenuItem id="inspector" icon="open-window">
            Inspector
          </MenuItem>
          <MenuItem id="assistant" icon="open-window">
            ChatGPT
          </MenuItem>
          {tool && (
            <MenuItem
              id="tool-screen"
              icon="windows"
              isDisabled={!placement}
              description={placement ? 'Asks for permission to use your screens' : 'Not available in this browser; drag the window instead'}
            >
              {tool.name} on another screen…
            </MenuItem>
          )}
        </MenuSection>
        <MenuSection title={`Remembered windows (${detachedViews.length})`}>
          <MenuItem id="restore" icon="reset" isDisabled={detachedViews.length === 0}>
            Restore workspace windows
          </MenuItem>
          <MenuItem id="manage" icon="settings" isDisabled={detachedViews.length === 0}>
            Manage remembered windows…
          </MenuItem>
        </MenuSection>
      </MenuButton>
      <Dialog title="Remembered windows" isOpen={manageOpen} onOpenChange={setManageOpen} size="sm">
        {detachedViews.length === 0 ? (
          <p className="m-0 text-ui-sm text-fg-2">Windows you open are remembered here so you can restore them later.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {detachedViews.map((d) => {
              const open = isWindowOpen(d.windowId)
              return (
                <li key={d.windowId} className="flex items-center gap-3 text-ui-sm">
                  <span className="min-w-0 flex-1 truncate">{d.title}</span>
                  <StatusBadge status={open ? 'current' : 'not-assessed'} label={open ? 'Open' : 'Closed'} />
                  <Button size="sm" variant="text" onPress={() => forget(d.windowId)} aria-label={`Forget ${d.title} window`}>
                    Forget
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Dialog>
    </>
  )
}
