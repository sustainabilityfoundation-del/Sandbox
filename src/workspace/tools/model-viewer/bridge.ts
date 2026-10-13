import type { ViewCommandKind } from '../../../state/viewerStore'

/**
 * Lets the (eagerly loaded) toolbar drive the (lazily loaded) 3D view without
 * importing three.js up front. The view installs the handlers when it mounts.
 */
export interface ViewerBridge {
  openFile: () => void
  loadActuator: () => void
  requestView: (kind: ViewCommandKind) => void
  setDisplayMode: (mode: 'solid' | 'wireframe') => void
  toggleGrid: () => void
  toggleTree: () => void
}

export const bridge: { current: ViewerBridge | null } = { current: null }

/** Mirror of viewer state for the toolbar (kept in the tool's view state). */
export interface ModelViewerViewState {
  fileName: string | null
  loading: boolean
  displayMode: 'solid' | 'wireframe'
  showGrid: boolean
  treeOpen: boolean
}

export const ACTUATOR_MODEL_URL = `${import.meta.env.BASE_URL}models/actuator.glb`
