import type { Basis, CalculationQualifications } from '@ews/engineering-calc'
import type { BatchRequest, BatchResponse, ConceptualizeKnowledgeApi, RequestContext } from './contract/conceptualize'
import type { AnyRef } from './refs'

/**
 * Declarative proposals (ADR-0042, CR-A1, CR-S4). A draft is plain data: what will change, why, on what
 * evidence, with which uncertainty and approvals, and the module operations that Apply performs. The
 * engine never applies drafts; the platform executor does, as the user, after the user chooses Apply.
 */

/** SDK ServiceProposalItem with the extended basis (CR-S4). */
export interface ProposalItem {
  targetId?: string
  label: string
  current?: string
  proposed: string
  basis?: Basis
}

/** One operation of the owning module's API, by OpenAPI operationId (CR-A1). */
export interface ModuleOperation {
  module: 'conceptualize' | 'requirements'
  operationId: string
  params: Record<string, string>
  body: unknown
  ifMatch?: string
  /** Derived from the draft ID and the operation index, so a retried Apply never duplicates records. */
  idempotencyKey: string
}

export interface ProposalDraft {
  id: string
  runId: string
  stepId: string
  status: 'draft' | 'offered' | 'applied' | 'rejected' | 'expired' | 'superseded'
  module: 'conceptualize' | 'requirements'
  title: string
  /** Proposed action, one sentence. */
  action: string
  rationale: string
  affected: AnyRef[]
  expectedEffects: string[]
  evidence: { ref: AnyRef; basis: Basis }[]
  assumptions: { text: string; ref?: AnyRef }[]
  uncertainty: { summary: string; ranges?: { name: string; min: number; max: number; unit: string; kind: 'sampled-range' | 'bounds'; quality?: 'exact' | 'enclosure' }[] }
  /** C11: qualifications of a calculation draft, shown unchanged in the preview. */
  qualifications?: CalculationQualifications
  /** What applying this does NOT establish (C11), shown in the preview. */
  limits?: string[]
  requiredApprovals: { permission: 'author' | 'decide'; module: string; reason: string }[]
  operations: ModuleOperation[]
  preview: ProposalItem[]
  createdAt: string
  expiresAt: string
  applied?: { at: string; by: string; results: unknown[] }
}

/** Builds a single-operation Conceptualize batch for a draft. */
export function batchOperation(draftId: string, batch: Omit<BatchRequest, 'idempotencyKey'>, index = 0): ModuleOperation {
  const idempotencyKey = `${draftId}:${index}`
  return { module: 'conceptualize', operationId: 'batch', params: {}, body: { ...batch, idempotencyKey }, idempotencyKey }
}

/**
 * PLATFORM APPLY EMULATION for tests and the demonstration: what the AI Interface executor will do on
 * Apply once CR-A1 is implemented (outside this package's scope). It executes the draft's operations
 * against the module API as the applying user, records the proposal ID as provenance, and refuses
 * operation IDs that are not on the module's allowlist.
 */
export const APPLY_ALLOWLIST: Record<ModuleOperation['module'], string[]> = { conceptualize: ['batch'], requirements: [] }

export async function applyDraftAsUser(
  draft: ProposalDraft,
  modules: { conceptualize: ConceptualizeKnowledgeApi },
  user: Omit<RequestContext, 'proposalId' | 'runId' | 'sourceKind'>,
): Promise<{ results: BatchResponse[] }> {
  if (draft.status !== 'draft' && draft.status !== 'offered') throw new Error(`Proposal ${draft.id} is ${draft.status}; only open proposals can be applied.`)
  if (Date.parse(draft.expiresAt) < Date.now()) throw new Error(`Proposal ${draft.id} expired; ask for a fresh one.`)
  const results: BatchResponse[] = []
  for (const op of draft.operations) {
    if (!APPLY_ALLOWLIST[op.module].includes(op.operationId)) throw new Error(`Operation ${op.module}.${op.operationId} is not allowed in proposals.`)
    const ctx: RequestContext = { ...user, sourceKind: 'reasoning', proposalId: draft.id, runId: draft.runId, stepId: draft.stepId }
    results.push(await modules.conceptualize.batch(op.body as BatchRequest, ctx))
  }
  draft.status = 'applied'
  draft.applied = { at: new Date().toISOString(), by: user.actor, results }
  return { results }
}
