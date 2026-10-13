import { useState, type ReactNode } from 'react'
import { useConversation } from '../assistant/conversation'
import { Button, IconButton, SegmentedControl, Select } from '../sdk/controls'
import { Icons } from '../sdk/icons'
import { DEFAULT_LAYOUTS, useWorkspaceStore, type Layout } from '../sdk/store'
import { openInSeparateWindow, openOnAnotherScreen, restoreWorkspaceWindows } from '../session/windows'
import { isWindowOpen, screenPlacementSupported } from '../session/windowSession'
import { usePreferences, type DensityPreference, type ThemePreference } from '../theme/preferences'
import { getTool, getTools } from '../tools/registry'
import type { ViewportMode } from './layout/viewport'
import { Menu, MenuSection, cx, useToasts } from './primitives'

// ---- Side panel / drawer ---------------------------------------------------------------------

/**
 * Product tree and inspector container. On desktop it is a grid column; on
 * tablets and phones it is an overlay drawer. It is the same element in every
 * mode and stays mounted when closed, so nothing inside it loses state.
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
  const drawer = mode !== 'desktop'
  return (
    <aside
      className={cx('ws-side', `ws-side-${side}`, drawer && 'ws-drawer', open && 'is-open')}
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      role={drawer && open ? 'dialog' : undefined}
      aria-modal={drawer && open ? true : undefined}
    >
      <div className="ws-pane-title">
        <span>{title}</span>
        <span className="flex items-center gap-0.5">
          {actions}
          <IconButton
            label={drawer ? `Close ${title.toLowerCase()}` : `Hide ${title.toLowerCase()}`}
            icon={drawer ? Icons.close : side === 'left' ? Icons.panelLeft : Icons.panelRight}
            size="sm"
            onClick={onClose}
          />
        </span>
      </div>
      <div className="ws-side-body">{children}</div>
    </aside>
  )
}

// ---- Phone navigation ---------------------------------------------------------------------------

type Destination = 'tree' | 'tools' | 'inspector' | 'activity' | 'assistant'

/** Bottom bar on phones: quick access to navigation, tools, inspection, Activity and ChatGPT. */
export function MobileNav({ onOpenLauncher }: { onOpenLauncher: () => void }) {
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const pending = useConversation((s) => Object.values(s.proposals).filter((p) => p.status === 'pending' || p.status === 'conflict').length)

  const current: Destination | null = layout.treeOpen
    ? 'tree'
    : layout.inspectorOpen
      ? 'inspector'
      : layout.activityOpen
        ? layout.dockTab
        : null

  // One sheet at a time on a phone.
  const go = (d: Destination) => {
    if (d === 'tools') return onOpenLauncher()
    const closeAll: Partial<Layout> = { treeOpen: false, inspectorOpen: false, activityOpen: false }
    if (current === d) return setLayout(closeAll)
    if (d === 'tree') setLayout({ ...closeAll, treeOpen: true })
    else if (d === 'inspector') setLayout({ ...closeAll, inspectorOpen: true })
    else setLayout({ ...closeAll, activityOpen: true, dockTab: d })
  }

  const items: { id: Destination; label: string; icon: typeof Icons.grid; badge?: number }[] = [
    { id: 'tree', label: 'Tree', icon: Icons.panelLeft },
    { id: 'tools', label: 'Tools', icon: Icons.grid },
    { id: 'inspector', label: 'Inspect', icon: Icons.panelRight },
    { id: 'activity', label: 'Activity', icon: Icons.panelBottom },
    { id: 'assistant', label: 'ChatGPT', icon: Icons.chat, badge: pending },
  ]

  return (
    <nav className="ws-mobile-nav" aria-label="Workspace navigation">
      {items.map((item) => {
        const Icon = item.icon
        const selected = current === item.id
        return (
          <button
            key={item.id}
            type="button"
            className="ws-mobile-nav-item"
            aria-pressed={item.id === 'tools' ? undefined : selected}
            onClick={() => go(item.id)}
            data-nav={item.id}
          >
            <span className="relative">
              <Icon width={20} height={20} aria-hidden="true" />
              {!!item.badge && <span className="ws-nav-badge">{item.badge}</span>}
            </span>
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ---- Display menu ---------------------------------------------------------------------------

const PRESETS = {
  tree: { Narrow: 210, Medium: 248, Wide: 340 },
  inspector: { Narrow: 260, Medium: 320, Wide: 440 },
  dock: { Small: 180, Medium: 280, Large: 420 },
}

/** Theme, density and layout settings. Layout presets are the non-drag alternative for resizing. */
export function DisplayMenu({ mode, tone = 'header' }: { mode: ViewportMode; tone?: 'header' | 'surface' }) {
  const theme = usePreferences((s) => s.theme)
  const density = usePreferences((s) => s.density)
  const setTheme = usePreferences((s) => s.setTheme)
  const setDensity = usePreferences((s) => s.setDensity)
  const layout = useWorkspaceStore((s) => s.layout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)

  const preset = (key: keyof typeof PRESETS, value: number) =>
    (Object.entries(PRESETS[key]) as [string, number][]).reduce((best, [name, v]) =>
      Math.abs(v - value) < Math.abs(PRESETS[key][best as never] - value) ? name : best,
    Object.keys(PRESETS[key])[0])

  return (
    <Menu label="Display and layout" icon={Icons.display} tone={tone}>
      {() => (
        <div className="flex flex-col">
          <MenuSection title="Theme">
            <SegmentedControl<ThemePreference>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </MenuSection>
          <MenuSection title="Density">
            <SegmentedControl<DensityPreference>
              label="Density"
              value={density}
              onChange={setDensity}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </MenuSection>
          <MenuSection title={`Layout (${layoutClass === 'spacious' ? 'wide screens' : 'narrow screens'})`}>
            <div className="flex flex-col gap-2 text-ui-sm">
              {mode === 'desktop' && (
                <>
                  <PresetRow
                    label="Product tree"
                    value={preset('tree', layout.treeWidth)}
                    options={Object.keys(PRESETS.tree)}
                    onChange={(name) => setLayout({ treeOpen: true, treeWidth: PRESETS.tree[name as keyof typeof PRESETS.tree] })}
                  />
                  <PresetRow
                    label="Inspector"
                    value={preset('inspector', layout.inspectorWidth)}
                    options={Object.keys(PRESETS.inspector)}
                    onChange={(name) =>
                      setLayout({ inspectorOpen: true, inspectorWidth: PRESETS.inspector[name as keyof typeof PRESETS.inspector] })
                    }
                  />
                </>
              )}
              {mode !== 'phone' && (
                <PresetRow
                  label="Bottom panel"
                  value={preset('dock', layout.dockHeight)}
                  options={Object.keys(PRESETS.dock)}
                  onChange={(name) => setLayout({ activityOpen: true, dockHeight: PRESETS.dock[name as keyof typeof PRESETS.dock] })}
                />
              )}
              {mode === 'desktop' && (
                <label className="flex items-center justify-between gap-2">
                  <span>Second view</span>
                  <Select
                    value={layout.split?.toolId ?? ''}
                    onChange={(e) => setLayout({ split: e.target.value ? { toolId: e.target.value, ratio: layout.split?.ratio ?? 0.5 } : null })}
                    aria-label="Second view"
                  >
                    <option value="">Off</option>
                    {getTools()
                      .filter((t) => !t.singleInstance)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.id === activeToolId ? ' (same tool)' : ''}
                        </option>
                      ))}
                  </Select>
                </label>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLayout(DEFAULT_LAYOUTS[layoutClass])}>
                Reset layout
              </Button>
            </div>
          </MenuSection>
        </div>
      )}
    </Menu>
  )
}

function PresetRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <SegmentedControl label={`${label} size`} size="sm" value={value} onChange={onChange} options={options.map((o) => ({ value: o, label: o }))} />
    </div>
  )
}

// ---- Windows menu ---------------------------------------------------------------------------

/** Open views in separate windows, and restore remembered windows (always from a user action). */
export function WindowsMenu({ tone = 'header' }: { tone?: 'header' | 'surface' }) {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const detachedViews = useWorkspaceStore((s) => s.detachedViews)
  const forget = useWorkspaceStore((s) => s.forgetDetached)
  const push = useToasts((s) => s.push)
  const [, refresh] = useState(0)
  const [onOtherScreen, setOnOtherScreen] = useState(false)
  const placement = screenPlacementSupported()
  const tool = getTool(activeToolId)

  const open = (kind: 'tool' | 'inspector' | 'assistant', toolId?: string) => {
    if (onOtherScreen) void openOnAnotherScreen(kind, toolId)
    else openInSeparateWindow(kind, toolId)
    setTimeout(() => refresh((n) => n + 1), 500)
  }

  return (
    <Menu label="Windows" icon={Icons.windows} tone={tone}>
      {(close) => (
        <div className="flex flex-col">
          <MenuSection title="Open in separate window">
            <div className="flex flex-col items-stretch gap-1.5">
              {tool && (
                <Button size="sm" icon={Icons.external} onClick={() => open('tool', tool.id)}>
                  {tool.name}
                </Button>
              )}
              <Button size="sm" icon={Icons.external} onClick={() => open('inspector')}>
                Inspector
              </Button>
              <Button size="sm" icon={Icons.external} onClick={() => open('assistant')}>
                ChatGPT
              </Button>
              <label className="mt-1 flex items-start gap-2 text-ui-xs text-fg-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-accent"
                  checked={onOtherScreen}
                  disabled={!placement}
                  onChange={(e) => setOnOtherScreen(e.target.checked)}
                />
                <span>
                  Place on another screen (asks for permission)
                  {!placement && <span className="block text-fg-3">Not available in this browser. Drag the window to another monitor instead.</span>}
                </span>
              </label>
            </div>
          </MenuSection>
          <MenuSection title={`Remembered windows (${detachedViews.length})`}>
            {detachedViews.length === 0 ? (
              <p className="m-0 text-ui-sm text-fg-3">Windows you open are remembered here so you can restore them later.</p>
            ) : (
              <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0">
                {detachedViews.map((d) => (
                  <li key={d.windowId} className="flex items-center gap-2 text-ui-sm">
                    <span className={cx('size-2 shrink-0 rounded-full', isWindowOpen(d.windowId) ? 'bg-success' : 'bg-line-strong')} />
                    <span className="flex-1 truncate">{d.title}</span>
                    <span className="text-ui-xs text-fg-3">{isWindowOpen(d.windowId) ? 'open' : 'closed'}</span>
                    <Button size="sm" variant="ghost" onClick={() => forget(d.windowId)} aria-label={`Forget ${d.title} window`}>
                      Forget
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button
              size="sm"
              variant="primary"
              icon={Icons.windows}
              disabled={detachedViews.length === 0}
              onClick={() => {
                const result = restoreWorkspaceWindows()
                push({
                  tone: result.blocked ? 'warning' : 'success',
                  title: 'Restore workspace windows',
                  body: `${result.opened} opened, ${result.alreadyOpen} already open${result.blocked ? `, ${result.blocked} blocked by the browser (use the links)` : ''}.`,
                })
                close()
              }}
            >
              Restore workspace windows
            </Button>
          </MenuSection>
        </div>
      )}
    </Menu>
  )
}
