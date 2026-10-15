import { randomUUID } from 'node:crypto'
import { isValidUnit } from '@ews/platform-sdk'
import { conflict, invalid, notFound } from '../errors'
import { audit, isoRequired, isUuid, nextKey, type Ctx } from './context'
import { registerOwn } from './artifacts'
import type { Queryable } from '../ports'

/**
 * Product registry (ADR-0063): product elements and named breakdowns, module `product`. Elements are registered
 * in the artifact registry like every other artifact. Element kinds never constrain decomposition; a breakdown
 * edge may not close a cycle within its breakdown.
 */
export const ELEMENT_KINDS = ['product', 'system', 'subsystem', 'assembly', 'part', 'other'] as const
export type ElementKind = (typeof ELEMENT_KINDS)[number]
export const BREAKDOWN_PURPOSES = ['product-breakdown', 'physical-assembly', 'other'] as const

export type PropertyValue = string | number | boolean | string[] | { value: number; unit: string }

interface ElementRow {
  id: string
  project_id: string
  key: string
  name: string
  element_kind: ElementKind
  description: string
  properties: Record<string, PropertyValue>
  lifecycle: string
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

export function elementJson(r: ElementRow, extra: { aliases?: string[]; artifactId?: string } = {}) {
  return {
    id: r.id,
    projectId: r.project_id,
    key: r.key,
    name: r.name,
    elementKind: r.element_kind,
    description: r.description,
    properties: r.properties,
    lifecycle: r.lifecycle,
    aliases: extra.aliases ?? [],
    ...(extra.artifactId ? { artifactId: extra.artifactId } : {}),
    createdAt: isoRequired(r.created_at),
    createdBy: r.created_by,
    updatedAt: isoRequired(r.updated_at),
    updatedBy: r.updated_by,
    revision: r.revision,
  }
}

const PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/

export function checkProperties(properties: Record<string, unknown>): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {}
  const entries = Object.entries(properties)
  if (entries.length > 200) throw invalid('At most 200 properties.', { properties: 'too many' })
  for (const [name, v] of entries) {
    if (!PROPERTY_NAME.test(name)) throw invalid(`Property name “${name}” must start with a letter (letters, digits, underscore).`, { [`properties.${name}`]: 'name' })
    if (typeof v === 'string' || typeof v === 'boolean') out[name] = v
    else if (typeof v === 'number' && Number.isFinite(v)) out[name] = v
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[name] = v as string[]
    else if (v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number' && typeof (v as { unit?: unknown }).unit === 'string') {
      const q = v as { value: number; unit: string }
      if (!Number.isFinite(q.value)) throw invalid(`${name}: the value must be a finite number.`, { [`properties.${name}`]: 'value' })
      if (!isValidUnit(q.unit)) throw invalid(`${name}: “${q.unit}” is not a unit the platform understands.`, { [`properties.${name}`]: 'unit' })
      out[name] = { value: q.value, unit: q.unit }
    } else throw invalid(`${name}: a property is text, a number, true/false, a list of text or a quantity { value, unit }.`, { [`properties.${name}`]: 'type' })
  }
  return out
}

async function aliasesOf(db: Queryable, ids: string[]): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ element_id: string; alias: string }>('SELECT element_id, alias FROM projects.product_element_aliases WHERE element_id = ANY($1::uuid[]) ORDER BY alias', [ids])
  const map = new Map<string, string[]>()
  for (const r of rows) map.set(r.element_id, [...(map.get(r.element_id) ?? []), r.alias])
  return map
}

async function register(ctx: Ctx, e: ElementRow) {
  return registerOwn(ctx, { module: 'product', kind: 'product-element', nativeId: e.id, category: 'product-element', key: e.key, title: e.name, lifecycle: e.lifecycle as 'working', moduleState: e.element_kind, version: e.revision })
}

async function snapshot(ctx: Ctx, e: ElementRow, summary: string) {
  await ctx.db.query('INSERT INTO projects.product_element_revisions (element_id, revision, snapshot, changed_at, changed_by, summary) VALUES ($1,$2,$3,$4,$5,$6)', [e.id, e.revision, JSON.stringify(elementJson(e)), ctx.now, ctx.actor, summary])
}

export interface ElementInput {
  name: string
  elementKind: ElementKind
  description?: string
  properties?: Record<string, unknown>
  key?: string
  /** Twin IDs this element stands for (legacy example project only). */
  aliases?: string[]
  /** Place it in a breakdown right away. */
  placement?: { breakdownId: string; parentId?: string | null; quantity?: number }
}

