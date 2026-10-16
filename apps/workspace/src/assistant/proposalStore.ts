import type { ExpectedRevision, ModuleOperation, ServiceProposalItem } from '@ews/platform-sdk'
import { ASSISTANT_API, ApiError, api, backendInUse } from '../settings/api'
import type { ChangeProposal, PreviewChange } from './types'

/**
 * Persisted proposals (integration milestone 1 C9): every proposal shown in the conversation is stored in the
 * assistant service as versioned data, so it reopens after a reload, in a new browser session or after a server
 * restart. Declarative proposals are applied by the service through the module API; twin and closure proposals
 * are applied here and their outcome is recorded there. In demo mode (no backend) proposals stay in this browser.
 */

export interface ServerProposal {
  id: string
  version: number
  key: string
  projectId: string
  conversationId: string
  messageId: string | null
  kind: 'declarative' | 'twin' | 'closure'
  module: string
  title: string
  explanation: string
  preview: unknown
  assumptions: string[]
  status: 'pending' | 'applying' | 'applied' | 'rejected' | 'conflict' | 'failed'
  message: string | null
  createdIds: string[]
  createdAt: string
  updatedAt: string
}

export interface StoreInput {
  kind: ServerProposal['kind']
  module: string
  preview: unknown
  operations?: ModuleOperation[]
  expected?: ExpectedRevision[]
  confirmation?: { phrase: string; prompt: string }
}

export const persistenceAvailable = () => backendInUse()

/** Stores a proposal. Declarative proposals must be stored (they are applied by the service); others are best effort. */
export async function storeProposal(p: ChangeProposal, input: StoreInput): Promise<ServerProposal | undefined> {
  if (!backendInUse()) {
    if (input.kind === 'declarative') throw new Error('Declarative proposals need the application backend (Service mode API).')
    return undefined
  }
  try {
    const r = await api<{ proposal: ServerProposal }>('POST', `${ASSISTANT_API}/proposals`, {
      projectId: p.projectId,
      conversationId: p.conversationId,
      messageId: p.messageId,
      key: p.id,
      kind: input.kind,
      module: input.module,
      title: p.title,
      explanation: p.explanation,
      preview: input.preview,
      assumptions: p.service?.assumptions ?? [],
      ...(input.operations ? { operations: input.operations } : {}),
      ...(input.expected ? { expected: input.expected } : {}),
      ...(input.confirmation ? { confirmation: input.confirmation } : {}),
    })
    return r.body.proposal
  } catch (e) {
    if (input.kind === 'declarative') throw e
    return undefined
  }
}

export async function applyStored(serverId: string, currentProjectId: string): Promise<{ proposal: ServerProposal; alreadyApplied: boolean }> {
  return (await api<{ proposal: ServerProposal; alreadyApplied: boolean }>('POST', `${ASSISTANT_API}/proposals/${serverId}/apply?projectId=${encodeURIComponent(currentProjectId)}`, {})).body
}

/** Records the outcome of a proposal applied (or rejected) in this browser. Best effort. */
export async function recordOutcome(serverId: string | undefined, status: 'applied' | 'failed' | 'conflict' | 'rejected', message?: string): Promise<void> {
  if (!serverId || !backendInUse()) return
  await api('POST', `${ASSISTANT_API}/proposals/${serverId}/outcome`, { status, ...(message ? { message: message.slice(0, 2000) } : {}) }).catch(() => undefined)
}

/** Open proposals of a project from earlier sessions. */
export async function openProposals(projectId: string): Promise<ServerProposal[]> {
  if (!backendInUse()) return []
  try {
    return (await api<{ proposals: ServerProposal[] }>('GET', `${ASSISTANT_API}/proposals?projectId=${encodeURIComponent(projectId)}&open=true`)).body.proposals
  } catch {
    return []
  }
}

/** A stored proposal as the conversation shows it. */
export function fromServer(s: ServerProposal, configurationId: string, localId: string): ChangeProposal {
  const twin = s.kind === 'twin'
  const twinPreview = (twin ? s.preview : {}) as { changes?: PreviewChange[]; requiredEntitlements?: ChangeProposal['requiredEntitlements']; configurationId?: string }
  return {
    id: localId,
    title: s.title,
    explanation: s.explanation,
    configurationId: twinPreview.configurationId ?? configurationId,
    previewModelRevision: 0,
    changes: twinPreview.changes ?? [],
    affectedOutputIds: [],
    status: s.status === 'applying' ? 'failed' : s.status,
    message:
      s.kind === 'closure'
        ? 'Prepared in an earlier session by a module that does not yet describe its changes as data (labelled fallback); it cannot be applied now. Ask again to prepare it in this window.'
        : (s.message ?? undefined),
    requiredEntitlements: twinPreview.requiredEntitlements ?? [],
    service: twin ? undefined : { module: s.module, items: Array.isArray(s.preview) ? (s.preview as ServiceProposalItem[]) : [], assumptions: s.assumptions, declarative: s.kind === 'declarative' },
    projectId: s.projectId,
    server: { id: s.id, kind: s.kind, version: s.version },
    reopened: true,
    conversationId: s.conversationId,
    messageId: s.messageId ?? '',
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  }
}

export { ApiError }
