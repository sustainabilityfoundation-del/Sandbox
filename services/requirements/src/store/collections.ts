import { randomUUID } from 'node:crypto'
import { conflict, invalid, notFound } from '../errors'
import type { LifecycleStatus } from '../domain/rules'
import { audit, emit, isUuid, isoRequired, type Ctx, type Queryable } from './context'

/**
 * Collections are structured documents: ordered trees of headings and requirement references.
 * Membership and order are document structure only; they never create or imply derivation or
 * decomposition. A requirement appears at most once per collection and may appear in several.
 */

export interface CollectionDto {
  id: string
  projectId: string
  name: string
  description: string
  kind: 'document' | 'set'
  revision: number
  structureRevision: number
  archived: boolean
  requirementCount: number
  createdAt: string
  createdBy: string
  updatedAt: string
  updatedBy: string
}

export interface NodeDto {
  id: string
  parentId: string | null
  position: number
  depth: number
  number: string
  kind: 'heading' | 'requirement'
  heading: string | null
  requirementId: string | null
  key: string | null
  title: string | null
  status: LifecycleStatus | null
}

interface CollectionRow {
  id: string
  project_id: string
  name: string
  description: string
  kind: 'document' | 'set'
  revision: number
  structure_revision: number
  archived: boolean
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  requirement_count: string
}

const toDto = (r: CollectionRow): CollectionDto => ({
  id: r.id,
  projectId: r.project_id,
  name: r.name,
  description: r.description,
  kind: r.kind,
  revision: r.revision,
  structureRevision: r.structure_revision,
  archived: r.archived,
  requirementCount: Number(r.requirement_count),
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  updatedAt: isoRequired(r.updated_at),
  updatedBy: r.updated_by,
})

const SELECT = `SELECT c.*, (SELECT count(*) FROM requirements.collection_nodes n WHERE n.collection_id = c.id AND n.kind = 'requirement') AS requirement_count FROM requirements.collections c`

export async function listCollections(db: Queryable, projectId: string, includeArchived = false): Promise<CollectionDto[]> {
  const { rows } = await db.query<CollectionRow>(`${SELECT} WHERE c.project_id = $1 ${includeArchived ? '' : 'AND NOT c.archived'} ORDER BY c.name`, [projectId])
  return rows.map(toDto)
}

export async function getCollection(db: Queryable, projectId: string, id: string): Promise<CollectionDto | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<CollectionRow>(`${SELECT} WHERE c.project_id = $1 AND c.id = $2`, [projectId, id])
  return rows[0] && toDto(rows[0])
}

export async function createCollection(ctx: Ctx, input: { name: string; description?: string; kind?: 'document' | 'set' }, id: string = randomUUID()): Promise<CollectionDto> {
  const name = input.name.trim()
  if (!name) throw invalid('A collection needs a name.', { name: 'required' })
  const taken = await ctx.db.query('SELECT 1 FROM requirements.collections WHERE project_id = $1 AND name = $2', [ctx.projectId, name])
  if (taken.rowCount) throw conflict(`A collection named “${name}” already exists.`)
  await ctx.db.query(
    `INSERT INTO requirements.collections (id, project_id, name, description, kind, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7)`,
    [id, ctx.projectId, name, input.description ?? '', input.kind ?? 'document', ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'collection', entityId: id, action: 'created', revision: 1, details: { name } })
  await emit(ctx, 'requirements.collection-changed', id, 1)
  return (await getCollection(ctx.db, ctx.projectId, id))!
}

