import { randomUUID } from 'node:crypto'
import { invalid, notFound } from '../errors'
import { provisionalLabel } from '../domain/architecture'
import { readDefinition, type EngineeringDefinition } from '../domain/definition'
import type { ConceptDto, DecisionDto } from '../http/schemas'
import { listDecisions, listSets, requireSet } from './alternatives'
import { readinessOf } from './architecture'
import { listAssumptions } from './assumptions'
import { requireConcept } from './concepts'
import { listConstraints } from './constraints'
import { audit, emit, isUuid, isoRequired, nextKey, type Ctx, type Queryable } from './context'
import { listLinks } from './implementations'
import { DefinitionCache, listVisuals, type Staleness, type Visual } from './visuals'

/**
 * Concept cards (comparison workflow) and the CAD handoff package (concept-visualization-contracts.md §1).
 * Requirements and constraints are shown as INTENDED unless a recorded check exists: "verified" needs
 * verified evidence (basis evidence) whose result is checked against the constraint; anything else is a
 * preliminary check. An image never counts (ADR-0070).
 */

export type Coverage = 'intended' | 'preliminary-check' | 'verified'

export interface CardConstraint {
  id: string
  key: string
  revision: number
  statement: string
  bound: unknown
  strength: string
  status: string
  requirement: unknown | null
  coverage: Coverage
  checkStatus: string | null
  checkedBy: string | null
}

export interface ConceptCard {
  concept: { id: string; key: string; name: string; summary: string; revision: number; stage: string; maturity: string; verificationStatus: string }
  intent: string
  principle: string[]
  components: EngineeringDefinition['components']
  interfaces: (EngineeringDefinition['interfaces'][number] & { betweenNames: string[] })[]
  parameters: EngineeringDefinition['parameters']
  benefits: string[]
  tradeOffs: string[]
  constraints: CardConstraint[]
  requirements: { relation: string; artifact: unknown; coverage: 'intended' }[]
  assumptions: { id: string; key: string; statement: string; validationStatus: string }[]
  questions: { kind: string; text: string; state: string | null }[]
  validation: { verificationStatus: string; openQuestions: number; unconfirmedHypotheses: number; constraintsVerified: number; constraintsChecked: number; constraintsTotal: number }
  visuals: Visual[]
  /** The primary visual: the current structured layout when there is one. */
  primaryVisualId: string | null
  decisions: { id: string; key: string; title: string; status: string; outcome: string; rationale: string }[]
  membership: { setId: string; setKey: string; setName: string; status: string }[]
}

interface CheckRow {
  constraint_id: string
  basis: string
  status: string | null
  key: string
}

async function constraintChecks(db: Queryable, projectId: string, ids: string[]): Promise<Map<string, { coverage: Coverage; status: string | null; by: string }>> {
  const out = new Map<string, { coverage: Coverage; status: string | null; by: string }>()
  if (!ids.length) return out
  const { rows } = await db.query<CheckRow>(
    `SELECT r->'constraint'->>'id' AS constraint_id, e.basis, r->>'status' AS status, e.key
       FROM conceptualize.evidence e, jsonb_array_elements(e.results) r
      WHERE e.project_id = $1 AND r->'constraint'->>'id' = ANY($2::text[])
      ORDER BY e.created_at`,
    [projectId, ids],
  )
  for (const r of rows) {
    const coverage: Coverage = r.basis === 'evidence' ? 'verified' : 'preliminary-check'
    const prior = out.get(r.constraint_id)
    // The latest verified result wins over preliminary ones; otherwise the latest.
    if (!prior || coverage === 'verified' || prior.coverage !== 'verified') out.set(r.constraint_id, { coverage, status: r.status, by: r.key })
  }
  return out
}

