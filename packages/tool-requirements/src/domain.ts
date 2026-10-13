import {
  componentOf,
  readRequirement,
  type EngineeringObject,
  type ModelIndex,
  type RequirementStatus,
} from '@ews/platform-sdk'

/** Tool-specific domain logic (no React): filtering and tracing requirements. */

export const VERIFICATION_METHODS = ['Analysis', 'Test', 'Inspection', 'Demonstration']

export interface RequirementsViewState {
  /** 'selection': only requirements allocated to the selected (or last selected) component. */
  filterMode: 'all' | 'selection'
  /** Component the filter refers to, kept when a requirement itself is selected. */
  filterComponentId: string | null
  statusFilter: 'all' | RequirementStatus
  search: string
  /** Show trace columns (SysML references and representations). */
  showTrace: boolean
  editor: { requirementId: string; focus: 'details' | 'allocation'; tab: 'details' | 'relationships' | 'history' } | null
}

export const INITIAL_VIEW_STATE: RequirementsViewState = {
  filterMode: 'selection',
  filterComponentId: null,
  statusFilter: 'all',
  search: '',
  showTrace: false,
  editor: null,
}

/** The component a selection refers to: a component, or what a SysML/CAD representation represents. */
export function selectedComponent(model: ModelIndex, selectedIds: string[]): EngineeringObject | undefined {
  for (const id of selectedIds) {
    const component = componentOf(model, id)
    if (component) return component
  }
  return undefined
}

/** Requirements a selection points at directly (a requirement, or a SysML element referencing one). */
export function selectedRequirementIds(model: ModelIndex, selectedIds: string[]): string[] {
  return selectedIds.flatMap((id) => {
    const o = model.get(id)
    if (o?.type === 'requirement') return [o.id]
    if (o?.type === 'sysml-element') return model.linked(o.id, 'references', 'out')
    return []
  })
}

/** Allocated to the component or to one of its sub-components. */
export function allocatedTo(model: ModelIndex, requirementId: string, componentId: string): boolean {
  const scope = new Set([componentId, ...model.childrenOf(componentId).map((c) => c.id)])
  return model.linked(requirementId, 'allocated-to', 'out').some((id) => scope.has(id))
}

export function matchesSearch(requirement: EngineeringObject, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const r = readRequirement(requirement)
  return [r.id, r.title, r.statement, r.rationale].some((text) => text.toLowerCase().includes(q))
}

export interface FilterResult {
  visible: EngineeringObject[]
  total: number
  component: EngineeringObject | undefined
}

export function filterRequirements(model: ModelIndex, state: RequirementsViewState, selectedIds: string[]): FilterResult {
  const requirements = model.objects.filter((o) => o.type === 'requirement')
  const component = selectedComponent(model, selectedIds) ?? (state.filterComponentId ? model.get(state.filterComponentId) : undefined)
  const visible = requirements.filter(
    (r) =>
      (state.filterMode === 'all' || !component || allocatedTo(model, r.id, component.id)) &&
      (state.statusFilter === 'all' || readRequirement(r).status === state.statusFilter) &&
      matchesSearch(r, state.search),
  )
  return { visible, total: requirements.length, component }
}

/** SysML elements that reference the requirement, and parts that satisfy those references. */
export function sysmlTrace(model: ModelIndex, requirementId: string): { references: EngineeringObject[]; satisfiedBy: EngineeringObject[] } {
  const references = model.linkedObjects(requirementId, 'references', 'in').filter((o) => o.type === 'sysml-element')
  const satisfiedBy = references.flatMap((ref) => model.linkedObjects(ref.id, 'satisfies', 'in'))
  return { references, satisfiedBy }
}
