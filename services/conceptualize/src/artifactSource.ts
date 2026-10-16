import type { ArtifactChange, ArtifactDescriptor, ArtifactKindInfo, ArtifactLifecycle, ArtifactPage, ArtifactSource, NativeRef, ProvisionRequest, ProvisionResult } from '@ews/platform-sdk'
import { ARTIFACT_SOURCE_CONTRACT_VERSION } from '@ews/platform-sdk'
import type { Pool } from 'pg'
import type { EventHub } from './events/hub'

/**
 * Conceptualize as an SDK 1.7 `ArtifactSource` for Project Management (CR-PM-REG-2,
 * docs/modules/projects/registration-and-provisioning.md §4). Read-only, in-process (system principal):
 * it reads Conceptualize's own tables and publishes summaries only, never content. Changes come from the
 * transactional outbox after commit (at least once; consumers dedupe by eventId). Provisioning is not
 * needed: data is keyed by project ID, and nothing is ever created for a project (no seed outside the
 * PRJ-ACT100 development fixture).
 */

const MODULE = 'conceptualize'

export const CONCEPTS_ARTIFACT_KINDS: ArtifactKindInfo[] = [
  { kind: 'concept', label: 'Concept', category: 'concept', navigable: false },
  { kind: 'function', label: 'Function', category: 'design-knowledge', navigable: false },
  { kind: 'constraint', label: 'Design constraint', category: 'design-knowledge', navigable: false },
  { kind: 'assumption', label: 'Assumption', category: 'design-knowledge', navigable: false },
  { kind: 'alternative-set', label: 'Alternative set', category: 'design-knowledge', navigable: false },
  { kind: 'trade-study', label: 'Trade study', category: 'analysis', navigable: false },
  { kind: 'decision', label: 'Design decision', category: 'design-knowledge', navigable: false },
  { kind: 'evidence', label: 'Engineering evidence', category: 'analysis', navigable: false },
  { kind: 'concept-implementation', label: 'Concept implementation', category: 'concept', navigable: false },
]
const KIND_ORDER = CONCEPTS_ARTIFACT_KINDS.map((k) => k.kind)

/** Conceptualize entity type ↔ registry kind. */
const KIND_OF_TYPE: Record<string, string> = { concept: 'concept', function: 'function', constraint: 'constraint', assumption: 'assumption', 'alternative-set': 'alternative-set', 'trade-study': 'trade-study', decision: 'decision', evidence: 'evidence', implementation: 'concept-implementation' }

/** Module state → normalised lifecycle (information-model.md §5; published by the module). */
export function lifecycleOf(kind: string, state: string): ArtifactLifecycle {
  switch (kind) {
    case 'concept':
      return state === 'selected' || state === 'engineering-development' ? 'in-review' : state === 'implemented' || state === 'verified' ? 'released' : state === 'superseded' ? 'superseded' : state === 'archived' ? 'retired' : 'working'
    case 'decision':
      return state.startsWith('proposed') ? 'in-review' : state === 'recorded' ? 'released' : state.startsWith('recorded (invalidated') || state === 'superseded' ? 'superseded' : state === 'withdrawn' ? 'retired' : 'working'
    case 'function':
      return state === 'retired' ? 'retired' : 'working'
    case 'constraint':
      return state === 'retired' ? 'retired' : 'working'
    case 'assumption':
      return state === 'validated' ? 'released' : state === 'invalidated' || state === 'retired' ? 'retired' : 'working'
    case 'evidence':
      return state.endsWith('(superseded)') ? 'superseded' : 'working'
    case 'concept-implementation':
      return state === 'implemented' ? 'released' : state === 'retired' ? 'retired' : 'working'
    default:
      return 'working'
  }
}

interface Row {
  kind: string
  ko: number
  id: string
  key: string
  title: string
  state: string
  version: number
  created_at: Date
  created_by: string
  modified_at: Date
  modified_by: string
  container_kind: string | null
  container_id: string | null
}

