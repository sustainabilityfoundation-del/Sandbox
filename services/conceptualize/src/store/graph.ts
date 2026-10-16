import { invalid } from '../errors'
import { DESIGN_ENTITY_TYPES, type DesignEntityType } from '../domain/rules'
import type { PathsRequestDto, TraverseRequestDto } from '../http/designSchemas'
import { prefixQuery } from './concepts'
import { isoRequired, type Queryable } from './context'
import { allRefs } from './refs'

/**
 * Graph API (CR-C9, ADR-0041) over one vocabulary: Concept relationships, design links, concept links to
 * artifacts, and readings of stored data (realizes, implemented-with, member-of, decides, selected-through,
 * evidence-for, applies-to, decision dependencies). Persistence-independent for callers; today the
 * project's edges are assembled from the relational tables and traversed in memory (bounded: depth ≤ 6,
 * limit ≤ 500), which can be replaced by recursive queries or a projection behind the same API.
 */

export interface GRef {
  module: string
  type?: DesignEntityType
  id: string
  revision?: number
}
export interface GEdge {
  id: string
  type: string
  from: GRef
  to: GRef
  basis: string | null
  pinned: boolean
  stored: 'design-links' | 'relationships' | 'concept-links' | 'derived'
  /** R1-8: true for edges read from records (implementations, decisions, alternative sets, evidence subjects) rather than stored links. */
  derived: boolean
}
export interface GNode {
  ref: GRef
  key: string
  label: string
  revision: number | null
  type: string
  status: string
}

const keyOf = (r: GRef) => (r.module === 'conceptualize' ? `d:${r.id}` : `a:${r.module}:${r.id}`)
const d = (type: DesignEntityType, id: string, revision?: number | null): GRef => ({ module: 'conceptualize', type, id, ...(revision ? { revision } : {}) })
const a = (module: string, id: string, revision?: number | null): GRef => ({ module, id, ...(revision ? { revision } : {}) })

