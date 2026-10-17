import { ActionError, type AssistantActionDefinition } from '@ews/platform-sdk'
import type { ArchitectureInput, ConceptsModuleClient, ContextReadiness, DiversityResult, ReadinessActivity } from '@ews/conceptualize-client'
import { connection, optString, resolve, string, UUID } from './assistantShared'

/**
 * Architecture-first generation and the readiness gate (ECII increment 2). `assess_diversity` and `evaluate_readiness`
 * are the service's deterministic calculations over the structure of the records (no model, no keyword rules).
 * `architectureOf` turns the architecture block a model writes into service input; the service validates it for the
 * user and the AI alike.
 */

export const LEVELS = ['architecture', 'variant'] as const
export type Level = (typeof LEVELS)[number]
export const ACTIVITIES: ReadinessActivity[] = ['architecture-concepts', 'host-specific-concepts', 'dimensioned-design', 'cad-handoff']

const list = { type: 'array', items: string, maxItems: 30 }
/** The architecture block as a model writes it (the level comes from the operation, never from the block). */
export const architectureSchema = {
  type: 'object',
  description: 'How this alternative is organised before any dimension is chosen. Required for level architecture. Write only what you can reason about; state what is unverified as an assumption or as evidence required; never invent values of an existing system.',
  properties: {
    hostInterface: { type: 'string', description: 'The interface to the system it works with (which existing feature or connection it uses); leave empty when the design object works alone.' },
    attachmentPrinciple: { type: 'string', description: 'The principle by which it attaches, fits or connects.' },
    interfaceGeometry: { type: 'string', description: 'What the interface needs to look like (features, extents); unknown values stay unknown.' },
    loadPath: { type: 'string', description: 'How loads, forces or flows pass from the design object into the host or surroundings.' },
    installationRemoval: { type: 'string', description: 'How it is installed and removed.' },
    advantages: list,
    disadvantages: { ...list, description: 'At least one principal disadvantage.' },
    risks: { ...list, description: 'Technical risks.' },
    assumptions: { ...list, description: 'Unverified assumptions this architecture rests on.' },
    evidenceRequired: { ...list, description: 'Evidence needed before this architecture can be relied on (at least one).' },
  },
  required: ['attachmentPrinciple', 'loadPath', 'installationRemoval', 'disadvantages', 'evidenceRequired'],
  additionalProperties: false,
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function levelOf(args: Record<string, unknown>): Level | undefined {
  const v = args.level
  if (v === undefined || v === null || v === '') return undefined
  if (!LEVELS.includes(v as Level)) throw new ActionError('invalid-arguments', `level must be one of ${LEVELS.join(', ')}.`)
  return v as Level
}

/** The block to store for one alternative, or an explicit refusal when the level needs one and it is missing. */
export function architectureOf(raw: unknown, level: Level | undefined, parentArchitecture: string | undefined, where: string): ArchitectureInput | undefined {
  if (!level) {
    if (raw !== undefined && raw !== null) throw new ActionError('invalid-arguments', `${where}.architecture needs the operation to say level: architecture (or variant).`)
    return undefined
  }
  if (level === 'variant') {
    if (!parentArchitecture) throw new ActionError('invalid-arguments', 'level variant needs parentArchitecture: the key, ID or name of the architecture these alternatives vary. Different architectures are developed with level architecture first.')
    return { level, parent: parentArchitecture }
  }
  if (!isObj(raw)) throw new ActionError('invalid-arguments', `${where}.architecture is required for level architecture: { hostInterface, attachmentPrinciple, interfaceGeometry, loadPath, installationRemoval, advantages, disadvantages, risks, assumptions, evidenceRequired }. Alternatives that differ only in parameters are variants of one architecture, not different architectures.`)
  const block: ArchitectureInput = { level }
  for (const k of ['hostInterface', 'attachmentPrinciple', 'interfaceGeometry', 'loadPath', 'installationRemoval'] as const) {
    const v = raw[k]
    if (v !== undefined && v !== null && typeof v !== 'string') throw new ActionError('invalid-arguments', `${where}.architecture.${k} must be a string.`)
    if (typeof v === 'string' && v.trim()) block[k] = v.trim()
  }
  for (const k of ['advantages', 'disadvantages', 'risks', 'assumptions', 'evidenceRequired'] as const) {
    const v = raw[k]
    if (v !== undefined && v !== null && !Array.isArray(v)) throw new ActionError('invalid-arguments', `${where}.architecture.${k} must be an array of strings.`)
    if (Array.isArray(v)) block[k] = v.map((x) => String(x).trim()).filter(Boolean)
  }
  return block
}

/** Advisory readiness for a proposal's preview; never throws (readiness must not block a proposal). */
export async function readinessNote(client: ConceptsModuleClient, activity: ReadinessActivity, conceptId?: string): Promise<ContextReadiness | undefined> {
  try {
    return await client.readiness({ activity, ...(conceptId ? { conceptId } : {}) })
  } catch {
    return undefined
  }
}

const nameOf = (r: DiversityResult, id: string) => {
  const s = r.subjects.find((x) => x.id === id)
  return s ? `${s.key} ${s.name}` : id
}

export const architectureActions: AssistantActionDefinition[] = [
  {
    name: 'conceptualize.assess_diversity',
    label: 'Assess architectural diversity',
    description:
      'Check whether alternatives are really different architectures or only variations of one. Deterministic: the service compares the structured architecture blocks (host interface, attachment principle, interface geometry, load path, installation and removal) as text, never by keyword. Alternatives that differ only in parameters, or that say the same in their architecture fields, are reported as variants and do not count as distinct architectures. Name the alternatives with conceptIds (CON-… keys), setId or parentId. Use it after recording alternatives with level architecture and before developing dimensioned variants.',
    parameters: {
      type: 'object',
      properties: {
        conceptIds: { type: 'array', items: string, minItems: 2, maxItems: 30, description: 'The alternatives to compare (CON-… keys or UUIDs).' },
        setId: { type: 'string', description: 'Alternative set UUID: compare its active members.' },
        parentId: { type: 'string', description: 'Parent Concept (key or UUID): compare the members of its alternative sets.' },
        minimum: { type: 'integer', minimum: 1, maximum: 20, description: 'Distinct architectures needed (default 2; ask for 3 when the user wants several options).' },
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const keys = args.conceptIds === undefined || args.conceptIds === null ? [] : Array.isArray(args.conceptIds) ? args.conceptIds.map(String) : (() => { throw new ActionError('invalid-arguments', '“conceptIds” must be an array.') })()
      const conceptIds = await Promise.all(keys.map(async (k) => (UUID.test(k) ? k : (await resolve(client, k)).id)))
      const setId = optString(args, 'setId')
      const parentArg = optString(args, 'parentId')
      const parentId = parentArg ? (await resolve(client, parentArg)).id : undefined
      if (!conceptIds.length && !setId && !parentId) throw new ActionError('invalid-arguments', 'Say which alternatives to compare: conceptIds, setId or parentId.')
      const minimum = typeof args.minimum === 'number' ? args.minimum : undefined
      const r = await client.assessDiversity({ ...(conceptIds.length ? { conceptIds } : {}), ...(setId ? { setId } : {}), ...(parentId ? { parentId } : {}), ...(minimum ? { minimum } : {}) })
      return {
        kind: 'data',
        data: {
          verdict: r.verdict,
          distinctArchitectures: r.distinctCount,
          needed: r.minimum,
          architectures: r.architectures.map((g) => g.members.map((m) => nameOf(r, m))),
          variants: r.variants.map((v) => `${v.key} ${v.name} varies ${v.parent}`),
          unclassified: r.unclassified.map((u) => `${u.key} ${u.name}`),
          pairs: r.pairs.map((p) => ({ a: nameOf(r, p.a), b: nameOf(r, p.b), verdict: p.verdict, similarity: p.similarity, ...(p.differsOnlyIn ? { differsOnlyIn: p.differsOnlyIn } : {}) })),
          findings: r.findings,
        },
        summary: `${r.distinctCount} distinct architecture(s) among ${r.subjects.length} alternative(s): ${r.verdict}`,
        inspected: r.subjects.map((s) => ({ id: s.key, detail: s.level ?? 'no architecture block' })),
      }
    },
  },
  {
    name: 'conceptualize.evaluate_readiness',
    label: 'Evaluate context readiness',
    description:
      'Evaluate whether the recorded context suffices for each downstream activity: architecture concepts (needs Exploratory), host-specific concepts (needs Context Established), dimensioned design and CAD handoff (need Interfaces Verified). Deterministic and advisory: computed by the service from the engineering intent (INT-…; the latest active one when omitted), its gaps and the architecture blocks of the named Concept (or of the project). It lists the unmet items per activity; output built before the gate is met is provisional. It never blocks exploration, but never present provisional work as validated.',
    parameters: {
      type: 'object',
      properties: {
        intentId: { type: 'string', description: 'INT-… key or UUID; the latest active intent when omitted.' },
        activity: { type: 'string', enum: ACTIVITIES, description: 'Evaluate one activity; all four when omitted.' },
        conceptId: { type: 'string', description: 'CON-… key or UUID of the architecture or design under assessment; every live architecture of the project when omitted.' },
      },
      additionalProperties: false,
    },
    async run(args, ctx) {
      const { client } = connection(ctx)
      const activity = optString(args, 'activity')
      if (activity && !ACTIVITIES.includes(activity as ReadinessActivity)) throw new ActionError('invalid-arguments', `activity must be one of ${ACTIVITIES.join(', ')}.`)
      const conceptArg = optString(args, 'conceptId')
      const conceptId = conceptArg ? (await resolve(client, conceptArg)).id : undefined
      const r = await client.readiness({ ...(optString(args, 'intentId') ? { intentId: optString(args, 'intentId') } : {}), ...(activity ? { activity: activity as ReadinessActivity } : {}), ...(conceptId ? { conceptId } : {}) })
      return {
        kind: 'data',
        data: {
          intent: r.intent ? `${r.intent.key} rev ${r.intent.revision}` : null,
          concept: r.concept ? `${r.concept.key} ${r.concept.name}` : null,
          level: r.level,
          state: r.contextReadiness.state,
          blockingIssues: r.contextReadiness.blockingIssues,
          provisional: r.provisional,
          label: r.label,
          advisory: r.advisory,
          activities: r.activities.map((a) => ({ activity: a.activity, requires: a.requires, met: a.met, unmet: a.unmet.map((u) => u.text) })),
        },
        summary: r.label,
        inspected: r.intent ? [{ id: r.intent.key, detail: `rev ${r.intent.revision}` }] : [],
      }
    },
  },
]
