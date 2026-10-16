import { ActionError, argString, type AssistantActionDefinition, type ServiceProposalItem } from '@ews/platform-sdk'
import { definitionInput, type ConceptsModuleClient, type DefinitionInput, type EngineeringDefinition, type Visual } from '@ews/conceptualize-client'
import { assistantProvenance, connection, optString, proposal, resolve, string, UUID } from './assistantShared'
import { applyDefinitionChanges, ChangeError, type DefinitionChanges } from './layout/definitionChanges'
import { parameterLabel, renderLayout } from './layout/renderLayout'
import { generationRecord, illustrationAvailability, illustrationInstruction, refusalRecord, visualizationPort } from './visualization'

/**
 * Assistant operations for visual concept exploration (concept-visualization-contracts.md §2). Each one is the
 * domain operation the UI uses (same API, same server validation), prepared as a service proposal and applied
 * only after review. Layouts are drawn from the structured definition; illustrations go through the
 * visualization service and are refused with its reason when it is unavailable (never a placeholder).
 */

const coord = { oneOf: [{ type: 'number' }, { type: 'object', properties: { parameter: string }, required: ['parameter'] }], description: 'Layout units (mm by default) or { parameter: <parameter ID> } to bind the extent to a length parameter (to scale)' }
const BASES = ['ai-hypothesis', 'assumption', 'estimate']
export const definitionSchema = {
  type: 'object',
  description:
    'Engineering definition: components with stable IDs (C1, C2 … give your own or let the service assign), parameters with units (symbol, value or min/max, unit, basis), interfaces between two components, relationships, functional intent and a structured 2D layout. Dimension labels come only from parameters.',
  properties: {
    intent: string,
    components: { type: 'array', items: { type: 'object', properties: { id: string, name: string, kind: { type: 'string', enum: ['part', 'assembly', 'purchased', 'envelope', 'feature'] }, description: string }, required: ['name'] } },
    parameters: { type: 'array', items: { type: 'object', properties: { id: string, symbol: string, name: string, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, unit: string, basis: { type: 'string', enum: BASES }, componentId: string }, required: ['symbol', 'unit'] } },
    interfaces: { type: 'array', items: { type: 'object', properties: { id: string, name: string, kind: { type: 'string', enum: ['mechanical', 'electrical', 'fluid', 'thermal', 'data', 'other'] }, between: { type: 'array', items: string, minItems: 2, maxItems: 2 }, description: string, parameterIds: { type: 'array', items: string } }, required: ['name', 'between'] } },
    relationships: { type: 'array', items: { type: 'object', properties: { id: string, type: { type: 'string', enum: ['contains', 'attached-to', 'supports', 'guides', 'drives', 'connected-to', 'clears'] }, from: string, to: string }, required: ['type', 'from', 'to'] } },
    layout: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['top', 'front', 'side', 'section'] },
        unit: string,
        items: { type: 'array', items: { type: 'object', properties: { componentId: string, x: coord, y: coord, width: coord, height: coord, shape: { type: 'string', enum: ['rect', 'circle'] } }, required: ['componentId', 'x', 'y', 'width', 'height'] } },
        dimensions: { type: 'array', items: { type: 'object', properties: { parameterId: string, componentId: string, axis: { type: 'string', enum: ['x', 'y'] } }, required: ['parameterId', 'componentId', 'axis'] } },
      },
      required: ['items'],
    },
  },
}

