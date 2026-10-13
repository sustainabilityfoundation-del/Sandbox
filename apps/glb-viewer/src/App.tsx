import { useRef } from 'react'
import { HierarchySidebar } from './components/HierarchySidebar'
import { DropOverlay, EmptyState, ErrorBanner, LoadingOverlay } from './components/Overlays'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { useFileDrop } from './hooks/useFileDrop'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useViewerStore } from './state/viewerStore'
import { Viewport } from './viewer/Viewport'

export default function App() {
  const openFile = useViewerStore((s) => s.openFile)
  const showEmptyState = useViewerStore((s) => s.model === null && s.status !== 'loading')
  const fileInput = useRef<HTMLInputElement>(null)
  const dragging = useFileDrop((file) => void openFile(file))
  useKeyboardShortcuts()

  const chooseFile = () => fileInput.current?.click()

  return (
    <div className="app">
      <Toolbar onOpen={chooseFile} />
      <input
        ref={fileInput}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // allow re-opening the same file
          if (file) void openFile(file)
        }}
      />
      <div className="workspace">
        <HierarchySidebar />
        <main className="viewport">
          <Viewport />
          {showEmptyState && <EmptyState onOpen={chooseFile} />}
          <ErrorBanner />
          <LoadingOverlay />
          <StatusBar />
        </main>
      </div>
      {dragging && <DropOverlay />}
    </div>
  )
}
