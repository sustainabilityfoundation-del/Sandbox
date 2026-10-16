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
  AppIcon,
  Dialog,
  Drawer,
  Icon,
  IconButton,
  MenuButton,
  MenuItem,
  MenuSection,
  PanelHeader,
  PopoverButton,
  SearchField,
  SegmentedControl,
  Select,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  ToggleIconButton,
  cx,
  useToasts,
  type IconName,
} from '@ews/design-system'
import type { ViewportMode } from './layout/viewport'
import { useExplorerFilter } from './layout/explorerFilter'
import {
  PRESETS as LAYOUT_PRESETS,
  PRESET_IDS,
  applyPreset,
  assistantOnRight,
  assistantVisibleRight,
  currentPreset,
  dockAssistant,
  hideRightArea,
  inspectorVisible,
  rightTabShown,
  showAssistant,
  showInspector,
} from './layout/presets'
import { AssistantPanel } from './assistant/AssistantPanel'
import { Inspector } from './Inspector'

// ---- Side panel ----------------------------------------------------------------------------

/**
 * Product tree and inspector container: a grid column on desktop, a modal
 * drawer (focus contained, Escape closes, focus returns) on tablets and phones.
 */
export function SidePanel({
  side,
  title,
  icon,
  open,
  mode,
  onClose,
  actions,
  toolbar,
  children,
}: {
  side: 'left' | 'right'
  title: string
  icon?: IconName
  open: boolean
  mode: ViewportMode
  onClose: () => void
  actions?: ReactNode
  /** Content under the header (a search filter). */
  toolbar?: ReactNode
  children: ReactNode
}) {
  if (mode !== 'desktop') {
    return (
      <Drawer side={side} title={title} isOpen={open} onOpenChange={(o) => !o && onClose()} actions={actions} fullWidth={mode === 'phone'}>
        {toolbar && <div className="ws-side-toolbar pt-2">{toolbar}</div>}
        {children}
      </Drawer>
    )
  }
  return (
    <aside className={cx('ws-side', `ws-side-${side}`, open && 'is-open')} aria-label={title} aria-hidden={!open} inert={!open}>
      <PanelHeader
        title={title}
        icon={icon}
        actions={
          <>
            {actions}
            <IconButton label={`Hide ${title.toLowerCase()}`} icon={side === 'left' ? 'panel-left' : 'panel-right'} size="sm" onPress={onClose} />
          </>
        }
      >
        {toolbar && <div className="ws-side-toolbar">{toolbar}</div>}
      </PanelHeader>
      <div className="ws-side-body">{children}</div>
    </aside>
  )
}

/** Search filter for the explorer (product tree or project explorer). */
export function ExplorerFilter({ label }: { label: string }) {
  const query = useExplorerFilter((s) => s.query)
  const setQuery = useExplorerFilter((s) => s.setQuery)
  return <SearchField label={label} placeholder="Search project…" value={query} onChange={setQuery} className="ws-explorer-filter" />
}

/** Panel toggles at the end of the location bar: explorer, inspector, assistant and canvas maximize. */
export function PanelToggles({ mode, layout }: { mode: ViewportMode; layout: Layout }) {
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const desktop = mode === 'desktop'
  const max = layout.canvasMaximized
  const right = assistantOnRight(layout, desktop)
  return (
    <div className="ws-pane-bar-actions" role="group" aria-label="Panels" data-help-id="platform.panels">
      <ToggleIconButton
        className="ws-panel-toggle"
        label="Explorer"
        icon="panel-left"
        size="sm"
        isSelected={layout.treeOpen && !max}
        onChange={() => setLayout(desktop ? { treeOpen: !(layout.treeOpen && !max), canvasMaximized: false } : { treeOpen: !layout.treeOpen, inspectorOpen: false })}
      />
      {/* The inspector and the assistant are two tabs of one right-hand panel: each button shows its tab, and pressing the one that is showing closes the panel. */}
      <ToggleIconButton
        className="ws-panel-toggle"
        label="Inspector"
        icon="panel-right"
        size="sm"
        isSelected={inspectorVisible(layout, desktop)}
        onChange={() => {
          if (inspectorVisible(layout, desktop)) hideRightArea()
          else if (desktop) showInspector()
          else setLayout({ inspectorOpen: !layout.inspectorOpen, treeOpen: false })
        }}
      />
      {right && (
        <ToggleIconButton
          className="ws-panel-toggle"
          label="AI Assistant"
          icon="assistant"
          size="sm"
          isSelected={assistantVisibleRight(layout, desktop)}
          onChange={() => (assistantVisibleRight(layout, desktop) ? hideRightArea() : showAssistant())}
        />
      )}
      {desktop && (
        <ToggleIconButton
          className="ws-panel-toggle"
          label={max ? 'Restore panels' : 'Maximize the canvas'}
          icon={max ? 'minimize' : 'maximize'}
          size="sm"
          isSelected={max}
          onChange={() => setLayout({ canvasMaximized: !max })}
        />
      )}
    </div>
  )
}