const changesSchema = {
  type: 'object',
  description: 'Targeted changes; everything not mentioned stays as it is (IDs are kept).',
  properties: {
    intent: string,
    setParameters: { type: 'array', items: { type: 'object', properties: { parameter: { type: 'string', description: 'Parameter ID or symbol' }, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, unit: string }, required: ['parameter'] } },
    addParameters: { type: 'array', items: { type: 'object', properties: { symbol: string, name: string, value: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, unit: string, componentId: string, basis: { type: 'string', enum: BASES } }, required: ['symbol', 'unit'] } },
    removeParameters: { type: 'array', items: string },
    addComponents: { type: 'array', items: { type: 'object', properties: { name: string, kind: { type: 'string', enum: ['part', 'assembly', 'purchased', 'envelope', 'feature'] }, description: string, placement: { type: 'object', properties: { x: coord, y: coord, width: coord, height: coord }, required: ['x', 'y', 'width', 'height'] } }, required: ['name'] } },
    updateComponents: { type: 'array', items: { type: 'object', properties: { id: string, name: string, kind: { type: 'string', enum: ['part', 'assembly', 'purchased', 'envelope', 'feature'] }, description: string }, required: ['id'] } },
    removeComponents: { type: 'array', items: string },
    setPlacements: { type: 'array', items: { type: 'object', properties: { componentId: string, x: coord, y: coord, width: coord, height: coord }, required: ['componentId'] } },
    addInterfaces: { type: 'array', items: { type: 'object', properties: { name: string, kind: string, between: { type: 'array', items: string }, description: string }, required: ['name', 'between'] } },
    removeInterfaces: { type: 'array', items: string },
    addDimensions: { type: 'array', items: { type: 'object', properties: { parameter: string, componentId: string, axis: { type: 'string', enum: ['x', 'y'] } }, required: ['parameter', 'componentId', 'axis'] } },
  },
}

const KEY = /^VIS-\d{3,}$/i

export async function resolveVisual(client: ConceptsModuleClient, ref: string, revision?: number): Promise<Visual> {
  try {
    if (UUID.test(ref)) return await client.visual(ref, revision)
    if (KEY.test(ref)) {
      const hit = (await client.visuals({ includeArchived: true })).find((v) => v.key.toUpperCase() === ref.toUpperCase())
      if (hit) return revision && revision !== hit.revision ? await client.visual(hit.id, revision) : hit
    }
  } catch {
    /* reported below */
  }
  throw new ActionError('not-found', `${ref}${revision ? ` revision ${revision}` : ''} is not a visual in this project (use its key, e.g. VIS-001, or UUID).`)
}

const definitionLines = (d: EngineeringDefinition | DefinitionInput, prefix = ''): ServiceProposalItem[] => [
  ...(d.intent ? [{ label: `${prefix}Functional intent`, proposed: d.intent, basis: 'ai-hypothesis' as const }] : []),
  ...(d.components ?? []).map((c): ServiceProposalItem => ({ label: `${prefix}Component${c.id ? ` ${c.id}` : ''}`, proposed: `${c.name} (${c.kind ?? 'part'})`, basis: 'ai-hypothesis' })),
  ...(d.parameters ?? []).map((p): ServiceProposalItem => ({ label: `${prefix}Parameter${p.id ? ` ${p.id}` : ''}`, proposed: parameterLabel({ value: null, min: null, max: null, ...p } as never), basis: (p.basis as 'ai-hypothesis' | 'assumption' | 'estimate' | undefined) ?? 'ai-hypothesis' })),
  ...(d.interfaces ?? []).map((f): ServiceProposalItem => ({ label: `${prefix}Interface`, proposed: `${f.name}: ${f.between.join(' ↔ ')}`, basis: 'ai-hypothesis' })),
  ...(d.layout ? [{ label: `${prefix}Layout`, proposed: `${d.layout.view ?? 'top'} view, ${d.layout.items.length} placed components, ${(d.layout.dimensions ?? []).length} dimensions (labels from parameters)`, basis: 'ai-hypothesis' as const }] : []),
]

function changesOf(args: Record<string, unknown>): DefinitionChanges {
  const c = (args.changes ?? {}) as DefinitionChanges
  if (typeof c !== 'object' || Array.isArray(c)) throw new ActionError('invalid-arguments', '“changes” must be an object.')
  return c
}

