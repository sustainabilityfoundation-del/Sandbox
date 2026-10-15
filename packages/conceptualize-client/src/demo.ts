import {
  CONCEPTS_CONTRACT_VERSION,
  ConceptsServiceError,
  type ConceptImplementationSummary,
  type ConceptSummary,
  type ConceptsService,
} from '@ews/platform-sdk'

/**
 * Explicit demo adapter (mode 'demo'): the SDK read contract over in-browser example data with the
 * same identities as the API seed (CON-001 … CON-009). Chosen deliberately (harness option or
 * workspace setting); never a fallback for a failing API. Authoring, alternatives, trade studies and
 * the assistant's proposals need API mode.
 */

const id = (n: number) => `c0ce0000-0000-4000-8000-${String(n).padStart(12, '0')}`

const SEED: Omit<ConceptSummary, 'projectId' | 'revision' | 'updatedAt'>[] = [
  { id: id(1), key: 'CON-001', name: 'Linear actuator ACT-100', summary: 'Electromechanical linear actuator for the press-fit station: 300 mm stroke, 12 kN operating load.', abstraction: 'system', classifications: ['actuator', 'electromechanical'], maturity: 'engineering-development' },
  { id: id(2), key: 'CON-002', name: 'Generate linear motion', summary: 'Turn motor rotation into translation of the rod over the full stroke.', abstraction: 'function', classifications: [], maturity: 'defined' },
  { id: id(3), key: 'CON-003', name: 'Carry the axial load', summary: 'Transfer the press-fit load from the rod to the frame without buckling.', abstraction: 'function', classifications: [], maturity: 'defined' },
  { id: id(4), key: 'CON-004', name: 'Protect against ingress', summary: 'Keep dust and wash-down water out of the drive (IP65).', abstraction: 'function', classifications: [], maturity: 'defined' },
  { id: id(5), key: 'CON-005', name: 'Provide controlled mechanical power transmission', summary: 'Transmit motor power to the screw at a controlled ratio.', abstraction: 'function', classifications: ['power transmission'], maturity: 'evaluated' },
  { id: id(6), key: 'CON-006', name: 'Gear train', summary: 'Spur gear pair between motor and screw.', abstraction: 'component', classifications: ['power transmission'], maturity: 'selected' },
  { id: id(7), key: 'CON-007', name: 'Belt drive', summary: 'Toothed belt and pulleys.', abstraction: 'component', classifications: ['power transmission'], maturity: 'evaluated' },
  { id: id(8), key: 'CON-008', name: 'Chain drive', summary: 'Roller chain and sprockets.', abstraction: 'component', classifications: ['power transmission'], maturity: 'evaluated' },
  { id: id(9), key: 'CON-009', name: 'Direct-drive motor', summary: 'Motor shaft coupled directly to the screw.', abstraction: 'component', classifications: ['power transmission'], maturity: 'evaluated' },
]

const IMPLEMENTATIONS: Omit<ConceptImplementationSummary, 'updatedAt'>[] = [
  {
    id: 'd0ce0000-0000-4000-8000-000000000001',
    name: 'ACT-100 electromechanical design',
    conceptIds: [id(1), id(2), id(3)],
    status: 'in-development',
    artifacts: [
      { module: 'twin', id: 'ACT-100', kind: 'assembly' },
      { module: 'sysml', id: 'SYS-001', kind: 'sysml-part' },
      { module: 'cad', id: 'CAD-120', kind: 'cad-representation' },
      { module: 'cad', id: 'CAD-110', kind: 'cad-representation' },
    ],
  },
  { id: 'd0ce0000-0000-4000-8000-000000000002', name: 'Housing sealing', conceptIds: [id(4)], status: 'candidate', artifacts: [{ module: 'twin', id: 'HSG-110', kind: 'part' }] },
]

export interface DemoOptions {
  projectId?: string
  latencyMs?: number
  now?: () => Date
}

export function createDemoConceptsService(options: DemoOptions = {}): ConceptsService & { readonly demo: true } {
  const projectId = options.projectId ?? 'PRJ-ACT100'
  const at = (options.now?.() ?? new Date()).toISOString()
  const latency = () => new Promise((r) => setTimeout(r, options.latencyMs ?? 0))
  const concepts: ConceptSummary[] = SEED.map((c) => ({ ...c, projectId, revision: 1, updatedAt: at }))
  const impls: ConceptImplementationSummary[] = IMPLEMENTATIONS.map((i) => ({ ...i, updatedAt: at }))
  const inProject = (p: string) => {
    if (p !== projectId) throw new ConceptsServiceError('forbidden', `The demo data covers project ${projectId} only.`)
  }
  return {
    demo: true,
    contractVersion: CONCEPTS_CONTRACT_VERSION,
    mode: 'demo',
    async get(cid, scope) {
      await latency()
      inProject(scope.projectId)
      const c = concepts.find((x) => x.id === cid)
      if (!c || (scope.revision && scope.revision !== 1)) return undefined
      return { ...c }
    },
    async list(q) {
      await latency()
      inProject(q.projectId)
      const limit = q.limit ?? 50
      if (limit < 1 || limit > 200) throw new ConceptsServiceError('invalid', 'limit must be between 1 and 200.', { fields: { limit: '1–200' } })
      const text = q.text?.toLowerCase().trim()
      const items = concepts.filter(
        (c) =>
          (!q.ids?.length || q.ids.includes(c.id)) &&
          (!q.maturity?.length ? c.maturity !== 'archived' && c.maturity !== 'superseded' : q.maturity.includes(c.maturity)) &&
          (!text || `${c.key} ${c.name} ${c.summary}`.toLowerCase().includes(text)),
      )
      let start = 0
      if (q.cursor) {
        start = Number(atob(q.cursor))
        if (!Number.isInteger(start) || start < 0) throw new ConceptsServiceError('invalid', 'The cursor is not valid.')
      }
      const page = items.slice(start, start + limit)
      return { items: page.map((c) => ({ ...c })), total: items.length, ...(start + limit < items.length ? { nextCursor: btoa(String(start + limit)) } : {}) }
    },
    async conceptsForArtifact(artifact, scope) {
      await latency()
      inProject(scope.projectId)
      return impls
        .filter((i) => i.artifacts.some((a) => a.module === artifact.module && a.id === artifact.id))
        .flatMap((i) => i.conceptIds.map((cid) => ({ concept: { ...concepts.find((c) => c.id === cid)! }, implementation: { ...i } })))
    },
    async implementations(conceptId, scope) {
      await latency()
      inProject(scope.projectId)
      return impls.filter((i) => i.conceptIds.includes(conceptId)).map((i) => ({ ...i }))
    },
    subscribe() {
      // Demo data never changes, so there is nothing to announce.
      return () => undefined
    },
  }
}
