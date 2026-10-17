import { ActionError, type AssistantActionDefinition, type ModuleOperation, type ServiceProposalItem } from '@ews/platform-sdk'
import type { ConceptsModuleClient, EngineeringIntent, IntentCreate, IntentPatch, IntentQuestion, IntentSystem, InformationNeed } from '@ews/conceptualize-client'
import { connection, MODULE, optString, resolveRef, string, UUID } from './assistantShared'

/**
 * Assistant operations for the Engineering Intent (ECII increment 1). The model interprets the request and fills in
 * the intent; nothing here parses text or applies keyword rules. `interpret_intent` is a declarative proposal
 * (the person applies it; the server validates the structure), `read_context` reads, `identify_gaps` is the
 * service's deterministic computation over the structure.
 */

const ROLES = ['standalone', 'accessory', 'component', 'modification', 'system']
const MODES = ['standalone', 'hosted', 'embedded', 'connected', 'replacement', 'undetermined']
const RELATIONS = ['mounts-to', 'connects-to', 'integrates-with', 'interferes-with']
const OWNERS = ['project', 'external', 'shared']
const ROUTES = ['research', 'ask-user', 'measure', 'defer']
const IMPACTS = ['blocks', 'changes-architecture', 'refines']

const systemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'What the system is called; a description of it when its identity is not known.' },
    role: { type: 'string', description: 'The role this system plays for the design object, in your own words.' },
    description: string,
    identified: { type: 'boolean', description: 'true only when the exact product or system is known; false while it is unspecified or only described.' },
    owner: { type: 'string', enum: OWNERS, description: 'Who controls the interface on that side.' },
    relation: { type: 'string', enum: RELATIONS },
    productElement: { type: 'object', description: 'Product element reference, when the system is already registered as one.', properties: { module: { type: 'string', enum: ['product'] }, id: string }, required: ['module', 'id'] },
  },
  required: ['name', 'identified', 'owner', 'relation'],
  additionalProperties: false,
}
const needSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Short ID unique within the intent, e.g. N1.' },
    text: { type: 'string', description: 'The information that is missing.' },
    tier: { type: 'integer', enum: [1, 2, 3, 4], description: '1 essential (blocks the design), 2 concept, 3 detail, 4 immaterial.' },
    subject: string,
    route: { type: 'string', enum: ROUTES },
    state: { type: 'string', enum: ['open', 'resolved'] },
  },
  required: ['id', 'text', 'tier', 'route'],
  additionalProperties: false,
}
const questionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Short ID unique within the intent, e.g. Q1.' },
    text: { type: 'string', description: 'The question for the person.' },
    why: { type: 'string', description: 'Why it is asked and what it changes.' },
    impact: { type: 'string', enum: IMPACTS },
    options: { type: 'array', items: string, minItems: 1, maxItems: 8, description: 'What the person can answer or do instead.' },
    state: { type: 'string', enum: ['open', 'answered', 'withdrawn'] },
    needId: { type: 'string', description: 'ID of the information need, or of the structural gap (system-0, systems, integration), this question asks about.' },
  },
  required: ['id', 'text', 'why', 'impact', 'options'],
  additionalProperties: false,
}

const list = (v: unknown, key: string): unknown[] => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new ActionError('invalid-arguments', `“${key}” must be an array.`)
  return v
}
const strings = (v: unknown, key: string) => list(v, key).map((x) => String(x))

const projectPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`

async function findIntent(client: ConceptsModuleClient, idOrKey: string | undefined): Promise<EngineeringIntent> {
  if (idOrKey) {
    try {
      return await client.intent(idOrKey)
    } catch {
      throw new ActionError('not-found', `${idOrKey} is not an engineering intent in this project (use its key, e.g. INT-001, or its UUID).`)
    }
  }
  const active = await client.intents()
  const latest = active[active.length - 1]
  if (!latest) throw new ActionError('not-found', 'This project has no engineering intent yet. Interpret the request first (conceptualize.interpret_intent).')
  return latest
}

const sectionPreview = (i: Partial<IntentCreate & IntentPatch>): ServiceProposalItem[] => [
  ...(i.designObject ? [{ label: 'Design object', proposed: i.designObject, basis: 'ai-hypothesis' as const }] : []),
  ...(i.role ? [{ label: 'Role', proposed: i.role, basis: 'ai-hypothesis' as const }] : []),
  ...(i.integration ? [{ label: 'Integration', proposed: `${i.integration}${i.rationale ? `: ${i.rationale}` : ''}`, basis: 'ai-hypothesis' as const }] : []),
  ...(i.externalSystems ?? []).map((s: IntentSystem): ServiceProposalItem => ({ label: 'External system', proposed: `${s.name}${s.role ? ` (${s.role})` : ''}: ${s.relation}, ${s.identified ? 'identified' : 'not identified'}, owner ${s.owner}`, basis: 'ai-hypothesis' })),
  ...(i.objectives ?? []).map((o): ServiceProposalItem => ({ label: 'Objective', proposed: o, basis: 'ai-hypothesis' })),
  ...(i.environment ?? []).map((o): ServiceProposalItem => ({ label: 'Environment', proposed: o, basis: 'ai-hypothesis' })),
  ...(i.informationNeeds ?? []).map((n: InformationNeed): ServiceProposalItem => ({ label: `Information need (tier ${n.tier}, ${n.route})`, proposed: n.text, basis: 'ai-hypothesis' })),
  ...(i.questions ?? []).map((q: IntentQuestion): ServiceProposalItem => ({ label: `Question (${q.impact})`, proposed: `${q.text} Why: ${q.why} Options: ${q.options.join('; ')}`, basis: 'ai-hypothesis' })),
]

export const intentActions: AssistantActionDefinition[] = [
  {
    name: 'conceptualize.interpret_intent',
    label: 'Interpret the engineering intent',
    description:
      'Record your interpretation of the request as a structured engineering intent: the design object, its role (standalone, accessory, component, modification, system), whether it integrates with an existing system (integration: standalone, hosted, embedded, connected, replacement, undetermined), the external systems involved (identified or not, who owns that side, how the design relates to it), objectives, environment, what information is missing (information needs with tier 1-4 and a route) and the questions to ask. Pass intentId (INT-…) to revise an existing intent; omitted fields are kept. Set identified true only for a system that is actually known; never invent interface values. A proposal the person applies; recorded as an AI hypothesis.',
    parameters: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'INT-… key or UUID of the intent to revise; omit to create a new one.' },
        designObject: { type: 'string', description: 'What is being designed, in one phrase.' },
        role: { type: 'string', enum: ROLES },
        integration: { type: 'string', enum: MODES, description: 'standalone: works alone. Other modes: works with another system. undetermined: not yet known.' },
        rationale: { type: 'string', description: 'Why you chose this integration mode.' },
        externalSystems: { type: 'array', items: systemSchema, maxItems: 30 },
        objectives: { type: 'array', items: string, maxItems: 50 },
        environment: { type: 'array', items: string, maxItems: 50 },
        informationNeeds: { type: 'array', items: needSchema, maxItems: 100 },
        assumptions: { type: 'array', items: string, maxItems: 100, description: 'Assumption keys (ASM-…) this intent rests on.' },
        questions: { type: 'array', items: questionSchema, maxItems: 50 },
        reason: string,
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { client, projectId } = connection(ctx)
      const intentArg = optString(args, 'intentId')
      const assumptionKeys = strings(args.assumptions, 'assumptions')
      const assumptions = await Promise.all(assumptionKeys.map(async (k) => (UUID.test(k) ? k : (await resolveRef(client, k, ['assumption'])).ref.id)))
      const fields: IntentPatch = {
        ...(optString(args, 'designObject') ? { designObject: optString(args, 'designObject') } : {}),
        ...(optString(args, 'role') ? { role: optString(args, 'role') as never } : {}),
        ...(optString(args, 'integration') ? { integration: optString(args, 'integration') as never } : {}),
        ...(args.rationale !== undefined ? { rationale: String(args.rationale ?? '') } : {}),
        ...(args.externalSystems !== undefined ? { externalSystems: list(args.externalSystems, 'externalSystems').map((s) => ({ role: '', description: '', ...(s as object) })) as IntentSystem[] } : {}),
        ...(args.objectives !== undefined ? { objectives: strings(args.objectives, 'objectives') } : {}),
        ...(args.environment !== undefined ? { environment: strings(args.environment, 'environment') } : {}),
        ...(args.informationNeeds !== undefined ? { informationNeeds: list(args.informationNeeds, 'informationNeeds').map((n) => ({ state: 'open', ...(n as object) })) as InformationNeed[] } : {}),
        ...(args.assumptions !== undefined ? { assumptions } : {}),
        ...(args.questions !== undefined ? { questions: list(args.questions, 'questions').map((q) => ({ state: 'open', ...(q as object) })) as IntentQuestion[] } : {}),
      }
      const reason = optString(args, 'reason') ?? ''
      let operation: ModuleOperation
      let title: string
      let explanation: string
      let inspected: { id: string; detail: string }[] = []
      if (intentArg) {
        const current = await findIntent(client, intentArg)
        if (!Object.keys(fields).length) throw new ActionError('no-op', 'Give at least one field to change.')
        operation = { module: MODULE, operationId: 'updateIntent', method: 'PATCH', path: `${projectPath(projectId)}/intents/${current.id}`, body: { ...fields, ...(reason ? { reason } : {}) }, ifMatch: `"${current.revision}"` }
        title = `Revise ${current.key} ${current.designObject}`
        explanation = `Creates revision ${current.revision + 1} of ${current.key} if it is still at revision ${current.revision} when you apply. The earlier revision is kept.`
        inspected = [{ id: current.key, detail: `rev ${current.revision}` }]
      } else {
        const designObject = fields.designObject
        if (!designObject || !fields.role || !fields.integration) throw new ActionError('invalid-arguments', 'A new intent needs designObject, role and integration. To revise an existing intent, pass intentId.')
        operation = { module: MODULE, operationId: 'createIntent', method: 'POST', path: `${projectPath(projectId)}/intents`, body: { ...fields, ...(reason ? { reason } : {}) } }
        title = `Engineering intent: ${designObject}`
        explanation = 'Records how the request was interpreted: what is designed, whether it works with an existing system, which systems are involved and what is not yet known. The service validates the structure when you apply it; the assistant’s interpretation stays an AI hypothesis until you confirm it.'
      }
      return {
        kind: 'declarative-proposal',
        module: MODULE,
        projectId,
        title,
        explanation,
        preview: sectionPreview(fields),
        assumptions: ['This is an interpretation of the request by the assistant; check the integration mode and the external systems before relying on them.'],
        inspected,
        operations: [operation],
      }
    },
  },
  {
    name: 'conceptualize.read_context',
    label: 'Read the engineering context',
    description: 'Read an engineering intent (INT-…; the latest active one when omitted) together with the records around it: the assumptions it lists, the project constraints and concepts, its open questions and its information gaps.',
    parameters: { type: 'object', properties: { intentId: string }, additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const intent = await findIntent(client, optString(args, 'intentId'))
      const c = await client.intentContext(intent.id)
      return {
        kind: 'data',
        data: {
          intent: { key: c.intent.key, id: c.intent.id, revision: c.intent.revision, basis: c.intent.basis, designObject: c.intent.designObject, role: c.intent.role, integration: c.intent.integration, rationale: c.intent.rationale, externalSystems: c.intent.externalSystems, objectives: c.intent.objectives, environment: c.intent.environment, informationNeeds: c.intent.informationNeeds },
          assumptions: c.assumptions.map((a) => ({ key: a.key, statement: a.statement, validationStatus: a.validationStatus })),
          constraints: c.constraints.filter((x) => x.status !== 'retired').map((x) => ({ key: x.key, statement: x.statement, status: x.status })),
          concepts: c.concepts,
          openQuestions: c.questions,
          gaps: { counts: c.gaps.counts, items: c.gaps.gaps },
        },
        summary: `Read ${c.intent.key} (rev ${c.intent.revision}) with ${c.gaps.gaps.length} gap(s)`,
        inspected: [{ id: c.intent.key, detail: `rev ${c.intent.revision}` }],
      }
    },
  },
  {
    name: 'conceptualize.identify_gaps',
    label: 'Identify information gaps',
    description: 'List the missing information of an engineering intent (INT-…; the latest active one when omitted) in four tiers: essential, concept, detail, immaterial. Deterministic, computed by the service from the structure of the intent (integration mode, whether each external system is identified, open information needs, open questions); no model. Use it after interpreting the intent and before asking or researching.',
    parameters: { type: 'object', properties: { intentId: string }, additionalProperties: false },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const intent = await findIntent(client, optString(args, 'intentId'))
      const g = await client.intentGaps(intent.id)
      return {
        kind: 'data',
        data: { intent: g.key, revision: g.revision, counts: g.counts, gaps: g.gaps, researchItems: g.researchItems, unaskedEssential: g.unaskedEssential, systemGaps: g.systemGaps },
        summary: `${g.key}: ${g.counts.essential} essential, ${g.counts.concept} concept, ${g.counts.detail} detail, ${g.counts.immaterial} immaterial gap(s)`,
        inspected: [{ id: g.key, detail: `rev ${g.revision}` }],
      }
    },
  },
]

