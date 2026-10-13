import { useViewerStore, type ViewDirection } from '../state/viewerStore'
import {
  FitIcon,
  GridIcon,
  OpenIcon,
  ResetIcon,
  SidebarIcon,
  SolidIcon,
  WireframeIcon,
} from './icons'

const VIEWS: { kind: ViewDirection; label: string; title: string }[] = [
  { kind: 'front', label: 'Front', title: 'Front view' },
  { kind: 'back', label: 'Back', title: 'Back view' },
  { kind: 'left', label: 'Left', title: 'Left view' },
  { kind: 'right', label: 'Right', title: 'Right view' },
  { kind: 'top', label: 'Top', title: 'Top view' },
  { kind: 'bottom', label: 'Bottom', title: 'Bottom view' },
  { kind: 'iso', label: 'Iso', title: 'Isometric view' },
]

export function Toolbar({ onOpen }: { onOpen: () => void }) {
  const hasModel = useViewerStore((s) => s.model !== null)
  const loading = useViewerStore((s) => s.status === 'loading')
  const displayMode = useViewerStore((s) => s.displayMode)
  const showGrid = useViewerStore((s) => s.showGrid)
  const sidebarOpen = useViewerStore((s) => s.sidebarOpen)
  const { requestView, setDisplayMode, toggleGrid, setSidebarOpen } = useViewerStore.getState()

  return (
    <header className="toolbar">
      <div className="toolbar-brand">
        <button
          type="button"
          className="icon-button"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-pressed={sidebarOpen}
          aria-label={sidebarOpen ? 'Hide model tree' : 'Show model tree'}
          title={sidebarOpen ? 'Hide model tree' : 'Show model tree'}
        >
          <SidebarIcon />
        </button>
        <span className="brand-name">GLB Viewer</span>
      </div>

      <div className="toolbar-scroll" role="toolbar" aria-label="Viewer controls">
        <button type="button" className="button button-primary" onClick={onOpen} disabled={loading}>
          <OpenIcon />
          <span>Open model</span>
        </button>

        <div className="toolbar-group">
          <button
            type="button"
            className="button"
            onClick={() => requestView('fit')}
            disabled={!hasModel}
            title="Fit visible components to the view (F)"
          >
            <FitIcon />
            <span>Fit</span>
          </button>
          <button
            type="button"
            className="button"
            onClick={() => requestView('reset')}
            disabled={!hasModel}
            title="Reset to the initial isometric view"
          >
            <ResetIcon />
            <span>Reset</span>
          </button>
        </div>

        <div className="segmented" role="group" aria-label="Standard views">
          {VIEWS.map((v) => (
            <button
              key={v.kind}
              type="button"
              onClick={() => requestView(v.kind)}
              disabled={!hasModel}
              title={v.title}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="Display mode">
          <button
            type="button"
            aria-pressed={displayMode === 'solid'}
            onClick={() => setDisplayMode('solid')}
            disabled={!hasModel}
            title="Shaded display"
          >
            <SolidIcon />
            <span>Solid</span>
          </button>
          <button
            type="button"
            aria-pressed={displayMode === 'wireframe'}
            onClick={() => setDisplayMode('wireframe')}
            disabled={!hasModel}
            title="Wireframe display (W)"
          >
            <WireframeIcon />
            <span>Wireframe</span>
          </button>
        </div>

        <button
          type="button"
          className="button"
          aria-pressed={showGrid}
          onClick={toggleGrid}
          disabled={!hasModel}
          title="Toggle floor grid"
        >
          <GridIcon />
          <span>Grid</span>
        </button>
      </div>
    </header>
  )
}
