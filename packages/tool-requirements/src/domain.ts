import {
  componentOf,
  type ArtifactInput,
  type Baseline,
  type OutputRecord,
  readRequirement,
  type EngineeringObject,
  type ModelIndex,
  type RequirementStatus,
} from '@ews/platform-sdk'

/** Tool-specific domain logic (no React): filtering and tracing requirements. */

export const VERIFICATION_METHODS = ['Analysis', 'Test', 'Inspection', 'Demonstration']

export type RequirementsPage = 'table' | 'matrix' | 'baselines' | 'exchange' | 'quality'
export type DetailTab = 'details' | 'relationships' | 'reviews' | 'history' | 'comments' | 'quality' | 'verification'
export const TABLE_COLUMNS = ['key', 'title', 'status', 'type', 'priority', 'owner', 'allocation', 'verification', 'origin', 'updated', 'trace'] as const
export type TableColumn = (typeof TABLE_COLUMNS)[number]

export interface RequirementsViewState {
  /** 'selection': only requirements allocated to the selected (or last selected) component. */
  filterMode: 'all' | 'selection'
  /** Component the filter refers to, kept when a requirement itself is selected. */
  filterComponentId: string | null
  /** Twin status filter (demo mode and legacy twin data). */
  statusFilter: 'all' | RequirementStatus
  search: string
  /** Show trace columns (SysML references and representations). */
  showTrace: boolean
  /** Open detail panel: a requirement ID (canonical UUID in API mode) or 'new'. */
  editor: { requirementId: string; focus: 'details' | 'allocation'; tab: DetailTab } | null
  /** API mode: which page of the tool is shown. */
  page: RequirementsPage
  statuses: string[]
  types: string[]
  collectionId: string | null
  includeArchived: boolean
  columns: TableColumn[]
  sort: 'key' | '-updated'
  /** Read-only historical view of a requirements baseline. */
  baselineId: string | null
  /** Multi-select for bulk operations. */
  bulk: boolean
  savedViewId: string | null
}

export const DEFAULT_COLUMNS: TableColumn[] = ['key', 'title', 'status', 'type', 'allocation', 'verification']