/** Every edge of the project valid at `asOf` (or now). */
export async function projectEdges(db: Queryable, projectId: string, asOf?: string | null): Promise<GEdge[]> {
  const at = asOf ? new Date(asOf) : null
  const alive = (created: Date, removedAt: Date | null, removed: boolean) => (at ? created <= at && (!removedAt || removedAt > at) : !removed)
  const edges: GEdge[] = []
  const rel = await db.query<{ id: string; type: string; from_id: string; to_id: string; basis: string; created_at: Date; removed_at: Date | null; removed: boolean }>('SELECT id, type, from_id, to_id, basis, created_at, removed_at, removed FROM conceptualize.relationships WHERE project_id = $1', [projectId])
  for (const r of rel.rows) if (alive(r.created_at, r.removed_at, r.removed)) edges.push({ id: r.id, type: r.type, from: d('concept', r.from_id), to: d('concept', r.to_id), basis: r.basis, pinned: false, stored: 'relationships', derived: false })
  const dl = await db.query<{ id: string; type: string; from_type: DesignEntityType; from_id: string; from_revision: number | null; to_type: string; to_id: string; to_module: string | null; to_revision: number | null; basis: string; created_at: Date; removed_at: Date | null; removed: boolean }>('SELECT * FROM conceptualize.design_links WHERE project_id = $1', [projectId])
  for (const r of dl.rows) {
    if (!alive(r.created_at, r.removed_at, r.removed)) continue
    edges.push({ id: r.id, type: r.type, from: d(r.from_type, r.from_id, r.from_revision), to: r.to_type === 'artifact' ? a(r.to_module!, r.to_id, r.to_revision) : d(r.to_type as DesignEntityType, r.to_id, r.to_revision), basis: r.basis, pinned: !!(r.from_revision || r.to_revision), stored: 'design-links', derived: false })
  }
  const cl = await db.query<{ id: string; relation: string; concept_id: string; module: string; artifact_id: string; artifact_revision: number | null; created_at: Date; removed_at: Date | null; removed: boolean }>('SELECT id, relation, concept_id, module, artifact_id, artifact_revision, created_at, removed_at, removed FROM conceptualize.concept_links WHERE project_id = $1', [projectId])
  for (const r of cl.rows) if (alive(r.created_at, r.removed_at, r.removed)) edges.push({ id: r.id, type: r.relation, from: d('concept', r.concept_id), to: a(r.module, r.artifact_id, r.artifact_revision), basis: null, pinned: !!r.artifact_revision, stored: 'concept-links', derived: false })
  const ic = await db.query<{ implementation_id: string; concept_id: string; added_at: Date; removed_at: Date | null; removed: boolean }>('SELECT ic.* FROM conceptualize.implementation_concepts ic JOIN conceptualize.implementations i ON i.id = ic.implementation_id WHERE i.project_id = $1', [projectId])
  for (const r of ic.rows) if (alive(r.added_at, r.removed_at, r.removed)) edges.push({ id: `realizes:${r.implementation_id}:${r.concept_id}`, type: 'realizes', from: d('implementation', r.implementation_id), to: d('concept', r.concept_id), basis: null, pinned: false, stored: 'derived', derived: true })
  const ia = await db.query<{ id: string; implementation_id: string; module: string; artifact_id: string; artifact_revision: number | null; added_at: Date; removed_at: Date | null; removed: boolean }>('SELECT ia.* FROM conceptualize.implementation_artifacts ia JOIN conceptualize.implementations i ON i.id = ia.implementation_id WHERE i.project_id = $1', [projectId])
  for (const r of ia.rows) if (alive(r.added_at, r.removed_at, r.removed)) edges.push({ id: r.id, type: 'realized-as', from: d('implementation', r.implementation_id), to: a(r.module, r.artifact_id, r.artifact_revision), basis: null, pinned: !!r.artifact_revision, stored: 'derived', derived: true })
  const am = await db.query<{ set_id: string; concept_id: string; status: string; added_at: Date }>('SELECT m.* FROM conceptualize.alternative_members m JOIN conceptualize.alternative_sets s ON s.id = m.set_id WHERE s.project_id = $1', [projectId])
  for (const r of am.rows) if ((!at || r.added_at <= at) && r.status !== 'withdrawn') edges.push({ id: `member:${r.set_id}:${r.concept_id}`, type: 'member', from: d('alternative-set', r.set_id), to: d('concept', r.concept_id), basis: null, pinned: false, stored: 'derived', derived: true })
  const sets = await db.query<{ id: string; parent_id: string; created_at: Date }>('SELECT id, parent_id, created_at FROM conceptualize.alternative_sets WHERE project_id = $1', [projectId])
  for (const r of sets.rows) if (!at || r.created_at <= at) edges.push({ id: `alternatives-for:${r.id}`, type: 'alternatives-for', from: d('alternative-set', r.id), to: d('concept', r.parent_id), basis: null, pinned: false, stored: 'derived', derived: true })
  const dec = await db.query<{ id: string; set_id: string | null; subject_id: string | null; status: string; superseded_by_id: string | null; outcomes: { conceptId: string; outcome: string }[]; support: { ref: { id: string }; role: string }[]; assumption_refs: { id: string; revision?: number }[]; constraint_refs: { id: string; revision?: number }[]; affected: GRef[]; invalidation_conditions: { id: string; subject: GRef }[]; proposed_at: Date }>(
    'SELECT id, set_id, subject_id, status, superseded_by_id, outcomes, support, assumption_refs, constraint_refs, affected, invalidation_conditions, proposed_at FROM conceptualize.decisions WHERE project_id = $1',
    [projectId],
  )
  for (const r of dec.rows) {
    if (at && r.proposed_at > at) continue
    if (r.set_id) edges.push({ id: `decides:${r.id}`, type: 'decides', from: d('decision', r.id), to: d('alternative-set', r.set_id), basis: null, pinned: false, stored: 'derived', derived: true })
    if (r.subject_id) edges.push({ id: `decides-subject:${r.id}`, type: 'decides', from: d('decision', r.id), to: d('concept', r.subject_id), basis: null, pinned: false, stored: 'derived', derived: true })
    // R1-8: Concept selected (or rejected) through a recorded decision.
    if (r.status === 'recorded') for (const o of r.outcomes.filter((x) => x.outcome === 'accepted' || x.outcome === 'rejected')) edges.push({ id: `selected:${r.id}:${o.conceptId}`, type: 'selected-through', from: d('concept', o.conceptId), to: d('decision', r.id), basis: 'decision', pinned: false, stored: 'derived', derived: true })
    for (const s of r.support) edges.push({ id: `support:${r.id}:${s.ref.id}`, type: s.role === 'contradicts' ? 'contradicted-by' : 'supported-by', from: d('decision', r.id), to: d('evidence', s.ref.id), basis: null, pinned: false, stored: 'derived', derived: true })
    for (const x of r.assumption_refs) edges.push({ id: `assumes:${r.id}:${x.id}`, type: 'decision-assumes', from: d('decision', r.id), to: d('assumption', x.id, x.revision), basis: null, pinned: !!x.revision, stored: 'derived', derived: true })
    for (const x of r.constraint_refs) edges.push({ id: `constrained:${r.id}:${x.id}`, type: 'decision-constrained-by', from: d('decision', r.id), to: d('constraint', x.id, x.revision), basis: null, pinned: !!x.revision, stored: 'derived', derived: true })
    for (const x of r.affected ?? []) edges.push({ id: `affects:${r.id}:${keyOf(x)}`, type: 'affects', from: d('decision', r.id), to: x, basis: null, pinned: !!x.revision, stored: 'derived', derived: true })
    for (const c of r.invalidation_conditions ?? []) edges.push({ id: `watches:${r.id}:${c.id}`, type: 'watches', from: d('decision', r.id), to: c.subject, basis: null, pinned: !!c.subject.revision, stored: 'derived', derived: true })
  }
  const es = await db.query<{ evidence_id: string; subject_type: DesignEntityType; subject_id: string; subject_revision: number | null; created_at: Date; basis: string }>('SELECT s.*, e.created_at, e.basis FROM conceptualize.evidence_subjects s JOIN conceptualize.evidence e ON e.id = s.evidence_id WHERE e.project_id = $1', [projectId])
  for (const r of es.rows) if (!at || r.created_at <= at) edges.push({ id: `evidence:${r.evidence_id}:${r.subject_id}`, type: 'subject', from: d('evidence', r.evidence_id), to: d(r.subject_type, r.subject_id, r.subject_revision), basis: r.basis, pinned: !!r.subject_revision, stored: 'derived', derived: true })
  const asm = await db.query<{ id: string; scope: { subjects?: { type: DesignEntityType; id: string }[] }; created_at: Date; basis: string }>(
    'SELECT a.id, v.scope, a.created_at, v.basis FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id AND v.revision = a.current_revision WHERE a.project_id = $1',
    [projectId],
  )
  for (const r of asm.rows) if (!at || r.created_at <= at) for (const s of r.scope.subjects ?? []) edges.push({ id: `applies:${r.id}:${s.id}`, type: 'applies-to', from: d('assumption', r.id), to: d(s.type, s.id), basis: r.basis, pinned: false, stored: 'derived', derived: true })
  const cm = await db.query<{ id: string; parameters: { symbol: string; defaultBinding?: { ref: GRef } }[]; assumptions: GRef[]; created_at: Date }>(
    'SELECT m.id::text, v.parameters, v.assumptions, m.created_at FROM conceptualize.calculation_models m JOIN conceptualize.calculation_model_revisions v ON v.model_id = m.id AND v.revision = m.current_revision WHERE m.project_id = $1',
    [projectId],
  )
  for (const r of cm.rows) {
    if (at && r.created_at > at) continue
    for (const p of r.parameters) if (p.defaultBinding) edges.push({ id: `binds:${r.id}:${p.symbol}`, type: 'binds', from: d('calculation-model' as DesignEntityType, r.id), to: p.defaultBinding.ref, basis: null, pinned: !!p.defaultBinding.ref.revision, stored: 'derived', derived: true })
    for (const a of r.assumptions ?? []) edges.push({ id: `binds:${r.id}:assumption:${a.id}`, type: 'binds', from: d('calculation-model' as DesignEntityType, r.id), to: a, basis: null, pinned: !!a.revision, stored: 'derived', derived: true })
  }
  const pe = await db.query<{ id: string; calculation: { modelId: string; modelRevision: number }; created_at: Date; basis: string }>("SELECT id::text, calculation, created_at, basis FROM conceptualize.evidence WHERE project_id = $1 AND calculation IS NOT NULL", [projectId])
  for (const r of pe.rows) if (!at || r.created_at <= at) edges.push({ id: `produced-by:${r.id}`, type: 'produced-by', from: d('evidence', r.id), to: d('calculation-model' as DesignEntityType, r.calculation.modelId, r.calculation.modelRevision), basis: r.basis, pinned: true, stored: 'derived', derived: true })
  for (const e of edges) e.derived = e.stored === 'derived'
  return edges
}

