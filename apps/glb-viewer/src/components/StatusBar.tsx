import { useViewerStore } from '../state/viewerStore'
import { formatBytes, formatCount } from './format'
import { CloseIcon, EyeOffIcon } from './icons'

/** File details and the current selection, along the bottom of the viewport. */
export function StatusBar() {
  const model = useViewerStore((s) => s.model)
  const selectedId = useViewerStore((s) => s.selectedId)
  const select = useViewerStore((s) => s.select)
  const toggleHidden = useViewerStore((s) => s.toggleHidden)
  if (!model) return null

  const selectedName = selectedId ? model.nameById.get(selectedId) : undefined

  return (
    <div className="statusbar">
      <dl className="stats">
        <div className="stat stat-file">
          <dt>File</dt>
          <dd title={`${model.fileName} (${formatBytes(model.fileSize)})`}>{model.fileName}</dd>
        </div>
        <div className="stat">
          <dt>Meshes</dt>
          <dd>{formatCount(model.meshCount)}</dd>
        </div>
        <div className="stat">
          <dt>Triangles</dt>
          <dd>{formatCount(model.triangleCount)}</dd>
        </div>
      </dl>
      <div className="selection" aria-live="polite">
        {selectedId && selectedName ? (
          <>
            <span className="selection-label">Selected</span>
            <span className="selection-name" title={selectedName}>
              {selectedName}
            </span>
            <button
              type="button"
              className="icon-button small"
              onClick={() => {
                toggleHidden(selectedId)
                select(null)
              }}
              title="Hide selected (H)"
              aria-label="Hide selected component"
            >
              <EyeOffIcon width={14} height={14} />
            </button>
            <button
              type="button"
              className="icon-button small"
              onClick={() => select(null)}
              title="Clear selection (Esc)"
              aria-label="Clear selection"
            >
              <CloseIcon width={14} height={14} />
            </button>
          </>
        ) : (
          <span className="selection-hint">Click a part to select it</span>
        )}
      </div>
    </div>
  )
}
