import { useEffect, useState } from 'react'
import type { DemoRepository } from './repository/DemoRepository'
import { PROJECT_ID } from './repository/seed'
import { useWorkspaceStore } from './sdk/store'
import { Icons } from './sdk/icons'
import { BottomDock } from './shell/BottomDock'
import { Header } from './shell/Header'
import { Inspector } from './shell/Inspector'
import { ProductTree } from './shell/ProductTree'
import { ToolLauncher } from './shell/ToolLauncher'
import { ToolTabs } from './shell/ToolTabs'
import { ToolToolbar } from './shell/ToolToolbar'
import { WorkArea } from './shell/WorkArea'
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

export default function App({ repository }: { repository: DemoRepository }) {
  const status = useWorkspaceStore((s) => s.status)
  const loadError = useWorkspaceStore((s) => s.loadError)
  const layout = useWorkspaceStore((s) => s.layout)
  const setLayout = useWorkspaceStore((s) => s.setLayout)
  const activeTool = getTool(useWorkspaceStore((s) => s.activeToolId))
  const [launcherOpen, setLauncherOpen] = useState(false)

  useEffect(() => {
    if (started) return
    started = true
    void start(repository)
  }, [repository])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setLauncherOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (status === 'loading') {
    return (
      <div className="ws-splash">
        <span className="ws-spinner" aria-hidden="true" />
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
          <button
            type="button"
            className="ws-button ws-button-primary"
            onClick={() => {
              repository.offline = false
              void start(repository)
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const columns = `${layout.treeOpen ? 'var(--ws-tree-w)' : '0px'} minmax(0, 1fr) ${layout.inspectorOpen ? 'var(--ws-insp-w)' : '0px'}`

  return (
    <div className="ws-app">
      <Header repository={repository} />
      <div className="ws-body" style={{ gridTemplateColumns: columns }}>
        <aside className="ws-left" aria-label="Product tree" hidden={!layout.treeOpen}>
          <div className="ws-pane-title">
            <span>Product tree</span>
          </div>
          <ProductTree />
        </aside>
        <div className="ws-center">
          <div className="ws-center-top">
            <button
              type="button"
              className="ws-icon-button"
              onClick={() => setLayout({ treeOpen: !layout.treeOpen })}
              aria-pressed={layout.treeOpen}
              title={layout.treeOpen ? 'Hide product tree' : 'Show product tree'}
            >
              <Icons.panelLeft />
            </button>
            <ToolTabs onOpenLauncher={() => setLauncherOpen(true)} />
            <button
              type="button"
              className="ws-icon-button"
              onClick={() => setLayout({ inspectorOpen: !layout.inspectorOpen })}
              aria-pressed={layout.inspectorOpen}
              title={layout.inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            >
              <Icons.panelRight />
            </button>
          </div>
          {activeTool && <ToolToolbar tool={activeTool} />}
          <WorkArea />
          <BottomDock />
        </div>
        <div className="ws-right" hidden={!layout.inspectorOpen}>
          <Inspector />
        </div>
      </div>
      {launcherOpen && <ToolLauncher onClose={() => setLauncherOpen(false)} />}
    </div>
  )
}