const C = 'conceptualize'
/** One SELECT per kind with the same columns ($1 = project). */
const SELECTS: Record<string, string> = {
  concept: `SELECT 'concept' AS kind, e.id::text, e.key, v.name AS title, e.maturity AS state, e.current_revision AS version, e.created_at, e.created_by, e.updated_at AS modified_at, e.updated_by AS modified_by, NULL::text AS container_kind, NULL::text AS container_id
    FROM ${C}.concepts e JOIN ${C}.concept_revisions v ON v.concept_id = e.id AND v.revision = e.current_revision WHERE e.project_id = $1`,
  function: `SELECT 'function', e.id::text, e.key, v.name, e.status, e.current_revision, e.created_at, e.created_by, e.updated_at, e.updated_by, NULL, NULL
    FROM ${C}.functions e JOIN ${C}.function_revisions v ON v.function_id = e.id AND v.revision = e.current_revision WHERE e.project_id = $1`,
  constraint: `SELECT 'constraint', e.id::text, e.key, v.statement, e.status, e.current_revision, e.created_at, e.created_by, e.updated_at, e.updated_by, NULL, NULL
    FROM ${C}.design_constraints e JOIN ${C}.constraint_revisions v ON v.constraint_id = e.id AND v.revision = e.current_revision WHERE e.project_id = $1`,
  assumption: `SELECT 'assumption', e.id::text, e.key, v.statement, e.validation_status, e.current_revision, e.created_at, e.created_by, e.updated_at, e.updated_by, NULL, NULL
    FROM ${C}.assumptions e JOIN ${C}.assumption_revisions v ON v.assumption_id = e.id AND v.revision = e.current_revision WHERE e.project_id = $1`,
  'alternative-set': `SELECT 'alternative-set', e.id::text, e.key, e.name, 'open', e.record_version, e.created_at, e.created_by, e.updated_at, e.updated_by, 'concept', e.parent_id::text
    FROM ${C}.alternative_sets e WHERE e.project_id = $1`,
  'trade-study': `SELECT 'trade-study', e.id::text, e.key, e.title, 'open', e.revision, e.created_at, e.created_by, e.updated_at, e.updated_by, CASE WHEN e.set_id IS NULL THEN NULL ELSE 'alternative-set' END, e.set_id::text
    FROM ${C}.trade_studies e WHERE e.project_id = $1`,
  decision: `SELECT 'decision', e.id::text, e.key, e.title,
      CASE WHEN e.superseded_by_id IS NOT NULL AND e.status = 'recorded' THEN 'superseded' WHEN e.status = 'recorded' AND e.validity <> 'valid' THEN 'recorded (' || e.validity || ')' ELSE e.status END,
      e.record_version, e.proposed_at, e.proposed_by, COALESCE(e.recorded_at, e.proposed_at), COALESCE(e.recorded_by, e.proposed_by), CASE WHEN e.set_id IS NULL THEN NULL ELSE 'alternative-set' END, e.set_id::text
    FROM ${C}.decisions e WHERE e.project_id = $1`,
  evidence: `SELECT 'evidence', e.id::text, e.key, e.title, e.basis || CASE WHEN EXISTS (SELECT 1 FROM ${C}.evidence x WHERE x.supersedes_id = e.id) THEN ' (superseded)' ELSE '' END, 1, e.created_at, e.created_by, e.created_at, e.created_by, NULL, NULL
    FROM ${C}.evidence e WHERE e.project_id = $1`,
  'concept-implementation': `SELECT 'concept-implementation', e.id::text, e.key, e.name, e.status, e.revision, e.created_at, e.created_by, e.updated_at, e.updated_by, NULL, NULL
    FROM ${C}.implementations e WHERE e.project_id = $1`,
}

function unionFor(kinds: string[]): string {
  return kinds.map((k) => `SELECT ${KIND_ORDER.indexOf(k)} AS ko, s.* FROM (${SELECTS[k]}) AS s(kind, id, key, title, state, version, created_at, created_by, modified_at, modified_by, container_kind, container_id)`).join('\nUNION ALL\n')
}

