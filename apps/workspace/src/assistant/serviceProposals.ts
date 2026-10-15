import type { ServiceProposal } from '@ews/platform-sdk'

/**
 * Apply and undo functions of service proposals (SDK 1.5), kept in memory in the window that
 * prepared them. The proposal record itself (preview, assumptions, status) is plain data shared with
 * other windows; only this window can apply it, and the card says so elsewhere.
 */
const handlers = new Map<string, Pick<ServiceProposal, 'apply' | 'undo'> & { applied?: { createdIds?: string[] } }>()

export function registerServiceHandlers(proposalId: string, proposal: ServiceProposal): void {
  handlers.set(proposalId, { apply: proposal.apply, undo: proposal.undo })
}

export function serviceHandlers(proposalId: string) {
  return handlers.get(proposalId)
}