export async function conceptCard(db: Queryable, projectId: string, conceptId: string, cache = new DefinitionCache(db)): Promise<ConceptCard> {
  const c = await requireConcept(db, projectId, conceptId)
  const def = readDefinition(c.definition)
  const [constraints, links, assumptions, visuals, decisions, sets] = await Promise.all([
    listConstraints(db, projectId, { subjectId: c.id }),
    listLinks(db, projectId, { conceptId: c.id }),
    listAssumptions(db, projectId, { subjectId: c.id }),
    listVisuals(db, projectId, { conceptId: c.id }),
    listDecisions(db, projectId, { conceptId: c.id }),
    listSets(db, projectId, { conceptId: c.id }),
  ])
  void cache
  const live = constraints.filter((x) => x.status !== 'retired')
  const checks = await constraintChecks(db, projectId, live.map((x) => x.id))
  const cardConstraints: CardConstraint[] = live.map((x) => {
    const check = checks.get(x.id)
    return { id: x.id, key: x.key, revision: x.revision, statement: x.statement, bound: x.bound, strength: x.strength, status: x.status, requirement: x.source.kind === 'requirement' ? x.source.ref : null, coverage: check?.coverage ?? 'intended', checkStatus: check?.status ?? null, checkedBy: check?.by ?? null }
  })
  const name = new Map(def.components.map((x) => [x.id, x.name]))
  const st = (kinds: string[]) => c.statements.filter((s) => kinds.includes(s.kind))
  const layouts = visuals.filter((v) => v.kind === 'layout')
  return {
    concept: { id: c.id, key: c.key, name: c.name, summary: c.summary, revision: c.revision, stage: c.stage, maturity: c.maturity, verificationStatus: c.verificationStatus },
    intent: def.intent,
    principle: st(['principle', 'mechanism']).map((s) => s.text),
    components: def.components,
    interfaces: def.interfaces.map((f) => ({ ...f, betweenNames: f.between.map((b) => name.get(b) ?? b) })),
    parameters: def.parameters,
    benefits: st(['benefit']).map((s) => s.text),
    tradeOffs: st(['trade-off']).map((s) => s.text),
    constraints: cardConstraints,
    requirements: links.filter((l) => !l.removed && l.artifact.module === 'requirements').map((l) => ({ relation: l.relation, artifact: l.artifact, coverage: 'intended' as const })),
    assumptions: assumptions.filter((a) => a.validationStatus !== 'retired').map((a) => ({ id: a.id, key: a.key, statement: a.statement, validationStatus: a.validationStatus })),
    questions: st(['question', 'uncertainty']).filter((s) => s.state !== 'resolved').map((s) => ({ kind: s.kind, text: s.text, state: s.state })),
    validation: {
      verificationStatus: c.verificationStatus,
      openQuestions: c.statements.filter((s) => (s.kind === 'question' || s.kind === 'uncertainty') && s.state !== 'resolved').length,
      unconfirmedHypotheses: c.statements.filter((s) => s.basis === 'ai-hypothesis' && !s.confirmedAt).length,
      constraintsVerified: cardConstraints.filter((x) => x.coverage === 'verified').length,
      constraintsChecked: cardConstraints.filter((x) => x.coverage !== 'intended').length,
      constraintsTotal: cardConstraints.length,
    },
    visuals,
    primaryVisualId: (layouts.find((v) => !v.staleness.outdated) ?? layouts[0])?.id ?? null,
    decisions: decisions.flatMap((d: DecisionDto) => d.outcomes.filter((o) => o.conceptId === c.id).map((o) => ({ id: d.id, key: d.key, title: d.title, status: d.status, outcome: o.outcome, rationale: o.rationale || d.rationale }))),
    membership: sets.flatMap((s) => s.members.filter((m) => m.conceptId === c.id).map((m) => ({ setId: s.id, setKey: s.key, setName: s.name, status: m.status }))),
  }
}

/** Cards of the members of an alternative set (the comparison view), in member order. */
export async function setCards(db: Queryable, projectId: string, setId: string): Promise<{ setId: string; key: string; name: string; question: string; parentId: string; cards: ConceptCard[] }> {
  const s = await requireSet(db, projectId, setId)
  const cache = new DefinitionCache(db)
  const cards: ConceptCard[] = []
  for (const m of s.members.filter((x) => x.status !== 'withdrawn')) cards.push(await conceptCard(db, projectId, m.conceptId, cache))
  return { setId: s.id, key: s.key, name: s.name, question: s.question, parentId: s.parentId, cards }
}

// ---- CAD handoff ------------------------------------------------------------------------------------------------------

export interface HandoffItem {
  kind: 'open-question' | 'uncertainty' | 'missing-definition' | 'parameter-range' | 'unplaced-component' | 'interface-without-parameters' | 'unchecked-constraint' | 'not-selected' | 'unvalidated-assumption' | 'provisional-readiness'
  text: string
  ref: string | null
}

export interface Handoff {
  id: string
  key: string
  projectId: string
  conceptId: string
  conceptRevision: number
  target: 'cad'
  package: Record<string, unknown> & { unresolved: HandoffItem[] }
  staleness: Staleness
  createdAt: string
  createdBy: string
  provenance: { sourceKind: string; conversationId: string | null; proposalId: string | null; messageId: string | null }
}