async function lockCollection(ctx: Ctx, id: string): Promise<CollectionDto> {
  if (!isUuid(id)) throw notFound('Collection not found.')
  const { rowCount } = await ctx.db.query('SELECT 1 FROM requirements.collections WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound('Collection not found.')
  return (await getCollection(ctx.db, ctx.projectId, id))!
}

export async function updateCollection(ctx: Ctx, id: string, patch: { name?: string; description?: string; archived?: boolean }, expectedRevision: number): Promise<CollectionDto> {
  const c = await lockCollection(ctx, id)
  if (c.revision !== expectedRevision) throw conflict(`The collection changed since revision ${expectedRevision} (now ${c.revision}).`, c.revision)
  if (patch.name !== undefined && patch.name.trim() !== c.name) {
    const taken = await ctx.db.query('SELECT 1 FROM requirements.collections WHERE project_id = $1 AND name = $2 AND id <> $3', [ctx.projectId, patch.name.trim(), id])
    if (taken.rowCount) throw conflict(`A collection named “${patch.name.trim()}” already exists.`)
  }
  await ctx.db.query(
    `UPDATE requirements.collections SET name = coalesce($3, name), description = coalesce($4, description), archived = coalesce($5, archived), revision = revision + 1, updated_at = $6, updated_by = $7 WHERE id = $1 AND project_id = $2`,
    [id, ctx.projectId, patch.name?.trim() ?? null, patch.description ?? null, patch.archived ?? null, ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'collection', entityId: id, action: patch.archived === true ? 'archived' : patch.archived === false ? 'restored' : 'updated', revision: c.revision + 1, details: patch })
  await emit(ctx, 'requirements.collection-changed', id, c.structureRevision)
  return (await getCollection(ctx.db, ctx.projectId, id))!
}

// ---- structure -----------------------------------------------------------------------------------------

interface NodeRow {
  id: string
  parent_id: string | null
  position: number
  kind: 'heading' | 'requirement'
  heading: string | null
  requirement_id: string | null
  key: string | null
  title: string | null
  status: LifecycleStatus | null
}

/** Flat depth-first order with outline numbers. */
export function orderNodes(rows: NodeRow[]): NodeDto[] {
  const children = new Map<string | null, NodeRow[]>()
  for (const r of rows) children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r])
  for (const list of children.values()) list.sort((a, b) => a.position - b.position)
  const out: NodeDto[] = []
  const walk = (parent: string | null, depth: number, prefix: string) => {
    ;(children.get(parent) ?? []).forEach((r, i) => {
      const number = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      out.push({ id: r.id, parentId: r.parent_id, position: r.position, depth, number, kind: r.kind, heading: r.heading, requirementId: r.requirement_id, key: r.key, title: r.title, status: r.status })
      walk(r.id, depth + 1, number)
    })
  }
  walk(null, 0, '')
  return out
}

export async function collectionTree(db: Queryable, projectId: string, id: string, baselineId?: string): Promise<{ collection: CollectionDto; nodes: NodeDto[]; baselineId?: string }> {
  const collection = await getCollection(db, projectId, id)
  if (!collection) throw notFound('Collection not found.')
  if (baselineId) {
    if (!isUuid(baselineId)) throw notFound('Baseline not found.')
    const bc = await db.query<{ name: string; structure_revision: number }>('SELECT name, structure_revision FROM requirements.baseline_collections WHERE baseline_id = $1 AND collection_id = $2', [baselineId, id])
    if (!bc.rowCount) throw notFound('The collection is not part of that baseline.')
    const { rows } = await db.query<NodeRow>(
      `SELECT n.node_id AS id, n.parent_id, n.position, n.kind, n.heading, n.requirement_id, br.key, v.title, br.status
       FROM requirements.baseline_collection_nodes n
       LEFT JOIN requirements.baseline_requirements br ON br.baseline_id = n.baseline_id AND br.requirement_id = n.requirement_id
       LEFT JOIN requirements.requirement_revisions v ON v.requirement_id = br.requirement_id AND v.revision = br.revision
       WHERE n.baseline_id = $1 AND n.collection_id = $2`,
      [baselineId, id],
    )
    return { collection: { ...collection, name: bc.rows[0].name, structureRevision: bc.rows[0].structure_revision, requirementCount: rows.filter((r) => r.kind === 'requirement').length }, nodes: orderNodes(rows), baselineId }
  }
  const { rows } = await db.query<NodeRow>(
    `SELECT n.id, n.parent_id, n.position, n.kind, n.heading, n.requirement_id, r.key, v.title, r.status
     FROM requirements.collection_nodes n
     LEFT JOIN requirements.requirements r ON r.id = n.requirement_id
     LEFT JOIN requirements.requirement_revisions v ON v.requirement_id = r.id AND v.revision = r.current_revision
     WHERE n.collection_id = $1`,
    [id],
  )
  return { collection, nodes: orderNodes(rows) }
}

async function checkStructure(ctx: Ctx, collectionId: string, expected: number | null): Promise<CollectionDto> {
  const c = await lockCollection(ctx, collectionId)
  if (c.archived) throw invalid('The collection is archived.')
  if (expected !== null && c.structureRevision !== expected) {
    throw conflict(`The structure of “${c.name}” changed since revision ${expected} (now ${c.structureRevision}).`, c.structureRevision)
  }
  return c
}

