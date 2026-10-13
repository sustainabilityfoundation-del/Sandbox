import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DemoRepository } from './repository/DemoRepository'
import { PROJECT_ID } from './repository/seed'
import { windowInfo } from './session/windowSession'
import { Button, IconButton, Spinner } from './sdk/controls'
import { Icons } from './sdk/icons'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from './sdk/store'
import { detachedViewId } from './sdk/views'
import { AssistantPanel } from './shell/assistant/AssistantPanel'
import { BottomDock } from './shell/BottomDock'
import { Header } from './shell/Header'
import { Inspector } from './shell/Inspector'
import { PANEL_LIMITS, clampLayout, useViewportMode, useViewportSize, useVisualViewportHeight, type ViewportMode } from './shell/layout/viewport'
import { PaneArea } from './shell/PaneArea'
import { ProductTree } from './shell/ProductTree'
import { ResizeHandle, Toaster } from './shell/primitives'
import { MobileNav, SidePanel } from './shell/ShellParts'
import { ToolLauncher } from './shell/ToolLauncher'
import { ToolToolbar } from './shell/ToolToolbar'
import { ToolViewHost, UnsupportedSelectionNotice, ViewControls } from './shell/WorkArea'
import { DEFAULT_OPEN_TOOLS } from './tools'
import { getTool, getTools } from './tools/registry'

let started = false

function start(repository: DemoRepository) {
  return useWorkspaceStore.getState().initialize({
    repository,
    projectId: PROJECT_ID,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: DEFAULT_OPEN_TOOLS,
  })
}

/** Keeps the store's layout class (and so its saved layout preferences) in step with the viewport. */
function useLayoutClass(mode: ViewportMode) {
  const setLayoutClass = useWorkspaceStore((s) => s.setLayoutClass)
  const layoutClass = mode === 'desktop' ? 'spacious' : 'compact'
  // Before paint, so the first frame already uses the right saved layout.
  useLayoutEffect(() => setLayoutClass(layoutClass), [layoutClass, setLayoutClass])
}