export async function createElement(ctx: Ctx, input: ElementInput, options: { id?: string; summary?: string } = {}) {
  if (!ELEMENT_KINDS.includes(input.elementKind)) throw invalid(`Element kind is one of ${ELEMENT_KINDS.join(', ')}.`, { elementKind: 'unknown' })
  if (!input.name?.trim()) throw invalid('A name is required.', { name: 'required' })
  const properties = checkProperties(input.properties ?? {})
  const key = input.key ?? (await nextKey(ctx, 'PE', 'product_elements'))
  const id = options.id ?? randomUUID()
  const { rows } = await ctx.db.query<ElementRow>(
    `INSERT INTO projects.product_elements (id, project_id, key, name, element_kind, description, properties, created_at, created_by, updated_at, updated_by, source_kind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$9,$10) RETURNING *`,
    [id, ctx.projectId, key, input.name.trim(), input.elementKind, input.description ?? '', JSON.stringify(properties), ctx.now, ctx.actor, ctx.provenance.sourceKind],
  )
  const e = rows[0]
  for (const alias of input.aliases ?? []) await ctx.db.query(`INSERT INTO projects.product_element_aliases (project_id, alias, element_id) VALUES ($1,$2,$3)`, [ctx.projectId, alias, id])
  await snapshot(ctx, e, options.summary ?? 'Created')
  const artifactId = await register(ctx, e)
  if (input.placement) await addEdge(ctx, input.placement.breakdownId, { parentId: input.placement.parentId ?? null, childId: id, quantity: input.placement.quantity })
  await audit(ctx, { entityType: 'product-element', entityId: id, action: 'created', revision: 1, details: { key, elementKind: input.elementKind } })
  return elementJson(e, { aliases: input.aliases ?? [], artifactId })
}

export async function loadElement(db: Queryable, projectId: string, idOrAlias: string, forUpdate = false): Promise<ElementRow> {
  const lock = forUpdate ? ' FOR UPDATE' : ''
  const byId = isUuid(idOrAlias) ? await db.query<ElementRow>(`SELECT * FROM projects.product_elements WHERE id = $1 AND project_id = $2${lock}`, [idOrAlias, projectId]) : { rows: [] as ElementRow[] }
  if (byId.rows[0]) return byId.rows[0]
  const byAlias = await db.query<ElementRow>(`SELECT e.* FROM projects.product_element_aliases a JOIN projects.product_elements e ON e.id = a.element_id WHERE a.project_id = $1 AND a.alias = $2${lock}`, [projectId, idOrAlias])
  if (!byAlias.rows[0]) throw notFound(`No product element ${idOrAlias} in this project.`)
  return byAlias.rows[0]
}

