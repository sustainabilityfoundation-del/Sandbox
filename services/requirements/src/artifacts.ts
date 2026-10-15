/**
 * Artifact source for Project Management (CR-PM-REG-1; SDK 1.7 `ArtifactSource`,
 * docs/modules/projects/registration-and-provisioning.md §4).
 *
 * Read-only and in-process: reads this module's own tables directly (no HTTP, no principal) and maps
 * the committed outbox events to `ArtifactChange`s. Project Management never writes through it.
 */
import type { Pool } from 'pg'
import {
  ARTIFACT_SOURCE_CONTRACT_VERSION,
  type ArtifactChange,
  type ArtifactDescriptor,
  type ArtifactKindInfo,
  type ArtifactLifecycle,
  type ArtifactPage,
  type ArtifactSource,
  type NativeRef,
  type ProvisionRequest,
  type ProvisionResult,
  type RequirementsEvent,
} from '@ews/platform-sdk'
import type { EventHub } from './events/hub'
import type { TwinDirectory } from './twin'

export const ARTIFACT_MODULE = 'requirements'

export const REQUIREMENT_ARTIFACT_KINDS: readonly ArtifactKindInfo[] = [
  { kind: 'requirement', label: 'Requirement', category: 'requirement', navigable: true },
  { kind: 'requirement-collection', label: 'Requirements collection', category: 'requirement', navigable: true },
  { kind: 'requirements-baseline', label: 'Requirements baseline', category: 'baseline', navigable: true },
]

type Kind = 'requirement' | 'requirement-collection' | 'requirements-baseline'
const KINDS: Kind[] = ['requirement', 'requirement-collection', 'requirements-baseline']
const MAX_PAGE = 500
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Module state → normalised lifecycle (information-model.md §5). Archived records are retired. */
export function requirementLifecycle(status: string, archived: boolean): ArtifactLifecycle {
  if (archived) return 'retired'
  switch (status) {
    case 'in-review':
      return 'in-review'
    case 'approved':
      return 'released'
    case 'retired':
      return 'retired'
    default:
      return 'working'
  }
}

/** Outbox event → registry change. Unknown (future) event types ask for reconciliation. */
export function toArtifactChange(event: RequirementsEvent): ArtifactChange {
  const ref = (kind: Kind): NativeRef[] => [{ module: ARTIFACT_MODULE, kind, id: event.entityId }]
  const base = { eventId: event.eventId, projectId: event.projectId, occurredAt: event.occurredAt }
  switch (event.type) {
    case 'requirement.created':
    case 'requirement.updated':
    case 'requirement.restored':
    case 'requirement.relationships-changed':
      return { kind: 'upserted', ...base, refs: ref('requirement'), actor: event.actor }
    case 'requirement.archived':
      return { kind: 'retired', ...base, refs: ref('requirement'), actor: event.actor }
    case 'requirements.baseline-created':
      return { kind: 'upserted', ...base, refs: ref('requirements-baseline'), actor: event.actor }
    // Itemisable: entityId is the collection (create, metadata, structure). An archived collection is
    // described with lifecycle 'retired'.
    case 'requirements.collection-changed':
      return { kind: 'upserted', ...base, refs: ref('requirement-collection'), actor: event.actor }
    case 'requirements.import-completed':
      return { kind: 'reconcile', ...base, reason: 'Requirements import completed (bulk change).' }
    default:
      return { kind: 'reconcile', ...base, reason: `Unrecognised requirements event ${String((event as { type: string }).type)}.` }
  }
}

type Row = {
  kind: Kind
  id: string
  key: string
  title: string
  module_state: string
  lifecycle_status: string
  archived: boolean
  version: string
  version_label: string
  version_at: Date
  created_at: Date
  created_by: string
  modified_at: Date
  modified_by: string
}

// One SELECT per kind, same columns; `rank` gives the stable cross-kind order (rank, id).
const SELECTS: Record<Kind, string> = {
  requirement: `
    SELECT 0 AS rank, 'requirement' AS kind, r.id::text AS id, r.key, v.title,
           CASE WHEN r.archived THEN 'archived' ELSE r.status END AS module_state, r.status AS lifecycle_status, r.archived,
           r.current_revision::text AS version, 'rev ' || r.current_revision AS version_label, v.created_at AS version_at,
           r.created_at, r.created_by, r.updated_at AS modified_at, r.updated_by AS modified_by
      FROM requirements.requirements r
      JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
     WHERE r.project_id = $1`,
  'requirement-collection': `
    SELECT 1 AS rank, 'requirement-collection' AS kind, c.id::text AS id, c.name AS key, c.name AS title,
           CASE WHEN c.archived THEN 'archived' ELSE c.kind END AS module_state, 'collection' AS lifecycle_status, c.archived,
           c.revision || '.' || c.structure_revision AS version, 'rev ' || c.revision || ', structure ' || c.structure_revision AS version_label, c.updated_at AS version_at,
           c.created_at, c.created_by, c.updated_at AS modified_at, c.updated_by AS modified_by
      FROM requirements.collections c
     WHERE c.project_id = $1`,
  'requirements-baseline': `
    SELECT 2 AS rank, 'requirements-baseline' AS kind, b.id::text AS id, b.name AS key, b.name AS title,
           'baseline' AS module_state, 'baseline' AS lifecycle_status, false AS archived,
           '1' AS version, NULL AS version_label, b.created_at AS version_at,
           b.created_at, b.created_by, b.created_at AS modified_at, b.created_by AS modified_by
      FROM requirements.baselines b
     WHERE b.project_id = $1`,
}