const encodeCursor = (r: Pick<Row, 'ko' | 'key' | 'id'>) => Buffer.from(JSON.stringify([r.ko, r.key, r.id])).toString('base64url')
function decodeCursor(c: string): [number, string, string] {
  try {
    const v = JSON.parse(Buffer.from(c, 'base64url').toString('utf8'))
    if (Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' && typeof v[1] === 'string' && typeof v[2] === 'string') return v as [number, string, string]
  } catch {
    /* fall through */
  }
  throw new Error('Invalid cursor')
}

const ref = (kind: string, id: string): NativeRef => ({ module: MODULE, kind, id })
const iso = (d: Date) => new Date(d).toISOString()

async function relationsFor(pool: Pool, projectId: string, rows: Row[]): Promise<Map<string, NonNullable<ArtifactDescriptor['relations']>>> {
  const out = new Map<string, NonNullable<ArtifactDescriptor['relations']>>()
  const ids = rows.map((r) => r.id)
  if (!ids.length) return out
  const add = (id: string, rel: NonNullable<ArtifactDescriptor['relations']>[number]) => out.set(id, [...(out.get(id) ?? []), rel])
  const rel = await pool.query<{ from_id: string; type: string; to_id: string }>(`SELECT from_id::text, type, to_id::text FROM ${C}.relationships WHERE project_id = $1 AND NOT removed AND from_id::text = ANY($2) ORDER BY created_at, id`, [projectId, ids])
  for (const r of rel.rows) add(r.from_id, { type: r.type, to: ref('concept', r.to_id) })
  const dl = await pool.query<{ from_id: string; type: string; to_type: string; to_id: string; to_revision: number | null }>(
    `SELECT from_id::text, type, to_type, to_id, to_revision FROM ${C}.design_links WHERE project_id = $1 AND NOT removed AND to_type <> 'artifact' AND from_id::text = ANY($2) ORDER BY created_at, id`,
    [projectId, ids],
  )
  for (const r of dl.rows) if (KIND_OF_TYPE[r.to_type]) add(r.from_id, { type: r.type, to: ref(KIND_OF_TYPE[r.to_type], r.to_id), ...(r.to_revision ? { toRevision: r.to_revision } : {}) })
  const ic = await pool.query<{ implementation_id: string; concept_id: string }>(`SELECT implementation_id::text, concept_id::text FROM ${C}.implementation_concepts WHERE NOT removed AND implementation_id::text = ANY($1) ORDER BY added_at`, [ids])
  for (const r of ic.rows) add(r.implementation_id, { type: 'realizes', to: ref('concept', r.concept_id) })
  const es = await pool.query<{ evidence_id: string; subject_type: string; subject_id: string; subject_revision: number | null }>(`SELECT evidence_id::text, subject_type, subject_id::text, subject_revision FROM ${C}.evidence_subjects WHERE evidence_id::text = ANY($1)`, [ids])
  for (const r of es.rows) if (KIND_OF_TYPE[r.subject_type]) add(r.evidence_id, { type: 'subject', to: ref(KIND_OF_TYPE[r.subject_type], r.subject_id), ...(r.subject_revision ? { toRevision: r.subject_revision } : {}) })
  return out
}

async function toDescriptors(pool: Pool, projectId: string, rows: Row[]): Promise<ArtifactDescriptor[]> {
  const relations = await relationsFor(pool, projectId, rows)
  return rows.map((r) => ({
    ref: ref(r.kind, r.id),
    key: r.key,
    title: r.title,
    moduleState: r.state,
    lifecycle: lifecycleOf(r.kind, r.state),
    version: { value: r.version, label: r.kind === 'evidence' ? 'immutable' : `rev ${r.version}`, at: iso(r.modified_at) },
    createdAt: iso(r.created_at),
    createdBy: r.created_by,
    modifiedAt: iso(r.modified_at),
    modifiedBy: r.modified_by,
    ...(r.container_kind && r.container_id ? { container: ref(r.container_kind, r.container_id) } : {}),
    ...(relations.get(r.id)?.length ? { relations: relations.get(r.id) } : {}),
  }))
}

/** The records an outbox event is about (implementation events name Concepts; link events name the link). */
async function refsForEvent(pool: Pool, projectId: string, type: string, entityId: string): Promise<NativeRef[] | null> {
  if (type.startsWith('link.')) {
    const { rows } = await pool.query<{ from_type: string; from_id: string }>(`SELECT from_type, from_id::text FROM ${C}.design_links WHERE id::text = $1 AND project_id = $2`, [entityId, projectId])
    return rows[0] && KIND_OF_TYPE[rows[0].from_type] ? [ref(KIND_OF_TYPE[rows[0].from_type], rows[0].from_id)] : null
  }
  const found = await pool.query<{ kind: string }>(
    `SELECT 'concept' AS kind FROM ${C}.concepts WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'function' FROM ${C}.functions WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'constraint' FROM ${C}.design_constraints WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'assumption' FROM ${C}.assumptions WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'alternative-set' FROM ${C}.alternative_sets WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'trade-study' FROM ${C}.trade_studies WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'decision' FROM ${C}.decisions WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'evidence' FROM ${C}.evidence WHERE id::text = $1 AND project_id = $2
     UNION ALL SELECT 'concept-implementation' FROM ${C}.implementations WHERE id::text = $1 AND project_id = $2`,
    [entityId, projectId],
  )
  if (!found.rows[0]) return null
  const refs = [ref(found.rows[0].kind, entityId)]
  if (type.startsWith('concept.implementation-')) {
    const { rows } = await pool.query<{ id: string }>(`SELECT DISTINCT implementation_id::text AS id FROM ${C}.implementation_concepts WHERE concept_id::text = $1`, [entityId])
    for (const r of rows) refs.push(ref('concept-implementation', r.id))
  }
  return refs
}

export function createConceptsArtifactSource(pool: Pool, events: Pick<EventHub, 'subscribeAll'>): ArtifactSource {
  const select = async (projectId: string, kinds: string[], where: string, params: unknown[], limit: number) => {
    const sql = `SELECT * FROM (${unionFor(kinds)}) u ${where} ORDER BY ko, key, id LIMIT ${limit}`
    return (await pool.query<Row>(sql, [projectId, ...params])).rows
  }
  return {
    module: MODULE,
    contractVersion: ARTIFACT_SOURCE_CONTRACT_VERSION,
    describeModule: () => ({ name: 'Conceptualize', kinds: CONCEPTS_ARTIFACT_KINDS.map((k) => ({ ...k })) }),

    async list(projectId, options = {}): Promise<ArtifactPage> {
      const limit = Math.min(Math.max(options.limit ?? 200, 1), 500)
      const kinds = (options.kinds?.length ? options.kinds : KIND_ORDER).filter((k) => KIND_ORDER.includes(k))
      if (!kinds.length) return { items: [] }
      const params: unknown[] = []
      let where = ''
      if (options.cursor) {
        const [ko, key, id] = decodeCursor(options.cursor)
        params.push(ko, key, id)
        where = 'WHERE (ko, key, id) > ($2::int, $3::text, $4::text)'
      }
      const rows = await select(projectId, kinds, where, params, limit + 1)
      const page = rows.slice(0, limit)
      return { items: await toDescriptors(pool, projectId, page), ...(rows.length > limit ? { nextCursor: encodeCursor(page[page.length - 1]) } : {}) }
    },

    async describe(projectId, refs) {
      const mine = refs.filter((r) => r.module === MODULE && KIND_ORDER.includes(r.kind))
      if (!mine.length) return []
      const kinds = [...new Set(mine.map((r) => r.kind))]
      const rows = await select(projectId, kinds, 'WHERE (kind || \':\' || id) = ANY($2)', [mine.map((r) => `${r.kind}:${r.id}`)], 5000)
      return toDescriptors(pool, projectId, rows)
    },

    subscribe(listener) {
      return events.subscribeAll((e) => {
        void (async () => {
          let change: ArtifactChange
          try {
            const refs = await refsForEvent(pool, e.projectId, e.type, e.entityId)
            change = refs
              ? { kind: 'upserted', eventId: e.eventId, projectId: e.projectId, refs, occurredAt: e.occurredAt, actor: e.actor }
              : { kind: 'reconcile', eventId: e.eventId, projectId: e.projectId, reason: `${e.type} for ${e.entityId} could not be itemised`, occurredAt: e.occurredAt }
          } catch {
            change = { kind: 'reconcile', eventId: e.eventId, projectId: e.projectId, reason: `${e.type}: lookup failed`, occurredAt: e.occurredAt }
          }
          listener(change)
        })()
      })
    },

    async provision(request: ProvisionRequest): Promise<ProvisionResult> {
      // Data is keyed by project ID; a blank project needs nothing and gets nothing (no seed).
      if (request.template.content !== 'blank') return { status: 'failed', retryable: false, message: `Conceptualize has no content template ${request.template.id}.` }
      return { status: 'not-needed' }
    },
  }
}