export const INITIAL_VIEW_STATE: RequirementsViewState = {
  filterMode: 'selection',
  filterComponentId: null,
  statusFilter: 'all',
  search: '',
  showTrace: false,
  editor: null,
  page: 'table',
  statuses: [],
  types: [],
  collectionId: null,
  includeArchived: false,
  columns: DEFAULT_COLUMNS,
  sort: 'key',
  baselineId: null,
  bulk: false,
  savedViewId: null,
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

// ---- verification records -----------------------------------------------------------------

/**
 * A verification record is a saved artifact (kind 'verification-record',
 * schema version 1). It pins the exact requirement revision it verifies and
 * the configured article (configuration, optionally a baseline), names the
 * procedure or run, and may reference evidence. Its inputs are the requirement
 * and its allocated components, so editing either marks the record
 * potentially stale; the record itself never changes.
 */
export const VERIFICATION_RECORD = { kind: 'verification-record', schemaVersion: 1 } as const

export type VerificationOutcome = 'pass' | 'fail' | 'inconclusive'

export interface VerificationDraft {
  requirement: EngineeringObject
  components: EngineeringObject[]
  method: string
  outcome: VerificationOutcome
  procedure: string
  baselineId?: string
  evidenceId?: string
}

export function verificationArtifact(d: VerificationDraft): ArtifactInput {
  return {
    kind: VERIFICATION_RECORD.kind,
    schemaVersion: VERIFICATION_RECORD.schemaVersion,
    title: `${d.requirement.id} verification (${d.method})`,
    objectIds: [d.requirement.id, ...d.components.map((c) => c.id)],
    inputs: [{ id: d.requirement.id, revision: d.requirement.revision }, ...d.components.map((c) => ({ id: c.id, revision: c.revision }))],
    references: [
      { id: d.requirement.id, revision: d.requirement.revision, role: 'verifies' },
      ...(d.baselineId ? [{ id: d.baselineId, role: 'baseline' }] : []),
      ...(d.evidenceId ? [{ id: d.evidenceId, role: 'evidence' }] : []),
    ],
    scenarioId: null,
    completion: 'complete',
    result: [
      { key: 'method', label: 'Method', value: d.method },
      { key: 'outcome', label: 'Outcome', value: d.outcome },
      { key: 'procedure', label: 'Procedure / run', value: d.procedure.trim() },
    ],
    summary: `${d.outcome === 'pass' ? 'Pass' : d.outcome === 'fail' ? 'Fail' : 'Inconclusive'} by ${d.method.toLowerCase()}: ${d.procedure.trim()}`,
  }
}

export interface VerificationRecordView {
  id: string
  method: string
  outcome: VerificationOutcome
  procedure: string
  requirementRevision: number | undefined
  baselineId: string | undefined
  evidenceId: string | undefined
  configurationId: string
  createdAt: string
  stale: boolean
  staleReasons: string[]
}

export function readVerificationRecord(a: OutputRecord & { freshness: { stale: boolean; reasons: string[] } }, requirementId: string): VerificationRecordView {
  const value = (key: string) => String(a.result.find((r) => r.key === key)?.value ?? '')
  const ref = (role: string) => a.references?.find((r) => r.role === role && (role !== 'verifies' || r.id === requirementId))
  const outcome = value('outcome')
  return {
    id: a.id,
    method: value('method'),
    outcome: outcome === 'pass' || outcome === 'fail' ? outcome : 'inconclusive',
    procedure: value('procedure'),
    requirementRevision: ref('verifies')?.revision,
    baselineId: ref('baseline')?.id,
    evidenceId: ref('evidence')?.id,
    configurationId: a.configurationId,
    createdAt: a.createdAt,
    stale: a.freshness.stale,
    staleReasons: a.freshness.reasons,
  }
}

export type VerificationState = 'not-verified' | 'verified' | 'stale' | 'failed' | 'inconclusive'

/** Status from the newest record: a passing record only counts while its inputs are unchanged. */
export function verificationState(records: VerificationRecordView[]): VerificationState {
  const latest = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!latest) return 'not-verified'
  if (latest.stale) return 'stale'
  return latest.outcome === 'pass' ? 'verified' : latest.outcome === 'fail' ? 'failed' : 'inconclusive'
}

/** Baselines a record may name: same configuration and pinning the requirement's current revision. */
export function eligibleBaselines(baselines: Baseline[], requirement: EngineeringObject, configurationId: string): { baseline: Baseline; reason?: string }[] {
  return baselines.map((baseline) => {
    if (baseline.configurationId !== configurationId) return { baseline, reason: `for ${baseline.configurationId}` }
    const pinned = baseline.objects.find((o) => o.id === requirement.id)?.revision
    if (pinned !== requirement.revision) return { baseline, reason: pinned ? `pins ${requirement.id} rev ${pinned}` : `does not contain ${requirement.id}` }
    return { baseline }
  })
}

/**
 * View state for an artifact open link (`ArtifactDescriptor.open.params` from the artifact source:
 * `id` for a requirement, `collectionId`, `baselineId`). Unknown or empty params give null.
 * Used by the view when the shared selection is a collection or baseline ID, and by the SDK
 * open-params hook once it exists (SDK change proposal in the progress file).
 */
export function openLinkViewState(params: Record<string, string | undefined>): Partial<RequirementsViewState> | null {
  const uuid = (v: string | undefined) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : undefined)
  const id = uuid(params.id)
  const collectionId = uuid(params.collectionId)
  const baselineId = uuid(params.baselineId)
  if (id) return { page: 'table', editor: { requirementId: id, focus: 'details', tab: 'details' } }
  if (collectionId) return { page: 'table', collectionId, baselineId: null }
  if (baselineId) return { page: 'table', baselineId }
  return null
}
