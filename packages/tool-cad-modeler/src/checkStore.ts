import { useSyncExternalStore } from 'react'
import type { CheckReport } from './checks'

/**
 * Latest "Check against constraints" run per document, kept in memory for this browser session only. It is deliberately
 * not part of the view state: the workspace persists view state and restores it on reload, which would bring back a
 * spinner that never stops or an old report. A reload starts with no check; a report is tied to the document id and the
 * model version it measured and is shown as outdated once the version differs.
 */
export type CheckPanelState = { state: 'running' } | { state: 'done'; report: CheckReport; at: string } | { state: 'error'; message: string }

export interface StoredCheck {
  documentId: string
  /** Model version when the run started. */
  modelVersion: number
  check: CheckPanelState
}

interface Snapshot {
  checks: ReadonlyMap<string, StoredCheck>
  /** Incremented by the toolbar command; the view runs the check once per value. */
  requestSeq: number
}

let snapshot: Snapshot = { checks: new Map(), requestSeq: 0 }
const listeners = new Set<() => void>()
const emit = (next: Snapshot) => {
  snapshot = next
  for (const l of [...listeners]) l()
}

export const checkStore = {
  subscribe(l: () => void) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  getSnapshot: () => snapshot,
  set(documentId: string, modelVersion: number, check: CheckPanelState) {
    const checks = new Map(snapshot.checks)
    checks.set(documentId, { documentId, modelVersion, check })
    emit({ ...snapshot, checks })
  },
  request() {
    emit({ ...snapshot, requestSeq: snapshot.requestSeq + 1 })
  },
  isRunning: (documentId: string) => snapshot.checks.get(documentId)?.check.state === 'running',
  /** Test helper: forget everything (as a reload does). */
  reset() {
    emit({ checks: new Map(), requestSeq: 0 })
  },
}

export function useCheckStore(): Snapshot {
  return useSyncExternalStore(checkStore.subscribe, checkStore.getSnapshot)
}

/** The check to show for a document at its current model version; `stale` when the model changed after the run. */
export function checkFor(snap: Snapshot, documentId: string | undefined, modelVersion: number | undefined): { check: CheckPanelState | undefined; stale: boolean } {
  const s = documentId ? snap.checks.get(documentId) : undefined
  if (!s) return { check: undefined, stale: false }
  return { check: s.check, stale: s.check.state === 'done' && modelVersion !== undefined && s.modelVersion !== modelVersion }
}