const OPEN_PARAM: Record<Kind, string> = { requirement: 'id', 'requirement-collection': 'collectionId', 'requirements-baseline': 'baselineId' }

function descriptor(r: Row, relations: ArtifactDescriptor['relations']): ArtifactDescriptor {
  const lifecycle: ArtifactLifecycle =
    r.kind === 'requirement' ? requirementLifecycle(r.lifecycle_status, r.archived) : r.kind === 'requirements-baseline' ? 'released' : r.archived ? 'retired' : 'working'
  return {
    ref: { module: ARTIFACT_MODULE, kind: r.kind, id: r.id },
    key: r.key,
    title: r.title,
    moduleState: r.module_state,
    lifecycle,
    version: {
      value: r.kind === 'requirement' || r.kind === 'requirements-baseline' ? Number(r.version) : r.version,
      ...(r.version_label ? { label: r.version_label } : {}),
      at: new Date(r.version_at).toISOString(),
    },
    createdAt: new Date(r.created_at).toISOString(),
    createdBy: r.created_by,
    modifiedAt: new Date(r.modified_at).toISOString(),
    modifiedBy: r.modified_by,
    ...(relations?.length ? { relations } : {}),
    open: { toolId: 'requirements', params: { [OPEN_PARAM[r.kind]]: r.id } },
  }
}

/** NativeRef of a product element in Project Management's product registry (C3 scheme). */
export const PRODUCT_ELEMENT_REF = { module: 'product', kind: 'product-element' } as const

type Relations = NonNullable<ArtifactDescriptor['relations']>

/**
 * Module-owned relationships of the given requirements:
 * - requirement → requirement (derives-from, decomposes, depends-on) with the target revision they
 *   were made against;
 * - allocated-to a product element, as `{ module: 'product', kind: 'product-element', id: <element UUID> }`.
 *   An allocation target is a product element when its canonical ID is a UUID: the ID the host's
 *   TwinDirectory returns for it, else the stored ID. Allocations pin no target revision. Allocations to
 *   the static sample twin (ACT-100, ROD-120 …) have no native module and are not reported;
 * - allocated-to a SysML Modeler element, as `{ module: 'sysml', kind: 'sysml-model-element', id }` with the
 *   commit number recorded when the allocation was made as `toRevision`.
 */
async function relationsOf(pool: Pool, twin: TwinDirectory | undefined, projectId: string, ids: string[]): Promise<Map<string, Relations>> {
  const out = new Map<string, Relations>()
  if (!ids.length) return out
  const add = (from: string, rel: Relations[number]) => out.set(from, [...(out.get(from) ?? []), rel])
  const { rows } = await pool.query<{ from_id: string; type: string; to_id: string | null; to_twin_id: string | null; target_kind: string; to_revision: number | null; to_target_revision: number | null }>(
    `SELECT l.from_requirement_id::text AS from_id, l.type, l.to_requirement_id::text AS to_id, l.to_twin_id, l.target_kind, v.to_requirement_revision AS to_revision, v.to_target_revision
       FROM requirements.relationships l
       JOIN requirements.relationship_revisions v ON v.relationship_id = l.id AND v.revision = l.current_revision
      WHERE l.project_id = $1 AND l.from_requirement_id = ANY($2::uuid[]) AND NOT l.deleted
      ORDER BY l.from_requirement_id, l.type, coalesce(l.to_requirement_id::text, l.to_twin_id)`,
    [projectId, ids],
  )
  const targets = [...new Set(rows.flatMap((r) => (r.to_twin_id && r.target_kind === 'twin' ? [r.to_twin_id] : [])))]
  const known = twin && targets.length ? await twin.lookup(projectId, targets) : new Map()
  for (const r of rows) {
    if (r.to_id) {
      add(r.from_id, { type: r.type, to: { module: ARTIFACT_MODULE, kind: 'requirement', id: r.to_id }, ...(r.to_revision != null ? { toRevision: r.to_revision } : {}) })
      continue
    }
    if (!r.to_twin_id) continue
    if (r.target_kind === 'sysml-model-element') {
      add(r.from_id, { type: r.type, to: { module: 'sysml', kind: 'sysml-model-element', id: r.to_twin_id }, ...(r.to_target_revision != null ? { toRevision: r.to_target_revision } : {}) })
      continue
    }
    const resolved = known.get(r.to_twin_id)?.id
    const element = resolved && UUID.test(resolved) ? resolved : UUID.test(r.to_twin_id) ? r.to_twin_id : undefined
    if (element) add(r.from_id, { type: r.type, to: { ...PRODUCT_ELEMENT_REF, id: element.toLowerCase() } })
  }
  return out
}

