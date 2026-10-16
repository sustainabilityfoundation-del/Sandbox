import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from '../platform/store'
import { splitViewId } from '../platform/views'
import { openToolOrExplain } from '../platform/api'
import { getTool, getTools } from '../platform/registry'
import { AppIcon, Breadcrumbs, Button, Icon, IconButton, MenuButton, MenuItem, ResizeHandle, Select, Tab, TabList, TabPanel, Tabs, type BreadcrumbItem } from '@ews/design-system'
import { displayId } from '@ews/model-service'
import { iconForType } from '@ews/platform-sdk/react'
import { useCurrentProject } from '../projects/bootstrap'
import { openProjectHome } from '../projects/ProjectHome'
import { workspaceServices } from '../platform/services'
import { PANEL_LIMITS, type ViewportMode } from './layout/viewport'
import { ToolToolbar } from './ToolToolbar'
import { ToolViewHost, UnsupportedSelectionNotice, ViewControls } from './WorkArea'
import { canOpenTool, useEntitlements } from '../platform/entitlements'
import { DEMO_TOOL_EXPLANATION, isDemoTool } from '../platform/demoTools'

/**
 * Where the canvas is: project › configuration › module › selection. Built from the shared context only;
 * modules show their own internal location (package, diagram) inside their view.
 */
function ContextBreadcrumbs() {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const opened = useCurrentProject((s) => s.opened)
  const tool = getTool(activeToolId)
  const selected = context.selectedIds.map((id) => model.get(id)).filter((o) => !!o)
  const items: BreadcrumbItem[] = [
    {
      id: 'project',
      label: opened ? opened.current.key : model.snapshot.project.id,
      icon: 'project',
      onPress: opened ? () => openProjectHome(workspaceServices.projects ? 'projects' : 'overview') : undefined,
    },
    { id: 'configuration', label: context.configurationId, icon: 'branch' },
    ...(tool ? [{ id: 'tool', label: tool.name, icon: tool.icon }] : []),
    ...(selected.length === 1
      ? [{ id: 'selection', label: `${displayId(selected[0]!)} ${selected[0]!.name}`, icon: iconForType(selected[0]!.type) }]
      : selected.length > 1
        ? [{ id: 'selection', label: `${selected.length} objects` }]
        : []),
  ]
  return (
    <div className="ws-crumbs">
      <Breadcrumbs items={items} label="Workspace location" />
    </div>
  )
}

