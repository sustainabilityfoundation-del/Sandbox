import { ActionError, type AssistantActionDefinition, type ServiceProposalItem } from '@ews/platform-sdk'
import type { CriterionCategory, CriterionInput, ExplorationCreate, Quantity, StatementInput, StatementKind } from '@ews/conceptualize-client'
import { assistantProvenance, connection, optString, proposal, resolve, string } from './assistantShared'
import { formatQuantity, KIND_LABEL } from './domain'

/**
 * CR-AI-1: `conceptualize.develop_alternatives` records the alternatives (and optionally the trade study)
 * exactly as the caller wrote them. It never invents alternatives: without `alternatives` it refuses.
 * The scripted principle library (ai/generator) is used ONLY by the demo planner, which converts its
 * output into these same arguments (`demoAlternativesArguments`), so a real model's request never gets
 * library content mixed in.
 */

export const STATEMENT_KINDS: StatementKind[] = ['function', 'behavior', 'principle', 'effect', 'input', 'output', 'constraint', 'interface', 'mechanism', 'problem', 'capability', 'performance', 'assumption', 'uncertainty', 'question', 'rationale', 'note', 'benefit', 'trade-off']
/** Bases the assistant may write (ADR-0043); default ai-hypothesis. */
const MODEL_BASES = ['ai-hypothesis', 'assumption', 'estimate'] as const
type ModelBasis = (typeof MODEL_BASES)[number]
const CATEGORIES: CriterionCategory[] = ['performance', 'mass', 'cost', 'complexity', 'manufacturability', 'risk', 'custom']

export const REFUSE_NO_ALTERNATIVES =
  'Give the alternatives you propose: name and summary each (alternatives: [{ name, summary, description?, statements? }]). This operation records your alternatives exactly as you write them; it does not invent any.'

const bad = (message: string): never => {
  throw new ActionError('invalid-arguments', message)
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown, where: string, required = true): string | undefined => {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return required ? bad(`${where} must be a non-empty string.`) : undefined
  if (typeof v !== 'string') return bad(`${where} must be a string.`)
  return v.trim()
}
const num = (v: unknown, where: string): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'number' || !Number.isFinite(v)) return bad(`${where} must be a number.`)
  return v
}
const basisOf = (v: unknown, where: string): ModelBasis => {
  if (v === undefined || v === null || v === '') return 'ai-hypothesis'
  if (!MODEL_BASES.includes(v as ModelBasis)) return bad(`${where} must be one of ${MODEL_BASES.join(', ')} (the assistant cannot record user assertions, calculated values, evidence or decisions).`)
  return v as ModelBasis
}

function quantityOf(v: unknown, where: string): Quantity | undefined {
  if (v === undefined || v === null) return undefined
  if (!isObj(v)) return bad(`${where} must be an object { value?, min?, max?, unit }.`)
  const unit = text(v.unit, `${where}.unit`)!
  const q: Quantity = { unit }
  const value = num(v.value, `${where}.value`)
  const min = num(v.min, `${where}.min`)
  const max = num(v.max, `${where}.max`)
  if (value !== undefined) q.value = value
  if (min !== undefined) q.min = min
  if (max !== undefined) q.max = max
  if (value === undefined && min === undefined && max === undefined) bad(`${where} needs a value, min or max.`)
  return q
}

/** Model-written statements, kept verbatim: kind, text, optional quantity and basis (default ai-hypothesis). */
export function modelStatements(raw: unknown, where: string): StatementInput[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return bad(`${where} must be an array of { kind, text, quantity?, basis? }.`)
  return raw.map((s, i) => {
    const at = `${where}[${i}]`
    if (!isObj(s)) return bad(`${at} must be an object { kind, text, quantity?, basis? }.`)
    const kind = s.kind as StatementKind
    if (!STATEMENT_KINDS.includes(kind)) return bad(`${at}.kind must be one of ${STATEMENT_KINDS.join(', ')}.`)
    const quantity = quantityOf(s.quantity, `${at}.quantity`)
    return { kind, text: text(s.text, `${at}.text`)!, basis: basisOf(s.basis, `${at}.basis`), ...(quantity ? { quantity } : {}) }
  })
}

const statementSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: STATEMENT_KINDS },
    text: string,
    quantity: { type: 'object', properties: { value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, unit: string }, required: ['unit'] },
    basis: { type: 'string', enum: [...MODEL_BASES], description: 'Default ai-hypothesis.' },
  },
  required: ['kind', 'text'],
}
export const statementsSchema = { type: 'array', items: statementSchema, maxItems: 40 }

interface ModelAlternative {
  name: string
  summary: string
  description?: string
  statements: StatementInput[]
  parts: string[]
}

function alternativesOf(raw: unknown): ModelAlternative[] {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return bad(REFUSE_NO_ALTERNATIVES)
  if (!Array.isArray(raw)) return bad(`alternatives must be an array. ${REFUSE_NO_ALTERNATIVES}`)
  if (raw.length > 20) bad('At most 20 alternatives.')
  const out = raw.map((a, i): ModelAlternative => {
    const at = `alternatives[${i}]`
    if (!isObj(a)) return bad(`${at} must be an object { name, summary, description?, statements? }. ${REFUSE_NO_ALTERNATIVES}`)
    const parts = a.parts === undefined || a.parts === null ? [] : Array.isArray(a.parts) ? a.parts.map((p, j) => text(p, `${at}.parts[${j}]`)!) : bad(`${at}.parts must be an array of names.`)
    return { name: text(a.name, `${at}.name`)!, summary: text(a.summary, `${at}.summary`)!, description: text(a.description, `${at}.description`, false), statements: modelStatements(a.statements, `${at}.statements`), parts }
  })
  const names = out.map((a) => a.name.toLowerCase())
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup) bad(`Two alternatives are named “${dup}”; give each a distinct name.`)
  return out
}

type Score = NonNullable<NonNullable<ExplorationCreate['tradeStudy']>['scores']>[number]

/** Index by 0-based number or by name (case-insensitive). */
function indexOf(ref: unknown, names: string[], where: string): number {
  if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < names.length) return ref
  if (typeof ref === 'string') {
    const i = names.findIndex((n) => n.toLowerCase() === ref.trim().toLowerCase())
    if (i >= 0) return i
  }
  return bad(`${where} must name one of: ${names.join(', ')} (or give its 0-based index).`)
}

