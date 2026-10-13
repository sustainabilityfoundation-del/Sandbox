import { useEffect, useMemo, useRef } from 'react'
import '../../../styles.css'
import { HierarchySidebar } from '../../../components/HierarchySidebar'
import { DropOverlay, ErrorBanner, LoadingOverlay } from '../../../components/Overlays'
import { StatusBar } from '../../../components/StatusBar'
import { useFileDrop } from '../../../hooks/useFileDrop'
import { useKeyboardShortcuts } from '../../../hooks/useKeyboardShortcuts'
import type { LoadedModel } from '../../../loading/types'
import { useViewerStore } from '../../../state/viewerStore'
import { Viewport } from '../../../viewer/Viewport'
import {
  Icons,
  Notice,
  isComponent,
  useIsActiveTool,
  useModel,
  useSelection,
  useToolApi,
  type ModelIndex,
} from '../../sdk'
import { ACTUATOR_MODEL_URL, bridge, type ModelViewerViewState } from './bridge'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Links GLB nodes to digital-twin objects: a node whose name contains an object
 * ID (e.g. "ROD-120 Rod") maps to that object, and its descendants inherit it.
 */
function useNodeMapping(file: LoadedModel | null, twin: ModelIndex) {
  return useMemo(() => {
    const direct = new Map<string, string>()
    if (!file) return { direct, effective: () => undefined as string | undefined, nodesFor: () => [] as string[] }
    const ids = twin.objects.filter(isComponent).map((o) => o.id)
    const pattern = ids.length ? new RegExp(`(^|[^A-Za-z0-9])(${ids.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`) : null
    for (const [uuid, name] of file.nameById) {
      const match = pattern?.exec(name)
      if (match) direct.set(uuid, match[2])
    }
    const effective = (uuid: string): string | undefined => {
      for (let id: string | undefined = uuid; id; id = file.parentById.get(id)) {
        const mapped = direct.get(id)
        if (mapped) return mapped
      }
      return undefined
    }
    const depth = (uuid: string) => {
      let d = 0
      for (let id = file.parentById.get(uuid); id; id = file.parentById.get(id)) d++
      return d
    }
    // Nodes directly named for an object, shallowest first.
    const nodesFor = (objectId: string) =>
      [...direct].filter(([, o]) => o === objectId).map(([uuid]) => uuid).sort((a, b) => depth(a) - depth(b))
    return { direct, effective, nodesFor }
  }, [file, twin])
}

function EmptyViewer({ onOpen, onActuator }: { onOpen: () => void; onActuator: () => void }) {
  return (
    <div className="mv-empty">
      <div className="mv-empty-card">
        <Icons.viewer3d width={36} height={36} />
        <h2>No 3D model loaded</h2>
        <p>
          Open a <strong>.glb</strong> exported from SolidWorks, drop one here, or load the ACT-100 actuator sample. Nodes
          whose names contain an object ID such as <code>ROD-120</code> are linked to the digital twin, so selection
          follows you across tools.
        </p>
        <div className="mv-empty-actions">
          <button type="button" className="ws-button ws-button-primary" onClick={onActuator}>
            Load ACT-100 model
          </button>
          <button type="button" className="ws-button" onClick={onOpen}>
            Open GLB…
          </button>
        </div>
        <p className="ws-muted">Files are processed locally in the browser. Loaded files are not saved to the repository.</p>
      </div>
    </div>
  )
}