/** Project revision for builtFrom (R1): the latest audit sequence number at asOf (or now). Audit events are append-only. */
export async function projectRevision(db: Queryable, projectId: string, asOf?: string | null): Promise<number> {
  const { rows } = await db.query<{ n: string | null }>('SELECT max(id) AS n FROM conceptualize.audit_events WHERE project_id = $1 AND ($2::timestamptz IS NULL OR occurred_at <= $2::timestamptz)', [projectId, asOf ?? null])
  return Number(rows[0]?.n ?? 0)
}

async function nodesFor(db: Queryable, projectId: string, refs: GRef[], at: Date | null): Promise<Map<string, GNode>> {
  const types = [...new Set(refs.filter((r) => r.module === 'conceptualize').map((r) => r.type!))]
  const infos = types.length ? await allRefs(db, projectId, types) : []
  const map = new Map<string, GNode>()
  for (const i of infos) if (!at || i.createdAt <= at) map.set(`d:${i.ref.id}`, { ref: i.ref, key: i.key, label: i.label, revision: i.revision, type: i.ref.type, status: i.status })
  for (const r of refs) if (r.module !== 'conceptualize') map.set(keyOf(r), { ref: { module: r.module, id: r.id }, key: `${r.module}:${r.id}`, label: r.id, revision: null, type: 'artifact', status: '' })
  return map
}

