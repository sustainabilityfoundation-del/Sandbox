import type { RequirementsModuleClient } from '@ews/requirements-client'
import { useSyncExternalStore } from 'react'

/**
 * Assistant proposals for API-backed requirements. The platform's preview/Apply mechanism only
 * applies twin changes (contract change request 3 in the progress file), so the assistant action
 * records a proposal here and the Requirements view shows it with a field-by-field preview,
 * Apply / Reject, the expected revision, activity logging and Undo. Nothing changes until the
 * user applies it, and applying uses the same API validation and revision checks as a manual edit.
 */
export interface ProposalChange {
  field: 'title' | 'statement' | 'rationale'
  current: string
  proposed: string
}

export interface AssistantProposal {
  id: string
  requirementId: string
  key: string
  expectedRevision: number
  changes: ProposalChange[]
  explanation: string
  createdAt: string
  status: 'pending' | 'applied' | 'rejected' | 'failed' | 'undone'
  appliedRevision?: number
  error?: string
}

/** The connection the assistant actions use while a Requirements view is mounted in API mode. */
export interface AssistantConnection {
  client: RequirementsModuleClient
  projectId: string
}

let connection: AssistantConnection | null = null
let proposals: AssistantProposal[] = []
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function setAssistantConnection(c: AssistantConnection | null) {
  connection = c
}
export function getAssistantConnection(): AssistantConnection | null {
  return connection
}

export function addProposal(p: Omit<AssistantProposal, 'id' | 'createdAt' | 'status'>): AssistantProposal {
  const proposal: AssistantProposal = { ...p, id: `RQP-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`, createdAt: new Date().toISOString(), status: 'pending' }
  proposals = [proposal, ...proposals].slice(0, 20)
  notify()
  return proposal
}

export function updateProposal(id: string, patch: Partial<AssistantProposal>) {
  proposals = proposals.map((p) => (p.id === id ? { ...p, ...patch } : p))
  notify()
}

export function useProposals(): AssistantProposal[] {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => proposals,
    () => proposals,
  )
}

/** For tests. */
export function resetProposals() {
  proposals = []
  connection = null
  notify()
}
