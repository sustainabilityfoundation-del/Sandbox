import { randomUUID } from 'node:crypto'
import { conflict, forbidden, invalid, notFound } from '../errors'
import { roleAllows, type Role } from '../domain/rules'
import { audit, isUuid, isoRequired, type Ctx, type Queryable } from './context'

type Row = { id: string; project_id: string; owner: string; name: string; shared: boolean; definition: Record<string, unknown>; revision: number; created_at: Date; updated_at: Date }
const toDto = (r: Row) => ({ id: r.id, projectId: r.project_id, owner: r.owner, name: r.name, shared: r.shared, definition: r.definition, revision: r.revision, createdAt: isoRequired(r.created_at), updatedAt: isoRequired(r.updated_at) })

const ALLOWED_KEYS = new Set(['text', 'status', 'type', 'priority', 'owner', 'collectionId', 'includeArchived', 'configurationId', 'columns', 'sort', 'allocatedTo'])

function validateDefinition(d: Record<string, unknown>) {
  const unknown = Object.keys(d).filter((k) => !ALLOWED_KEYS.has(k))
  if (unknown.length) throw invalid(`Unknown view settings: ${unknown.join(', ')}.`, { definition: `allowed: ${[...ALLOWED_KEYS].join(', ')}` })
  if (JSON.stringify(d).length > 20000) throw invalid('The view definition is too large.', { definition: 'max 20 kB' })
}

/** The caller's views and views shared with the project. */
export async function listViews(db: Queryable, projectId: string, actor: string) {
  const { rows } = await db.query<Row>('SELECT * FROM requirements.saved_views WHERE project_id = $1 AND NOT deleted AND (owner = $2 OR shared) ORDER BY name', [projectId, actor])
  return rows.map(toDto)
}

export async function saveView(ctx: Ctx, role: Role | null, input: { name: string; shared?: boolean; definition: Record<string, unknown> }, id?: string, expectedRevision?: number) {
  validateDefinition(input.definition)
  if (input.shared && !roleAllows(role, 'save-shared-view')) throw forbidden('Your role may save personal views only.')
  if (!id) {
    const dup = await ctx.db.query('SELECT 1 FROM requirements.saved_views WHERE project_id = $1 AND owner = $2 AND name = $3 AND NOT deleted', [ctx.projectId, ctx.actor, input.name.trim()])
    if (dup.rowCount) throw conflict(`You already have a view named “${input.name.trim()}”.`)
    const newId = randomUUID()
    await ctx.db.query(
      'INSERT INTO requirements.saved_views (id, project_id, owner, name, shared, definition, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [newId, ctx.projectId, ctx.actor, input.name.trim(), input.shared ?? false, JSON.stringify(input.definition), ctx.now],
    )
    await audit(ctx, { entityType: 'saved-view', entityId: newId, action: 'created', revision: 1, details: { name: input.name } })
    return toDto((await ctx.db.query<Row>('SELECT * FROM requirements.saved_views WHERE id = $1', [newId])).rows[0])
  }
  if (!isUuid(id)) throw notFound('View not found.')
  const { rows } = await ctx.db.query<Row>('SELECT * FROM requirements.saved_views WHERE id = $1 AND project_id = $2 AND NOT deleted FOR UPDATE', [id, ctx.projectId])
  const v = rows[0]
  if (!v) throw notFound('View not found.')
  if (v.owner !== ctx.actor) throw forbidden('Only the owner changes a saved view.')
  if (expectedRevision === undefined || v.revision !== expectedRevision) throw conflict(`The view changed since revision ${expectedRevision} (now ${v.revision}).`, v.revision)
  await ctx.db.query('UPDATE requirements.saved_views SET name = $2, shared = $3, definition = $4, revision = revision + 1, updated_at = $5 WHERE id = $1', [id, input.name.trim(), input.shared ?? v.shared, JSON.stringify(input.definition), ctx.now])
  await audit(ctx, { entityType: 'saved-view', entityId: id, action: 'updated', revision: v.revision + 1 })
  return toDto((await ctx.db.query<Row>('SELECT * FROM requirements.saved_views WHERE id = $1', [id])).rows[0])
}

export async function deleteView(ctx: Ctx, id: string, expectedRevision: number) {
  if (!isUuid(id)) throw notFound('View not found.')
  const { rows } = await ctx.db.query<Row>('SELECT * FROM requirements.saved_views WHERE id = $1 AND project_id = $2 AND NOT deleted FOR UPDATE', [id, ctx.projectId])
  const v = rows[0]
  if (!v) throw notFound('View not found.')
  if (v.owner !== ctx.actor) throw forbidden('Only the owner deletes a saved view.')
  if (v.revision !== expectedRevision) throw conflict(`The view changed since revision ${expectedRevision} (now ${v.revision}).`, v.revision)
  await ctx.db.query('UPDATE requirements.saved_views SET deleted = true, revision = revision + 1, updated_at = $2 WHERE id = $1', [id, ctx.now])
  await audit(ctx, { entityType: 'saved-view', entityId: id, action: 'deleted', revision: v.revision + 1 })
}