/** Bumps the structure revision and emits requirements.collection-changed (SDK 1.3) in the same transaction. */
async function bumpStructure(ctx: Ctx, collectionId: string) {
  const { rows } = await ctx.db.query<{ r: number }>('UPDATE requirements.collections SET structure_revision = structure_revision + 1, updated_at = $2, updated_by = $3 WHERE id = $1 RETURNING structure_revision AS r', [collectionId, ctx.now, ctx.actor])
  await emit(ctx, 'requirements.collection-changed', collectionId, rows[0].r)
}

async function siblingCount(ctx: Ctx, collectionId: string, parentId: string | null): Promise<number> {
  const { rows } = await ctx.db.query<{ n: string }>('SELECT count(*) AS n FROM requirements.collection_nodes WHERE collection_id = $1 AND parent_id IS NOT DISTINCT FROM $2', [collectionId, parentId])
  return Number(rows[0].n)
}

async function checkParent(ctx: Ctx, collectionId: string, parentId: string | null) {
  if (parentId === null) return
  if (!isUuid(parentId)) throw invalid('parentId must be a node of this collection.', { parentId: 'unknown node' })
  const { rowCount } = await ctx.db.query('SELECT 1 FROM requirements.collection_nodes WHERE id = $1 AND collection_id = $2', [parentId, collectionId])
  if (!rowCount) throw invalid('parentId must be a node of this collection.', { parentId: 'unknown node' })
}

export interface NodeInput {
  kind: 'heading' | 'requirement'
  heading?: string
  requirementId?: string
  parentId?: string | null
  position?: number
}

export async function addNode(ctx: Ctx, collectionId: string, input: NodeInput, expectedStructureRevision: number | null, id: string = randomUUID()): Promise<NodeDto> {
  const c = await checkStructure(ctx, collectionId, expectedStructureRevision)
  const parentId = input.parentId ?? null
  await checkParent(ctx, collectionId, parentId)
  if (input.kind === 'heading') {
    if (!input.heading?.trim() || input.requirementId) throw invalid('A heading node needs heading text and no requirement.', { heading: 'required' })
  } else {
    if (!input.requirementId || input.heading) throw invalid('A requirement node needs requirementId and no heading.', { requirementId: 'required' })
    const r = await ctx.db.query<{ key: string }>('SELECT key FROM requirements.requirements WHERE id = $1 AND project_id = $2', [input.requirementId, ctx.projectId])
    if (!r.rowCount) throw invalid('The requirement does not exist in this project.', { requirementId: 'unknown' })
    const dup = await ctx.db.query('SELECT 1 FROM requirements.collection_nodes WHERE collection_id = $1 AND requirement_id = $2', [collectionId, input.requirementId])
    if (dup.rowCount) throw conflict(`${r.rows[0].key} is already in “${c.name}”. A requirement appears at most once per collection.`, c.structureRevision)
  }
  const count = await siblingCount(ctx, collectionId, parentId)
  const position = Math.min(input.position ?? count, count)
  await ctx.db.query('UPDATE requirements.collection_nodes SET position = position + 1 WHERE collection_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position >= $3', [collectionId, parentId, position])
  await ctx.db.query(
    'INSERT INTO requirements.collection_nodes (id, collection_id, parent_id, position, kind, heading, requirement_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, collectionId, parentId, position, input.kind, input.kind === 'heading' ? input.heading!.trim() : null, input.requirementId ?? null],
  )
  await bumpStructure(ctx, collectionId)
  await audit(ctx, { entityType: 'collection', entityId: collectionId, action: 'node-added', revision: c.structureRevision + 1, details: { nodeId: id, kind: input.kind, requirementId: input.requirementId, heading: input.heading, parentId, position } })
  return (await collectionTree(ctx.db, ctx.projectId, collectionId)).nodes.find((n) => n.id === id)!
}

async function getNode(ctx: Ctx, collectionId: string, nodeId: string) {
  if (!isUuid(nodeId)) throw notFound('Node not found.')
  const { rows } = await ctx.db.query<{ id: string; parent_id: string | null; position: number; kind: string; requirement_id: string | null }>(
    'SELECT id, parent_id, position, kind, requirement_id FROM requirements.collection_nodes WHERE id = $1 AND collection_id = $2',
    [nodeId, collectionId],
  )
  if (!rows[0]) throw notFound('Node not found in this collection.')
  return rows[0]
}