function MainWorkspace({ repository }: { repository: DemoRepository }) {
  const mode = useViewportMode()
  const size = useViewportSize()
  useVisualViewportHeight()
  useLayoutClass(mode)
  const stored = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const layoutClass = useWorkspaceStore((s) => s.layoutClass)
  const selectedIds = useWorkspaceStore((s) => s.context.selectedIds)
  const [launcherOpen, setLauncherOpen] = useState(false)
  // Restored or dragged sizes are clamped to the current viewport so panels stay reachable.
  const layout = clampLayout(stored, size.width, size.height)
  const desktop = mode === 'desktop'
  const drawerOpen = !desktop && (layout.treeOpen || layout.inspectorOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLauncherOpen((o) => !o)
      }
      if (e.key === 'Escape' && drawerOpen) setLayout({ treeOpen: false, inspectorOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, setLayout])

  // On phones, picking an object in the tree drawer reveals the tool view.
  const lastSelection = useRef(selectedIds)
  useEffect(() => {
    if (lastSelection.current === selectedIds) return
    lastSelection.current = selectedIds
    if (mode === 'phone' && useWorkspaceStore.getState().layout.treeOpen) setLayout({ treeOpen: false })
  }, [selectedIds, mode, setLayout])

  const gridTemplateColumns = desktop
    ? [
        layout.treeOpen ? `${layout.treeWidth}px` : '0px',
        layout.treeOpen ? 'auto' : '0px',
        'minmax(0, 1fr)',
        layout.inspectorOpen ? 'auto' : '0px',
        layout.inspectorOpen ? `${layout.inspectorWidth}px` : '0px',
      ].join(' ')
    : 'minmax(0, 1fr)'
  const maxTree = Math.min(PANEL_LIMITS.tree.max, size.width * PANEL_LIMITS.tree.share)
  const maxInspector = Math.min(PANEL_LIMITS.inspector.max, size.width * PANEL_LIMITS.inspector.share)

  return (
    <div className="ws-app" data-mode={mode}>
      <Header repository={repository} mode={mode} />
      <div className="ws-body" style={{ gridTemplateColumns }}>
        <SidePanel side="left" title="Product tree" open={layout.treeOpen} mode={mode} onClose={() => setLayout({ treeOpen: false })}>
          <ProductTree />
        </SidePanel>
        {desktop && layout.treeOpen && (
          <ResizeHandle
            orientation="vertical"
            label="Resize product tree"
            value={layout.treeWidth}
            min={PANEL_LIMITS.tree.min}
            max={maxTree}
            onChange={(treeWidth) => setLayout({ treeWidth })}
            onReset={() => setLayout({ treeWidth: DEFAULT_LAYOUTS[layoutClass].treeWidth })}
            className="ws-area-tree-handle"
          />
        )}
        <div className="ws-center">
          <PaneArea
            mode={mode}
            onOpenLauncher={() => setLauncherOpen(true)}
            tabsLeading={
              mode !== 'phone' && (
                <IconButton
                  className="ws-panel-toggle"
                  label={layout.treeOpen ? 'Hide product tree' : 'Show product tree'}
                  icon={Icons.panelLeft}
                  size="sm"
                  aria-pressed={layout.treeOpen}
                  onClick={() => setLayout(desktop ? { treeOpen: !layout.treeOpen } : { treeOpen: !layout.treeOpen, inspectorOpen: false })}
                />
              )
            }
            tabsTrailing={
              mode !== 'phone' && (
                <IconButton
                  className="ws-panel-toggle"
                  label={layout.inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                  icon={Icons.panelRight}
                  size="sm"
                  aria-pressed={layout.inspectorOpen}
                  onClick={() =>
                    setLayout(desktop ? { inspectorOpen: !layout.inspectorOpen } : { inspectorOpen: !layout.inspectorOpen, treeOpen: false })
                  }
                />
              )
            }
          />
          <BottomDock mode={mode} />
        </div>
        {desktop && layout.inspectorOpen && (
          <ResizeHandle
            orientation="vertical"
            label="Resize inspector"
            value={layout.inspectorWidth}
            min={PANEL_LIMITS.inspector.min}
            max={maxInspector}
            invert
            onChange={(inspectorWidth) => setLayout({ inspectorWidth })}
            onReset={() => setLayout({ inspectorWidth: DEFAULT_LAYOUTS[layoutClass].inspectorWidth })}
            className="ws-area-inspector-handle"
          />
        )}
        <SidePanel side="right" title="Inspector" open={layout.inspectorOpen} mode={mode} onClose={() => setLayout({ inspectorOpen: false })}>
          <Inspector />
        </SidePanel>
      </div>
      {drawerOpen && <div className="ws-scrim" onClick={() => setLayout({ treeOpen: false, inspectorOpen: false })} aria-hidden="true" />}
      {mode === 'phone' && <MobileNav onOpenLauncher={() => setLauncherOpen(true)} />}
      {launcherOpen && <ToolLauncher onClose={() => setLauncherOpen(false)} />}
      <Toaster />
    </div>
  )
}

/**
 * A detached window: one tool view, the inspector, or ChatGPT, connected to the
 * same repository and session as the main window.
 */
function DetachedWorkspace({ repository }: { repository: DemoRepository }) {
  const mode = useViewportMode()
  useVisualViewportHeight()
  useLayoutClass(mode)
  const { kind, toolId, windowId } = windowInfo
  const tool = kind === 'tool' ? getTool(toolId) : undefined
  const title = kind === 'tool' ? (tool?.name ?? 'Unknown tool') : kind === 'inspector' ? 'Inspector' : 'ChatGPT'

  useEffect(() => {
    document.title = `${title} · Engineering Workspace`
  }, [title])

  let content
  if (kind === 'tool' && tool) {
    const viewId = detachedViewId(windowId, tool.id)
    content = (
      <section className="ws-pane ws-pane-main" aria-label={tool.name}>
        <ToolToolbar tool={tool} viewId={viewId} trailing={<ViewControls viewId={viewId} />} />
        <UnsupportedSelectionNotice tool={tool} viewId={viewId} />
        <div className="ws-work">
          <ToolViewHost tool={tool} viewId={viewId} active />
        </div>
      </section>
    )
  } else if (kind === 'inspector') {
    content = <Inspector viewId={detachedViewId(windowId, 'inspector')} detachable={false} />
  } else if (kind === 'assistant') {
    content = <AssistantPanel />
  } else {
    content = <div className="ws-work-empty">This window refers to a tool that is no longer available.</div>
  }

  return (
    <div className="ws-app ws-detached" data-mode={mode}>
      <Header repository={repository} mode={mode} />
      <div className="ws-detached-bar">
        <Icons.windows width={14} height={14} aria-hidden="true" />
        <strong>{title}</strong>
        <span className="ws-muted">Separate window, connected to the same project session. Close it at any time; saved work is kept.</span>
      </div>
      <main className="ws-detached-main">{content}</main>
      <Toaster />
    </div>
  )
}

export default function App({ repository }: { repository: DemoRepository }) {
  const status = useWorkspaceStore((s) => s.status)
  const loadError = useWorkspaceStore((s) => s.loadError)

  useEffect(() => {
    if (started) return
    started = true
    void start(repository)
  }, [repository])

  if (status === 'loading') {
    return (
      <div className="ws-splash">
        <Spinner />
        <span>Loading project from {repository.info.label}…</span>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="ws-splash">
        <div className="ws-splash-card" role="alert">
          <Icons.alert width={22} height={22} />
          <h1>Could not load the project</h1>
          <p>{loadError}</p>
          <Button
            variant="primary"
            onClick={() => {
              repository.offline = false
              void start(repository)
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return windowInfo.role === 'detached' ? <DetachedWorkspace repository={repository} /> : <MainWorkspace repository={repository} />
}
