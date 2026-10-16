import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DemoRepository } from '@ews/model-service'
import { PROJECT_ID } from '@ews/model-service'
import { windowInfo } from './session/windowSession'
import { DEFAULT_LAYOUTS, useWorkspaceStore } from './platform/store'
import { detachedViewId } from './platform/views'
import { AssistantPanel } from './shell/assistant/AssistantPanel'
import { BottomDock } from './shell/BottomDock'
import { Header } from './shell/Header'
import { Inspector } from './shell/Inspector'
import { PANEL_LIMITS, clampLayout, useViewportMode, useViewportSize, useVisualViewportHeight, type ViewportMode } from './shell/layout/viewport'
import { PaneArea } from './shell/PaneArea'
import { ProductTree } from './shell/ProductTree'
import { ExplorerFilter, MobileNav, PanelToggles, RightPanel, SidePanel } from './shell/ShellParts'
import { NavigationRail } from './shell/Rail'
import { StatusBar } from './shell/StatusBar'
import { assistantOnRight, rightAreaOpen } from './shell/layout/presets'
import { CommandPalette } from './shell/CommandPalette'
import { ToolToolbar } from './shell/ToolToolbar'
import { ToolViewHost, UnsupportedSelectionNotice, ViewControls } from './shell/WorkArea'
import { DEFAULT_OPEN_TOOLS } from './platform/tools'
import { getTool, getTools } from './platform/registry'
import { Button, Icon, ResizeHandle, Spinner, Toaster, useToasts } from '@ews/design-system'
import { useEntitlements } from './platform/entitlements'
import { workspaceServices } from './platform/services'
import { LockedToolNotice } from './shell/WorkArea'
import { BaselineDialog } from './shell/Baselines'
import { CapabilitiesDialog } from './shell/CapabilitiesDialog'
import { CoverageDialog } from './shell/CoverageDialog'
import { HelpCentre } from './help/HelpCentre'
import { openContextualHelp } from './help/contextual'
import { openCurrentProject, useCurrentProject } from './projects/bootstrap'
import { ProjectExplorer } from './projects/ProjectExplorer'
import { ProjectHome, openProjectHome } from './projects/ProjectHome'
import { switchProject } from './projects/currentProject'

let started = false

async function start(repository: DemoRepository) {
  // The window's project (CR-PM-WS-1): opened through Project Management when available; PRJ-ACT100 otherwise.
  let opened
  try {
    opened = await openCurrentProject({ repository, projects: workspaceServices.projects, legacyTools: DEFAULT_OPEN_TOOLS })
  } catch (error) {
    useWorkspaceStore.setState({ status: 'error', loadError: error instanceof Error ? error.message : String(error) })
    return
  }
  await useWorkspaceStore.getState().initialize({
    repository,
    projectId: opened.legacy ? PROJECT_ID : opened.current.projectId,
    tools: getTools().map((t) => ({ id: t.id, initialViewState: t.initialViewState })),
    defaultOpenToolIds: opened.defaultTools,
    requirements: workspaceServices.requirements,
  })
  // Committed changes in Project Management (product elements, breakdowns) refresh the projected model (CR-PM-MS-2).
  if (!opened.legacy && workspaceServices.projects) {
    let timer: ReturnType<typeof setTimeout> | undefined
    workspaceServices.projects.subscribe(opened.current.projectId, (e) => {
      if (e.type !== 'artifact.registered' && e.type !== 'artifact.updated') return
      clearTimeout(timer)
      timer = setTimeout(() => void useWorkspaceStore.getState().refreshRequirements(), 200)
    })
  }
}

/** Keeps the store's layout class (and so its saved layout preferences) in step with the viewport. */
function useLayoutClass(mode: ViewportMode) {
  const setLayoutClass = useWorkspaceStore((s) => s.setLayoutClass)
  const layoutClass = mode === 'desktop' ? 'spacious' : 'compact'
  // Before paint, so the first frame already uses the right saved layout.
  useLayoutEffect(() => setLayoutClass(layoutClass), [layoutClass, setLayoutClass])
}

/** Handles a direct route (?tool=<id>) once, with the same subscription check as every other entry point. */
function useToolDeepLink() {
  const ready = useWorkspaceStore((s) => s.status === 'ready')
  useEffect(() => {
    if (!ready) return
    const params = new URLSearchParams(location.search)
    const toolId = params.get('tool')
    if (!toolId || params.has('window')) return
    const access = useWorkspaceStore.getState().activateTool(toolId)
    if (!access.ok) useToasts.getState().push({ tone: 'warning', title: 'Tool not available', body: access.reason })
    params.delete('tool')
    history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
  }, [ready])
}

