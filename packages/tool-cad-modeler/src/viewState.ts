/** Private state of one CAD Modeler view instance (never shared model data). */

export type PanelTab = 'model' | 'edit' | 'inspect' | 'diagnostics'

export type Editing =
  | { kind: 'new-sketch' }
  | { kind: 'sketch'; sketchId: string }
  | { kind: 'extrude'; featureId?: string }
  | { kind: 'revolve'; featureId?: string }
  | { kind: 'fillet'; featureId?: string }
  | { kind: 'chamfer'; featureId?: string }
  | { kind: 'datum-plane'; featureId?: string }

export type SelectionItem =
  | { kind: 'face' | 'edge'; id: string; bodyId: string }
  | { kind: 'body'; id: string }
  | { kind: 'feature'; id: string }
  | { kind: 'sketch-entity'; id: string; sketchId: string }
  | { kind: 'parameter'; id: string; partId: string }

export type ViewPreset = 'fit' | 'iso' | 'front' | 'top' | 'right'

export interface CadModelerViewState {
  /** Document shown by this view (null: follow the session's active document). */
  documentId: string | null
  tab: PanelTab
  editing: Editing | null
  selection: SelectionItem[]
  showEdges: boolean
  /** Edges highlighted in the 3D view (fillet and chamfer forms). */
  highlightEdges?: string[]
  /** Open dialog (documents of the project in the CAD service). */
  dialog?: 'open' | null
  viewRequest: { kind: ViewPreset; seq: number } | null
  /** Mirror of session flags so the toolbar re-renders when they change. */
  status: { hasDoc: boolean; canUndo: boolean; canRedo: boolean; hasBody: boolean; dirty: boolean; busy: boolean }
}

export const INITIAL_VIEW_STATE: CadModelerViewState = {
  documentId: null,
  tab: 'model',
  editing: null,
  selection: [],
  showEdges: true,
  viewRequest: null,
  status: { hasDoc: false, canUndo: false, canRedo: false, hasBody: false, dirty: false, busy: false },
}