export async function moveNode(ctx: Ctx, collectionId: string, nodeId: string, to: { parentId: string | null; position: number }, expectedStructureRevision: number | null): Promise<NodeDto[]> {
  const c = await checkStructure(ctx, collectionId, expectedStructureRevision)
  const node = await getNode(ctx, collectionId, nodeId)
  await checkParent(ctx, collectionId, to.parentId)
  // Refuse moving a node under itself or a descendant.
  if (to.parentId) {
    const { rows } = await ctx.db.query<{ id: string }>(
      `WITH RECURSIVE up(id, parent_id) AS (SELECT id, parent_id FROM requirements.collection_nodes WHERE id = $1
         UNION ALL SELECT n.id, n.parent_id FROM requirements.collection_nodes n JOIN up ON n.id = up.parent_id)
       SELECT id FROM up WHERE id = $2`,
      [to.parentId, nodeId],
    )
    if (rows.length) throw invalid('A node cannot be moved under itself or one of its descendants.', { parentId: 'cycle' })
  }
  await ctx.db.query('UPDATE requirements.collection_nodes SET position = position - 1 WHERE collection_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position > $3', [collectionId, node.parent_id, node.position])
  const count = await siblingCount(ctx, collectionId, to.parentId) - (node.parent_id === to.parentId ? 1 : 0)
  const position = Math.max(0, Math.min(to.position, count))
  await ctx.db.query('UPDATE requirements.collection_nodes SET position = position + 1 WHERE collection_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position >= $3 AND id <> $4', [collectionId, to.parentId, position, nodeId])
  await ctx.db.query('UPDATE requirements.collection_nodes SET parent_id = $2, position = $3 WHERE id = $1', [nodeId, to.parentId, position])
  await bumpStructure(ctx, collectionId)
  await audit(ctx, { entityType: 'collection', entityId: collectionId, action: 'node-moved', revision: c.structureRevision + 1, details: { nodeId, from: { parentId: node.parent_id, position: node.position }, to: { parentId: to.parentId, position } } })
  return (await collectionTree(ctx.db, ctx.projectId, collectionId)).nodes
}

export async function renameHeading(ctx: Ctx, collectionId: string, nodeId: string, heading: string, expectedStructureRevision: number | null) {
  const c = await checkStructure(ctx, collectionId, expectedStructureRevision)
  const node = await getNode(ctx, collectionId, nodeId)
  if (node.kind !== 'heading') throw invalid('Only heading nodes have text; edit the requirement itself instead.')
  if (!heading.trim()) throw invalid('Heading text is required.', { heading: 'required' })
  await ctx.db.query('UPDATE requirements.collection_nodes SET heading = $2 WHERE id = $1', [nodeId, heading.trim()])
  await bumpStructure(ctx, collectionId)
  await audit(ctx, { entityType: 'collection', entityId: collectionId, action: 'heading-renamed', revision: c.structureRevision + 1, details: { nodeId, heading: heading.trim() } })
  return (await collectionTree(ctx.db, ctx.projectId, collectionId)).nodes
}

/** Removes a node from the structure (never the requirement). Nodes with children must be emptied first. */
export async function removeNode(ctx: Ctx, collectionId: string, nodeId: string, expectedStructureRevision: number | null) {
  const c = await checkStructure(ctx, collectionId, expectedStructureRevision)
  const node = await getNode(ctx, collectionId, nodeId)
  const kids = await ctx.db.query('SELECT 1 FROM requirements.collection_nodes WHERE parent_id = $1 LIMIT 1', [nodeId])
  if (kids.rowCount) throw invalid('Move or remove the nested items first.', { nodeId: 'has children' })
  await ctx.db.query('DELETE FROM requirements.collection_nodes WHERE id = $1', [nodeId])
  await ctx.db.query('UPDATE requirements.collection_nodes SET position = position - 1 WHERE collection_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND position > $3', [collectionId, node.parent_id, node.position])
  await bumpStructure(ctx, collectionId)
  await audit(ctx, { entityType: 'collection', entityId: collectionId, action: 'node-removed', revision: c.structureRevision + 1, details: { nodeId, kind: node.kind, requirementId: node.requirement_id } })
  return (await collectionTree(ctx.db, ctx.projectId, collectionId)).nodes
}

export async function collectionsOf(db: Queryable, requirementId: string): Promise<{ id: string; name: string; nodeId: string }[]> {
  const { rows } = await db.query<{ id: string; name: string; node_id: string }>(
    'SELECT c.id, c.name, n.id AS node_id FROM requirements.collection_nodes n JOIN requirements.collections c ON c.id = n.collection_id WHERE n.requirement_id = $1 ORDER BY c.name',
    [requirementId],
  )
  return rows.map((r) => ({ id: r.id, name: r.name, nodeId: r.node_id }))
}