function tradeStudyOf(raw: unknown, alternatives: ModelAlternative[], fallbackTitle: string): ExplorationCreate['tradeStudy'] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!isObj(raw)) return bad('tradeStudy must be an object { title?, criteria, scores? }.')
  if (!Array.isArray(raw.criteria) || !raw.criteria.length) return bad('tradeStudy.criteria must list at least one criterion { name, weight }.')
  const criteria = raw.criteria.map((c, i): CriterionInput => {
    const at = `tradeStudy.criteria[${i}]`
    if (!isObj(c)) return bad(`${at} must be an object { name, weight, direction?, unit?, category?, description? }.`)
    const weight = num(c.weight, `${at}.weight`)
    if (weight === undefined || weight < 0) return bad(`${at}.weight must be a number ≥ 0.`)
    const direction = c.direction === undefined || c.direction === null || c.direction === '' ? 'maximize' : c.direction === 'maximize' || c.direction === 'minimize' ? c.direction : bad(`${at}.direction must be maximize or minimize.`)
    const unit = text(c.unit, `${at}.unit`, false)
    const scale = c.scale === undefined || c.scale === null || c.scale === '' ? (unit ? 'quantity' : 'qualitative') : c.scale === 'quantity' || c.scale === 'qualitative' ? c.scale : bad(`${at}.scale must be quantity or qualitative.`)
    if (scale === 'quantity' && !unit) bad(`${at}: a quantity criterion needs a unit.`)
    const category = c.category === undefined || c.category === null || c.category === '' ? 'custom' : CATEGORIES.includes(c.category as CriterionCategory) ? (c.category as CriterionCategory) : bad(`${at}.category must be one of ${CATEGORIES.join(', ')}.`)
    const description = text(c.description, `${at}.description`, false)
    return { name: text(c.name, `${at}.name`)!, category, weight, direction, scale, ...(unit ? { unit } : {}), ...(description ? { description } : {}) }
  })
  const altNames = alternatives.map((a) => a.name)
  const critNames = criteria.map((c) => c.name)
  const scores = raw.scores === undefined || raw.scores === null ? [] : Array.isArray(raw.scores) ? raw.scores : bad('tradeStudy.scores must be an array.')
  const out = scores.map((s, i): Score => {
    const at = `tradeStudy.scores[${i}]`
    if (!isObj(s)) return bad(`${at} must be an object { alternative, criterion, value | low/high | qualitative, rationale }.`)
    const alternative = indexOf(s.alternative, altNames, `${at}.alternative`)
    const criterion = indexOf(s.criterion, critNames, `${at}.criterion`)
    const rationale = text(s.rationale, `${at}.rationale`)!
    const c = criteria[criterion]
    const score: Score = { alternative, criterion, basis: basisOf(s.basis, `${at}.basis`), rationale }
    if (c.scale === 'qualitative') {
      const q = num(s.qualitative ?? s.value, `${at}.qualitative`)
      if (q === undefined || q < 1 || q > 5) bad(`${at}: criterion “${c.name}” is qualitative; give qualitative 1–5.`)
      score.qualitative = q
    } else {
      const value = num(s.value, `${at}.value`)
      const low = num(s.low, `${at}.low`)
      const high = num(s.high, `${at}.high`)
      if (value === undefined && (low === undefined || high === undefined)) bad(`${at}: criterion “${c.name}” is a quantity; give value or low and high (in ${c.unit}).`)
      if (value !== undefined) score.value = value
      if (low !== undefined) score.low = low
      if (high !== undefined) score.high = high
      score.unit = text(s.unit, `${at}.unit`, false) ?? c.unit ?? undefined
    }
    return score
  })
  const seen = new Set<string>()
  for (const s of out) {
    const k = `${s.alternative}:${s.criterion}`
    if (seen.has(k)) bad(`Two scores for “${altNames[s.alternative]}” on “${critNames[s.criterion]}”.`)
    seen.add(k)
  }
  return { title: text(raw.title, 'tradeStudy.title', false) ?? fallbackTitle, criteria, ...(out.length ? { scores: out } : {}) }
}

export const MODEL_GENERATOR = 'assistant proposal (alternatives as written in the conversation)'

const statementLine = (s: StatementInput) => `${KIND_LABEL[s.kind]}: ${s.text}${s.quantity ? ` ${formatQuantity(s.quantity)}` : ''}`
const scoreText = (s: Score) => (s.qualitative != null ? `${s.qualitative}/5` : s.value != null ? `${s.value}${s.unit ? ` ${s.unit}` : ''}` : `${s.low}–${s.high}${s.unit ? ` ${s.unit}` : ''}`)