function MainWorkspace({ repository }: { repository: DemoRepository }) {
  useToolDeepLink()
  const opened = useCurrentProject((s) => s.opened)
  const explorerProject = opened && !opened.legacy && opened.context ? opened.current.projectId : null
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
  const phone = mode === 'phone'
  const maximized = layout.canvasMaximized && !phone
  const treeShown = layout.treeOpen && !maximized
  const right = assistantOnRight(layout, desktop)
  // One right-hand column: the Inspector and (when docked there) the AI Assistant are its tabs and share one width.
  const rightShown = rightAreaOpen(layout, desktop) && !maximized
  const rightWidth = right ? Math.max(layout.inspectorWidth, PANEL_LIMITS.assistant.min) : layout.inspectorWidth

  // Ctrl/Cmd+K works everywhere, including while typing, because it has a modifier.
  // Drawers, sheets and dialogs handle Escape themselves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLauncherOpen((o) => !o)
      }
      // F1: help for the focused control, the active tool or the selection (works while typing too).
      if (e.key === 'F1' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openContextualHelp(document.activeElement)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // On phones, picking an object in the tree drawer reveals the tool view.
  const lastSelection = useRef(selectedIds)
  useEffect(() => {
    if (lastSelection.current === selectedIds) return
    lastSelection.current = selectedIds
    if (mode === 'phone' && useWorkspaceStore.getState().layout.treeOpen) setLayout({ treeOpen: false })
  }, [selectedIds, mode, setLayout])

  // Laptop widths keep the rail to icons (with tooltips) so the canvas keeps its space.
  const railExpanded = layout.railExpanded && size.width >= 1440
  const rail = phone ? '0px' : railExpanded ? 'var(--ws-rail-w)' : 'var(--ws-rail-w-collapsed)'
  const gridTemplateColumns = desktop
    ? [
        rail,
        treeShown ? `${layout.treeWidth}px` : '0px',
        treeShown ? 'auto' : '0px',
        'minmax(0, 1fr)',
        rightShown ? 'auto' : '0px',
        rightShown ? `${rightWidth}px` : '0px',
      ].join(' ')
    : `${rail} minmax(0, 1fr)`
  const maxTree = Math.min(PANEL_LIMITS.tree.max, size.width * PANEL_LIMITS.tree.share)
  const maxRight = Math.min(right ? PANEL_LIMITS.assistant.max : PANEL_LIMITS.inspector.max, size.width * PANEL_LIMITS.assistant.share)
  const minRight = right ? PANEL_LIMITS.assistant.min : PANEL_LIMITS.inspector.min
  const explorerTitle = explorerProject ? 'Project Explorer' : 'Product tree'

  return (
    <div className="ws-app" data-mode={mode} data-maximized={maximized || undefined}>
      <Header repository={repository} mode={mode} onOpenPalette={() => setLauncherOpen(true)} />
      <div className="ws-body" style={{ gridTemplateColumns }}>
        {!phone && <NavigationRail desktop={desktop} expanded={railExpanded} />}
        {/* New projects show their registered artifacts by module; the example project keeps its product tree (C12). */}
        <SidePanel
          side="left"
          title={explorerTitle}
          icon="project"
          open={desktop ? treeShown : layout.treeOpen}
          mode={mode}
          onClose={() => setLayout({ treeOpen: false })}
          toolbar={<ExplorerFilter label={explorerProject ? 'Filter project artifacts' : 'Filter the product tree'} />}
        >
          {explorerProject ? <ProjectExplorer projectId={explorerProject} /> : <ProductTree />}
        </SidePanel>
        {desktop && treeShown && (
          <ResizeHandle
            orientation="vertical"
            label="Resize project explorer"
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
            tabsTrailing={!phone && <PanelToggles mode={mode} layout={layout} />}
          />
          {!maximized && <BottomDock mode={mode} assistantInDock={!right} />}
        </div>
        {desktop && rightShown && (
          <ResizeHandle
            orientation="vertical"
            label="Resize right-hand panel"
            value={rightWidth}
            min={minRight}
            max={maxRight}
            invert
            onChange={(inspectorWidth) => setLayout({ inspectorWidth })}
            onReset={() => setLayout({ inspectorWidth: DEFAULT_LAYOUTS[layoutClass].inspectorWidth })}
            className="ws-area-inspector-handle"
          />
        )}
        {desktop && right ? (
          <RightPanel open={rightShown} />
        ) : (
          <SidePanel side="right" title="Inspector" icon="tune" open={desktop ? rightShown : layout.inspectorOpen} mode={mode} onClose={() => setLayout({ inspectorOpen: false })}>
            <Inspector />
          </SidePanel>
        )}
      </div>
      {phone ? <MobileNav onOpenLauncher={() => setLauncherOpen(true)} /> : <StatusBar repository={repository} />}
      <CommandPalette isOpen={launcherOpen} onOpenChange={setLauncherOpen} />
      <BaselineDialog />
      <CapabilitiesDialog />
      <CoverageDialog />
      <HelpCentre />
      <ProjectHome />
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
  // Re-evaluated whenever the subscription changes (also when changed in another window).
  const entitled = useEntitlements((s) => (tool ? s.has(tool.entitlement) : true))
  const title = kind === 'tool' ? (tool?.name ?? 'Unknown tool') : kind === 'inspector' ? 'Inspector' : 'AI Assistant'

  useEffect(() => {
    document.title = `${title} · Engineering Workspace`
  }, [title])

  let content
  if (kind === 'tool' && tool && !entitled) {
    content = <LockedToolNotice tool={tool} />
  } else if (kind === 'tool' && tool) {
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
        <Icon name="windows" size={18} />
        <strong>{title}</strong>
        <span className="text-fg-3">Separate window, connected to the same project session. Close it at any time; saved work is kept.</span>
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
        <Spinner size={28} label="Loading project" />
        <span>Loading project from {repository.info.label}…</span>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="ws-splash">
        <div className="ws-splash-card" role="alert">
          <Icon name="error" size={24} className="text-danger" />
          <h1>Could not load the project</h1>
          <p>{loadError}</p>
          <Button
            variant="filled"
            icon="sync"
            onPress={() => {
              repository.offline = false
              void start(repository)
            }}
          >
            Retry
          </Button>
          {workspaceServices.projects && (
            <div className="flex flex-wrap gap-2">
              <Button icon="repository" onPress={() => openProjectHome()}>
                Projects…
              </Button>
              <Button variant="quiet" onPress={() => switchProject(PROJECT_ID)}>
                Open the example project
              </Button>
            </div>
          )}
        </div>
        <ProjectHome />
      </div>
    )
  }

  return windowInfo.role === 'detached' ? <DetachedWorkspace repository={repository} /> : <MainWorkspace repository={repository} />
}
