import { Ajv, type ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { Type, type TSchema } from '@sinclair/typebox'
import { invalid } from '../errors'
import * as D from '../http/designSchemas'
import * as S from '../http/schemas'
import { addMember, createDecision, createSet } from './alternatives'
import { createAssumption } from './assumptions'
import { createConcept, updateConcept } from './concepts'
import { createConstraint } from './constraints'
import { audit, type Ctx } from './context'
import { createDesignLink } from './designLinks'
import { createFunction, updateFunction } from './functions'
import { createEvidence, createImplementation, createLink } from './implementations'
import { createRelationship } from './relationships'

/**
 * Atomic batch (CR-C10): a list of create/link/update operations executed in one transaction with one
 * provenance. An operation may name a placeholder (`ref: "$fn1"`); any later string value equal to it is
 * replaced by the created ID. Each item is validated with the same schema and rules as its single
 * endpoint; any failure rolls back the whole batch and names the failing item.
 */

const addFormats = addFormatsModule as unknown as (a: Ajv) => Ajv
const ajv = addFormats(new Ajv({ allErrors: true, strict: false, coerceTypes: false, useDefaults: false }))

function stripIds(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripIds)
  if (!schema || typeof schema !== 'object') return schema
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) if (k !== '$id') out[k] = stripIds(v)
  return out
}

const withField = (schema: TSchema, fields: Record<string, TSchema>) => Type.Object({ ...(schema as unknown as { properties: Record<string, TSchema> }).properties, ...fields }, { additionalProperties: false })

const SCHEMA_OF: Record<string, TSchema> = {
  'create-concept': S.ConceptCreate,
  'update-concept': S.ConceptPatch,
  'create-function': D.FunctionCreate,
  'update-function': D.FunctionPatch,
  'create-constraint': D.ConstraintCreate,
  'create-assumption': D.AssumptionCreate,
  'create-relationship': S.RelationshipCreate,
  'create-design-link': D.DesignLinkCreate,
  'create-evidence': D.EvidenceCreateV,
  'create-decision': D.DecisionCreateV,
  'create-implementation': S.ImplementationCreate,
  'create-concept-link': withField(S.LinkCreate, { conceptId: S.Uuid }),
  'create-alternative-set': S.AlternativeSetCreate,
  'add-alternative': Type.Object({ setId: S.Uuid, conceptId: S.Uuid }, { additionalProperties: false }),
}
const validators = new Map<string, ValidateFunction>()
const validatorFor = (op: string) => {
  let v = validators.get(op)
  if (!v) validators.set(op, (v = ajv.compile(stripIds(SCHEMA_OF[op]) as object)))
  return v
}

const PLACEHOLDER = /^\$[A-Za-z][A-Za-z0-9_-]{0,40}$/

function substitute(value: unknown, ids: Map<string, string>, path: string): unknown {
  if (typeof value === 'string' && PLACEHOLDER.test(value)) {
    const id = ids.get(value)
    if (!id) throw invalid(`Unknown placeholder ${value}; it must be defined by an earlier operation.`, { [path]: 'unknown placeholder' })
    return id
  }
  if (Array.isArray(value)) return value.map((v, i) => substitute(v, ids, `${path}.${i}`))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, ids, `${path}.${k}`)]))
  return value
}

type Result = { id: string; key?: string | null; revision?: number | null }

