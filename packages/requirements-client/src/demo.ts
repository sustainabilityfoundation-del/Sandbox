import {
  REQUIREMENTS_CONTRACT_VERSION,
  RequirementsServiceError,
  type RequirementLifecycleStatus,
  type RequirementSummary,
  type RequirementTraceLink,
  type RequirementsEvent,
  type RequirementsService,
} from '@ews/platform-sdk'

/**
 * Explicit demo adapter (mode 'demo'): in-browser data with the same identities, revision checks,
 * idempotency and validation rules as the API for the SDK contract. Chosen deliberately (harness
 * option or workspace setting); it is never a fallback for a failing API. It implements only the
 * SDK contract: collections, reviews, baselines, quality checks and ReqIF need API mode.
 */

interface DemoRequirement extends RequirementSummary {
  rationale: string
  legacyIds: string[]
}

const DEFAULT_TYPES = ['functional', 'performance', 'interface', 'environmental', 'physical', 'design-constraint', 'safety', 'other']

const SEED: Omit<DemoRequirement, 'projectId' | 'revision' | 'archived' | 'updatedAt'>[] = [
  { id: '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001', key: 'REQ-001', legacyIds: ['REQ-001'], title: 'Operating load', statement: 'The actuator shall withstand an operating load of 12 kN in the maximum-load scenario with a positive margin of safety.', rationale: 'Peak press-fit force measured on the customer line is 11 kN; 12 kN adds a handling allowance.', type: 'performance', status: 'approved', applicability: [], verificationMethods: ['analysis', 'test'] },
  { id: '5b1c7e2a-0002-4e6a-9c1d-6f0a3d2b1002', key: 'REQ-002', legacyIds: ['REQ-002'], title: 'Extension time', statement: 'The actuator shall extend its full 300 mm stroke in no more than 6.0 s at nominal load.', rationale: 'Cycle-time budget of the assembly cell.', type: 'performance', status: 'approved', applicability: [], verificationMethods: ['test'] },
  { id: '5b1c7e2a-0003-4e6a-9c1d-6f0a3d2b1003', key: 'REQ-003', legacyIds: ['REQ-003'], title: 'Ingress protection', statement: 'The housing shall provide ingress protection to IP65.', rationale: 'Wash-down cleaning in the food-packaging variant.', type: 'environmental', status: 'in-review', applicability: [], verificationMethods: ['inspection'] },
  { id: '5b1c7e2a-0004-4e6a-9c1d-6f0a3d2b1004', key: 'REQ-004', legacyIds: [], title: 'Rod buckling safety', statement: 'The rod shall have a buckling safety factor of at least 3.0 under an axial compressive load of 12 kN at full extension.', rationale: 'Derived from the operating load for the rod as the most buckling-critical part.', type: 'performance', status: 'draft', applicability: [], verificationMethods: ['analysis'] },
  { id: '5b1c7e2a-0005-4e6a-9c1d-6f0a3d2b1005', key: 'REQ-005', legacyIds: [], title: 'Motor power', statement: 'The motor shall deliver at least 350 W continuous mechanical power at 3000 rpm.', rationale: 'Part of the decomposition of the extension-time requirement.', type: 'performance', status: 'draft', applicability: [], verificationMethods: ['test'] },
  { id: '5b1c7e2a-0006-4e6a-9c1d-6f0a3d2b1006', key: 'REQ-006', legacyIds: [], title: 'Cleaning', statement: 'The housing should be easy to clean and shall resist corrosion etc. as appropriate.', rationale: '', type: 'environmental', status: 'draft', applicability: [], verificationMethods: [] },
]

const LINKS: { type: RequirementTraceLink['type']; from: string; to: string }[] = [
  { type: 'allocated-to', from: 'REQ-001', to: 'ROD-120' },
  { type: 'allocated-to', from: 'REQ-001', to: 'HSG-110' },
  { type: 'allocated-to', from: 'REQ-002', to: 'ACT-100' },
  { type: 'allocated-to', from: 'REQ-002', to: 'MTR-130' },
  { type: 'allocated-to', from: 'REQ-003', to: 'HSG-110' },
  { type: 'allocated-to', from: 'REQ-004', to: 'ROD-120' },
  { type: 'allocated-to', from: 'REQ-005', to: 'MTR-130' },
  { type: 'derives-from', from: 'REQ-004', to: 'REQ-001' },
  { type: 'decomposes', from: 'REQ-005', to: 'REQ-002' },
]