export const developAlternatives: AssistantActionDefinition = {
  name: 'conceptualize.develop_alternatives',
  label: 'Record alternative concepts',
  description:
    'Record the alternative solution Concepts YOU propose for a design objective, as an alternative set under a parent Concept, optionally with a trade study. ' +
    'You must supply `alternatives`: for each a name and a summary (the principle in one or two sentences), optionally a description, statements (kind, text, quantity, basis) and part names. ' +
    'Optionally supply `tradeStudy`: criteria with weights, and scores per alternative and criterion with a rationale (qualitative 1–5, or value / low–high in the criterion unit). ' +
    'Everything is recorded exactly as you write it, as AI hypotheses (or the basis you give: assumption, estimate). The objective text is kept verbatim. ' +
    'Give `parentId` to put the alternatives under an existing Concept; otherwise `name` names the new parent Concept. Nothing is invented by this operation; without alternatives it refuses. One atomic change, applied only after review.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The design objective in the user’s words (kept verbatim).' },
      name: { type: 'string', description: 'Name of the new parent Concept (when no parentId).' },
      parentId: { type: 'string', description: 'Existing Concept (key or UUID) the alternatives belong to.' },
      statements: { ...statementsSchema, description: 'Statements of the parent Concept, e.g. the constraints of the objective.' },
      alternatives: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: { name: string, summary: string, description: string, statements: statementsSchema, parts: { type: 'array', items: string, maxItems: 30, description: 'Names of child Concepts (functional decomposition).' } },
          required: ['name', 'summary'],
        },
      },
      tradeStudy: {
        type: 'object',
        properties: {
          title: string,
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: string, weight: { type: 'number', minimum: 0 }, direction: { type: 'string', enum: ['maximize', 'minimize'] }, scale: { type: 'string', enum: ['qualitative', 'quantity'] }, unit: string, category: { type: 'string', enum: CATEGORIES }, description: string },
              required: ['name', 'weight'],
            },
          },
          scores: {
            type: 'array',
            items: {
              type: 'object',
              properties: { alternative: { type: ['string', 'integer'], description: 'Alternative name (or 0-based index).' }, criterion: { type: ['string', 'integer'], description: 'Criterion name (or 0-based index).' }, qualitative: { type: 'number', minimum: 1, maximum: 5 }, value: { type: 'number' }, low: { type: 'number' }, high: { type: 'number' }, unit: string, rationale: string, basis: { type: 'string', enum: [...MODEL_BASES] } },
              required: ['alternative', 'criterion', 'rationale'],
            },
          },
        },
        required: ['criteria'],
      },
    },
    required: ['text', 'alternatives'],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const objective = text(args.text, '“text”')!
    // Validate the model's content before touching the service, so a missing list is refused clearly.
    const alternatives = alternativesOf(args.alternatives)
    const parentStatements = modelStatements(args.statements, 'statements')
    const { client } = connection(ctx)
    const parentArg = optString(args, 'parentId')
    const existing = parentArg ? await resolve(client, parentArg) : undefined
    const parentName = optString(args, 'name') ?? (existing ? undefined : objective.length <= 120 ? objective : `${objective.slice(0, 117).trimEnd()}…`)
    const label = existing ? existing.name : parentName!
    const tradeStudy = tradeStudyOf(args.tradeStudy, alternatives, `Comparison: ${label}`)
    if (existing && parentStatements.length) bad('statements describe a new parent Concept; with parentId, add statements to the existing Concept separately.')
    const exploration: ExplorationCreate = {
      objective,
      ...(existing ? { parentId: existing.id } : { parent: { name: parentName!, description: objective, statements: parentStatements } }),
      setName: `Alternatives for ${label}`,
      question: objective,
      alternatives: alternatives.map((a) => ({
        name: a.name,
        summary: a.summary,
        ...(a.description ? { description: a.description } : {}),
        statements: a.statements,
        ...(a.parts.length ? { children: a.parts.map((p) => ({ name: p, abstraction: 'function' as const })) } : {}),
      })),
      ...(tradeStudy ? { tradeStudy } : {}),
      generator: MODEL_GENERATOR,
    }
    const preview: ServiceProposalItem[] = [
      existing ? { label: 'Parent Concept (existing)', proposed: `${existing.key} ${existing.name}`, targetId: existing.id } : { label: 'Parent Concept', proposed: parentName!, basis: 'ai-hypothesis' },
      { label: 'Objective (your words)', proposed: objective, basis: 'user-statement' },
      ...parentStatements.map((s): ServiceProposalItem => ({ label: 'Parent statement', proposed: statementLine(s), basis: s.basis as ModelBasis })),
      ...alternatives.flatMap((a, i): ServiceProposalItem[] => [
        { label: `Alternative ${i + 1}`, proposed: `${a.name}: ${a.summary}${a.parts.length ? ` (parts: ${a.parts.join(', ')})` : ''}`, basis: 'ai-hypothesis' },
        ...(a.description ? [{ label: `${a.name}: description`, proposed: a.description, basis: 'ai-hypothesis' as const }] : []),
        ...a.statements.map((s): ServiceProposalItem => ({ label: `${a.name}: statement`, proposed: statementLine(s), basis: s.basis as ModelBasis })),
      ]),
      ...(tradeStudy
        ? [
            { label: 'Trade study', proposed: `${tradeStudy.title}: ${tradeStudy.criteria.map((c) => `${c.name} (weight ${c.weight}, ${c.direction}${c.unit ? `, ${c.unit}` : ''})`).join('; ')}`, basis: 'ai-hypothesis' as const },
            ...(tradeStudy.scores ?? []).map((s): ServiceProposalItem => ({ label: `Score: ${alternatives[s.alternative].name} / ${tradeStudy.criteria[s.criterion].name}`, proposed: `${scoreText(s)}: ${s.rationale}`, basis: s.basis as ModelBasis })),
          ]
        : []),
    ]
    let explorationId: string | undefined
    return proposal({
      title: `Record ${alternatives.length} alternative${alternatives.length === 1 ? '' : 's'} for “${label}”`,
      explanation: `The alternatives${tradeStudy ? ' and the trade study' : ''} are recorded exactly as proposed in the conversation, as AI hypotheses (or the stated basis). Nothing is verified; review, confirm or discard.`,
      preview,
      assumptions: ['The alternatives, statements and scores are the assistant’s proposals, not research results or measurements.', ...(tradeStudy?.scores?.length ? ['Trade-study scores are AI hypotheses for discussion; the ranking is preliminary.'] : [])],
      inspected: existing ? [{ id: existing.key, detail: `parent Concept (rev ${existing.revision})` }] : [],
      async apply(p) {
        const e = await client.createExploration(exploration, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:explore` })
        explorationId = e.id
        const parent = e.created.concepts.find((c) => c.role === 'parent')
        const alts = e.created.concepts.filter((c) => c.role === 'alternative')
        return { summary: `Recorded ${alts.map((c) => `${c.key} ${c.name}`).join(', ')} as alternatives${parent ? ` of ${parent.key}` : existing ? ` of ${existing.key}` : ''}${tradeStudy ? ' with a trade study' : ''}`, createdIds: e.created.concepts.map((c) => c.id) }
      },
      async undo() {
        if (!explorationId) return { summary: 'Nothing to undo.' }
        await client.undoExploration(explorationId, { reason: 'Undo of an assistant proposal (compensating change)' })
        return { summary: 'Archived the recorded Concepts and withdrew the alternatives (kept in the history)' }
      },
    })
  },
}

/**
 * DEMO ONLY: the scripted demo planner turns the principle library's output into the same arguments a
 * model writes, so the action has one path and never consults the library itself.
 */
export function demoAlternativesArguments(e: ExplorationCreate): Record<string, unknown> {
  const strip = (s: StatementInput) => ({ kind: s.kind, text: s.text, ...(s.quantity ? { quantity: s.quantity } : {}), ...(s.basis && s.basis !== 'ai-hypothesis' ? { basis: s.basis } : {}) })
  return {
    text: e.objective,
    ...(e.parent ? { name: e.parent.name, statements: (e.parent.statements ?? []).map(strip) } : {}),
    alternatives: e.alternatives.map((a) => ({
      name: a.name,
      summary: a.summary ?? a.name,
      statements: (a.statements ?? []).map(strip),
      ...(a.children?.length ? { parts: a.children.map((c) => c.name) } : {}),
    })),
    ...(e.tradeStudy
      ? {
          tradeStudy: {
            title: e.tradeStudy.title,
            criteria: e.tradeStudy.criteria.map((c) => ({ name: c.name, weight: c.weight, direction: c.direction, scale: c.scale, ...(c.unit ? { unit: c.unit } : {}), category: c.category, ...(c.description ? { description: c.description } : {}) })),
            scores: (e.tradeStudy.scores ?? []).map((s) => ({
              alternative: s.alternative,
              criterion: s.criterion,
              ...(s.qualitative != null ? { qualitative: s.qualitative } : {}),
              ...(s.value != null ? { value: s.value } : {}),
              ...(s.low != null ? { low: s.low } : {}),
              ...(s.high != null ? { high: s.high } : {}),
              ...(s.unit ? { unit: s.unit } : {}),
              rationale: s.rationale ?? 'Scripted demo score (AI hypothesis)',
              ...(s.basis !== 'ai-hypothesis' ? { basis: s.basis } : {}),
            })),
          },
        }
      : {}),
  }
}