const encode = (n: number) => Buffer.from(String(n)).toString('base64url')
const decode = (s: string) => {
  const n = Number(Buffer.from(s, 'base64url').toString('utf8'))
  if (!Number.isInteger(n) || n < 0) throw invalid('The cursor is not valid.', { cursor: 'malformed' }, 400)
  return n
}

/** Breadth-first traversal from the start refs along the followed link types and directions. */
export async function traverse(db: Queryable, projectId: string, req: TraverseRequestDto) {
  const maxDepth = req.maxDepth ?? 3
  const limit = req.limit ?? 200
  const at = req.asOf ? new Date(req.asOf) : null
  const all = await projectEdges(db, projectId, req.asOf)
  const follow = req.follow?.length ? req.follow : null
  const allowed = (e: GEdge, dir: 'out' | 'in') => !follow || follow.some((f) => f.type === e.type && (f.direction ?? 'both') !== (dir === 'out' ? 'in' : 'out'))
  const out = new Map<string, GEdge[]>()
  const inn = new Map<string, GEdge[]>()
  for (const e of all) {
    out.set(keyOf(e.from), [...(out.get(keyOf(e.from)) ?? []), e])
    inn.set(keyOf(e.to), [...(inn.get(keyOf(e.to)) ?? []), e])
  }
  const starts = req.start.map((s) => s as GRef)
  const seen = new Map<string, { ref: GRef; depth: number }>()
  for (const s of starts) seen.set(keyOf(s), { ref: { module: s.module, ...(s.type ? { type: s.type } : {}), id: s.id }, depth: 0 })
  const edgeSet = new Map<string, GEdge>()
  let frontier = starts.map((s) => keyOf(s))
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = []
    for (const k of frontier) {
      const step = (e: GEdge, other: GRef) => {
        if (req.where?.basis?.length && e.basis && !req.where.basis.includes(e.basis)) return
        edgeSet.set(e.id, e)
        const ok = keyOf(other)
        if (!seen.has(ok)) {
          seen.set(ok, { ref: other, depth })
          next.push(ok)
        }
      }
      for (const e of out.get(k) ?? []) if (allowed(e, 'out')) step(e, e.to)
      for (const e of inn.get(k) ?? []) if (allowed(e, 'in')) step(e, e.from)
    }
    frontier = next
  }
  const nodeMap = await nodesFor(db, projectId, [...seen.values()].map((v) => v.ref), at)
  let nodes = [...seen.values()].sort((x, y) => x.depth - y.depth).map((v) => nodeMap.get(keyOf(v.ref))).filter((n): n is GNode => !!n)
  if (req.nodeTypes?.length) nodes = nodes.filter((n) => req.nodeTypes!.includes(n.type))
  if (req.where?.status?.length) nodes = nodes.filter((n) => req.where!.status!.includes(n.status))
  const offset = req.cursor ? decode(req.cursor) : 0
  const page = nodes.slice(offset, offset + limit)
  const pageKeys = new Set(page.map((n) => keyOf(n.ref)))
  const edges = [...edgeSet.values()].filter((e) => pageKeys.has(keyOf(e.from)) || pageKeys.has(keyOf(e.to)))
  return { nodes: page, edges, truncated: offset + limit < nodes.length, ...(offset + limit < nodes.length ? { cursor: encode(offset + limit) } : {}), builtFrom: { at: new Date().toISOString(), asOf: req.asOf ?? null, revision: await projectRevision(db, projectId, req.asOf) } }
}

