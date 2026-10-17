import { ActionError, type AssistantActionDefinition, type ServiceProposalItem } from '@ews/platform-sdk'
import type { CriterionCategory, CriterionInput, DefinitionInput, ExplorationCreate, Quantity, StatementInput, StatementKind } from '@ews/conceptualize-client'
import { assistantProvenance, connection, optString, proposal, resolve, string } from './assistantShared'
import { definitionSchema } from './assistantVisual'
import { architectureOf, architectureSchema, LEVELS, levelOf, readinessNote, type Level } from './assistantArchitecture'
import type { ArchitectureInput } from '@ews/conceptualize-client'
import { formatQuantity, KIND_LABEL } from './domain'
import { parameterLabel } from './layout/renderLayout'
import { generationRecord, illustrationAvailability, illustrationInstruction, refusalRecord, visualizationPort } from './visualization'

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
  /** Engineering definition (components, parameters, interfaces, layout): validated by the service. */
  definition?: DefinitionInput
  /** ECII increment 2: the architecture block (level architecture) or the parent link (level variant). */
  architecture?: ArchitectureInput
}

function alternativesOf(raw: unknown, level?: Level, parentArchitecture?: string): ModelAlternative[] {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return bad(REFUSE_NO_ALTERNATIVES)
  if (!Array.isArray(raw)) return bad(`alternatives must be an array. ${REFUSE_NO_ALTERNATIVES}`)
  if (raw.length > 20) bad('At most 20 alternatives.')
  const out = raw.map((a, i): ModelAlternative => {
    const at = `alternatives[${i}]`
    if (!isObj(a)) return bad(`${at} must be an object { name, summary, description?, statements? }. ${REFUSE_NO_ALTERNATIVES}`)
    const parts = a.parts === undefined || a.parts === null ? [] : Array.isArray(a.parts) ? a.parts.map((p, j) => text(p, `${at}.parts[${j}]`)!) : bad(`${at}.parts must be an array of names.`)
    if (a.definition !== undefined && a.definition !== null && !isObj(a.definition)) bad(`${at}.definition must be an object { intent?, components?, parameters?, interfaces?, layout? }.`)
    const architecture = architectureOf(a.architecture, level, parentArchitecture, at)
    return { name: text(a.name, `${at}.name`)!, summary: text(a.summary, `${at}.summary`)!, description: text(a.description, `${at}.description`, false), statements: modelStatements(a.statements, `${at}.statements`), parts, ...(isObj(a.definition) ? { definition: a.definition as DefinitionInput } : {}), ...(architecture ? { architecture } : {}) }
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
const architectureLines = (a: ModelAlternative): ServiceProposalItem[] => {
  const b = a.architecture
  if (!b) return []
  if (b.level === 'variant') return [{ label: `${a.name}: variant of`, proposed: b.parent ?? '', basis: 'ai-hypothesis' }]
  const line = (label: string, v: string | string[] | undefined): ServiceProposalItem[] => (v && v.length ? [{ label: `${a.name}: ${label}`, proposed: Array.isArray(v) ? v.join('; ') : v, basis: 'ai-hypothesis' }] : [])
  return [
    ...line('host interface', b.hostInterface),
    ...line('attachment principle', b.attachmentPrinciple),
    ...line('interface geometry', b.interfaceGeometry),
    ...line('load path', b.loadPath),
    ...line('installation and removal', b.installationRemoval),
    ...line('advantages', b.advantages),
    ...line('disadvantages', b.disadvantages),
    ...line('risks', b.risks),
    ...line('assumptions (unverified)', b.assumptions),
    ...line('evidence required', b.evidenceRequired),
  ]
}
const scoreText = (s: Score) => (s.qualitative != null ? `${s.qualitative}/5` : s.value != null ? `${s.value}${s.unit ? ` ${s.unit}` : ''}` : `${s.low}–${s.high}${s.unit ? ` ${s.unit}` : ''}`)

export const developAlternatives: AssistantActionDefinition = {
  name: 'conceptualize.develop_alternatives',
  label: 'Record alternative concepts',
  description:
    'Record the alternative solution Concepts YOU propose for a design objective, as an alternative set under a parent Concept, optionally with a trade study. ' +
    'You must supply `alternatives`: for each a name and a summary (the principle in one or two sentences), optionally a description, statements (kind, text, quantity, basis) and part names. ' +
    'Optionally supply `tradeStudy`: criteria with weights, and scores per alternative and criterion with a rationale (qualitative 1–5, or value / low–high in the criterion unit). ' +
    'Everything is recorded exactly as you write it, as AI hypotheses (or the basis you give: assumption, estimate). The objective text is kept verbatim. ' +
    'Give `parentId` to put the alternatives under an existing Concept; otherwise `name` names the new parent Concept. Nothing is invented by this operation; without alternatives it refuses. One atomic change, applied only after review. ' +
    'Propose 3 alternatives unless the user asks for another number; make them differ in architecture, mechanism, packaging or manufacture, not only in styling. ' +
    'Architecture first: when the design object works with another system, first record the different ways it could work with it with `level: "architecture"` and an `architecture` block per alternative (host interface, attachment principle, interface geometry, load path, installation and removal, advantages, disadvantages, risks, assumptions, evidence required), then check them with conceptualize.assess_diversity. Only afterwards explore parameters, orientation, material and local shape with `level: "variant"` and `parentArchitecture` naming the architecture; a set that differs only in parameters is a set of variants, not of architectures. State unverified host features as assumptions or evidence required; never invent them. The preview says whether the output is provisional (conceptualize.evaluate_readiness). Give each a `definition` (components, parameters with units, interfaces and a structured layout) so it is drawn as a dimensioned layout and compared side by side (`visuals.layout`, default true). `visuals.illustration` also requests illustrative images when image generation is available (otherwise the reason is shown and layouts still work).',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The design objective in the user’s words (kept verbatim).' },
      name: { type: 'string', description: 'Name of the new parent Concept (when no parentId).' },
      parentId: { type: 'string', description: 'Existing Concept (key or UUID) the alternatives belong to.' },
      level: { type: 'string', enum: [...LEVELS], description: 'architecture: the alternatives are different ways the solution is organised (each needs an architecture block). variant: parameter, material or local-shape variations of one architecture (needs parentArchitecture). Omit only for generic alternatives outside the architecture-first workflow.' },
      parentArchitecture: { type: 'string', description: 'level variant: key, ID or name of the architecture the alternatives vary.' },
      statements: { ...statementsSchema, description: 'Statements of the parent Concept, e.g. the constraints of the objective.' },
      alternatives: {
        type: 'array',
        minItems: 1,
        maxItems: 20,
        items: {
          type: 'object',
          properties: { name: string, summary: string, description: string, statements: statementsSchema, parts: { type: 'array', items: string, maxItems: 30, description: 'Names of child Concepts (functional decomposition).' }, architecture: architectureSchema, definition: definitionSchema },
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
      visuals: { type: 'object', properties: { layout: { type: 'boolean', description: 'Draw a layout for each alternative with a layout definition (default true)' }, illustration: { type: 'boolean', description: 'Also request illustrations (default false)' } } },
    },
    // alternatives is checked by the action, so a call without them gets the explicit refusal below.
    required: ['text'],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const objective = text(args.text, '“text”')!
    // Validate the model's content before touching the service, so a missing list is refused clearly.
    const level = levelOf(args)
    const parentArchitecture = optString(args, 'parentArchitecture')
    if (parentArchitecture && level !== 'variant') bad('parentArchitecture belongs to level variant.')
    const alternatives = alternativesOf(args.alternatives, level, parentArchitecture)
    const parentStatements = modelStatements(args.statements, 'statements')
    const { client, projectId } = connection(ctx)
    const visualsArg = (isObj(args.visuals) ? args.visuals : {}) as { layout?: boolean; illustration?: boolean }
    const drawLayouts = visualsArg.layout !== false
    const illustrations = visualsArg.illustration === true ? await illustrationAvailability(projectId) : null
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
        ...(a.definition || a.architecture ? { definition: { ...(a.definition ?? {}), ...(a.architecture ? { architecture: a.architecture } : {}) }, stage: a.definition?.layout ? ('layout' as const) : ('exploration' as const) } : {}),
      })),
      ...(tradeStudy ? { tradeStudy } : {}),
      generator: MODEL_GENERATOR,
    }
    // Advisory readiness (ECII increment 2): architecture-first output is provisional until the context supports its activity.
    const readiness = level ? await readinessNote(client, level === 'architecture' ? 'architecture-concepts' : 'dimensioned-design') : undefined
    const preview: ServiceProposalItem[] = [
      existing ? { label: 'Parent Concept (existing)', proposed: `${existing.key} ${existing.name}`, targetId: existing.id } : { label: 'Parent Concept', proposed: parentName!, basis: 'ai-hypothesis' },
      { label: 'Objective (your words)', proposed: objective, basis: 'user-statement' },
      ...parentStatements.map((s): ServiceProposalItem => ({ label: 'Parent statement', proposed: statementLine(s), basis: s.basis as ModelBasis })),
      ...alternatives.flatMap((a, i): ServiceProposalItem[] => [
        { label: `Alternative ${i + 1}`, proposed: `${a.name}: ${a.summary}${a.parts.length ? ` (parts: ${a.parts.join(', ')})` : ''}`, basis: 'ai-hypothesis' },
        ...(a.description ? [{ label: `${a.name}: description`, proposed: a.description, basis: 'ai-hypothesis' as const }] : []),
        ...a.statements.map((s): ServiceProposalItem => ({ label: `${a.name}: statement`, proposed: statementLine(s), basis: s.basis as ModelBasis })),
        ...architectureLines(a),
        ...(a.definition
          ? [
              { label: `${a.name}: components`, proposed: (a.definition.components ?? []).map((c) => `${c.id ? `${c.id} ` : ''}${c.name}`).join(', ') || '(none)', basis: 'ai-hypothesis' as const },
              ...((a.definition.parameters ?? []).length ? [{ label: `${a.name}: parameters`, proposed: (a.definition.parameters ?? []).map((q) => parameterLabel({ value: null, min: null, max: null, ...q } as never)).join('; '), basis: 'ai-hypothesis' as const }] : []),
              ...(a.definition.layout && drawLayouts ? [{ label: `${a.name}: layout`, proposed: `Drawn from the definition: ${a.definition.layout.items.length} placed components, ${(a.definition.layout.dimensions ?? []).length} dimensions (labels from parameters)` }] : []),
            ]
          : []),
      ]),
      ...(level ? [{ label: 'Level', proposed: level === 'architecture' ? 'Architectures (different ways the solution is organised)' : `Variants of ${parentArchitecture}` }] : []),
      ...(readiness ? [{ label: 'Readiness (advisory)', proposed: readiness.label }] : []),
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
      assumptions: [
        'The alternatives, statements and scores are the assistant’s proposals, not research results or measurements.',
        ...(readiness?.provisional ? [`${readiness.label}. These are provisional concepts, not validated engineering solutions.`] : []),
        ...(tradeStudy?.scores?.length ? ['Trade-study scores are AI hypotheses for discussion; the ranking is preliminary.'] : []),
        ...(illustrations ? [illustrations.available ? `Illustrations are requested (${illustrations.adapter}); they are illustrative, not to scale. ${illustrations.reason}` : `Illustrations are not available: ${illustrations.reason} The layouts are drawn as usual; no image is made.`] : []),
      ],
      inspected: existing ? [{ id: existing.key, detail: `parent Concept (rev ${existing.revision})` }] : [],
      async apply(p) {
        const e = await client.createExploration(exploration, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:explore` })
        explorationId = e.id
        const parent = e.created.concepts.find((c) => c.role === 'parent')
        const alts = e.created.concepts.filter((c) => c.role === 'alternative')
        const prov = assistantProvenance(p)
        const notes: string[] = []
        const visualIds: string[] = []
        // Visuals per alternative: one item's failure never affects another (each is its own request).
        for (const [i, alt] of alts.entries()) {
          const def = alternatives[i]?.definition
          if (def?.layout && drawLayouts) {
            try {
              const v = await client.createVisual({ conceptId: alt.id, kind: 'layout' }, { provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:layout:${i}` })
              visualIds.push(v.id)
              notes.push(`${alt.key}: layout ${v.key}${v.notToScale ? ' (not to scale)' : ''}`)
            } catch (err) {
              notes.push(`${alt.key}: no layout (${(err as Error).message})`)
            }
          }
          if (illustrations?.available) {
            const c = await client.concept(alt.id)
            const card = await client.conceptCard(alt.id)
            const instruction = illustrationInstruction({ name: c.name, intent: card.intent, principle: card.principle, components: card.components, interfaces: card.interfaces })
            const v = await client.createVisual({ conceptId: alt.id, kind: 'illustration', instruction }, { provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:illustration:${i}` })
            visualIds.push(v.id)
            try {
              const { job } = await visualizationPort()!.createJob(projectId, { kind: 'illustration', subject: { module: 'conceptualize', type: 'concept', id: alt.id, revision: c.revision }, instruction, adapter: illustrations.adapter ?? undefined, clientRef: v.id, purpose: `${alt.key} ${alt.name}`, provenance: { sourceKind: 'assistant', conversationId: p.conversationId, proposalId: p.proposalId, messageId: p.messageId } })
              await client.recordGeneration(v.id, v.revision, generationRecord(job), { provenance: prov })
              notes.push(`${alt.key}: illustration ${v.key} ${job.state}`)
            } catch (err) {
              await client.recordGeneration(v.id, v.revision, refusalRecord(err), { provenance: prov })
              notes.push(`${alt.key}: illustration refused (${(err as Error).message})`)
            }
          }
        }
        // Level architecture: say at once whether the alternatives are really different (deterministic, advisory).
        let diversityNote = ''
        if (level === 'architecture' && alts.length > 1) {
          try {
            const d = await client.assessDiversity({ conceptIds: alts.map((c) => c.id) })
            diversityNote = `. Diversity: ${d.distinctCount} distinct architecture(s), ${d.verdict}${d.findings.length ? ` (${d.findings[0]})` : ''}`
          } catch (err) {
            diversityNote = `. Diversity not assessed (${(err as Error).message})`
          }
        }
        return { summary: `Recorded ${alts.map((c) => `${c.key} ${c.name}`).join(', ')} as alternatives${level ? ` (level ${level})` : ''}${parent ? ` of ${parent.key}` : existing ? ` of ${existing.key}` : ''}${tradeStudy ? ' with a trade study' : ''}${notes.length ? `. Visuals: ${notes.join('; ')}` : ''}${diversityNote}`, createdIds: [...e.created.concepts.map((c) => c.id), ...visualIds] }
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
