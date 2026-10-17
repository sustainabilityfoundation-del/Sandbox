import type { ArtifactRef, ContextOmission, ContextQuantity, ContextRef, ContextSection, ContextSnapshotItem, SelectContextRequest, SelectContextResponse } from '@ews/platform-sdk'
import { readDefinition, type Parameter } from '../domain/definition'
import { DESIGN_ENTITY_TYPES, type DesignEntityType } from '../domain/rules'
import { listAssumptions } from './assumptions'
import { listConstraints } from './constraints'
import { isUuid, type Queryable } from './context'
import { getIntent, listIntents } from './intents'
import { readinessOf } from './architecture'
import { describeRefs } from './refs'

/**
 * The Conceptualize context selector (SDK 1.15 `selectContext`, ADR-0085, ECII plan Amendment 2): a read-only projection of the
 * project's design knowledge for one AI operation. It returns references with exact revisions plus bounded projections
 * (quantities with unit, tolerance and datum; summaries of at most 2,000 characters); it never copies document bytes and
 * never writes. Selection follows explicit records (the active intent, constraints, interfaces, assumptions, open
 * information needs and questions), not text similarity.
 *
 * Mandatory items (never dropped or summarised by the assembler):
 * - hard constraints in force (`strength = hard`, `status = active`): the safety-relevant limits (Conceptualize has no separate
 *   safety flag; a hard active constraint is the strongest statement the module holds);
 * - interfaces whose parameters are checked against a hard active constraint, and interface-kind hard constraints (critical interfaces);
 * - material unknowns: open essential (tier 1) information needs and open questions that block.
 */

export const SELECTOR_VERSION = 'conceptualize-context/1'
export const SUMMARY_LIMIT = 2000

/** Truncates to the summary bound (an ellipsis marks the cut). */
export const bounded = (text: string, limit = SUMMARY_LIMIT): string => (text.length <= limit ? text : `${text.slice(0, limit - 1)}…`)

/** Difference of two decimals without float noise (6.6 - 6.3 is 0.3, not 0.2999999999999998). */
const diff = (a: number, b: number): number => Number((a - b).toPrecision(12))

interface QuantityLike {
  value?: number | null
  unit: string
  min?: number | null
  max?: number | null
}

/** Quantities of a value or range, exactly as stored: a value with a range gets a tolerance, a bare range becomes its two bounds. */
export function quantitiesOf(name: string, q: QuantityLike | null | undefined, datum?: string): ContextQuantity[] {
  if (!q) return []
  const at = datum ? { datum } : {}
  if (q.value != null) {
    const tolerance = q.min != null || q.max != null ? { minus: q.min != null ? diff(q.value, q.min) : 0, plus: q.max != null ? diff(q.max, q.value) : 0 } : undefined
    return [{ name, value: q.value, unit: q.unit, ...(tolerance ? { tolerance } : {}), ...at }]
  }
  const out: ContextQuantity[] = []
  if (q.min != null) out.push({ name: `${name} (min)`, value: q.min, unit: q.unit, ...at })
  if (q.max != null) out.push({ name: `${name} (max)`, value: q.max, unit: q.unit, ...at })
  return out
}

const OPERATORS: Record<string, string> = { '<=': 'at most', '<': 'less than', '=': 'equal to', '>=': 'at least', '>': 'more than', 'in-range': 'within' }

interface Draft {
  ref: ContextRef
  section: ContextSection
  rank: number
  mandatory?: boolean
  via: ContextSnapshotItem['via']
  fields: string[]
  label?: string
  summary?: string
  quantities?: ContextQuantity[]
  status?: string
}

const toItem = (d: Draft): ContextSnapshotItem => ({
  ref: d.ref,
  revision: d.ref.revision ?? null,
  via: d.via,
  fields: d.fields,
  section: d.section,
  ...(d.mandatory ? { mandatory: true } : {}),
  rank: d.rank,
  projection: { ...(d.label ? { label: d.label } : {}), ...(d.summary ? { summary: bounded(d.summary) } : {}), ...(d.quantities?.length ? { quantities: d.quantities } : {}), ...(d.status ? { status: d.status } : {}) },
  selectedBy: 'conceptualize',
})