/** All simple paths (either direction along edges) between two refs, up to maxDepth links. */
export async function paths(db: Queryable, projectId: string, req: PathsRequestDto) {
  const maxDepth = req.maxDepth ?? 4
  const limit = req.limit ?? 20
  const all = (await projectEdges(db, projectId, req.asOf)).filter((e) => !req.follow?.length || req.follow.includes(e.type))
  const adj = new Map<string, { edge: GEdge; other: GRef }[]>()
  for (const e of all) {
    adj.set(keyOf(e.from), [...(adj.get(keyOf(e.from)) ?? []), { edge: e, other: e.to }])
    adj.set(keyOf(e.to), [...(adj.get(keyOf(e.to)) ?? []), { edge: e, other: e.from }])
  }
  const from = req.from as GRef
  const target = keyOf(req.to as GRef)
  const found: { nodes: GRef[]; edges: GEdge[] }[] = []
  let truncated = false
  const walk = (k: string, ref: GRef, nodes: GRef[], edges: GEdge[], visited: Set<string>) => {
    if (found.length >= limit) {
      truncated = true
      return
    }
    if (k === target && edges.length) {
      found.push({ nodes: [...nodes], edges: [...edges] })
      return
    }
    if (edges.length >= maxDepth) return
    for (const { edge, other } of adj.get(k) ?? []) {
      const ok = keyOf(other)
      if (visited.has(ok)) continue
      visited.add(ok)
      walk(ok, other, [...nodes, other], [...edges, edge], visited)
      visited.delete(ok)
    }
    void ref
  }
  walk(keyOf(from), from, [from], [], new Set([keyOf(from)]))
  found.sort((x, y) => x.edges.length - y.edges.length)
  const refs = found.flatMap((p) => p.nodes)
  const nodeMap = await nodesFor(db, projectId, refs, req.asOf ? new Date(req.asOf) : null)
  return { paths: found, nodes: [...nodeMap.values()], truncated }
}

