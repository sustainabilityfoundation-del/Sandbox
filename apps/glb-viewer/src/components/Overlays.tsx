import { useEffect, useState } from 'react'
import { SAMPLE_MODEL_URL, useViewerStore } from '../state/viewerStore'
import { AlertIcon, CloseIcon, OpenIcon, PartIcon } from './icons'

/** Checks for the optional bundled sample without depending on it existing. */
function useSampleAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(SAMPLE_MODEL_URL, { method: 'HEAD', signal: controller.signal })
      .then((res) => {
        // SPA hosts may answer a missing file with index.html; don't treat that as a model.
        const type = res.headers.get('content-type') ?? ''
        setAvailable(res.ok && !type.includes('text/html'))
      })
      .catch(() => setAvailable(false))
    return () => controller.abort()
  }, [])
  return available
}

export function EmptyState({ onOpen }: { onOpen: () => void }) {
  const sampleAvailable = useSampleAvailable()
  const openSample = useViewerStore((s) => s.openSample)

  return (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-icon">
          <PartIcon width={40} height={40} strokeWidth={1.2} />
        </div>
        <h1>View a SolidWorks model</h1>
        <p>
          Open a <strong>.glb</strong> file exported from SolidWorks, or drag it anywhere onto this window.
          Files are processed locally in your browser and never uploaded.
        </p>
        <div className="empty-actions">
          <button type="button" className="button button-primary button-large" onClick={onOpen}>
            <OpenIcon />
            <span>Open model</span>
          </button>
          {sampleAvailable && (
            <button type="button" className="button button-large" onClick={() => void openSample()}>
              Load sample
            </button>
          )}
        </div>
        <details className="empty-help">
          <summary>How do I export a GLB from SolidWorks?</summary>
          <ol>
            <li>Open your part or assembly in SolidWorks.</li>
            <li>
              Choose <em>File › Save As</em>.
            </li>
            <li>
              Set <em>Save as type</em> to <em>glTF Binary (*.glb)</em>, then save.
            </li>
            <li>Open the saved .glb file here.</li>
          </ol>
          <p className="muted">
            Native .sldprt / .sldasm files and STEP files cannot be opened directly.
          </p>
        </details>
      </div>
    </div>
  )
}

export function LoadingOverlay() {
  const loadingName = useViewerStore((s) => (s.status === 'loading' ? s.loadingName : null))
  if (!loadingName) return null
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <span className="spinner" aria-hidden="true" />
        <span>
          Loading <strong>{loadingName}</strong>…
        </span>
      </div>
    </div>
  )
}

export function ErrorBanner() {
  const error = useViewerStore((s) => s.error)
  const dismissError = useViewerStore((s) => s.dismissError)
  if (!error) return null
  return (
    <div className="error-banner" role="alert">
      <AlertIcon className="error-icon" width={18} height={18} />
      <div className="error-text">
        <strong>{error.title}</strong>
        <p>{error.message}</p>
      </div>
      <button type="button" className="icon-button small" onClick={dismissError} aria-label="Dismiss error">
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  )
}

export function DropOverlay() {
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-target">
        <OpenIcon width={32} height={32} />
        <span>Drop a .glb file to open it</span>
      </div>
    </div>
  )
}
