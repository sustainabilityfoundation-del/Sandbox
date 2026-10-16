import { randomUUID } from 'node:crypto'
import {
  BASIS_RANK,
  CalcError,
  ENGINE_VERSION,
  ENGINEERING_LIBRARY,
  compileModel,
  evaluateModel,
  libraryModel,
  qualifyManifest,
  validateModel,
  verifyManifest,
  type CalculationManifest,
  type CalculationModelDefinition,
  type InputValue,
} from '@ews/engineering-calc'
import { conflict, forbidden, invalid, notFound, ServiceError } from '../errors'
import { KEY_PREFIX, roleAllows, type Basis, type DesignEntityType } from '../domain/rules'
import type { CalculationModelCreateDto, CalculationModelOut, CalculationModelPatchDto } from '../http/calcSchemas'
import { ASSISTANT_BASES, audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'

/**
 * Calculation models (CR-C8). Definitions are validated and evaluated by @ews/engineering-calc; this module
 * stores them with immutable revisions, resolves default bindings to design records, and re-verifies manifests
 * for calculated evidence. It never re-implements the engine's semantics (C11 storage contract).
 */

interface Row {
  id: string
  project_id: string
  key: string
  current_revision: number
  validation_status: CalculationModelOut['validationStatus']
  created_at: Date
  created_by: string
  updated_at: Date
  updated_by: string
  revision: number
  name: string
  description: string
  grammar: string
  parameters: CalculationModelOut['parameters']
  relations: CalculationModelOut['relations']
  validity: CalculationModelOut['validity']
  basis: Basis
  assumptions: CalculationModelOut['assumptions']
  sources: CalculationModelOut['sources']
  library_id: string | null
  digest: string
  change_reason: string
  source_kind: CalculationModelOut['provenance']['sourceKind']
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  rev_created_at: Date
  rev_created_by: string
}

const SELECT = `SELECT m.id, m.project_id, m.key, m.current_revision, m.validation_status, m.created_at, m.created_by, m.updated_at, m.updated_by,
  v.revision, v.name, v.description, v.grammar, v.parameters, v.relations, v.validity, v.basis, v.assumptions, v.sources, v.library_id, v.digest, v.change_reason,
  v.source_kind, v.conversation_id, v.proposal_id, v.message_id, v.created_at AS rev_created_at, v.created_by AS rev_created_by
  FROM conceptualize.calculation_models m JOIN conceptualize.calculation_model_revisions v ON v.model_id = m.id`

const toDto = (r: Row): CalculationModelOut => ({
  id: r.id,
  key: r.key,
  projectId: r.project_id,
  revision: r.revision,
  name: r.name,
  description: r.description,
  grammar: r.grammar,
  parameters: r.parameters,
  relations: r.relations,
  validity: r.validity,
  basis: r.basis,
  validationStatus: r.validation_status,
  assumptions: r.assumptions,
  sources: r.sources,
  libraryId: r.library_id,
  digest: r.digest,
  changeReason: r.change_reason,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
  revisionCreatedAt: isoRequired(r.rev_created_at),
  revisionCreatedBy: r.rev_created_by,
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  updatedAt: isoRequired(r.updated_at),
  updatedBy: r.updated_by,
})

export async function getCalculationModel(db: Queryable, projectId: string, id: string, revision?: number): Promise<CalculationModelOut | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = COALESCE($3, m.current_revision) WHERE m.id = $1 AND m.project_id = $2`, [id, projectId, revision ?? null])
  return rows[0] ? toDto(rows[0]) : undefined
}

export async function requireCalculationModel(db: Queryable, projectId: string, id: string, revision?: number): Promise<CalculationModelOut> {
  const m = await getCalculationModel(db, projectId, id, revision)
  if (!m) throw notFound(revision ? `Calculation model ${id} revision ${revision} not found.` : `Calculation model ${id} not found.`)
  return m
}

export async function listCalculationModels(db: Queryable, projectId: string, q: { text?: string; status?: string } = {}): Promise<CalculationModelOut[]> {
  const params: unknown[] = [projectId]
  let where = 'm.project_id = $1'
  if (q.status) {
    params.push(q.status)
    where += ` AND m.validation_status = $${params.length}`
  } else where += " AND m.validation_status <> 'deprecated'"
  if (q.text?.trim()) {
    params.push(`%${q.text.trim()}%`)
    where += ` AND (v.name ILIKE $${params.length} OR m.key ILIKE $${params.length})`
  }
  const { rows } = await db.query<Row>(`${SELECT} AND v.revision = m.current_revision WHERE ${where} ORDER BY m.key`, params)
  return rows.map(toDto)
}

export async function listCalculationModelRevisions(db: Queryable, projectId: string, id: string) {
  const { rows } = await db.query<{ revision: number; name: string; change_reason: string; created_at: Date; created_by: string; source_kind: CalculationModelOut['provenance']['sourceKind']; conversation_id: string | null; proposal_id: string | null; message_id: string | null }>(
    `SELECT v.revision, v.name, v.change_reason, v.created_at, v.created_by, v.source_kind, v.conversation_id, v.proposal_id, v.message_id
     FROM conceptualize.calculation_model_revisions v JOIN conceptualize.calculation_models m ON m.id = v.model_id WHERE m.id = $1 AND m.project_id = $2 ORDER BY v.revision DESC`,
    [id, projectId],
  )
  return rows.map((r) => ({ revision: r.revision, name: r.name, changeReason: r.change_reason, maturityAtCreation: '', createdAt: isoRequired(r.created_at), createdBy: r.created_by, provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id } }))
}

/** Engine definition of a stored model revision (bindings are opaque to the engine). */
export function toDefinition(m: CalculationModelOut): CalculationModelDefinition {
  return {
    id: m.id,
    key: m.key,
    revision: m.revision,
    name: m.name,
    description: m.description,
    grammar: m.grammar as CalculationModelDefinition['grammar'],
    parameters: m.parameters.map(({ defaultBinding: _b, ...p }) => p),
    relations: m.relations,
    ...(m.validity ? { validity: m.validity } : {}),
    basis: m.basis,
    validationStatus: m.validationStatus,
  }
}

interface Content {
  name: string
  description: string
  grammar: string
  parameters: CalculationModelOut['parameters']
  relations: CalculationModelOut['relations']
  validity: CalculationModelOut['validity']
  basis: Basis
  assumptions: CalculationModelOut['assumptions']
  sources: CalculationModelOut['sources']
  libraryId: string | null
}

/** Validates a definition with the engine and its references in this project; returns the engine digest. */
async function check(ctx: Ctx, c: Content, validationStatus: CalculationModelOut['validationStatus']): Promise<string> {
  const errors: Record<string, string> = {}
  if (ctx.provenance.sourceKind === 'assistant' && !ASSISTANT_BASES.includes(c.basis)) errors.basis = 'the assistant proposes models as ai-hypothesis, assumption, assessment or estimate'
  if (['calculated', 'evidence', 'decision'].includes(c.basis)) errors.basis = 'a model is stated, assumed or proposed; calculated, evidence and decision apply to results'
  const { requireRefs } = await import('./refs')
  const { artifactProblem } = await import('./implementations')
  const designRefs: { type: DesignEntityType; id: string; field: string }[] = []
  c.parameters.forEach((p, i) => {
    const b = p.defaultBinding
    if (!b) return
    const r = b.ref as { module: string; type?: DesignEntityType; id: string }
    if (r.module === 'conceptualize') designRefs.push({ type: r.type!, id: r.id, field: `parameters.${i}.defaultBinding.ref` })
    else {
      const problem = artifactProblem(b.ref as never)
      if (problem) errors[`parameters.${i}.defaultBinding.ref`] = problem
    }
  })
  c.assumptions.forEach((a, i) => {
    if (a.type !== 'assumption') errors[`assumptions.${i}`] = 'assumption refs only'
    else designRefs.push({ type: 'assumption', id: a.id, field: `assumptions.${i}` })
  })
  c.sources.forEach((s, i) => {
    const problem = artifactProblem(s)
    if (problem) errors[`sources.${i}`] = problem
  })
  for (const r of designRefs) {
    try {
      await requireRefs(ctx.db, ctx.projectId, [{ type: r.type, id: r.id }], r.field)
    } catch {
      errors[r.field] = `${r.type} ${r.id} not found in this project`
    }
  }
  const def: CalculationModelDefinition = { id: 'pending', revision: 1, name: c.name, description: c.description, grammar: c.grammar as CalculationModelDefinition['grammar'], parameters: c.parameters.map(({ defaultBinding: _b, ...p }) => p), relations: c.relations, ...(c.validity ? { validity: c.validity } : {}), basis: c.basis, validationStatus }
  const problems = validateModel(def)
  for (const p of problems) errors[`model.${p.where}`] = `${p.code}: ${p.message}`
  if (Object.keys(errors).length) throw new ServiceError('invalid', 'The calculation model is not valid.', { fields: errors, problems })
  return compileModel(def).digest
}

async function insertRevision(ctx: Ctx, id: string, revision: number, c: Content, digest: string, reason: string) {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.calculation_model_revisions (model_id, revision, name, description, grammar, parameters, relations, validity, basis, assumptions, sources, library_id, digest, change_reason, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [id, revision, c.name, c.description, c.grammar, JSON.stringify(c.parameters), JSON.stringify(c.relations), c.validity ? JSON.stringify(c.validity) : null, c.basis, JSON.stringify(c.assumptions), JSON.stringify(c.sources), c.libraryId, digest, reason, p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
}

export async function createCalculationModel(ctx: Ctx, input: CalculationModelCreateDto & { id?: string }): Promise<CalculationModelOut> {
  if (!roleAllows(ctx.role, 'author')) throw forbidden('Creating a calculation model needs an editor or administrator.')
  let base: Partial<CalculationModelDefinition> = {}
  if (input.fromLibrary) {
    if (!ENGINEERING_LIBRARY.some((e) => e.id === input.fromLibrary)) throw invalid(`No library model ${input.fromLibrary}.`, { fromLibrary: ENGINEERING_LIBRARY.map((e) => e.id).join(', ') })
    base = libraryModel(input.fromLibrary)
  }
  const assistant = ctx.provenance.sourceKind === 'assistant'
  const c: Content = {
    name: (input.name ?? base.name ?? '').trim(),
    description: (input.description ?? base.description ?? '').trim(),
    grammar: input.grammar ?? base.grammar ?? 'ews-expr/1',
    parameters: input.parameters ?? ((base.parameters ?? []) as CalculationModelOut['parameters']),
    relations: input.relations ?? ((base.relations ?? []) as CalculationModelOut['relations']),
    validity: input.validity !== undefined ? input.validity : (base.validity ?? null),
    basis: input.basis ?? (base.basis as Basis | undefined) ?? (assistant ? 'ai-hypothesis' : 'user-assertion'),
    assumptions: input.assumptions ?? [],
    sources: input.sources ?? [],
    libraryId: input.fromLibrary ?? null,
  }
  if (!c.name) throw invalid('A calculation model needs a name.', { name: 'required' })
  // R1-5: AI-proposed models start unvalidated; a library entry stays unvalidated until a person validates it.
  const validationStatus = input.validationStatus ?? 'unvalidated'
  if (validationStatus === 'validated' && (assistant || input.fromLibrary)) throw invalid(assistant ? 'An AI-proposed calculation model starts unvalidated; a person validates it.' : 'A library model starts unvalidated; validate it after review.', { validationStatus: 'unvalidated' })
  const digest = await check(ctx, c, validationStatus)
  const id = input.id ?? randomUUID()
  const key = await nextKey(ctx, KEY_PREFIX.calculation, 'calculation_models')
  await ctx.db.query(
    `INSERT INTO conceptualize.calculation_models (id, project_id, key, current_revision, validation_status, created_at, created_by, updated_at, updated_by) VALUES ($1,$2,$3,1,$4,$5,$6,$5,$6)`,
    [id, ctx.projectId, key, validationStatus, ctx.now, ctx.actor],
  )
  const reason = (input.reason ?? '').trim()
  await insertRevision(ctx, id, 1, c, digest, reason)
  await audit(ctx, { entityType: 'calculation-model', entityId: id, action: 'created', revision: 1, reason, details: { key, name: c.name, digest, libraryId: c.libraryId, validationStatus } })
  await emit(ctx, 'calculation-model.created', id, 1)
  return (await getCalculationModel(ctx.db, ctx.projectId, id))!
}

async function lock(ctx: Ctx, id: string, expected: number | undefined): Promise<CalculationModelOut> {
  if (!isUuid(id)) throw notFound(`Calculation model ${id} not found.`)
  const { rowCount } = await ctx.db.query('SELECT 1 FROM conceptualize.calculation_models WHERE id = $1 AND project_id = $2 FOR UPDATE', [id, ctx.projectId])
  if (!rowCount) throw notFound(`Calculation model ${id} not found.`)
  const m = (await getCalculationModel(ctx.db, ctx.projectId, id))!
  if (expected !== undefined && m.revision !== expected) throw conflict(`${m.key} changed since revision ${expected} (now ${m.revision}). Reload; nothing was overwritten.`, m.revision)
  return m
}

/** A new revision; validation is reset because the validated definition changed. */
export async function updateCalculationModel(ctx: Ctx, id: string, patch: CalculationModelPatchDto, expected: number): Promise<CalculationModelOut> {
  if (!roleAllows(ctx.role, 'author')) throw forbidden('Editing a calculation model needs an editor or administrator.')
  const m = await lock(ctx, id, expected)
  if (m.validationStatus === 'deprecated') throw invalid(`${m.key} is deprecated; create a new model.`)
  const c: Content = {
    name: (patch.name ?? m.name).trim(),
    description: (patch.description ?? m.description).trim(),
    grammar: patch.grammar ?? m.grammar,
    parameters: patch.parameters ?? m.parameters,
    relations: patch.relations ?? m.relations,
    validity: patch.validity !== undefined ? patch.validity : m.validity,
    basis: patch.basis ?? m.basis,
    assumptions: patch.assumptions ?? m.assumptions,
    sources: patch.sources ?? m.sources,
    libraryId: m.libraryId,
  }
  const digest = await check(ctx, c, 'unvalidated')
  const revision = m.revision + 1
  const reason = (patch.reason ?? '').trim()
  await insertRevision(ctx, id, revision, c, digest, reason)
  await ctx.db.query(`UPDATE conceptualize.calculation_models SET current_revision = $2, validation_status = 'unvalidated', record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1`, [id, revision, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'calculation-model', entityId: id, action: 'revised', revision, reason, details: { digest, previousValidation: m.validationStatus } })
  await emit(ctx, 'calculation-model.revised', id, revision)
  return (await getCalculationModel(ctx.db, ctx.projectId, id))!
}

/** Validation is a person's record (a reviewer); deprecating is open to authors too. */
export async function setCalculationValidation(ctx: Ctx, id: string, status: CalculationModelOut['validationStatus'], expected: number | undefined, reason: string): Promise<CalculationModelOut> {
  if (ctx.provenance.sourceKind === 'assistant') throw forbidden('The assistant cannot change the validation of a calculation model; a person does.')
  if (status === 'validated' && !roleAllows(ctx.role, 'decide')) throw forbidden('Validating a calculation model needs a reviewer or administrator.')
  if (!roleAllows(ctx.role, 'author') && !roleAllows(ctx.role, 'decide')) throw forbidden('Changing model validation needs an editor, reviewer or administrator.')
  if (!reason?.trim()) throw invalid('A validation change needs a reason.', { reason: 'required' })
  const m = await lock(ctx, id, expected)
  if (m.validationStatus === status) throw invalid(`${m.key} is already ${status}.`)
  await ctx.db.query('UPDATE conceptualize.calculation_models SET validation_status = $2, record_version = record_version + 1, updated_at = $3, updated_by = $4 WHERE id = $1', [id, status, ctx.now, ctx.actor])
  await audit(ctx, { entityType: 'calculation-model', entityId: id, action: 'validation-changed', revision: m.revision, reason, details: { from: m.validationStatus, to: status } })
  await emit(ctx, 'calculation-model.revised', id, m.revision)
  return (await getCalculationModel(ctx.db, ctx.projectId, id))!
}

/** Value of a binding (quantity of an assumption, bound of a constraint, attribute of a Concept). */
async function bindingValue(db: Queryable, projectId: string, binding: NonNullable<CalculationModelOut['parameters'][number]['defaultBinding']>): Promise<InputValue | undefined> {
  const r = binding.ref as { module: string; type?: string; id: string; revision?: number }
  if (r.module !== 'conceptualize') return undefined
  const src = (basis: Basis, revision: number) => ({ kind: 'binding' as const, ref: { module: 'conceptualize', type: r.type, id: r.id, revision }, property: binding.property, revision, basis })
  if (r.type === 'assumption' && binding.property === 'quantity') {
    const { rows } = await db.query<{ quantity: { value?: number | null; min?: number | null; max?: number | null; unit: string } | null; basis: Basis; revision: number }>(
      `SELECT v.quantity, v.basis, v.revision FROM conceptualize.assumptions a JOIN conceptualize.assumption_revisions v ON v.assumption_id = a.id AND v.revision = COALESCE($3, a.current_revision) WHERE a.id::text = $1 AND a.project_id = $2`,
      [r.id, projectId, r.revision ?? null],
    )
    const q = rows[0]?.quantity
    return q ? { value: q.value ?? null, ...(q.min != null ? { min: q.min } : {}), ...(q.max != null ? { max: q.max } : {}), unit: q.unit, source: src(rows[0].basis, rows[0].revision) } : undefined
  }
  if (r.type === 'constraint' && binding.property === 'bound') {
    const { rows } = await db.query<{ bound: { quantity: { value?: number | null; min?: number | null; max?: number | null; unit: string } } | null; basis: Basis; revision: number }>(
      `SELECT v.bound, v.basis, v.revision FROM conceptualize.design_constraints c JOIN conceptualize.constraint_revisions v ON v.constraint_id = c.id AND v.revision = COALESCE($3, c.current_revision) WHERE c.id::text = $1 AND c.project_id = $2`,
      [r.id, projectId, r.revision ?? null],
    )
    const q = rows[0]?.bound?.quantity
    return q ? { value: q.value ?? null, ...(q.min != null ? { min: q.min } : {}), ...(q.max != null ? { max: q.max } : {}), unit: q.unit, source: src(rows[0].basis, rows[0].revision) } : undefined
  }
  if (r.type === 'concept') {
    const { rows } = await db.query<{ attributes: Record<string, { value?: number | null; min?: number | null; max?: number | null; unit: string; basis?: Basis }>; revision: number }>(
      `SELECT v.attributes, v.revision FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = COALESCE($3, c.current_revision) WHERE c.id::text = $1 AND c.project_id = $2`,
      [r.id, projectId, r.revision ?? null],
    )
    const a = rows[0]?.attributes?.[binding.property]
    return a ? { value: a.value ?? null, ...(a.min != null ? { min: a.min } : {}), ...(a.max != null ? { max: a.max } : {}), unit: a.unit, source: src(a.basis ?? 'user-assertion', rows[0].revision) } : undefined
  }
  return undefined
}

/** Read-only evaluation: inputs given, else default bindings, else parameter values. Nothing is stored. */
export async function evaluateCalculation(db: Queryable, projectId: string, id: string, req: { revision?: number; inputs?: Record<string, InputValue>; uncertainty?: 'point' | 'interval' }) {
  const m = await requireCalculationModel(db, projectId, id, req.revision)
  const inputs: Record<string, InputValue> = {}
  const missing: string[] = []
  // Constants come from the definition itself; the engine refuses them as inputs.
  for (const p of m.parameters.filter((x) => x.role === 'input' || x.role === 'design-variable')) {
    const given = req.inputs?.[p.symbol]
    if (given) inputs[p.symbol] = { ...given, source: (given.source as InputValue['source']) ?? { kind: 'literal', basis: 'user-assertion' } }
    else if (p.defaultBinding) {
      const v = await bindingValue(db, projectId, p.defaultBinding)
      if (v) inputs[p.symbol] = v
      else if (p.value !== undefined) inputs[p.symbol] = { value: p.value, unit: p.unit, source: { kind: 'literal', basis: m.basis } }
      else missing.push(p.symbol)
    } else if (p.value !== undefined || (p.min !== undefined && p.max !== undefined)) inputs[p.symbol] = { value: p.value ?? null, ...(p.min !== undefined ? { min: p.min } : {}), ...(p.max !== undefined ? { max: p.max } : {}), unit: p.unit, source: { kind: 'literal', basis: m.basis } }
    else missing.push(p.symbol)
  }
  if (missing.length) throw invalid(`Inputs missing: ${missing.join(', ')} (give them, bind them to a design record, or set a parameter value).`, Object.fromEntries(missing.map((s) => [`inputs.${s}`, 'required'])))
  try {
    const r = evaluateModel(toDefinition(m), inputs, { uncertainty: req.uncertainty ?? 'point' })
    return { model: { id: m.id, key: m.key, revision: m.revision }, inputs, manifest: r.manifest as unknown as Record<string, unknown>, qualifications: qualifyManifest(r.manifest) as unknown as Record<string, unknown>, basis: r.basis, warnings: r.warnings }
  } catch (e) {
    if (e instanceof CalcError) throw new ServiceError('invalid', `The calculation failed: ${e.message}`, { code: e.code, fields: { inputs: e.code } })
    throw e
  }
}

/** C11 storage contract Q1/Q2: verify a manifest against the stored model revision and derive its qualifications. */
export async function verifyEvidenceCalculation(ctx: Ctx, calc: { modelId: string; modelRevision: number; manifest: Record<string, unknown> }, basis: Basis) {
  const m = await getCalculationModel(ctx.db, ctx.projectId, calc.modelId, calc.modelRevision)
  if (!m) throw invalid(`Calculation model ${calc.modelId} revision ${calc.modelRevision} not found in this project.`, { 'calculation.modelId': 'not found' })
  const manifest = calc.manifest as unknown as CalculationManifest
  let verdict: ReturnType<typeof verifyManifest>
  try {
    verdict = verifyManifest(toDefinition(m), manifest)
  } catch (e) {
    throw new ServiceError('invalid', `The calculation could not be reproduced: ${e instanceof Error ? e.message : String(e)}`, { reasons: [String(e)], fields: { 'calculation.manifest': 'not reproducible' } })
  }
  if (!verdict.ok) throw new ServiceError('invalid', `The calculation could not be reproduced: ${verdict.reasons.join(' ')}`, { reasons: verdict.reasons, fields: { 'calculation.manifest': 'not reproducible' } })
  if (BASIS_RANK[basis as keyof typeof BASIS_RANK] > BASIS_RANK[manifest.basis]) throw invalid(`The manifest supports basis “${manifest.basis}”, not “${basis}”.`, { basis: `at most ${manifest.basis}` })
  const verification = { verifiedAt: ctx.now.toISOString(), engineVersion: ENGINE_VERSION, manifestVersion: (manifest.manifestVersion ?? 1) as 1 | 2 | 3, ok: true as const, ...(verdict.exactDigestMatch !== undefined ? { exactDigestMatch: verdict.exactDigestMatch } : {}) }
  return { calculation: { modelId: m.id, modelRevision: m.revision, manifest: calc.manifest, verification }, qualifications: qualifyManifest(manifest), model: m }
}

export const calculationLibrary = () =>
  ENGINEERING_LIBRARY.map((e) => ({ id: e.id, version: e.version, title: e.title, assumptions: e.assumptions, limitations: e.limitations, sources: e.sources, parameters: e.definition.parameters }))