export default function ModelViewerView() {
  const api = useToolApi<ModelViewerViewState>()
  const active = useIsActiveTool()
  const twin = useModel()
  const { selectedIds, selectedObjects, select } = useSelection()
  const fileInput = useRef<HTMLInputElement>(null)

  const file = useViewerStore((s) => s.model)
  const status = useViewerStore((s) => s.status)
  const displayMode = useViewerStore((s) => s.displayMode)
  const showGrid = useViewerStore((s) => s.showGrid)
  const sidebarOpen = useViewerStore((s) => s.sidebarOpen)
  const nodeSelected = useViewerStore((s) => s.selectedId)
  const viewer = useViewerStore.getState

  const dragging = useFileDrop((f) => void viewer().openFile(f), active)
  useKeyboardShortcuts(active)

  // Restore the remembered panel state once, then let the toolbar drive the viewer.
  useEffect(() => {
    viewer().setSidebarOpen(api.getViewState().treeOpen)
    viewer().setDisplayMode(api.getViewState().displayMode)
    if (viewer().showGrid !== api.getViewState().showGrid) viewer().toggleGrid()
    bridge.current = {
      openFile: () => fileInput.current?.click(),
      loadActuator: () => void viewer().openUrl(ACTUATOR_MODEL_URL, 'ACT-100 actuator.glb'),
      requestView: (kind) => viewer().requestView(kind),
      setDisplayMode: (mode) => viewer().setDisplayMode(mode),
      toggleGrid: () => viewer().toggleGrid(),
      toggleTree: () => viewer().setSidebarOpen(!viewer().sidebarOpen),
    }
    return () => {
      bridge.current = null
    }
  }, [api, viewer])

  // Mirror viewer state into this tool's view state for the toolbar.
  useEffect(() => {
    api.updateViewState({
      fileName: file?.fileName ?? null,
      loading: status === 'loading',
      displayMode,
      showGrid,
      treeOpen: sidebarOpen,
    })
  }, [api, file, status, displayMode, showGrid, sidebarOpen])

  const mapping = useNodeMapping(file, twin)
  const syncingFromShared = useRef(false)
  const targetId = selectedIds.find((id) => isComponent(twin.get(id)))

  // Shared selection → highlight the matching node.
  useEffect(() => {
    if (!file) return
    const current = useViewerStore.getState().selectedId
    if (targetId && current && mapping.effective(current) === targetId) return
    const next = targetId ? (mapping.nodesFor(targetId)[0] ?? null) : null
    if (next !== current) {
      syncingFromShared.current = true
      viewer().select(next)
    }
  }, [targetId, file, mapping, viewer])

  // Node picked in the viewer → select the linked digital-twin object.
  useEffect(() => {
    if (syncingFromShared.current) {
      syncingFromShared.current = false
      return
    }
    if (!active || !file) return
    if (nodeSelected) {
      const objectId = mapping.effective(nodeSelected)
      if (objectId && !(selectedIds.length === 1 && selectedIds[0] === objectId)) select([objectId])
    } else if (selectedIds.some((id) => mapping.nodesFor(id).length > 0)) {
      select([])
    }
    // Only respond to changes of the viewer's own selection.
  }, [nodeSelected])

  const unmatched = file ? selectedObjects.filter((o) => isComponent(o) && mapping.nodesFor(o.id).length === 0) : []
  const nodeName = nodeSelected ? file?.nameById.get(nodeSelected) : undefined
  const unlinkedNode = nodeSelected && !mapping.effective(nodeSelected)

  return (
    <div className="mv-root">
      <input
        ref={fileInput}
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void viewer().openFile(f)
        }}
      />

      {file && (unmatched.length > 0 || unlinkedNode || mapping.direct.size === 0) && (
        <div className="mv-notices">
          {unmatched.length > 0 && (
            <Notice tone="info" title={`${unmatched.map((o) => `${o.id} ${o.name}`).join(', ')} is not in this file`}>
              The selection is kept. No node in “{file.fileName}” is named with this object ID.
            </Notice>
          )}
          {unlinkedNode && (
            <Notice tone="info" title={`“${nodeName}” is not linked to the digital twin`}>
              Only nodes whose names contain an object ID update the shared selection.
            </Notice>
          )}
          {mapping.direct.size === 0 && (
            <Notice tone="info" title="No nodes are linked to model objects">
              Name SolidWorks components with their object IDs (for example “ROD-120 Rod”) to link them.
            </Notice>
          )}
        </div>
      )}

      <div className="workspace mv-body">
        <HierarchySidebar />
        <main className="viewport">
          <Viewport />
          {!file && status !== 'loading' && (
            <EmptyViewer onOpen={() => fileInput.current?.click()} onActuator={() => bridge.current?.loadActuator()} />
          )}
          <ErrorBanner />
          <LoadingOverlay />
          <StatusBar />
        </main>
      </div>
      {dragging && <DropOverlay />}
    </div>
  )
}