export const visualActions: AssistantActionDefinition[] = [
  {
    name: 'conceptualize.define_concept',
    label: 'Define the engineering definition',
    description:
      'Prepare the engineering definition of a Concept: functional intent, components (stable IDs), parameters with units, interfaces, relationships and a structured 2D layout (placements in mm or bound to length parameters; dimensions that point at parameters). Parts you give replace those parts; parts you omit stay. Values you write are AI hypotheses unless you mark them assumption or estimate. With a layout, a layout visual is drawn (new or a new revision). Apply creates a new Concept revision.',
    parameters: { type: 'object', properties: { conceptId: string, stage: { type: 'string', enum: ['exploration', 'layout', 'engineering'] }, definition: definitionSchema, drawLayout: { type: 'boolean', description: 'Default true when the definition has a layout' } }, required: ['conceptId', 'definition'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const given = (args.definition ?? {}) as DefinitionInput
      const current = c.definition ? definitionInput(c.definition) : {}
      const next: DefinitionInput = { ...current, ...Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined)) }
      const stage = optString(args, 'stage') as 'exploration' | 'layout' | 'engineering' | undefined
      const draw = args.drawLayout !== false && !!next.layout
      return proposal({
        title: `Define ${c.key} ${c.name}${next.layout ? ' with a layout' : ''}`,
        explanation: `A new revision of ${c.key} (now ${c.revision}) with the engineering definition below. The service checks IDs, units, references and the layout bindings exactly as for a person's edit.${draw ? ' The structured layout is then drawn from it.' : ''}`,
        preview: [...definitionLines(given), ...(stage ? [{ label: 'Stage', proposed: stage, current: c.stage }] : []), ...(draw ? [{ label: 'Layout visual', proposed: 'Drawn from the definition (labels from parameters)' }] : [])],
        assumptions: ['Values and components are AI hypotheses until a person confirms them; a layout is a structured diagram, not CAD geometry.'],
        inspected: [{ id: c.key, detail: `rev ${c.revision}` }],
        async apply(p) {
          const prov = assistantProvenance(p)
          const updated = await client.updateConcept(c.id, { definition: next, ...(stage ? { stage } : {}), reason: `Assistant proposal ${p.proposalId}` }, { expectedRevision: c.revision, provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:define` })
          const created: string[] = []
          let note = ''
          if (draw) {
            const layout = (await client.visuals({ conceptIds: [c.id] })).find((v) => v.kind === 'layout')
            const v = layout ? await client.reviseVisual(layout.id, { conceptRevision: updated.revision, reason: `Assistant proposal ${p.proposalId}` }, { expectedRevision: layout.revision, provenance: prov }) : await client.createVisual({ conceptId: c.id, kind: 'layout', conceptRevision: updated.revision }, { provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:layout` })
            created.push(v.id)
            note = ` Layout ${v.key} rev ${v.revision} drawn${v.notToScale ? ' (not to scale)' : ''}.`
          }
          return { summary: `${updated.key} is now revision ${updated.revision}.${note}`, createdIds: created }
        },
      })
    },
  },
  {
    name: 'conceptualize.read_visuals',
    label: 'Read visuals of a Concept',
    description: 'Read the visuals of a Concept: layouts and illustrations with their revisions, the Concept revision each shows, "possibly outdated" with the changed parameters, annotations (number, shape, normalized position, instruction, component), generation state, and the layout dimension labels (from parameters).',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const visuals = await client.visuals({ conceptIds: [c.id] })
      const out = []
      for (const v of visuals) {
        const def = v.kind === 'layout' ? (await client.concept(c.id, v.conceptRevision)).definition : undefined
        const d = def ? renderLayout(def) : null
        out.push({
          key: v.key,
          id: v.id,
          kind: v.kind,
          revision: v.revision,
          conceptRevision: v.conceptRevision,
          notToScale: v.notToScale,
          possiblyOutdated: v.staleness.outdated,
          changesSince: v.staleness.changes.map((x) => `${x.area} ${x.label} (${x.change})`),
          annotations: v.annotations.map((a) => ({ number: a.number, shape: a.shape, x: a.x, y: a.y, width: a.width, height: a.height, instruction: a.instruction, componentId: a.componentId, componentBasis: a.componentBasis })),
          generation: v.generation ? { state: v.generation.state, adapter: v.generation.adapter, testAsset: v.generation.testAsset, error: v.generation.error?.message ?? null } : null,
          ...(d ? { dimensions: d.dimensions.map((x) => x.label), components: d.components.map((x) => ({ id: x.componentId, name: x.name, box: x.box })), unplaced: d.unplaced } : {}),
        })
      }
      return { kind: 'data', data: { concept: `${c.key} ${c.name}`, revision: c.revision, stage: c.stage ?? 'exploration', visuals: out }, summary: `${visuals.length} visual(s) of ${c.key}`, inspected: visuals.map((v) => ({ id: v.key, detail: `rev ${v.revision}` })) }
    },
  },
  {
    name: 'conceptualize.request_illustration',
    label: 'Request a concept illustration',
    description:
      'Request an illustrative concept image (sketch or rendering) of a Concept from the visualization service. The instruction is composed from the structured definition. Images are illustrative, never to scale, never evidence. Refused with the reason when image generation is not available; use layouts then. Generation runs in the background; the card shows its progress.',
    parameters: { type: 'object', properties: { conceptId: string, style: { type: 'string', description: 'e.g. side view sketch, exploded view' } }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client, projectId } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const availability = await illustrationAvailability(projectId)
      if (!availability.available) throw new ActionError('not-available', `${availability.reason} (${availability.code}). The structured layout workflow is unaffected; no image was made.`)
      const card = await client.conceptCard(c.id)
      const instruction = illustrationInstruction({ name: c.name, intent: card.intent, principle: card.principle, components: card.components, interfaces: card.interfaces, style: optString(args, 'style') })
      return proposal({
        title: `Request an illustration of ${c.key} ${c.name}`,
        explanation: `Creates an illustration visual pinned to ${c.key} revision ${c.revision} and a generation job (${availability.adapter}). ${availability.reason}`,
        preview: [
          { label: 'Instruction (from the structured definition)', proposed: instruction, basis: 'ai-hypothesis' },
          { label: 'Adapter', proposed: availability.adapter ?? '' },
        ],
        assumptions: ['An image is illustrative: not to scale, not geometry, never evidence or verification.', ...(availability.testOnly ? ['Fake test adapter: the image is a labelled TEST ASSET.'] : [])],
        async apply(p) {
          const prov = assistantProvenance(p)
          const v = await client.createVisual({ conceptId: c.id, kind: 'illustration', instruction, view: optString(args, 'style'), conceptRevision: c.revision }, { provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:illustration` })
          const port = visualizationPort()!
          try {
            const { job } = await port.createJob(projectId, { kind: 'illustration', subject: { module: 'conceptualize', type: 'concept', id: c.id, revision: c.revision }, instruction, adapter: availability.adapter ?? undefined, clientRef: v.id, purpose: `${c.key} ${c.name}`, provenance: { sourceKind: 'assistant', conversationId: p.conversationId, proposalId: p.proposalId, messageId: p.messageId } })
            await client.recordGeneration(v.id, v.revision, generationRecord(job), { provenance: prov })
            return { summary: `${v.key}: illustration job ${job.id} ${job.state}.`, createdIds: [v.id] }
          } catch (e) {
            await client.recordGeneration(v.id, v.revision, refusalRecord(e), { provenance: prov })
            return { summary: `${v.key}: the visualization service refused the request: ${(e as Error).message}. No image was made; the layout is unaffected.`, createdIds: [v.id] }
          }
        },
      })
    },
  },
  {
    name: 'conceptualize.annotate_visual',
    label: 'Annotate a visual',
    description:
      'Add a numbered pin (x, y) or a rectangle (x, y, width, height) in normalized coordinates (0–1, origin top left) with an instruction to one exact visual revision. On a layout, give componentId from read_visuals (exact, structured). On an illustration a component is an inference: if it is not clear which component a region shows, ask the user instead of guessing.',
    parameters: { type: 'object', properties: { visualId: string, revision: { type: 'integer', minimum: 1 }, shape: { type: 'string', enum: ['pin', 'rect'] }, x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' }, instruction: string, componentId: string }, required: ['visualId', 'shape', 'x', 'y', 'instruction'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const v = await resolveVisual(client, argString(args, 'visualId'), typeof args.revision === 'number' ? args.revision : undefined)
      const shape = argString(args, 'shape') as 'pin' | 'rect'
      const componentId = optString(args, 'componentId')
      const num = (k: string) => (typeof args[k] === 'number' ? (args[k] as number) : undefined)
      const instruction = argString(args, 'instruction')
      return proposal({
        title: `Annotate ${v.key} rev ${v.revision}`,
        explanation: `A ${shape === 'pin' ? 'numbered pin' : 'rectangle'} on revision ${v.revision} only; it is never carried onto another revision.`,
        preview: [
          { label: 'Annotation', proposed: `${shape} at (${num('x')}, ${num('y')})${shape === 'rect' ? ` size ${num('width')} × ${num('height')}` : ''}: ${instruction}` },
          ...(componentId ? [{ label: 'Component', proposed: `${componentId} (${v.kind === 'layout' ? 'structured element' : 'inferred from the image'})`, basis: v.kind === 'layout' ? undefined : ('ai-hypothesis' as const) }] : []),
        ],
        async apply(p) {
          const a = await client.addAnnotation(v.id, v.revision, { shape, x: num('x')!, y: num('y')!, ...(shape === 'rect' ? { width: num('width'), height: num('height') } : {}), instruction, ...(componentId ? { componentId } : {}) }, { provenance: assistantProvenance(p) })
          return { summary: `Annotation ${a.number} on ${v.key} rev ${v.revision}${a.componentId ? ` (${a.componentId}, ${a.componentBasis})` : ''}`, createdIds: [a.id] }
        },
      })
    },
  },
  {
    name: 'conceptualize.refine_from_annotations',
    label: 'Refine a Concept from annotations',
    description:
      'Propose Concept changes answering annotations of a visual revision (read them with read_visuals): targeted changes to parameters, components, placements, interfaces and dimensions. Apply creates a new Concept revision and a new revision of the visual drawn from it (layouts are re-rendered; illustrations are re-requested when generation is available). The annotations stay on the revision they were made on. Do not promise that an image edit preserves exact geometry.',
    parameters: { type: 'object', properties: { visualId: string, annotations: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'Annotation numbers answered' }, changes: changesSchema, reason: string }, required: ['visualId', 'changes'], additionalProperties: false },
    async run(args, ctx) {
      const { client, projectId } = connection(ctx)
      const v = await resolveVisual(client, argString(args, 'visualId'))
      const c = await client.concept(v.conceptId)
      if (!c.definition) throw new ActionError('invalid-arguments', `${c.key} has no engineering definition to refine; use conceptualize.define_concept first.`)
      const numbers = (Array.isArray(args.annotations) ? args.annotations : []).map(Number)
      const answered = v.annotations.filter((a) => numbers.includes(a.number))
      const missing = numbers.filter((n) => !answered.some((a) => a.number === n))
      if (missing.length) throw new ActionError('invalid-arguments', `${v.key} rev ${v.revision} has no annotation ${missing.join(', ')} (it has ${v.annotations.map((a) => a.number).join(', ') || 'none'}).`)
      let result: ReturnType<typeof applyDefinitionChanges>
      try {
        result = applyDefinitionChanges(c.definition, changesOf(args))
      } catch (e) {
        if (e instanceof ChangeError) throw new ActionError('invalid-arguments', e.message)
        throw e
      }
      if (!result.lines.length) throw new ActionError('invalid-arguments', 'The changes change nothing; say what to change (setParameters, setPlacements, addComponents …).')
      const reason = optString(args, 'reason') ?? (answered.length ? answered.map((a) => `${a.number}. ${a.instruction}`).join('; ') : 'Refinement in the conversation')
      const availability = v.kind === 'illustration' ? await illustrationAvailability(projectId) : null
      return proposal({
        title: `Refine ${c.key} from ${v.key} rev ${v.revision}`,
        explanation: `New revision ${c.revision + 1} of ${c.key} and a new revision of ${v.key} drawn from it. ${answered.length ? `Answers annotation${answered.length > 1 ? 's' : ''} ${answered.map((a) => a.number).join(', ')}; they stay on revision ${v.revision}.` : ''}${availability && !availability.available ? ` The illustration cannot be regenerated: ${availability.reason}` : ''}`,
        preview: [
          ...answered.map((a): ServiceProposalItem => ({ label: `Annotation ${a.number}${a.componentId ? ` (${a.componentId})` : ''}`, proposed: a.instruction })),
          ...result.lines.map((l): ServiceProposalItem => ({ label: l.label, current: l.before, proposed: l.after, basis: 'ai-hypothesis' })),
        ],
        assumptions: ['Changed values are AI hypotheses until a person confirms them.', 'Other visuals of the Concept become possibly outdated; they are not regenerated automatically.'],
        inspected: [{ id: c.key, detail: `rev ${c.revision}` }, { id: v.key, detail: `rev ${v.revision}` }],
        async apply(p) {
          const prov = assistantProvenance(p)
          const updated = await client.updateConcept(c.id, { definition: result.input, reason: `${reason} (assistant proposal ${p.proposalId})` }, { expectedRevision: c.revision, provenance: prov, idempotencyKey: `${p.conversationId}:${p.proposalId}:refine` })
          if (v.kind === 'illustration' && !availability?.available) return { summary: `${updated.key} is now revision ${updated.revision}. ${v.key} was not regenerated: ${availability?.reason}`, createdIds: [] }
          const next = await client.reviseVisual(v.id, { conceptRevision: updated.revision, refinedFrom: answered.map((a) => a.id), instruction: reason, reason: `Assistant proposal ${p.proposalId}` }, { expectedRevision: v.revision, provenance: prov })
          if (v.kind === 'illustration') {
            const card = await client.conceptCard(c.id)
            const instruction = `${illustrationInstruction({ name: updated.name, intent: card.intent, principle: card.principle, components: card.components, interfaces: card.interfaces })} Change: ${reason}`.slice(0, 4000)
            try {
              const { job } = await visualizationPort()!.createJob(projectId, { kind: 'illustration', subject: { module: 'conceptualize', type: 'concept', id: c.id, revision: updated.revision }, instruction, clientRef: v.id, provenance: { sourceKind: 'assistant', conversationId: p.conversationId, proposalId: p.proposalId, messageId: p.messageId } })
              await client.recordGeneration(next.id, next.revision, generationRecord(job), { provenance: prov })
            } catch (e) {
              await client.recordGeneration(next.id, next.revision, refusalRecord(e), { provenance: prov })
            }
          }
          return { summary: `${updated.key} is now revision ${updated.revision}; ${next.key} revision ${next.revision} is drawn from it${next.notToScale ? ' (not to scale)' : ''}.`, createdIds: [next.id] }
        },
      })
    },
  },
  {
    name: 'conceptualize.compare_cards',
    label: 'Compare alternatives as cards',
    description: 'Read the comparison cards of an alternative set (by a member or parent Concept): per alternative the principle, components and interfaces, key parameters, benefits and trade-offs, constraints and requirements as intended vs checked vs verified, assumptions, open questions, validation status, visuals (possibly outdated) and decisions.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const sets = await client.alternativeSets(c.id)
      if (!sets.length) throw new ActionError('not-found', `${c.key} has no alternatives yet.`)
      const s = await client.setCards(sets[0].id)
      return {
        kind: 'data',
        data: {
          set: `${s.key} ${s.name}`,
          question: s.question,
          alternatives: s.cards.map((k) => ({
            concept: `${k.concept.key} ${k.concept.name} (rev ${k.concept.revision}, ${k.concept.stage})`,
            status: k.membership[0]?.status,
            principle: k.principle,
            components: k.components.map((x) => `${x.id} ${x.name}`),
            interfaces: k.interfaces.map((f) => `${f.name}: ${f.betweenNames.join(' ↔ ')}`),
            parameters: k.parameters.map(parameterLabel),
            benefits: k.benefits,
            tradeOffs: k.tradeOffs,
            constraints: k.constraints.map((x) => `${x.key} ${x.statement}: ${x.coverage}${x.checkStatus ? ` (${x.checkStatus})` : ''}`),
            openQuestions: k.questions.map((q) => q.text),
            validation: k.validation,
            visuals: k.visuals.map((v) => `${v.key} ${v.kind} rev ${v.revision}${v.staleness.outdated ? ' (possibly outdated)' : ''}`),
          })),
        },
        summary: `Compared ${s.cards.length} alternatives of ${s.key}`,
        inspected: s.cards.map((k) => ({ id: k.concept.key, detail: `rev ${k.concept.revision}` })),
      }
    },
  },
  {
    name: 'conceptualize.reject_alternative',
    label: 'Prepare a rejection of an alternative',
    description: 'Prepare a PROPOSED decision rejecting one alternative with its rationale. The alternative stays in the set with the rationale; a reviewer records the decision.',
    parameters: { type: 'object', properties: { conceptId: string, rationale: string }, required: ['conceptId', 'rationale'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const set = (await client.alternativeSets(c.id)).find((s) => s.members.some((m) => m.conceptId === c.id))
      if (!set) throw new ActionError('invalid-arguments', `${c.key} is not an alternative in any set.`)
      const rationale = argString(args, 'rationale')
      let decisionId: string | undefined
      return proposal({
        title: `Propose: reject ${c.key} ${c.name}`,
        explanation: `A proposed decision on ${set.key} ${set.name}: ${c.key} rejected. It stays in the set with this rationale; a reviewer records it.`,
        preview: [
          { label: 'Rejected (proposed)', proposed: `${c.key} ${c.name}`, basis: 'ai-hypothesis', targetId: c.id },
          { label: 'Rationale', proposed: rationale, basis: 'ai-hypothesis' },
        ],
        async apply(p) {
          const d = await client.createDecision({ title: `Reject ${c.name}`, rationale, setId: set.id, subjectId: c.id, question: set.question, outcomes: [{ conceptId: c.id, outcome: 'rejected', rationale }] }, { provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:reject` })
          decisionId = d.id
          return { summary: `Proposed ${d.key} (waiting for a reviewer)`, createdIds: [d.id] }
        },
        async undo() {
          if (!decisionId) return { summary: 'Nothing to undo.' }
          const d = await client.decision(decisionId)
          await client.withdrawDecision(d.id, { expectedRevision: d.recordVersion, reason: 'Undo of an assistant proposal' })
          return { summary: `Withdrew ${d.key}` }
        },
      })
    },
  },
  {
    name: 'conceptualize.create_cad_handoff',
    label: 'Prepare a CAD handoff',
    description: 'Prepare the structured, revision-pinned CAD handoff package of a Concept (normally the selected alternative): intent, components, interfaces, parameters, envelopes, constraints with coverage, requirement and decision links, and unresolved items. Missing information is listed, never invented; propose the missing definition instead. The CAD Modeler reads it to create the CAD document.',
    parameters: { type: 'object', properties: { conceptId: string }, required: ['conceptId'], additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const c = await resolve(client, argString(args, 'conceptId'))
      const card = await client.conceptCard(c.id)
      const gaps = [
        ...(card.components.length ? [] : ['no components']),
        ...(card.parameters.length ? [] : ['no parameters']),
        ...(c.definition?.layout ? [] : ['no layout']),
        ...card.questions.map((q) => `open: ${q.text}`),
        ...card.constraints.filter((x) => x.coverage === 'intended').map((x) => `${x.key} not checked`),
        ...(card.membership.some((m) => m.status === 'selected') ? [] : [`${c.key} is not the recorded selection`]),
      ]
      return proposal({
        title: `CAD handoff of ${c.key} ${c.name} (rev ${c.revision})`,
        explanation: `Builds an immutable package pinned to revision ${c.revision}. It becomes possibly outdated when the definition changes.`,
        preview: [
          { label: 'Contents', proposed: `${card.components.length} components, ${card.parameters.length} parameters, ${card.interfaces.length} interfaces, ${card.constraints.length} constraints, ${card.requirements.length} requirement links, ${card.decisions.length} decisions` },
          ...gaps.map((g): ServiceProposalItem => ({ label: 'Unresolved', proposed: g })),
        ],
        async apply(p) {
          const h = await client.createHandoff(c.id, { conceptRevision: c.revision, provenance: assistantProvenance(p), idempotencyKey: `${p.conversationId}:${p.proposalId}:handoff` })
          return { summary: `${h.key} built from ${c.key} rev ${h.conceptRevision} (${h.package.unresolved.length} unresolved items). Handoff ID ${h.id} for the CAD Modeler.`, createdIds: [h.id] }
        },
      })
    },
  },
]
