import { randomUUID } from 'node:crypto'
import type { AttributeDefinitionDto } from '../http/schemas'
import { conflict, invalid, notFound } from '../errors'
import { normalizeConventions, type WritingConventions } from '../quality/rules'
import { audit, iso, type Ctx, type Queryable } from './context'

type AttributeValue = string | number | boolean | string[] | null

interface DefinitionRow {
  id: string
  project_id: string
  key: string
  name: string
  description: string
  data_type: AttributeDefinitionDto['dataType']
  multi_valued: boolean
  min_value: string | null
  max_value: string | null
  max_length: number | null
  required: boolean
  revision: number
  archived: boolean
}

export async function listAttributeDefinitions(db: Queryable, projectId: string, includeArchived = true): Promise<AttributeDefinitionDto[]> {
  const defs = await db.query<DefinitionRow>(
    `SELECT * FROM requirements.attribute_definitions WHERE project_id = $1 ${includeArchived ? '' : 'AND NOT archived'} ORDER BY key`,
    [projectId],
  )
  if (!defs.rows.length) return []
  const values = await db.query<{ id: string; definition_id: string; key: string; label: string; position: number; archived: boolean }>(
    `SELECT id, definition_id, key, label, position, archived FROM requirements.attribute_enum_values WHERE definition_id = ANY($1) ORDER BY position`,
    [defs.rows.map((d) => d.id)],
  )
  return defs.rows.map((d) => ({
    id: d.id,
    projectId: d.project_id,
    key: d.key,
    name: d.name,
    description: d.description,
    dataType: d.data_type,
    multiValued: d.multi_valued,
    minValue: d.min_value === null ? null : Number(d.min_value),
    maxValue: d.max_value === null ? null : Number(d.max_value),
    maxLength: d.max_length,
    required: d.required,
    revision: d.revision,
    archived: d.archived,
    enumValues: values.rows.filter((v) => v.definition_id === d.id).map((v) => ({ id: v.id, key: v.key, label: v.label, position: v.position, archived: v.archived })),
  }))
}

export interface DefinitionInput {
  key: string
  name: string
  description?: string
  dataType: AttributeDefinitionDto['dataType']
  multiValued?: boolean
  minValue?: number | null
  maxValue?: number | null
  maxLength?: number | null
  required?: boolean
  enumValues?: { key: string; label: string }[]
}