async function artifactIdOfElement(ctx: Ctx, id: string) {
  const { rows } = await ctx.db.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = 'product' AND kind = 'product-element' AND native_id = $2`, [ctx.projectId, id])
  return rows[0]?.id
}

export async function getElement(ctx: Ctx, idOrAlias: string) {
  const e = await loadElement(ctx.db, ctx.projectId, idOrAlias)
  return elementJson(e, { aliases: (await aliasesOf(ctx.db, [e.id])).get(e.id) ?? [], artifactId: await artifactIdOfElement(ctx, e.id) })
}

export async function listElements(ctx: Ctx, query: { q?: string; elementKind?: string }) {
  const params: unknown[] = [ctx.projectId]
  const where = ['e.project_id = $1']
  if (query.elementKind) where.push(`e.element_kind = $${params.push(query.elementKind)}`)
  if (query.q?.trim()) where.push(`(e.key ILIKE $${params.push(`%${query.q.trim()}%`)} OR e.name ILIKE $${params.length})`)
  const { rows } = await ctx.db.query<ElementRow & { artifact_id: string | null }>(
    `SELECT e.*, a.id AS artifact_id FROM projects.product_elements e LEFT JOIN projects.artifacts a ON a.project_id = e.project_id AND a.module = 'product' AND a.kind = 'product-element' AND a.native_id = e.id::text
     WHERE ${where.join(' AND ')} ORDER BY e.key`,
    params,
  )
  const aliases = await aliasesOf(ctx.db, rows.map((r) => r.id))
  return rows.map((r) => elementJson(r, { aliases: aliases.get(r.id) ?? [], artifactId: r.artifact_id ?? undefined }))
}

export async function updateElement(ctx: Ctx, idOrAlias: string, expectedRevision: number, input: { name?: string; elementKind?: ElementKind; description?: string; properties?: Record<string, unknown>; lifecycle?: string }) {
  const e = await loadElement(ctx.db, ctx.projectId, idOrAlias, true)
  if (e.revision !== expectedRevision) throw conflict(`${e.key} changed since revision ${expectedRevision} (now ${e.revision}). Reload and apply your change again.`, e.revision)
  if (input.elementKind && !ELEMENT_KINDS.includes(input.elementKind)) throw invalid('Unknown element kind.', { elementKind: 'unknown' })
  if (input.name !== undefined && !input.name.trim()) throw invalid('A name is required.', { name: 'required' })
  if (input.lifecycle && !['working', 'in-review', 'released', 'superseded', 'retired'].includes(input.lifecycle)) throw invalid('Unknown lifecycle.', { lifecycle: 'unknown' })
  const properties = input.properties ? checkProperties({ ...e.properties, ...input.properties }) : null
  const changed = Object.keys(input)
  if (!changed.length) throw invalid('Nothing to change.')
  const { rows } = await ctx.db.query<ElementRow>(
    `UPDATE projects.product_elements SET name = coalesce($2, name), element_kind = coalesce($3, element_kind), description = coalesce($4, description), properties = coalesce($5, properties), lifecycle = coalesce($6, lifecycle),
       revision = revision + 1, updated_at = $7, updated_by = $8 WHERE id = $1 RETURNING *`,
    [e.id, input.name?.trim() ?? null, input.elementKind ?? null, input.description ?? null, properties ? JSON.stringify(properties) : null, input.lifecycle ?? null, ctx.now, ctx.actor],
  )
  const u = rows[0]
  await snapshot(ctx, u, `Changed ${changed.join(', ')}`)
  const artifactId = await register(ctx, u)
  await audit(ctx, { entityType: 'product-element', entityId: u.id, action: 'updated', revision: u.revision, details: { changed } })
  return elementJson(u, { aliases: (await aliasesOf(ctx.db, [u.id])).get(u.id) ?? [], artifactId })
}

export async function elementHistory(ctx: Ctx, idOrAlias: string) {
  const e = await loadElement(ctx.db, ctx.projectId, idOrAlias)
  const { rows } = await ctx.db.query<{ revision: number; snapshot: unknown; changed_at: Date; changed_by: string; summary: string }>('SELECT * FROM projects.product_element_revisions WHERE element_id = $1 ORDER BY revision DESC', [e.id])
  return rows.map((r) => ({ revision: r.revision, changedAt: isoRequired(r.changed_at), changedBy: r.changed_by, summary: r.summary, snapshot: r.snapshot }))
}

// ---- breakdowns ------------------------------------------------------------------------------------------

interface BreakdownRow {
  id: string
  project_id: string
  name: string
  purpose: string
  description: string
  revision: number
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
}

const breakdownJson = (b: BreakdownRow) => ({ id: b.id, projectId: b.project_id, name: b.name, purpose: b.purpose, description: b.description, revision: b.revision, createdAt: isoRequired(b.created_at), createdBy: b.created_by })

export async function createBreakdown(ctx: Ctx, input: { name: string; purpose: string; description?: string }, id: string = randomUUID()) {
  if (!(BREAKDOWN_PURPOSES as readonly string[]).includes(input.purpose)) throw invalid(`Purpose is one of ${BREAKDOWN_PURPOSES.join(', ')}.`, { purpose: 'unknown' })
  const { rows } = await ctx.db.query<BreakdownRow>(
    `INSERT INTO projects.breakdowns (id, project_id, name, purpose, description, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$6,$7) RETURNING *`,
    [id, ctx.projectId, input.name.trim(), input.purpose, input.description ?? '', ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'breakdown', entityId: id, action: 'created', revision: 1, details: { name: input.name, purpose: input.purpose } })
  return breakdownJson(rows[0])
}

async function loadBreakdown(ctx: Ctx, id: string, forUpdate = false): Promise<BreakdownRow> {
  if (!isUuid(id)) throw notFound(`No breakdown ${id}.`)
  const { rows } = await ctx.db.query<BreakdownRow>(`SELECT * FROM projects.breakdowns WHERE id = $1 AND project_id = $2${forUpdate ? ' FOR UPDATE' : ''}`, [id, ctx.projectId])
  if (!rows[0]) throw notFound(`No breakdown ${id}.`)
  return rows[0]
}

export async function listBreakdowns(ctx: Ctx) {
  const { rows } = await ctx.db.query<BreakdownRow>('SELECT * FROM projects.breakdowns WHERE project_id = $1 ORDER BY created_at, name', [ctx.projectId])
  return rows.map(breakdownJson)
}

/** Adds a parent→child edge (parent null = root). Refuses cycles within the breakdown. */
export async function addEdge(ctx: Ctx, breakdownId: string, input: { parentId: string | null; childId: string; quantity?: number; position?: number }) {
  const b = await loadBreakdown(ctx, breakdownId, true) // serialises edge changes per breakdown
  const child = await loadElement(ctx.db, ctx.projectId, input.childId)
  const parent = input.parentId ? await loadElement(ctx.db, ctx.projectId, input.parentId) : null
  if (parent && parent.id === child.id) throw invalid('An element cannot contain itself.', { parentId: 'same as child' })
  if (input.quantity !== undefined && !(input.quantity > 0)) throw invalid('Quantity must be positive.', { quantity: 'range' })
  if (parent) {
    // Would the parent be reachable from the child? Then the edge closes a cycle.
    const { rows } = await ctx.db.query<{ hit: boolean }>(
      `WITH RECURSIVE down(id) AS (
         SELECT child_id FROM projects.breakdown_edges WHERE breakdown_id = $1 AND parent_id = $2 AND removed_at IS NULL
         UNION SELECT e.child_id FROM projects.breakdown_edges e JOIN down d ON e.parent_id = d.id WHERE e.breakdown_id = $1 AND e.removed_at IS NULL)
       SELECT EXISTS (SELECT 1 FROM down WHERE id = $3) AS hit`,
      [b.id, child.id, parent.id],
    )
    if (rows[0].hit) throw invalid(`${parent.key} is already below ${child.key} in “${b.name}”; the edge would create a cycle.`, { parentId: 'cycle' })
  }
  const dup = await ctx.db.query(`SELECT 1 FROM projects.breakdown_edges WHERE breakdown_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND child_id = $3 AND removed_at IS NULL`, [b.id, parent?.id ?? null, child.id])
  if (dup.rowCount) throw conflict(`${child.key} is already ${parent ? `below ${parent.key}` : 'a root'} in “${b.name}”.`)
  const id = randomUUID()
  await ctx.db.query(`INSERT INTO projects.breakdown_edges (id, breakdown_id, parent_id, child_id, quantity, position, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
    id,
    b.id,
    parent?.id ?? null,
    child.id,
    input.quantity ?? null,
    input.position ?? 0,
    ctx.now,
    ctx.actor,
  ])
  await ctx.db.query('UPDATE projects.breakdowns SET revision = revision + 1, updated_at = $2, updated_by = $3 WHERE id = $1', [b.id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'breakdown', entityId: b.id, action: 'edge-added', details: { edgeId: id, parent: parent?.key ?? null, child: child.key, quantity: input.quantity ?? null } })
  return { id, breakdownId: b.id, parentId: parent?.id ?? null, childId: child.id, quantity: input.quantity ?? null, position: input.position ?? 0 }
}