/**
 * The right-hand column (desktop, assistant docked right): Inspector and AI Assistant as two tabs sharing one width.
 * Both panels stay mounted, so the conversation, a previewed proposal, scroll positions and the inspector's pinned view
 * survive switching tabs; the inactive one is hidden (CSS), not unmounted. The tab is remembered with the window's
 * layout preferences (`Layout.rightTab`).
 */
export function RightPanel({ open }: { open: boolean }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const info = useConversation((s) => s.service?.info)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)
  const tab = rightTabShown(layout, true)
  return (
    <aside className={cx('ws-side ws-side-right ws-side-tabbed', open && 'is-open')} aria-label="Inspector and AI Assistant" aria-hidden={!open} inert={!open}>
      <Tabs selectedKey={tab} onSelectionChange={(key) => setLayout({ rightTab: key as Layout['rightTab'] })} className="ws-right-tabs-root">
        <div className="ws-panel-header ws-right-header">
          <TabList aria-label="Right-hand panel" className="ws-right-tablist">
            <Tab id="inspector" data-right-tab="inspector" className="ws-right-tab">
              <AppIcon name="tune" size={16} />
              Inspector
            </Tab>
            <Tab id="assistant" data-right-tab="assistant" className="ws-right-tab">
              <AppIcon name="assistant" size={16} />
              AI Assistant
              {info?.kind !== 'remote' && (
                <span className="ws-dock-demo" title={`${info?.name ?? 'Assistant'} (not connected to an AI model; connect in Settings → AI and reasoning)`}>
                  Demo
                </span>
              )}
              {pending > 0 && (
                <span className="ws-dock-count" title={`${pending} change preview(s) awaiting review`} aria-label={`${pending} awaiting review`}>
                  {pending}
                </span>
              )}
            </Tab>
          </TabList>
          <div className="ws-right-actions">
            {tab === 'assistant' && (
              <>
                <IconButton label="Dock the assistant at the bottom" icon="dock-bottom" size="sm" onPress={() => dockAssistant('bottom')} />
                <IconButton label="Open the assistant in a separate window" icon="open-window" size="sm" onPress={() => openInSeparateWindow('assistant')} />
              </>
            )}
            <IconButton label="Hide the inspector and assistant panel" icon="panel-right" size="sm" onPress={hideRightArea} />
          </div>
        </div>
        <TabPanel id="inspector" shouldForceMount className="ws-right-panel ws-side-body">
          <Inspector />
        </TabPanel>
        <TabPanel id="assistant" shouldForceMount className="ws-right-panel ws-assistant-body" data-help-id="ai.panel">
          {info?.kind === 'remote' && (
            <div className="ws-assistant-provider ws-assistant-provider-row" title="Connected provider and model, as reported by the assistant service">
              {info.name}
              {info.model ? ` · ${info.model}` : ''}
            </div>
          )}
          <AssistantPanel />
        </TabPanel>
      </Tabs>
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
  const current: Destination | null = layout.treeOpen ? 'tree' : layout.inspectorOpen ? 'inspector' : layout.activityOpen ? (layout.dockTab === 'validation' ? 'activity' : layout.dockTab) : null

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
    { id: 'assistant', label: 'Assistant', icon: 'assistant', badge: pending },
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
  inspector: { Narrow: 300, Medium: 320, Wide: 440 },
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
        {mode === 'desktop' && (
          <section className="flex flex-col gap-1.5">
            <h3 className="m-0 text-ui-xs font-medium text-fg-3">Workspace preset</h3>
            <SegmentedControl
              label="Workspace preset"
              size="sm"
              value={currentPreset(layout) ?? 'custom'}
              onChange={(id) => id !== 'custom' && applyPreset(id as (typeof PRESET_IDS)[number])}
              options={[...PRESET_IDS.map((id) => ({ value: id as string, label: LAYOUT_PRESETS[id].label })), ...(currentPreset(layout) ? [] : [{ value: 'custom', label: 'Custom' }])]}
            />
            <SegmentedControl
              label="Assistant position"
              size="sm"
              value={layout.assistantDock}
              onChange={(dock) => dockAssistant(dock)}
              options={[
                { value: 'right', label: 'Assistant right', icon: 'dock-right' },
                { value: 'bottom', label: 'Assistant bottom', icon: 'dock-bottom' },
              ]}
            />
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-ui-xs font-medium text-fg-3">Layout ({layoutClass === 'spacious' ? 'wide screens' : 'narrow screens'})</h3>
          {mode === 'desktop' && (
            <>
              <PresetRow label="Explorer" preset="tree" value={layout.treeWidth} onChange={(treeWidth) => setLayout({ treeOpen: true, treeWidth })} />
              <PresetRow label="Right panel" preset="inspector" value={layout.inspectorWidth} onChange={(inspectorWidth) => setLayout({ inspectorOpen: true, inspectorWidth })} />
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
            AI Assistant
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