export async function runBatch(ctx: Ctx, request: D.BatchRequestDto) {
  const ids = new Map<string, string>()
  const results: { index: number; op: string; ref: string | null; id: string; key: string | null; revision: number | null }[] = []
  for (const [index, item] of request.operations.entries()) {
    const path = `operations.${index}`
    if (item.ref && ids.has(item.ref)) throw invalid(`Placeholder ${item.ref} is defined twice.`, { [`${path}.ref`]: 'duplicate' })
    const data = substitute(item.data, ids, `${path}.data`) as Record<string, unknown>
    const target = item.id ? (substitute(item.id, ids, `${path}.id`) as string) : undefined
    const validate = validatorFor(item.op)
    if (!validate(data)) {
      const fields = Object.fromEntries((validate.errors ?? []).map((e) => [`${path}.data${e.instancePath.replace(/\//g, '.')}`, `${e.message ?? 'invalid'}${e.params && 'additionalProperty' in e.params ? ` (${e.params.additionalProperty})` : ''}`]))
      throw invalid(`Operation ${index} (${item.op}) is not valid.`, fields)
    }
    if ((item.op === 'update-concept' || item.op === 'update-function') && (!target || item.expectedRevision === undefined)) throw invalid(`Operation ${index} (${item.op}) needs id and expectedRevision.`, { [path]: 'id and expectedRevision required' })
    let out: Result
    try {
      out = await execute(ctx, item.op, data, target, item.expectedRevision)
    } catch (e) {
      const err = e as { message?: string; details?: { fields?: Record<string, string> } }
      if (err && typeof err === 'object' && 'code' in err && 'status' in err) {
        const fields = Object.fromEntries(Object.entries(err.details?.fields ?? {}).map(([k, v]) => [`${path}.data.${k}`, v]))
        Object.assign(err, { message: `Operation ${index} (${item.op}): ${err.message}`, details: { ...(err.details ?? {}), fields: { ...fields, [path]: 'failed' } } })
      }
      throw e
    }
    if (item.ref) ids.set(item.ref, out.id)
    results.push({ index, op: item.op, ref: item.ref ?? null, id: out.id, key: out.key ?? null, revision: out.revision ?? null })
  }
  await audit(ctx, { entityType: 'batch', entityId: results[0]?.id ?? 'batch', action: 'applied', reason: request.reason ?? '', details: { operations: results.map((r) => `${r.op}:${r.id}`) } })
  return { results, ids: Object.fromEntries(ids) }
}

async function execute(ctx: Ctx, op: string, data: Record<string, unknown>, id: string | undefined, expected: number | undefined): Promise<Result> {
  switch (op) {
    case 'create-concept': {
      const { parentId, decompositionId, ...rest } = data as S.ConceptCreateDto
      const c = await createConcept(ctx, rest)
      if (parentId) await createRelationship(ctx, { type: 'contains', fromId: parentId, toId: c.id, decompositionId })
      return c
    }
    case 'update-concept':
      return (await updateConcept(ctx, id!, data as S.ConceptPatchDto, expected!)).concept
    case 'create-function':
      return createFunction(ctx, data as D.FunctionCreateDto)
    case 'update-function':
      return updateFunction(ctx, id!, data as D.FunctionPatchDto, expected!)
    case 'create-constraint':
      return createConstraint(ctx, data as D.ConstraintCreateDto)
    case 'create-assumption':
      return createAssumption(ctx, data as D.AssumptionCreateDto)
    case 'create-relationship':
      return createRelationship(ctx, data as S.RelationshipCreateDto)
    case 'create-design-link':
      return createDesignLink(ctx, data as D.DesignLinkCreateDto)
    case 'create-evidence':
      return createEvidence(ctx, data as D.EvidenceCreateVDto)
    case 'create-decision': {
      const d = await createDecision(ctx, data as D.DecisionCreateVDto)
      return { id: d.id, key: d.key, revision: d.recordVersion }
    }
    case 'create-implementation':
      return createImplementation(ctx, data as S.ImplementationCreateDto)
    case 'create-concept-link': {
      const { conceptId, ...rest } = data as S.LinkCreateDto & { conceptId: string }
      return createLink(ctx, conceptId, rest)
    }
    case 'create-alternative-set': {
      const s = await createSet(ctx, data as { parentId: string; name: string })
      return { id: s.id, key: s.key, revision: s.recordVersion }
    }
    case 'add-alternative': {
      const s = await addMember(ctx, data.setId as string, data.conceptId as string)
      return { id: s.id, key: s.key, revision: s.recordVersion }
    }
    default:
      throw invalid(`Unknown operation ${op}.`, { op: 'unknown' })
  }
}