function envelopes(def: EngineeringDefinition) {
  if (!def.layout) return []
  const params = new Map(def.parameters.map((p) => [p.id, p]))
  const extent = (c: number | { parameter: string }) => {
    if (typeof c === 'number') return { value: c, unit: def.layout!.unit, parameterId: null, basis: 'layout (schematic, not a defined parameter)' }
    const p = params.get(c.parameter)!
    return { value: p.value, unit: p.unit, parameterId: p.id, symbol: p.symbol, basis: p.basis }
  }
  return def.layout.items.map((it) => ({ componentId: it.componentId, view: def.layout!.view, shape: it.shape, width: extent(it.width), height: extent(it.height), position: { x: extent(it.x), y: extent(it.y) } }))
}

/** Builds the handoff package from one exact Concept revision. Missing information is listed, never invented. */
export async function buildHandoffPackage(db: Queryable, projectId: string, concept: ConceptDto): Promise<Handoff['package']> {
  const def = readDefinition(concept.definition)
  const card = await conceptCard(db, projectId, concept.id)
  const unresolved: HandoffItem[] = []
  if (!def.components.length) unresolved.push({ kind: 'missing-definition', text: 'No components are defined; CAD needs at least the parts to model.', ref: null })
  if (!def.parameters.length) unresolved.push({ kind: 'missing-definition', text: 'No parameters are defined; CAD has no dimensions to use.', ref: null })
  if (!def.layout) unresolved.push({ kind: 'missing-definition', text: 'No structured layout: positions and envelopes are unknown.', ref: null })
  for (const p of def.parameters) if (p.value == null) unresolved.push({ kind: 'parameter-range', text: `${p.symbol} is a range (${p.min ?? '…'}–${p.max ?? '…'} ${p.unit}) without a nominal value.`, ref: p.id })
  const placed = new Set(def.layout?.items.map((i) => i.componentId) ?? [])
  for (const c of def.components) if (def.layout && !placed.has(c.id)) unresolved.push({ kind: 'unplaced-component', text: `${c.id} ${c.name} is not placed in the layout.`, ref: c.id })
  for (const f of def.interfaces) if (!f.parameterIds.length) unresolved.push({ kind: 'interface-without-parameters', text: `Interface ${f.id} ${f.name} has no defining parameters.`, ref: f.id })
  for (const q of concept.statements) if ((q.kind === 'question' || q.kind === 'uncertainty') && q.state !== 'resolved') unresolved.push({ kind: q.kind === 'question' ? 'open-question' : 'uncertainty', text: q.text, ref: q.id })
  for (const x of card.constraints) if (x.coverage === 'intended') unresolved.push({ kind: 'unchecked-constraint', text: `${x.key} ${x.statement} has no recorded check.`, ref: x.id })
  for (const a of card.assumptions) if (a.validationStatus !== 'validated') unresolved.push({ kind: 'unvalidated-assumption', text: `${a.key} ${a.statement} (${a.validationStatus})`, ref: a.id })
  if (!card.membership.some((m) => m.status === 'selected') && concept.maturity !== 'selected') unresolved.push({ kind: 'not-selected', text: `${concept.key} is not recorded as the selected alternative.`, ref: concept.id })
  // ECII increment 2: the readiness gate is advisory in Phase 1. A handoff built before the interfaces are verified is labelled
  // provisional and lists what is unmet; it is never refused. Without an engineering intent readiness cannot be assessed.
  const readiness = await readinessOf(db, projectId, { activity: 'cad-handoff', conceptId: concept.id })
  const gate = readiness.activities[0]
  if (readiness.intent && gate && readiness.provisional) {
    unresolved.push({ kind: 'provisional-readiness', text: provisionalLabel(readiness.level, gate.unmet, 'cad-handoff'), ref: readiness.intent.id })
    for (const u of gate.unmet) unresolved.push({ kind: 'provisional-readiness', text: u.text, ref: u.ref ?? readiness.intent.id })
  }
  return {
    schema: 'conceptualize.cad-handoff/1',
    concept: { id: concept.id, key: concept.key, name: concept.name, revision: concept.revision, stage: concept.stage, maturity: concept.maturity },
    intent: def.intent,
    architecture: def.architecture,
    readiness: readiness.intent
      ? { assessed: true, activity: 'cad-handoff', intent: readiness.intent.key, level: readiness.level, provisional: readiness.provisional, advisory: true, unmet: gate?.unmet ?? [], criteriaVersion: readiness.criteriaVersion }
      : { assessed: false, activity: 'cad-handoff', advisory: true, note: 'No engineering intent is recorded, so readiness was not assessed; interpret the intent first.' },
    components: def.components,
    relationships: def.relationships,
    interfaces: def.interfaces,
    parameters: def.parameters,
    envelopes: envelopes(def),
    constraints: card.constraints,
    requirements: [...card.requirements, ...card.constraints.filter((x) => x.requirement).map((x) => ({ relation: 'formalized-by-constraint', artifact: x.requirement, coverage: x.coverage, constraintId: x.id }))],
    decisions: card.decisions,
    assumptions: card.assumptions,
    visuals: card.visuals.filter((v) => v.conceptRevision === concept.revision).map((v) => ({ id: v.id, key: v.key, kind: v.kind, revision: v.revision, notToScale: v.notToScale, illustrative: v.kind !== 'layout', testAsset: v.generation?.testAsset ?? false, assetId: v.generation?.assetId ?? null })),
    note: 'Structured intent for CAD. Images are references only (illustrative, not geometry). Values carry their basis; nothing here is verified unless a constraint says so.',
    unresolved,
  }
}

