import { invalid } from '../errors'
import { DESIGN_ENTITY_TYPES, type DesignEntityType, type DesignRef } from '../domain/rules'
import { isUuid, type Queryable } from './context'

/**
 * Design references (DesignRef, CR-S1): existence checks and display data for every Conceptualize entity
 * type, shared by evidence subjects, design links, decisions and the graph API.
 */

/** Per type: table, key and label columns, revision and status expressions (read-only SQL fragments). */
const SOURCES: Record<Exclude<DesignEntityType, 'statement'>, { from: string; key: string; label: string; revision: string; status: string; created: string }> = {
  concept: { from: 'conceptualize.concepts e JOIN conceptualize.concept_revisions v ON v.concept_id = e.id AND v.revision = e.current_revision', key: 'e.key', label: 'v.name', revision: 'e.current_revision', status: 'e.maturity', created: 'e.created_at' },
  function: { from: 'conceptualize.functions e JOIN conceptualize.function_revisions v ON v.function_id = e.id AND v.revision = e.current_revision', key: 'e.key', label: 'v.name', revision: 'e.current_revision', status: 'e.status', created: 'e.created_at' },
  constraint: { from: 'conceptualize.design_constraints e JOIN conceptualize.constraint_revisions v ON v.constraint_id = e.id AND v.revision = e.current_revision', key: 'e.key', label: 'v.statement', revision: 'e.current_revision', status: 'e.status', created: 'e.created_at' },
  assumption: { from: 'conceptualize.assumptions e JOIN conceptualize.assumption_revisions v ON v.assumption_id = e.id AND v.revision = e.current_revision', key: 'e.key', label: 'v.statement', revision: 'e.current_revision', status: 'e.validation_status', created: 'e.created_at' },
  evidence: { from: 'conceptualize.evidence e', key: 'e.key', label: 'e.title', revision: '1', status: 'e.basis', created: 'e.created_at' },
  decision: { from: 'conceptualize.decisions e', key: 'e.key', label: 'e.title', revision: 'e.record_version', status: "e.status || CASE WHEN e.validity <> 'valid' THEN ' (' || e.validity || ')' ELSE '' END", created: 'e.proposed_at' },
  implementation: { from: 'conceptualize.implementations e', key: 'e.key', label: 'e.name', revision: 'e.revision', status: 'e.status', created: 'e.created_at' },
  'alternative-set': { from: 'conceptualize.alternative_sets e', key: 'e.key', label: 'e.name', revision: 'e.record_version', status: "'open'", created: 'e.created_at' },
  'trade-study': { from: 'conceptualize.trade_studies e', key: 'e.key', label: 'e.title', revision: 'e.revision', status: "'open'", created: 'e.created_at' },
  exploration: { from: 'conceptualize.explorations e', key: "'EXP-' || substr(e.id::text, 1, 8)", label: 'e.objective', revision: '1', status: "CASE WHEN e.undone THEN 'undone' ELSE 'open' END", created: 'e.created_at' },
}

export interface RefInfo {
  ref: DesignRef
  key: string
  label: string
  revision: number
  status: string
  createdAt: Date
}

/** Display data for refs of one project (missing refs are omitted). */
export async function describeRefs(db: Queryable, projectId: string, refs: { type: DesignEntityType; id: string }[]): Promise<RefInfo[]> {
  const out: RefInfo[] = []
  const byType = new Map<DesignEntityType, string[]>()
  for (const r of refs) if (isUuid(r.id) && r.type !== 'statement') byType.set(r.type, [...(byType.get(r.type) ?? []), r.id])
  for (const [type, ids] of byType) {
    const s = SOURCES[type as Exclude<DesignEntityType, 'statement'>]
    if (!s) continue
    const { rows } = await db.query<{ id: string; key: string; label: string; revision: number; status: string; created: Date }>(
      `SELECT e.id::text AS id, ${s.key} AS key, ${s.label} AS label, ${s.revision}::int AS revision, ${s.status} AS status, ${s.created} AS created FROM ${s.from} WHERE e.project_id = $1 AND e.id = ANY($2::uuid[])`,
      [projectId, [...new Set(ids)]],
    )
    for (const r of rows) out.push({ ref: { module: 'conceptualize', type, id: r.id }, key: r.key, label: r.label, revision: r.revision, status: r.status, createdAt: r.created })
  }
  return out
}

/** All entities of the given types in a project (graph nodes, search). */
export async function allRefs(db: Queryable, projectId: string, types: DesignEntityType[] = DESIGN_ENTITY_TYPES): Promise<RefInfo[]> {
  const out: RefInfo[] = []
  for (const type of types) {
    const s = SOURCES[type as Exclude<DesignEntityType, 'statement'>]
    if (!s) continue
    const { rows } = await db.query<{ id: string; key: string; label: string; revision: number; status: string; created: Date }>(
      `SELECT e.id::text AS id, ${s.key} AS key, ${s.label} AS label, ${s.revision}::int AS revision, ${s.status} AS status, ${s.created} AS created FROM ${s.from} WHERE e.project_id = $1`,
      [projectId],
    )
    for (const r of rows) out.push({ ref: { module: 'conceptualize', type, id: r.id }, key: r.key, label: r.label, revision: r.revision, status: r.status, createdAt: r.created })
  }
  return out
}

/** Refuses refs that do not exist in the project (field = the request field to report). */
export async function requireRefs(db: Queryable, projectId: string, refs: { type: DesignEntityType; id: string }[], field: string): Promise<RefInfo[]> {
  for (const r of refs) {
    if (!DESIGN_ENTITY_TYPES.includes(r.type)) throw invalid(`Unknown design entity type ${r.type}.`, { [field]: DESIGN_ENTITY_TYPES.join(', ') })
    if (r.type === 'statement') throw invalid('Statements are referenced through their Concept.', { [field]: 'statement refs are not supported here' })
  }
  const found = await describeRefs(db, projectId, refs)
  const missing = refs.filter((r) => !found.some((f) => f.ref.type === r.type && f.ref.id === r.id))
  if (missing.length) throw invalid(`Referenced ${missing.map((m) => m.type).join(', ')} not found in this project.`, { [field]: missing.map((m) => `${m.type}:${m.id}`).join(', ') })
  return found
}

export const ref = (type: DesignEntityType, id: string, revision?: number): DesignRef => ({ module: 'conceptualize', type, id, ...(revision ? { revision } : {}) })