export async function removeEdge(ctx: Ctx, breakdownId: string, edgeId: string) {
  const b = await loadBreakdown(ctx, breakdownId, true)
  if (!isUuid(edgeId)) throw notFound(`No edge ${edgeId}.`)
  const res = await ctx.db.query(`UPDATE projects.breakdown_edges SET removed_at = $3, removed_by = $4 WHERE id = $1 AND breakdown_id = $2 AND removed_at IS NULL`, [edgeId, b.id, ctx.now, ctx.actor])
  if (!res.rowCount) throw notFound(`No active edge ${edgeId} in this breakdown.`)
  await ctx.db.query('UPDATE projects.breakdowns SET revision = revision + 1, updated_at = $2, updated_by = $3 WHERE id = $1', [b.id, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'breakdown', entityId: b.id, action: 'edge-removed', details: { edgeId } })
}

/** The breakdown as a tree (a projection; an element under two parents appears twice). */
export async function breakdownTree(ctx: Ctx, breakdownId: string) {
  const b = await loadBreakdown(ctx, breakdownId)
  const { rows } = await ctx.db.query<{ id: string; parent_id: string | null; child_id: string; quantity: string | null; position: number }>(
    'SELECT id, parent_id, child_id, quantity, position FROM projects.breakdown_edges WHERE breakdown_id = $1 AND removed_at IS NULL ORDER BY position, created_at',
    [b.id],
  )
  const elements = new Map((await listElements(ctx, {})).map((e) => [e.id, e]))
  type Node = { edgeId: string; element: ReturnType<typeof elementJson> | undefined; quantity: number | null; children: Node[] }
  const build = (parentId: string | null, seen: Set<string>): Node[] =>
    rows
      .filter((r) => r.parent_id === parentId && !seen.has(r.child_id))
      .map((r) => ({ edgeId: r.id, element: elements.get(r.child_id), quantity: r.quantity === null ? null : Number(r.quantity), children: build(r.child_id, new Set([...seen, r.child_id])) }))
  const placed = new Set(rows.map((r) => r.child_id))
  return { breakdown: breakdownJson(b), roots: build(null, new Set()), unplaced: [...elements.values()].filter((e) => !placed.has(e.id)).map((e) => e.id) }
}
