import { invalid, notFound } from '../errors'
import {
  assessDiversity,
  DIVERSITY_THRESHOLDS,
  evaluateReadiness,
  READINESS_ACTIVITIES,
  readArchitecture,
  type ArchitectureBlock,
  type DiversityItem,
  type ReadinessActivity,
} from '../domain/architecture'
import { computeGaps } from '../domain/intent'
import { readDefinition } from '../domain/definition'
import { isUuid, type Queryable } from './context'
import { contentOf, listIntents, resolveIntent } from './intents'
import { requireConcept } from './concepts'
import { getSet, listSets } from './alternatives'

/**
 * Architecture diversity and context readiness (ECII increment 2). Both are calculations over stored records:
 * no model, no keyword rules, nothing written. The domain functions (domain/architecture.ts) hold the rules.
 */

interface DefRow {
  id: string
  key: string
  name: string
  definition: unknown
}

const itemOf = (r: DefRow): DiversityItem => {
  const def = readDefinition(r.definition)
  return { id: r.id, key: r.key, name: r.name, architecture: def.architecture, parameters: Object.fromEntries(def.parameters.map((p) => [p.symbol, p.value])) }
}

async function definitionsOf(db: Queryable, projectId: string, ids: string[]): Promise<DefRow[]> {
  if (!ids.length) return []
  const { rows } = await db.query<DefRow>(
    `SELECT c.id::text AS id, c.key, v.name, v.definition
     FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision
     WHERE c.project_id = $1 AND c.id = ANY($2::uuid[])`,
    [projectId, ids],
  )
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is DefRow => !!r)
}

export interface DiversityQuery {
  conceptIds?: string[]
  setId?: string
  parentId?: string
  minimum?: number
}

/** Which Concepts to compare: the listed ones, the active members of one set, or those of every set of a parent. */
async function subjects(db: Queryable, projectId: string, q: DiversityQuery): Promise<string[]> {
  if (q.conceptIds?.length) {
    const bad = q.conceptIds.find((id) => !isUuid(id))
    if (bad) throw invalid(`conceptIds are UUIDs (${bad}).`, { conceptIds: 'uuid' }, 400)
    return [...new Set(q.conceptIds)]
  }
  if (q.setId) {
    const s = await getSet(db, projectId, q.setId)
    if (!s) throw notFound(`Alternative set ${q.setId} not found.`)
    return s.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)
  }
  if (q.parentId) {
    await requireConcept(db, projectId, q.parentId)
    const sets = await listSets(db, projectId, { conceptId: q.parentId })
    return [...new Set(sets.filter((s) => s.parentId === q.parentId).flatMap((s) => s.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)))]
  }
  throw invalid('Say which alternatives to compare: conceptIds, setId or parentId.', { conceptIds: 'one of conceptIds, setId, parentId' }, 400)
}

export async function diversityOf(db: Queryable, projectId: string, q: DiversityQuery) {
  const ids = await subjects(db, projectId, q)
  if (ids.length < 2) throw invalid('A diversity assessment compares at least two alternatives.', { conceptIds: 'at least two' }, 422)
  const rows = await definitionsOf(db, projectId, ids)
  const missing = ids.filter((id) => !rows.some((r) => r.id === id))
  if (missing.length) throw notFound(`Concept ${missing[0]} not found.`)
  const items = rows.map(itemOf)
  return {
    subjects: items.map((i) => ({ id: i.id, key: i.key, name: i.name, level: i.architecture?.level ?? null })),
    thresholds: DIVERSITY_THRESHOLDS,
    ...assessDiversity(items, q.minimum ?? DIVERSITY_THRESHOLDS.minimumDistinct),
  }
}

export interface ReadinessQuery {
  intentId?: string
  activity?: ReadinessActivity
  conceptId?: string
}

/** Architecture blocks under assessment: the named Concept's, else those of every live Concept of the project. */
async function architecturesOf(db: Queryable, projectId: string, conceptId?: string): Promise<{ blocks: ArchitectureBlock[]; concept: { id: string; key: string; name: string } | null }> {
  if (conceptId) {
    const c = await requireConcept(db, projectId, conceptId)
    const block = readDefinition(c.definition).architecture
    return { blocks: block ? [block] : [], concept: { id: c.id, key: c.key, name: c.name } }
  }
  const { rows } = await db.query<{ architecture: unknown }>(
    `SELECT v.definition -> 'architecture' AS architecture
     FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision
     WHERE c.project_id = $1 AND c.maturity NOT IN ('archived', 'superseded') AND jsonb_typeof(v.definition -> 'architecture') = 'object'`,
    [projectId],
  )
  return { blocks: rows.map((r) => readArchitecture(r.architecture)).filter((b): b is ArchitectureBlock => !!b), concept: null }
}

/** The intent a readiness question is about: the one named, else the latest active one (none is a valid answer). */
export async function readinessIntent(db: Queryable, projectId: string, intentId?: string) {
  if (intentId) return resolveIntent(db, projectId, intentId)
  const active = await listIntents(db, projectId)
  return active[active.length - 1] ?? null
}

export async function readinessOf(db: Queryable, projectId: string, q: ReadinessQuery) {
  if (q.activity && !READINESS_ACTIVITIES.includes(q.activity)) throw invalid(`activity is one of ${READINESS_ACTIVITIES.join(', ')}.`, { activity: 'unknown' }, 400)
  const intent = await readinessIntent(db, projectId, q.intentId)
  const { blocks, concept } = await architecturesOf(db, projectId, q.conceptId)
  const content = intent ? contentOf(intent) : null
  const result = evaluateReadiness({ intent: content, gaps: content ? computeGaps(content) : null, architectures: blocks }, q.activity)
  return {
    intent: intent ? { id: intent.id, key: intent.key, revision: intent.revision, designObject: intent.designObject, integration: intent.integration } : null,
    concept,
    architecturesConsidered: blocks.length,
    ...result,
  }
}