export interface DemoOptions {
  projectId?: string
  /** Simulated latency in ms (default 0). */
  latencyMs?: number
  actor?: string
  now?: () => Date
}

export function createDemoRequirementsService(options: DemoOptions = {}): RequirementsService & { readonly demo: true } {
  const projectId = options.projectId ?? 'PRJ-ACT100'
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const latency = () => new Promise((r) => setTimeout(r, options.latencyMs ?? 0))
  const start = now()
  const history = new Map<string, DemoRequirement[]>()
  for (const s of SEED) history.set(s.id, [{ ...s, projectId, revision: 1, archived: false, updatedAt: start }])
  const byKey = new Map(SEED.map((s) => [s.key, s.id]))
  const links: RequirementTraceLink[] = LINKS.map((l, i) => ({
    id: `demo-link-${i + 1}`,
    type: l.type,
    from: byKey.get(l.from)!,
    to: byKey.get(l.to) ?? l.to,
    ownerModule: 'requirements',
    fromRevision: 1,
  }))
  const idempotency = new Map<string, { hash: string; result: RequirementSummary }>()
  const listeners = new Map<string, Set<(e: RequirementsEvent) => void>>()
  let counter = SEED.length

  const current = (id: string) => history.get(id)?.at(-1)
  const summary = (r: DemoRequirement): RequirementSummary => ({
    id: r.id, key: r.key, projectId: r.projectId, revision: r.revision, title: r.title, statement: r.statement, type: r.type,
    status: r.status, archived: r.archived, applicability: [...r.applicability], verificationMethods: [...r.verificationMethods], updatedAt: r.updatedAt,
  })
  const checkProject = (p: string) => {
    if (p !== projectId) throw new RequirementsServiceError('forbidden', `The demo adapter only holds project ${projectId}.`)
  }
  const noBaselines = (scope: { baselineId?: string }) => {
    if (scope.baselineId) throw new RequirementsServiceError('unavailable', 'Requirements baselines are only available in API mode (the demo adapter has none).')
  }
  const emit = (type: RequirementsEvent['type'], entityId: string, committedRevision: number) => {
    const event: RequirementsEvent = { eventId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, type, projectId, entityId, committedRevision, occurredAt: now(), actor: options.actor ?? 'demo' }
    // Delivered after the change is "committed" (the mutation has completed).
    queueMicrotask(() => listeners.get(projectId)?.forEach((l) => l(event)))
  }
  const validate = (f: { title?: string; statement?: string; type?: string }) => {
    const fields: Record<string, string> = {}
    if (f.title !== undefined && (!f.title.trim() || f.title.length > 300)) fields.title = 'required, at most 300 characters'
    if (f.statement !== undefined && f.statement.length > 20000) fields.statement = 'at most 20 000 characters'
    if (f.type !== undefined && !DEFAULT_TYPES.includes(f.type)) fields.type = `must be one of ${DEFAULT_TYPES.join(', ')}`
    if (Object.keys(fields).length) throw new RequirementsServiceError('invalid', 'The requirement is not valid.', { fields })
  }
  const applicable = (r: DemoRequirement, cfg?: string) => !cfg || r.applicability.length === 0 || r.applicability.includes(cfg)

  return {
    contractVersion: REQUIREMENTS_CONTRACT_VERSION,
    mode: 'demo',
    demo: true,
    async get(id, scope) {
      await latency()
      checkProject(scope.projectId)
      noBaselines(scope)
      const revs = history.get(id)
      const r = scope.revision ? revs?.find((x) => x.revision === scope.revision) : revs?.at(-1)
      return r && applicable(r, scope.configurationId) ? summary(r) : undefined
    },
    async resolve(keyOrLegacyId, scope) {
      await latency()
      checkProject(scope.projectId)
      noBaselines(scope)
      const r = [...history.values()].map((h) => h.at(-1)!).find((x) => x.key === keyOrLegacyId || x.legacyIds.includes(keyOrLegacyId))
      return r && applicable(r, scope.configurationId) ? summary(r) : undefined
    },
    async list(q) {
      await latency()
      checkProject(q.projectId)
      noBaselines(q)
      const limit = q.limit ?? 50
      if (limit < 1 || limit > 200) throw new RequirementsServiceError('invalid', 'limit must be between 1 and 200.')
      const text = q.text?.trim().toLowerCase()
      const all = [...history.values()]
        .map((h) => h.at(-1)!)
        .filter((r) => (q.includeArchived || !r.archived) && applicable(r, q.configurationId))
        .filter((r) => !q.ids || q.ids.includes(r.id))
        .filter((r) => !q.keys || q.keys.includes(r.key) || r.legacyIds.some((l) => q.keys!.includes(l)))
        .filter((r) => !q.status?.length || q.status.includes(r.status))
        .filter((r) => !text || [r.key, r.title, r.statement, r.rationale].some((s) => s.toLowerCase().includes(text)))
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }) || a.id.localeCompare(b.id))
      let offset = 0
      if (q.cursor) {
        const n = Number(q.cursor.replace(/^demo:/, ''))
        if (!q.cursor.startsWith('demo:') || !Number.isInteger(n) || n < 0) throw new RequirementsServiceError('invalid', 'The cursor is not valid.')
        offset = n
      }
      const items = all.slice(offset, offset + limit).map(summary)
      return { items, nextCursor: offset + limit < all.length ? `demo:${offset + limit}` : undefined, total: all.length }
    },
    async create(input, opts) {
      await latency()
      checkProject(input.projectId)
      if (!opts?.idempotencyKey) throw new RequirementsServiceError('invalid', 'create needs an idempotencyKey so a retry cannot create a duplicate.')
      const hash = JSON.stringify(input)
      const prior = idempotency.get(opts.idempotencyKey)
      if (prior) {
        if (prior.hash !== hash) throw new RequirementsServiceError('invalid', 'This idempotency key was already used for a different request.')
        return prior.result
      }
      validate({ title: input.title, statement: input.statement, type: input.type ?? 'functional' })
      counter++
      const id = globalThis.crypto?.randomUUID?.() ?? `demo-${counter}`
      const r: DemoRequirement = {
        id, key: `REQ-${String(counter).padStart(3, '0')}`, projectId, revision: 1, title: input.title.trim(), statement: input.statement.trim(), rationale: input.rationale ?? '',
        type: input.type ?? 'functional', status: 'draft' as RequirementLifecycleStatus, archived: false, applicability: [], verificationMethods: [], updatedAt: now(), legacyIds: [],
      }
      history.set(id, [r])
      const result = summary(r)
      idempotency.set(opts.idempotencyKey, { hash, result })
      emit('requirement.created', id, 1)
      return result
    },
    async update(id, patch, opts) {
      await latency()
      const cur = current(id)
      if (!cur) throw new RequirementsServiceError('not-found', `Requirement ${id} not found.`)
      if (opts.idempotencyKey) {
        const prior = idempotency.get(opts.idempotencyKey)
        if (prior) return prior.result
      }
      if (cur.revision !== opts.expectedRevision) throw new RequirementsServiceError('conflict', `${cur.key} changed since revision ${opts.expectedRevision} (now ${cur.revision}).`, { currentRevision: cur.revision })
      validate(patch)
      if (cur.archived) throw new RequirementsServiceError('invalid', `${cur.key} is archived.`)
      const next: DemoRequirement = {
        ...cur,
        title: patch.title?.trim() ?? cur.title,
        statement: patch.statement?.trim() ?? cur.statement,
        rationale: patch.rationale ?? cur.rationale,
        type: patch.type ?? cur.type,
      }
      const changed = next.title !== cur.title || next.statement !== cur.statement || next.rationale !== cur.rationale || next.type !== cur.type
      if (!changed) return summary(cur)
      next.revision = cur.revision + 1
      next.updatedAt = now()
      if (cur.status === 'approved' || cur.status === 'in-review') next.status = 'draft'
      history.get(id)!.push(next)
      const result = summary(next)
      if (opts.idempotencyKey) idempotency.set(opts.idempotencyKey, { hash: JSON.stringify(patch), result })
      emit('requirement.updated', id, next.revision)
      return result
    },
    async traceLinks(id, scope) {
      await latency()
      checkProject(scope.projectId)
      noBaselines(scope)
      return links.filter((l) => l.from === id || l.to === id).map((l) => ({ ...l }))
    },
    subscribe(p, listener) {
      const set = listeners.get(p) ?? new Set()
      set.add(listener)
      listeners.set(p, set)
      return () => set.delete(listener)
    },
  }
}