async function toDescriptors(pool: Pool, twin: TwinDirectory | undefined, projectId: string, rows: Row[]): Promise<ArtifactDescriptor[]> {
  const relations = await relationsOf(pool, twin, projectId, rows.filter((r) => r.kind === 'requirement').map((r) => r.id))
  return rows.map((r) => descriptor(r, relations.get(r.id)))
}

const encodeCursor = (rank: number, id: string) => Buffer.from(JSON.stringify([rank, id])).toString('base64url')
function decodeCursor(cursor: string | undefined): [number, string] {
  if (!cursor) return [-1, '']
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'string') return [v[0], v[1]]
  } catch {
    /* fall through */
  }
  throw new Error('Invalid artifact cursor.')
}

/** The Requirements module's `ArtifactSource` (in-process; the API host wires it into Project Management). */
export interface RequirementsArtifactSourceOptions {
  /** The host's allocation-target directory (the same one the API validates with); resolves aliases of product elements. */
  twin?: TwinDirectory
}

export function createRequirementsArtifactSource(pool: Pool, events: Pick<EventHub, 'subscribeAll'>, options: RequirementsArtifactSourceOptions = {}): ArtifactSource {
  const { twin } = options
  return {
    module: ARTIFACT_MODULE,
    contractVersion: ARTIFACT_SOURCE_CONTRACT_VERSION,
    describeModule: () => ({ name: 'Requirements', kinds: REQUIREMENT_ARTIFACT_KINDS.map((k) => ({ ...k })) }),

    async list(projectId, options = {}): Promise<ArtifactPage> {
      const limit = Math.max(1, Math.min(MAX_PAGE, Math.floor(options.limit ?? MAX_PAGE)))
      const kinds = KINDS.filter((k) => !options.kinds || options.kinds.includes(k))
      if (!kinds.length) return { items: [] }
      const [rank, id] = decodeCursor(options.cursor)
      const { rows } = await pool.query<Row & { rank: number }>(
        `SELECT * FROM (${kinds.map((k) => SELECTS[k]).join(' UNION ALL ')}) a
          WHERE (a.rank, a.id) > ($2::int, $3::text) ORDER BY a.rank, a.id LIMIT $4`,
        [projectId, rank, id, limit + 1],
      )
      const page = rows.slice(0, limit)
      const items = await toDescriptors(pool, twin, projectId, page)
      const last = page[page.length - 1]
      return rows.length > limit && last ? { items, nextCursor: encodeCursor(last.rank, last.id) } : { items }
    },

    async describe(projectId, refs): Promise<ArtifactDescriptor[]> {
      const wanted = refs.filter((r) => r.module === ARTIFACT_MODULE && (KINDS as string[]).includes(r.kind) && UUID.test(r.id))
      if (!wanted.length) return []
      const found = new Map<string, Row>()
      for (const kind of KINDS) {
        const ids = [...new Set(wanted.filter((r) => r.kind === kind).map((r) => r.id.toLowerCase()))]
        if (!ids.length) continue
        const { rows } = await pool.query<Row>(`SELECT * FROM (${SELECTS[kind]}) a WHERE a.id = ANY($2::text[])`, [projectId, ids])
        for (const r of rows) found.set(`${kind}:${r.id}`, r)
      }
      const seen = new Set<string>()
      const ordered: Row[] = []
      for (const r of wanted) {
        const k = `${r.kind}:${r.id.toLowerCase()}`
        const row = found.get(k)
        if (row && !seen.has(k)) (seen.add(k), ordered.push(row))
      }
      return toDescriptors(pool, twin, projectId, ordered)
    },

    subscribe(listener) {
      return events.subscribeAll((event) => listener(toArtifactChange(event)))
    },

    // Requirements data is keyed by project ID: a new project needs nothing, and nothing is seeded
    // (the development seed writes PRJ-ACT100 only). Idempotent by construction.
    async provision(_request: ProvisionRequest): Promise<ProvisionResult> {
      return { status: 'not-needed' }
    },
  }
}
