/** Private state of one SysML Modeler view instance (never shared engineering data). */
export interface ModelerViewState {
  /** Centre area. */
  tab: 'diagram' | 'text' | 'validation' | 'history' | 'matrix' | 'coverage'
  /** Diagram kind (SysML v2 standard view presentations). */
  view: 'general' | 'interconnection' | 'action-flow' | 'state-transition'
  /** Relationship matrix kind (Grid View). */
  matrix: 'satisfy' | 'allocate' | 'connect'
  coverageGapsOnly: boolean
  /** Element selected in this view (SysML elements are not twin objects, so selection is view-private). */
  selectedId: string | null
  /** Namespace or definition the diagram and text show; null = the model root / first package. */
  rootId: string | null
  expanded: string[]
  search: string
  metaclassFilter: string
  /** Narrow layouts show one pane at a time. */
  pane: 'browser' | 'view' | 'properties'
  dialog: null | { kind: 'create'; ownerId: string | null } | { kind: 'connect'; contextId: string } | { kind: 'project' }
  zoom: number
}

export const INITIAL_VIEW_STATE: ModelerViewState = {
  tab: 'diagram',
  view: 'general',
  selectedId: null,
  rootId: null,
  expanded: [],
  search: '',
  metaclassFilter: '',
  pane: 'view',
  dialog: null,
  zoom: 1,
  matrix: 'satisfy',
  coverageGapsOnly: false,
}
