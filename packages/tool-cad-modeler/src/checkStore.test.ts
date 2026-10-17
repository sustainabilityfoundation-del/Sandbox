import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkFor, checkStore, type CheckPanelState } from './checkStore'
import { INITIAL_VIEW_STATE } from './viewState'
import type { CheckReport } from './checks'

const report = (modelVersion: number): CheckReport =>
  ({ documentId: 'd1', documentTitle: 'Plate', documentRevision: null, modelVersion, unsavedChanges: false, kernel: { name: 'OCCT', version: '8', licence: 'LGPL' }, results: [], evidence: null, assumptions: [], summary: { satisfied: 1, violated: 0, 'not-checkable': 0 } }) as CheckReport
const done = (v: number): CheckPanelState => ({ state: 'done', report: report(v), at: '2026-10-17T00:00:00Z' })

describe('check state is session state, not view state', () => {
  beforeEach(() => checkStore.reset())

  it('keeps nothing about the check in the persisted view state', () => {
    const persisted = JSON.parse(JSON.stringify(INITIAL_VIEW_STATE)) as Record<string, unknown>
    expect(Object.keys(persisted)).not.toContain('check')
    expect(Object.keys(persisted)).not.toContain('checkRequest')
    // A running check is mirrored only as a flag that the view rewrites on mount.
    expect(INITIAL_VIEW_STATE.status.checking).toBe(false)
  })

  it('a reload during a run starts with no check (no spinner that never stops)', async () => {
    checkStore.set('d1', 3, { state: 'running' })
    expect(checkStore.isRunning('d1')).toBe(true)
    vi.resetModules() // a reload: the module state is gone
    const fresh = await import('./checkStore')
    expect(fresh.checkStore.isRunning('d1')).toBe(false)
    expect(fresh.checkFor(fresh.checkStore.getSnapshot(), 'd1', 3)).toEqual({ check: undefined, stale: false })
  })

  it('a pass is current at the model version it measured and outdated after an edit', () => {
    checkStore.set('d1', 3, done(3))
    expect(checkFor(checkStore.getSnapshot(), 'd1', 3)).toMatchObject({ stale: false, check: { state: 'done' } })
    expect(checkFor(checkStore.getSnapshot(), 'd1', 4).stale).toBe(true)
  })

  it('is keyed by document: switching documents never shows another document report', () => {
    checkStore.set('d1', 3, done(3))
    expect(checkFor(checkStore.getSnapshot(), 'd2', 3)).toEqual({ check: undefined, stale: false })
    checkStore.set('d2', 1, { state: 'running' })
    expect(checkStore.isRunning('d1')).toBe(false)
    expect(checkFor(checkStore.getSnapshot(), 'd1', 3).check?.state).toBe('done')
    expect(checkFor(checkStore.getSnapshot(), undefined, undefined).check).toBeUndefined()
  })

  it('notifies subscribers, and the toolbar request is a counter', () => {
    const seen = vi.fn()
    const off = checkStore.subscribe(seen)
    checkStore.request()
    checkStore.set('d1', 1, { state: 'running' })
    off()
    checkStore.request()
    expect(seen).toHaveBeenCalledTimes(2)
    expect(checkStore.getSnapshot().requestSeq).toBe(2)
  })
})