/**
 * Main tool pane: tool tabs (React Aria Tabs, arrow-key navigation), the active
 * tool's toolbar and its view. Tools that must keep their state stay mounted
 * in an inert panel when another tab is selected. A tab whose tool the
 * subscription no longer includes stays (nothing is lost) and shows why.
 */
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
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const focusTab = useWorkspaceStore((s) => s.focusTab)
  useEntitlements((s) => s.plan) // re-render when the subscription changes
  const closeTool = useWorkspaceStore((s) => s.closeTool)
  const [visited, setVisited] = useState<Set<string>>(() => new Set())

  if (activeToolId && !visited.has(activeToolId)) setVisited(new Set(visited).add(activeToolId))
  const active = getTool(activeToolId)
  const openTools = openToolIds.map(getTool).filter((t) => !!t)

  const openSplit = () => {
    const available = getTools().filter((t) => !t.singleInstance && canOpenTool(t.id))
    const candidate = available.find((t) => t.id !== activeToolId) ?? available[0]
    if (candidate && layoutClass === 'spacious') setLayout({ split: { toolId: candidate.id, ratio: 0.5 } })
  }

  return (
    <section className="ws-pane ws-pane-main" aria-label="Main tool view">
      <Tabs
        selectedKey={activeToolId ?? ''}
        onSelectionChange={(key) => focusTab(String(key))}
        className="min-h-0 flex-1"
      >
        <div className="ws-pane-tabs">
          {tabsLeading}
          {/* Static children (not `items`), so the lock state re-renders when the subscription changes. */}
          <TabList aria-label="Open tools" className="ws-tool-tabs">
            {openTools.map((tool) => (
              <Tab key={tool.id} id={tool.id} data-tool-id={tool.id} className="ws-tool-tab">
                <AppIcon name={tool.icon} size={16} />
                <span>{tool.name}</span>
                {isDemoTool(tool.id) && (
                  <span className="ws-dock-demo" title={DEMO_TOOL_EXPLANATION}>
                    Demo
                  </span>
                )}
                {!canOpenTool(tool.id) && <AppIcon name="locked" size={16} label="Not in your subscription" className="text-fg-3" />}
              </Tab>
            ))}
          </TabList>
          <MenuButton
            label="Open tools"
            icon="more"
            onAction={(key) => {
              const [action, id] = String(key).split(':')
              if (action === 'close') closeTool(id)
              else if (action === 'palette') onOpenLauncher()
            }}
          >
            <MenuItem id="palette" icon="tools" shortcut="Ctrl K">
              Open a tool or command…
            </MenuItem>
            {openTools.map((t) => (
              <MenuItem key={t.id} id={`close:${t.id}`} icon="close" isDisabled={openTools.length === 1}>
                {`Close ${t.name}${isDemoTool(t.id) ? ' (Demo)' : ''}`}
              </MenuItem>
            ))}
          </MenuButton>
          <IconButton label="Open a tool or command" shortcut="Control+K" icon="add" size="sm" onPress={onOpenLauncher} className="ws-tools-button" />
          <ContextBreadcrumbs />
          {mode === 'desktop' && !split && (
            <IconButton label="Split view: show a second tool beside this one" icon="split" size="sm" onPress={openSplit} className="ws-panel-toggle" />
          )}
          {tabsTrailing}
        </div>
        {active && canOpenTool(active.id) && (
          <ToolToolbar tool={active} viewId={active.id} trailing={<ViewControls viewId={active.id} detach={{ kind: 'tool', toolId: active.id }} />} />
        )}
        {active && canOpenTool(active.id) && <UnsupportedSelectionNotice tool={active} />}
        <div className="ws-work">
          {!active && (
            <div className="ws-work-empty">
              <Icon name="tools" size={28} />
              <span>No tool open.</span>
              <Button variant="tonal" icon="tools" onPress={onOpenLauncher}>
                Open a tool
              </Button>
            </div>
          )}
          {openTools.map((tool) => {
            const mounted = tool.id === activeToolId || (tool.keepMounted && visited.has(tool.id))
            return (
              <TabPanel key={tool.id} id={tool.id} shouldForceMount={tool.keepMounted && visited.has(tool.id)} className="ws-tabpanel">
                {mounted && <ToolViewHost tool={tool} viewId={tool.id} active={tool.id === activeToolId} />}
              </TabPanel>
            )
          })}
        </div>
      </Tabs>
    </section>
  )
}

/** Optional second view instance beside the main pane (desktop only; kept mounted when hidden). */
function SplitPane({ toolId, hidden }: { toolId: string; hidden: boolean }) {
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const tool = getTool(toolId)
  if (!tool) return null
  const viewId = splitViewId(tool.id)
  const editable = layoutClass === 'spacious'

  return (
    <section className="ws-pane ws-pane-split" aria-label={`Second view: ${tool.name}`} hidden={hidden}>
      <div className="ws-pane-tabs ws-pane-split-header">
        <Select
          ariaLabel="Tool in the second view"
          size="sm"
          isDisabled={!editable}
          value={tool.id}
          onChange={(id) => setLayout({ split: { toolId: id, ratio: 0.5 } })}
          options={getTools()
            .filter((t) => !t.singleInstance)
            .map((t) => ({ id: t.id, label: `${t.name}${isDemoTool(t.id) ? ' (Demo)' : ''}${canOpenTool(t.id) ? '' : ' (not in subscription)'}`, isDisabled: !canOpenTool(t.id) }))}
          className="min-w-40"
        />
        <span className="flex-1" />
        <Button
          size="sm"
          variant="quiet"
          icon="swap"
          isDisabled={!editable || !activeToolId || getTool(activeToolId)?.singleInstance || !canOpenTool(activeToolId)}
          onPress={() => {
            if (!activeToolId) return
            setLayout({ split: { toolId: activeToolId, ratio: 0.5 } })
            openToolOrExplain(tool.id)
          }}
        >
          Swap
        </Button>
        <IconButton label="Close second view" icon="close" size="sm" isDisabled={!editable} onPress={() => setLayout({ split: null })} />
      </div>
      {canOpenTool(tool.id) && <ToolToolbar tool={tool} viewId={viewId} trailing={<ViewControls viewId={viewId} detach={{ kind: 'tool', toolId: tool.id }} />} />}
      {canOpenTool(tool.id) && <UnsupportedSelectionNotice tool={tool} viewId={viewId} />}
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