const designRef = (type: DesignEntityType | 'intent', id: string, revision: number): ContextRef => ({ module: 'conceptualize', id, revision, kind: type, type })

/** Sections each platform operation family needs (everything when the operation is not listed). The standing digest asks only for these four. */
export const DIGEST_SECTIONS: ContextSection[] = ['objective', 'systems', 'interfaces', 'readiness']

export async function selectContext(db: Queryable, projectId: string, req: SelectContextRequest): Promise<SelectContextResponse> {
  const wanted = req.sections?.length ? new Set<ContextSection>(req.sections) : null
  const want = (s: ContextSection) => !wanted || wanted.has(s)
  const drafts: Draft[] = []
  const omitted: ContextOmission[] = []

  // ---- requested targets (seed items) --------------------------------------------------------------------------------
  const wantedTargets = req.targets.filter((t: ArtifactRef) => t.module === 'conceptualize')
  if (wantedTargets.length) {
    const designTargets = wantedTargets.filter((t) => t.kind && (DESIGN_ENTITY_TYPES as string[]).includes(t.kind)).map((t) => ({ type: t.kind as DesignEntityType, id: t.id }))
    const found = await describeRefs(db, projectId, designTargets)
    const missing: ContextRef[] = []
    for (const t of wantedTargets) {
      if (t.kind === 'intent') {
        const intent = isUuid(t.id) ? await getIntent(db, projectId, t.id, t.revision) : undefined
        if (intent) drafts.push({ ref: designRef('intent', intent.id, intent.revision), section: 'objective', rank: 2000, via: 'seed', fields: ['designObject', 'objectives'], label: `${intent.key} ${intent.designObject}`, summary: intent.rationale, status: intent.basis })
        else missing.push({ module: 'conceptualize', id: t.id, ...(t.revision ? { revision: t.revision } : {}), kind: 'intent' })
        continue
      }
      const hit = found.find((f) => f.ref.id === t.id && f.ref.type === t.kind)
      if (hit) drafts.push({ ref: designRef(hit.ref.type, hit.ref.id, hit.revision), section: sectionOfType(hit.ref.type), rank: 2000, via: 'seed', fields: ['label', 'status'], label: `${hit.key} ${hit.label}`, status: hit.status })
      else missing.push({ module: 'conceptualize', id: t.id, ...(t.revision ? { revision: t.revision } : {}), ...(t.kind ? { kind: t.kind, type: t.kind } : {}) })
    }
    if (missing.length) omitted.push({ reason: 'not-found', count: missing.length, refs: missing })
  }

  // ---- the active intent: objective, hosts, unknowns -------------------------------------------------------------------
  const intents = await listIntents(db, projectId)
  const intent = intents[intents.length - 1]
  if (intent) {
    const ref = designRef('intent', intent.id, intent.revision)
    if (want('objective')) {
      const lines = [`Design object: ${intent.designObject} (role ${intent.role}, integration ${intent.integration}).`, intent.rationale && `Rationale: ${intent.rationale}`, intent.objectives.length && `Objectives: ${intent.objectives.join('; ')}`, intent.environment.length && `Environment: ${intent.environment.join('; ')}`].filter(Boolean)
      drafts.push({ ref, section: 'objective', rank: 1000, via: 'selector', fields: ['designObject', 'role', 'integration', 'rationale', 'objectives', 'environment'], label: `${intent.key} ${intent.designObject}`, summary: lines.join(' '), status: intent.basis })
    }
    if (want('systems')) {
      for (const s of intent.externalSystems) {
        const sid = s.id ?? s.name
        drafts.push({
          ref,
          section: 'systems',
          rank: 800,
          via: 'selector',
          fields: [`externalSystems.${sid}`],
          label: s.name,
          summary: `${s.role}. ${s.description}`.trim() + ` Relation: ${s.relation}; owner: ${s.owner}; ${s.identified ? 'identified' : 'not yet identified'}.`,
          status: s.identified ? 'documented' : 'unknown',
        })
      }
    }
    if (want('unknowns')) {
      for (const n of intent.informationNeeds) {
        if (n.state !== 'open' || n.tier > 2) continue
        drafts.push({ ref, section: 'unknowns', rank: n.tier === 1 ? 850 : 600, mandatory: n.tier === 1, via: 'selector', fields: [`informationNeeds.${n.id}`], label: `Need ${n.id} (tier ${n.tier})`, summary: n.text, status: 'unknown' })
      }
      for (const q of intent.questions) {
        if (q.state !== 'open') continue
        const blocks = q.impact === 'blocks'
        drafts.push({ ref, section: 'unknowns', rank: blocks ? 840 : q.impact === 'changes-architecture' ? 650 : 300, mandatory: blocks, via: 'selector', fields: [`questions.${q.id}`], label: `Question ${q.id} (${q.impact})`, summary: `${q.text} Why it matters: ${q.why}`, status: 'unknown' })
      }
    }
  }

  // ---- constraints and constraint-borne interfaces ------------------------------------------------------------------
  const constraints = want('constraints') || want('interfaces') ? await listConstraints(db, projectId) : []
  const hardActive = new Set(constraints.filter((c) => c.strength === 'hard' && c.status === 'active').map((c) => c.id))
  for (const c of constraints) {
    if (c.status === 'retired') continue
    const critical = c.strength === 'hard' && c.status === 'active'
    const section: ContextSection = c.kind === 'interface' ? 'interfaces' : 'constraints'
    if (!want(section)) continue
    const bound = c.bound
    const label = `${c.key} ${c.strength} ${c.kind} constraint`
    const operator = bound ? `${OPERATORS[bound.operator] ?? bound.operator}` : ''
    drafts.push({
      ref: designRef('constraint', c.id, c.revision),
      section,
      rank: critical ? 900 : c.strength === 'hard' ? 500 : c.strength === 'soft' ? 400 : 200,
      mandatory: critical,
      via: 'selector',
      fields: ['statement', 'bound', 'strength', 'basis', 'status'],
      label,
      summary: `${c.statement}${bound ? ` (${operator} ${bound.quantity.unit})` : ''}`,
      quantities: bound ? quantitiesOf(`${bound.symbol ?? c.key} ${bound.operator}`, bound.quantity) : [],
      status: `${c.status}; basis ${c.basis}`,
    })
  }

  // ---- assumptions not yet validated ----------------------------------------------------------------------------------
  if (want('assumptions')) {
    for (const a of await listAssumptions(db, projectId)) {
      if (a.validationStatus === 'validated' || a.validationStatus === 'invalidated' || a.validationStatus === 'retired') continue
      drafts.push({
        ref: designRef('assumption', a.id, a.revision),
        section: 'assumptions',
        rank: 450,
        via: 'selector',
        fields: ['statement', 'quantity', 'validationStatus'],
        label: `${a.key} assumption`,
        summary: a.statement,
        quantities: quantitiesOf(a.key, a.quantity),
        status: 'assumed',
      })
    }
  }

  // ---- live concepts: architectures (host interfaces) and component interfaces -----------------------------------------
  if (want('interfaces') || want('systems') || want('background')) {
    const { rows } = await db.query<{ id: string; key: string; revision: number; maturity: string; name: string; summary: string; definition: unknown }>(
      `SELECT c.id::text AS id, c.key, c.current_revision AS revision, c.maturity, v.name, v.summary, v.definition
       FROM conceptualize.concepts c JOIN conceptualize.concept_revisions v ON v.concept_id = c.id AND v.revision = c.current_revision
       WHERE c.project_id = $1 AND c.maturity NOT IN ('archived', 'superseded') ORDER BY c.key LIMIT 200`,
      [projectId],
    )
    for (const r of rows) {
      const ref = designRef('concept', r.id, r.revision)
      const def = readDefinition(r.definition)
      const arch = def.architecture
      if (arch?.level === 'architecture' && arch.hostInterface && want('interfaces')) {
        drafts.push({
          ref,
          section: 'interfaces',
          rank: 700,
          via: 'selector',
          fields: ['definition.architecture.hostInterface', 'definition.architecture.interfaceGeometry', 'definition.architecture.loadPath'],
          label: `${r.key} ${r.name} (architecture)`,
          summary: [`Host interface: ${arch.hostInterface}`, arch.attachmentPrinciple && `Attachment: ${arch.attachmentPrinciple}`, arch.interfaceGeometry && `Geometry: ${arch.interfaceGeometry}`, arch.loadPath && `Load path: ${arch.loadPath}`].filter(Boolean).join(' '),
          status: r.maturity,
        })
      }
      if (want('interfaces')) {
        const params = new Map<string, Parameter>(def.parameters.map((p) => [p.id, p]))
        for (const itf of def.interfaces) {
          const ps = itf.parameterIds.map((id) => params.get(id)).filter((p): p is Parameter => !!p)
          const critical = ps.some((p) => p.constraintId && hardActive.has(p.constraintId))
          drafts.push({
            ref,
            section: 'interfaces',
            rank: critical ? 880 : 650,
            mandatory: critical,
            via: 'selector',
            fields: [`definition.interfaces.${itf.id}`],
            label: `${r.key} interface ${itf.name} (${itf.kind})`,
            summary: `Between ${itf.between.join(' and ')}. ${itf.description}`.trim(),
            quantities: ps.flatMap((p) => quantitiesOf(p.symbol, { value: p.value, unit: p.unit, min: p.min, max: p.max })),
            status: ps.length ? ps.map((p) => p.basis).join(', ') : r.maturity,
          })
        }
      }
      if (want('background') && !arch && (req.operation.startsWith('conceptualize.') || req.operation === 'context.assemble')) {
        drafts.push({ ref, section: 'background', rank: 150, via: 'selector', fields: ['name', 'summary', 'maturity'], label: `${r.key} ${r.name}`, summary: r.summary, status: r.maturity })
      }
    }
  }

  // ---- readiness (the module's own view; also rendered by the digest) ---------------------------------------------------
  let readiness: SelectContextResponse['readiness']
  if (want('readiness')) {
    const r = await readinessOf(db, projectId, {})
    readiness = { state: r.contextReadiness.state, blockingIssues: r.contextReadiness.blockingIssues }
  }

  // ---- order and bound by the module's share of the budget ----------------------------------------------------------------
  const order = (a: Draft, b: Draft) => Number(!!b.mandatory) - Number(!!a.mandatory) || b.rank - a.rank || a.ref.id.localeCompare(b.ref.id) || a.fields.join().localeCompare(b.fields.join())
  const sorted = drafts.sort(order)
  const keep = Math.max(req.budget.maxItems, sorted.filter((d) => d.mandatory).length)
  const dropped = sorted.slice(keep)
  if (dropped.length) omitted.push({ reason: 'budget', count: dropped.length, refs: dropped.slice(0, 100).map((d) => d.ref) })
  return { module: 'conceptualize', selectorVersion: SELECTOR_VERSION, items: sorted.slice(0, keep).map(toItem), omitted, ...(readiness ? { readiness } : {}) }
}

function sectionOfType(type: DesignEntityType): ContextSection {
  switch (type) {
    case 'constraint':
      return 'constraints'
    case 'assumption':
      return 'assumptions'
    case 'evidence':
      return 'evidence'
    case 'decision':
      return 'decisions'
    default:
      return 'background'
  }
}