export async function createAttributeDefinition(ctx: Ctx, input: DefinitionInput, id: string = randomUUID()): Promise<AttributeDefinitionDto> {
  if (input.dataType === 'enumeration' && !input.enumValues?.length) throw invalid('An enumeration attribute needs at least one value.', { enumValues: 'required for enumerations' })
  if (input.dataType !== 'enumeration' && input.enumValues?.length) throw invalid('Only enumeration attributes have values.', { enumValues: 'not allowed' })
  if (input.multiValued && input.dataType !== 'enumeration') throw invalid('Only enumeration attributes can be multi-valued.', { multiValued: 'enumeration only' })
  const keys = new Set<string>()
  for (const v of input.enumValues ?? []) {
    if (keys.has(v.key)) throw invalid(`Enumeration value key “${v.key}” is used twice.`, { enumValues: 'duplicate key' })
    keys.add(v.key)
  }
  const existing = await ctx.db.query('SELECT 1 FROM requirements.attribute_definitions WHERE project_id = $1 AND key = $2', [ctx.projectId, input.key])
  if (existing.rowCount) throw conflict(`An attribute with key “${input.key}” already exists.`)
  await ctx.db.query(
    `INSERT INTO requirements.attribute_definitions (id, project_id, key, name, description, data_type, multi_valued, min_value, max_value, max_length, required, created_at, created_by, updated_at, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,$13)`,
    [id, ctx.projectId, input.key, input.name, input.description ?? '', input.dataType, input.multiValued ?? false, input.minValue ?? null, input.maxValue ?? null, input.maxLength ?? null, input.required ?? false, ctx.now, ctx.actor],
  )
  let position = 0
  for (const v of input.enumValues ?? []) {
    await ctx.db.query(`INSERT INTO requirements.attribute_enum_values (id, definition_id, key, label, position) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, v.key, v.label, position++])
  }
  await audit(ctx, { entityType: 'attribute-definition', entityId: id, action: 'created', revision: 1, details: { key: input.key, dataType: input.dataType } })
  return (await listAttributeDefinitions(ctx.db, ctx.projectId)).find((d) => d.id === id)!
}

export async function updateAttributeDefinition(
  ctx: Ctx,
  id: string,
  patch: { name?: string; description?: string; required?: boolean; archived?: boolean; addEnumValues?: { key: string; label: string }[] },
  expectedRevision: number,
): Promise<AttributeDefinitionDto> {
  const { rows } = await ctx.db.query<DefinitionRow>('SELECT * FROM requirements.attribute_definitions WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  const def = rows[0]
  if (!def) throw notFound('Attribute definition not found.')
  if (def.revision !== expectedRevision) throw conflict(`The attribute definition changed since revision ${expectedRevision} (now ${def.revision}).`, def.revision)
  if (patch.addEnumValues?.length && def.data_type !== 'enumeration') throw invalid('Only enumeration attributes have values.')
  await ctx.db.query(
    `UPDATE requirements.attribute_definitions SET name = coalesce($3, name), description = coalesce($4, description), required = coalesce($5, required), archived = coalesce($6, archived),
       revision = revision + 1, updated_at = $7, updated_by = $8 WHERE id = $1 AND project_id = $2`,
    [id, ctx.projectId, patch.name ?? null, patch.description ?? null, patch.required ?? null, patch.archived ?? null, ctx.now, ctx.actor],
  )
  if (patch.addEnumValues?.length) {
    const { rows: max } = await ctx.db.query<{ p: number | null }>('SELECT max(position) AS p FROM requirements.attribute_enum_values WHERE definition_id = $1', [id])
    let position = (max[0].p ?? -1) + 1
    for (const v of patch.addEnumValues) {
      await ctx.db.query(`INSERT INTO requirements.attribute_enum_values (id, definition_id, key, label, position) VALUES ($1,$2,$3,$4,$5)`, [randomUUID(), id, v.key, v.label, position++])
    }
  }
  await audit(ctx, { entityType: 'attribute-definition', entityId: id, action: 'updated', revision: def.revision + 1, details: patch })
  return (await listAttributeDefinitions(ctx.db, ctx.projectId)).find((d) => d.id === id)!
}

/**
 * Validates attribute values against their definitions. Values are keyed by definition ID (or
 * definition key, which is normalised to the ID). Returns the normalised map.
 */
export function validateAttributeValues(defs: AttributeDefinitionDto[], values: Record<string, AttributeValue>): Record<string, Exclude<AttributeValue, null>> {
  const byId = new Map(defs.map((d) => [d.id, d]))
  const byKey = new Map(defs.map((d) => [d.key, d]))
  const out: Record<string, Exclude<AttributeValue, null>> = {}
  const errors: Record<string, string> = {}
  for (const [k, value] of Object.entries(values)) {
    const def = byId.get(k) ?? byKey.get(k)
    if (!def) {
      errors[k] = 'unknown attribute'
      continue
    }
    if (value === null) continue
    const fail = (msg: string) => (errors[def.key] = msg)
    switch (def.dataType) {
      case 'string':
      case 'xhtml':
        if (typeof value !== 'string') fail('must be text')
        else if (def.maxLength && value.length > def.maxLength) fail(`at most ${def.maxLength} characters`)
        else out[def.id] = value
        break
      case 'integer':
      case 'real':
        if (typeof value !== 'number' || !Number.isFinite(value)) fail('must be a number')
        else if (def.dataType === 'integer' && !Number.isInteger(value)) fail('must be a whole number')
        else if (def.minValue !== null && value < def.minValue) fail(`at least ${def.minValue}`)
        else if (def.maxValue !== null && value > def.maxValue) fail(`at most ${def.maxValue}`)
        else out[def.id] = value
        break
      case 'boolean':
        if (typeof value !== 'boolean') fail('must be true or false')
        else out[def.id] = value
        break
      case 'date':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value) || Number.isNaN(Date.parse(value))) fail('must be a date (YYYY-MM-DD or RFC 3339)')
        else out[def.id] = value
        break
      case 'enumeration': {
        const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : null
        const allowed = new Set(def.enumValues.filter((v) => !v.archived).map((v) => v.key))
        if (!list) fail('must be a list of value keys')
        else if (!def.multiValued && list.length > 1) fail('only one value may be selected')
        else if (list.some((v) => !allowed.has(v))) fail(`unknown value; allowed: ${[...allowed].join(', ')}`)
        else out[def.id] = list
        break
      }
    }
  }
  if (Object.keys(errors).length) throw invalid('Some attribute values are not valid.', errors)
  return out
}

export async function getConventions(db: Queryable, projectId: string): Promise<{ settings: WritingConventions; revision: number; updatedAt: string | null; updatedBy: string | null }> {
  const { rows } = await db.query<{ settings: Partial<WritingConventions>; revision: number; updated_at: Date; updated_by: string }>(
    'SELECT settings, revision, updated_at, updated_by FROM requirements.quality_conventions WHERE project_id = $1',
    [projectId],
  )
  const r = rows[0]
  return { settings: normalizeConventions(r?.settings), revision: r?.revision ?? 0, updatedAt: iso(r?.updated_at), updatedBy: r?.updated_by ?? null }
}

const LIST_KEYS: (keyof WritingConventions)[] = ['requirementTypes', 'obligationVerbs', 'vagueTerms', 'ambiguousTerms', 'indefinitePronouns', 'placeholderMarkers', 'units', 'disabledRules']
const BOOL_KEYS: (keyof WritingConventions)[] = ['requireObligationVerb', 'requireRationale', 'requireSource', 'requireAcceptanceCriteria', 'requireVerificationMethod']

export async function putConventions(ctx: Ctx, settings: Record<string, unknown>, expectedRevision: number) {
  const errors: Record<string, string> = {}
  const clean: Partial<WritingConventions> = {}
  for (const [k, v] of Object.entries(settings)) {
    if ((LIST_KEYS as string[]).includes(k)) {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 100) || v.length > 1000) errors[k] = 'must be a list of non-empty strings'
      else (clean as Record<string, unknown>)[k] = [...new Set(v.map((x: string) => x.trim()))]
    } else if ((BOOL_KEYS as string[]).includes(k)) {
      if (typeof v !== 'boolean') errors[k] = 'must be true or false'
      else (clean as Record<string, unknown>)[k] = v
    } else if (k === 'duplicateThreshold') {
      if (typeof v !== 'number' || v <= 0 || v > 1) errors[k] = 'must be a number in (0, 1]'
      else clean.duplicateThreshold = v
    } else if (k === 'expectedTraceability') {
      const ok =
        Array.isArray(v) &&
        v.every(
          (x) =>
            x && typeof x === 'object' && ['allocated-to', 'derives-from', 'decomposes', 'depends-on'].includes((x as { relationship: string }).relationship) &&
            Array.isArray((x as { requirementTypes: unknown }).requirementTypes),
        )
      if (!ok) errors[k] = 'must be a list of { relationship, requirementTypes }'
      else clean.expectedTraceability = v as WritingConventions['expectedTraceability']
    } else errors[k] = 'unknown setting'
  }
  if (clean.requirementTypes && clean.requirementTypes.length === 0) errors.requirementTypes = 'needs at least one type'
  if (Object.keys(errors).length) throw invalid('Some conventions are not valid.', errors)
  const current = await ctx.db.query<{ revision: number }>('SELECT revision FROM requirements.quality_conventions WHERE project_id = $1 FOR UPDATE', [ctx.projectId])
  const rev = current.rows[0]?.revision ?? 0
  if (rev !== expectedRevision) throw conflict(`The conventions changed since revision ${expectedRevision} (now ${rev}).`, rev)
  await ctx.db.query(
    `INSERT INTO requirements.quality_conventions (project_id, settings, revision, updated_at, updated_by) VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (project_id) DO UPDATE SET settings = $2, revision = requirements.quality_conventions.revision + 1, updated_at = $3, updated_by = $4`,
    [ctx.projectId, JSON.stringify(clean), ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'conventions', entityId: ctx.projectId, action: 'updated', revision: rev + 1, details: { keys: Object.keys(clean) } })
  return getConventions(ctx.db, ctx.projectId)
}