interface HandoffRow {
  id: string
  project_id: string
  key: string
  concept_id: string
  concept_revision: number
  target: 'cad'
  package: Handoff['package']
  source_kind: string
  conversation_id: string | null
  proposal_id: string | null
  message_id: string | null
  created_at: Date
  created_by: string
}

const toHandoff = async (r: HandoffRow, cache: DefinitionCache): Promise<Handoff> => ({
  id: r.id,
  key: r.key,
  projectId: r.project_id,
  conceptId: r.concept_id,
  conceptRevision: r.concept_revision,
  target: r.target,
  package: r.package,
  staleness: await cache.staleness(r.concept_id, r.concept_revision, 'handoff'),
  createdAt: isoRequired(r.created_at),
  createdBy: r.created_by,
  provenance: { sourceKind: r.source_kind, conversationId: r.conversation_id, proposalId: r.proposal_id, messageId: r.message_id },
})

export async function createHandoff(ctx: Ctx, conceptId: string, input: { target?: 'cad'; conceptRevision?: number }): Promise<Handoff> {
  const current = await requireConcept(ctx.db, ctx.projectId, conceptId)
  if (input.conceptRevision && input.conceptRevision !== current.revision) throw invalid(`A handoff is built from the current revision of ${current.key} (${current.revision}); revision ${input.conceptRevision} is not current.`, { conceptRevision: 'not current' })
  const pkg = await buildHandoffPackage(ctx.db, ctx.projectId, current)
  const id = randomUUID()
  const key = await nextKey(ctx, 'HND', 'handoffs')
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.handoffs (id, project_id, key, concept_id, concept_revision, target, package, source_kind, conversation_id, proposal_id, message_id, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, ctx.projectId, key, current.id, current.revision, input.target ?? 'cad', JSON.stringify(pkg), p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, ctx.now, ctx.actor],
  )
  await audit(ctx, { entityType: 'handoff', entityId: id, conceptIds: [current.id], action: 'created', revision: current.revision, details: { key, target: input.target ?? 'cad', unresolved: pkg.unresolved.length } })
  await emit(ctx, 'handoff.created', id, 1)
  return (await getHandoff(ctx.db, ctx.projectId, id))!
}

export async function getHandoff(db: Queryable, projectId: string, id: string): Promise<Handoff | undefined> {
  if (!isUuid(id)) return undefined
  const { rows } = await db.query<HandoffRow>('SELECT * FROM conceptualize.handoffs WHERE id = $1 AND project_id = $2', [id, projectId])
  return rows[0] ? toHandoff(rows[0], new DefinitionCache(db)) : undefined
}

export async function requireHandoff(db: Queryable, projectId: string, id: string): Promise<Handoff> {
  const h = await getHandoff(db, projectId, id)
  if (!h) throw notFound(`Handoff ${id} not found.`)
  return h
}

export async function listHandoffs(db: Queryable, projectId: string, conceptId?: string): Promise<Handoff[]> {
  const { rows } = await db.query<HandoffRow>('SELECT * FROM conceptualize.handoffs WHERE project_id = $1 AND ($2::uuid IS NULL OR concept_id = $2) ORDER BY key', [projectId, conceptId && isUuid(conceptId) ? conceptId : null])
  const cache = new DefinitionCache(db)
  return Promise.all(rows.map((r) => toHandoff(r, cache)))
}
