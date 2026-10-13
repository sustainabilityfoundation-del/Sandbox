import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconButton, Select } from '../sdk/controls'
import { Icons } from '../sdk/icons'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../sdk/store'
import { splitViewId } from '../sdk/views'
import { getTool, getTools } from '../tools/registry'
import { PANEL_LIMITS, type ViewportMode } from './layout/viewport'
import { ResizeHandle } from './primitives'
import { ToolTabs } from './ToolTabs'
import { ToolToolbar } from './ToolToolbar'
import { ToolViewHost, UnsupportedSelectionNotice, ViewControls } from './WorkArea'

/** The main tool pane: tabs, toolbar and the open tool views (kept mounted where needed). */
function MainPane({
  mode,
  onOpenLauncher,
  tabsLeading,
  tabsTrailing,
}: {
  mode: ViewportMode
  onOpenLauncher: () => void
  tabsLeading?: ReactNode
  tabsTrailing?: ReactNode
}) {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const openToolIds = useWorkspaceStore((s) => s.openToolIds)
  const split = useWorkspaceStore((s) => s.layouts.spacious.split)
  const setLayouts = useWorkspaceStore((s) => s.setLayout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const [visited, setVisited] = useState<Set<string>>(() => new Set())

  if (activeToolId && !visited.has(activeToolId)) setVisited(new Set(visited).add(activeToolId))

  const mounted = openToolIds.filter((id) => id === activeToolId || (getTool(id)?.keepMounted && visited.has(id)))
  const active = getTool(activeToolId)

  const openSplit = () => {
    const candidate = getTools().find((t) => t.id !== activeToolId && !t.singleInstance) ?? getTools().find((t) => !t.singleInstance)
    if (candidate && layoutClass === 'spacious') setLayouts({ split: { toolId: candidate.id, ratio: 0.5 } })
  }

  return (
    <section className="ws-pane ws-pane-main" aria-label="Main tool view">
      <div className="ws-pane-tabs">
        {tabsLeading}
        <ToolTabs onOpenLauncher={onOpenLauncher} />
        {mode === 'desktop' && !split && (
          <IconButton label="Split view: show a second tool beside this one" icon={Icons.split} size="sm" onClick={openSplit} className="ws-panel-toggle" />
        )}
        {tabsTrailing}
      </div>
      {active && (
        <ToolToolbar
          tool={active}
          viewId={active.id}
          trailing={<ViewControls viewId={active.id} detach={{ kind: 'tool', toolId: active.id }} />}
        />
      )}
      {active && <UnsupportedSelectionNotice tool={active} />}
      <div className="ws-work">
        {!active && <div className="ws-work-empty">No tool open. Use Tools (Ctrl+K) to open one.</div>}
        {mounted.map((id) => {
          const tool = getTool(id)!
          return <ToolViewHost key={id} tool={tool} viewId={id} active={id === activeToolId} hidden={id !== activeToolId} />
        })}
      </div>
    </section>
  )
}

/** Optional second view instance beside the main pane (desktop only; kept mounted when hidden). */
function SplitPane({ toolId, hidden }: { toolId: string; hidden: boolean }) {
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const activateTool = useWorkspaceStore((s) => s.activateTool)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const tool = getTool(toolId)
  if (!tool) return null
  const viewId = splitViewId(tool.id)
  const editable = layoutClass === 'spacious'

  return (
    <section className="ws-pane ws-pane-split" aria-label={`Second view: ${tool.name}`} hidden={hidden}>
      <div className="ws-pane-tabs ws-pane-split-header">
        <label className="flex items-center gap-1.5 text-ui-xs text-fg-3">
          <span>Second view</span>
          <Select
            value={tool.id}
            disabled={!editable}
            onChange={(e) => setLayout({ split: { toolId: e.target.value, ratio: 0.5 } })}
            aria-label="Tool in the second view"
          >
            {getTools()
              .filter((t) => !t.singleInstance)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </label>
        <span className="flex-1" />
        <Button
          size="sm"
          variant="ghost"
          disabled={!editable || !activeToolId || getTool(activeToolId)?.singleInstance}
          title="Swap the main and second views"
          onClick={() => {
            if (!activeToolId) return
            setLayout({ split: { toolId: activeToolId, ratio: 0.5 } })
            activateTool(tool.id)
          }}
        >
          Swap
        </Button>
        <IconButton label="Close second view" icon={Icons.close} size="sm" disabled={!editable} onClick={() => setLayout({ split: null })} />
      </div>
      <ToolToolbar tool={tool} viewId={viewId} trailing={<ViewControls viewId={viewId} detach={{ kind: 'tool', toolId: tool.id }} />} />
      <UnsupportedSelectionNotice tool={tool} viewId={viewId} />
      <div className="ws-work">
        <ToolViewHost tool={tool} viewId={viewId} active={!hidden} />
      </div>
    </section>
  )
}

/** Main pane plus the optional split pane, separated by a resizable divider. */
export function PaneArea({
  mode,
  onOpenLauncher,
  tabsLeading,
  tabsTrailing,
}: {
  mode: ViewportMode
  onOpenLauncher: () => void
  tabsLeading?: ReactNode
  tabsTrailing?: ReactNode
}) {
  const split = useWorkspaceStore((s) => s.layouts.spacious.split)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1000)
  const showSplit = mode === 'desktop' && !!split

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth || 1000))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const ratio = split ? Math.min(PANEL_LIMITS.split.max, Math.max(PANEL_LIMITS.split.min, split.ratio)) : 0.5
  return (
    <div
      ref={ref}
      className="ws-panes"
      data-split={showSplit || undefined}
      style={showSplit ? { gridTemplateColumns: `minmax(0, ${ratio}fr) auto minmax(0, ${1 - ratio}fr)` } : undefined}
    >
      <MainPane mode={mode} onOpenLauncher={onOpenLauncher} tabsLeading={tabsLeading} tabsTrailing={tabsTrailing} />
      {split && showSplit && (
        <ResizeHandle
          orientation="vertical"
          label="Resize split view"
          value={ratio * width}
          min={PANEL_LIMITS.split.min * width}
          max={PANEL_LIMITS.split.max * width}
          step={width / 20}
          onChange={(px) => setLayout({ split: { ...split, ratio: px / width } })}
          onReset={() => setLayout({ split: { ...split, ratio: DEFAULT_LAYOUTS.spacious.split?.ratio ?? 0.5 } })}
        />
      )}
      {split && <SplitPane toolId={split.toolId} hidden={!showSplit} />}
    </div>
  )
}