const SEARCH: Partial<Record<DesignEntityType, { sql: string }>> = {
  concept: { sql: `SELECT c.id::text AS id, c.key, v.name AS label, c.maturity AS status, v.name || ' ' || v.summary || ' ' || v.description || ' ' || v.purpose AS doc FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision WHERE c.project_id = $1` },
  function: { sql: `SELECT f.id::text AS id, f.key, v.name AS label, f.status, v.name || ' ' || v.verb_phrase || ' ' || v.description || ' ' || v.purpose AS doc FROM conceptualize.functions f JOIN conceptualize.function_revisions v ON v.function_id = f.id AND v.revision = f.current_revision WHERE f.project_id = $1` },
  constraint: { sql: `SELECT c.id::text AS id, c.key, v.statement AS label, c.status, v.statement AS doc FROM conceptualize.design_constraints c JOIN conceptualize.constraint_revisions v ON v.constraint_id = c.id AND v.revision = c.current_revision WHERE c.project_id = $1` },
  assumption: { sql: `SELECT a.id::text AS id, a.key, v.statement AS label, a.validation_status AS status, v.statement AS doc FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id AND v.revision = a.current_revision WHERE a.project_id = $1` },
  decision: { sql: `SELECT id::text AS id, key, title AS label, status, title || ' ' || question || ' ' || rationale AS doc FROM conceptualize.decisions WHERE project_id = $1` },
  evidence: { sql: `SELECT id::text AS id, key, title AS label, basis AS status, title || ' ' || summary || ' ' || method AS doc FROM conceptualize.evidence WHERE project_id = $1` },
}

/** Full-text search across entity types (PostgreSQL text search, prefix matching; keys match too). */
export async function search(db: Queryable, projectId: string, q: string, types?: string, limit = 50) {
  const wanted = (types ? types.split(',').map((t) => t.trim()) : Object.keys(SEARCH)) as DesignEntityType[]
  if (wanted.some((t) => !DESIGN_ENTITY_TYPES.includes(t))) throw invalid('Unknown entity type.', { types: Object.keys(SEARCH).join(', ') }, 400)
  const tsq = prefixQuery(q)
  if (!tsq && !q.trim()) return { items: [], total: 0 }
  const items: { ref: { module: 'conceptualize'; type: DesignEntityType; id: string }; key: string; label: string; status: string; rank: number; snippet: string }[] = []
  for (const type of wanted) {
    const s = SEARCH[type]
    if (!s) continue
    const like = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const { rows } = tsq
      ? await db.query<{ id: string; key: string; label: string; status: string; doc: string; rank: number }>(
          `SELECT x.*, ts_rank(to_tsvector('simple', x.doc), to_tsquery('simple', $2)) + CASE WHEN x.key ILIKE $3 THEN 1 ELSE 0 END AS rank
           FROM (${s.sql}) x WHERE to_tsvector('simple', x.doc) @@ to_tsquery('simple', $2) OR x.key ILIKE $3`,
          [projectId, tsq, like],
        )
      : await db.query<{ id: string; key: string; label: string; status: string; doc: string; rank: number }>(`SELECT x.*, 1 AS rank FROM (${s.sql}) x WHERE x.key ILIKE $2`, [projectId, like])
    for (const r of rows) {
      const words = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
      const at = Math.max(0, ...words.map((w) => r.doc.toLowerCase().indexOf(w)).filter((i) => i >= 0).slice(0, 1))
      items.push({ ref: { module: 'conceptualize', type, id: r.id }, key: r.key, label: r.label.length > 160 ? `${r.label.slice(0, 159)}…` : r.label, status: r.status, rank: Number(r.rank), snippet: r.doc.slice(Math.max(0, at - 60), at + 140).trim() })
    }
  }
  items.sort((x, y) => y.rank - x.rank || x.key.localeCompare(y.key))
  return { items: items.slice(0, limit), total: items.length }
}

export const nowIso = () => isoRequired(new Date())
