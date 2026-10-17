import { ActionError, type AssistantActionContext, type ServiceProposal } from '@ews/platform-sdk'
import { getConceptsModuleClient, type Concept, type ConceptsModuleClient, type DesignEntityType, type DesignRef, type Provenance } from '@ews/conceptualize-client'

/** Helpers shared by the Conceptualize assistant actions (assistant.ts, assistantDesign.ts). */

export const MODULE = 'conceptualize'
const KEY = /^CON-\d{3,}$/i
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function connection(ctx: AssistantActionContext): { client: ConceptsModuleClient; projectId: string } {
  const projectId = ctx.captured.projectId
  const client = getConceptsModuleClient(ctx.services?.concepts, projectId)
  if (!client) throw new ActionError('not-available', ctx.services?.concepts ? 'Conceptualize runs on demo data here; changes and the assistant need API mode (service settings).' : 'The Conceptualize service is not available here.')
  return { client, projectId }
}

export async function resolve(client: ConceptsModuleClient, idOrKey: string): Promise<Concept> {
  try {
    if (UUID.test(idOrKey)) return await client.concept(idOrKey)
    if (KEY.test(idOrKey)) {
      const page = await client.list({ text: idOrKey.toUpperCase(), includeArchived: true, limit: 20 })
      const hit = page.items.find((c) => c.key.toUpperCase() === idOrKey.toUpperCase())
      if (hit) return await client.concept(hit.id)
    }
  } catch {
    /* reported below */
  }
  throw new ActionError('not-found', `${idOrKey} is not a Concept in this project (use its key, e.g. CON-001, or its UUID).`)
}

const PREFIX: Record<string, DesignEntityType> = { CON: 'concept', FN: 'function', CST: 'constraint', ASM: 'assumption', DEC: 'decision', EVD: 'evidence' }

/** Resolves a key (CON-001, FN-002, CST-003, ASM-004, DEC-005, EVD-006) to a reference with its label. */
export async function resolveRef(client: ConceptsModuleClient, key: string, allowed?: DesignEntityType[]): Promise<{ ref: DesignRef; key: string; label: string }> {
  const k = key.trim().toUpperCase()
  const type = PREFIX[k.split('-')[0]]
  if (!type || (allowed && !allowed.includes(type))) throw new ActionError('invalid-arguments', `${key} is not a key of ${allowed ? allowed.join(', ') : 'a Conceptualize record'} (e.g. ${allowed?.includes('function') ? 'FN-001' : 'CON-001'}).`)
  try {
    const found = await client.search(k, [type], 20)
    const hit = found.items.find((i) => i.key.toUpperCase() === k)
    if (hit) return { ref: { module: 'conceptualize', type, id: hit.ref.id }, key: hit.key, label: hit.label }
  } catch {
    /* reported below */
  }
  throw new ActionError('not-found', `${key} was not found in this project.`)
}

/**
 * The reference other modules bind to (CAD bind_parameter and check, CR-AI-9): exactly the scheme
 * CAD accepts, { module: 'conceptualize', kind: 'constraint', id, revision }.
 */
export const constraintBindingRef = (c: { id: string; revision: number }) => ({ module: 'conceptualize' as const, kind: 'constraint' as const, id: c.id, revision: c.revision })

/** Model-visible result line of an applied constraint write: key, UUID, revision and the binding reference. */
export const constraintResult = (verb: string, c: { id: string; key: string; revision: number }) =>
  `${verb} ${c.key} (id ${c.id}, revision ${c.revision}). Binding reference for CAD bind_parameter and check: ${JSON.stringify(constraintBindingRef(c))}`

export const assistantProvenance = (p: { conversationId: string; proposalId: string; messageId: string }): Provenance => ({ sourceKind: 'assistant', conversationId: p.conversationId, proposalId: p.proposalId, messageId: p.messageId })
export const string = { type: 'string' }

export function proposal(p: Omit<ServiceProposal, 'kind' | 'module'>): ServiceProposal {
  return { kind: 'service-proposal', module: MODULE, ...p }
}

/**
 * Optional string argument: absent, null or blank ("" from a model filling every field) means not given;
 * anything else must be a string.
 */
export function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key]
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return undefined
  if (typeof v !== 'string') throw new ActionError('invalid-arguments', `“${key}” must be a string.`)
  return v.trim()
}
