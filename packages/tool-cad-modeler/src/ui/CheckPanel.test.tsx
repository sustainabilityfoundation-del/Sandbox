import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CheckPanelState } from '../checkStore'
import type { CheckReport, CheckResult } from '../checks'
import { CheckPanel, describeBound } from './CheckPanel'

const bound = { constraint: { module: 'conceptualize', kind: 'constraint', id: 'c1', revision: 2 }, key: 'CST-004', statement: 'Wall at least 3 mm', latestRevision: 2, operator: '>=', value: 3, unit: 'mm', strength: 'must', constraintStatus: 'active', basis: 'x' }
const row = (o: Partial<CheckResult>): CheckResult => ({ checkId: 'p:wall', quantity: 'Wall thickness', measured: null, measuredModel: null, bound: null, status: 'satisfied', method: 'parameter', documentId: 'd1', documentRevision: 1, modelVersion: 4, kernel: { name: 'OCCT', version: '8' }, ...o }) as CheckResult
const report = (results: CheckResult[]): CheckReport =>
  ({
    documentId: 'd1', documentTitle: 'Plate', documentRevision: 1, modelVersion: 4, unsavedChanges: false, kernel: { name: 'OCCT', version: '8', licence: 'LGPL' }, results, evidence: null, assumptions: [],
    summary: { satisfied: results.filter((r) => r.status === 'satisfied').length, violated: results.filter((r) => r.status === 'violated').length, 'not-checkable': results.filter((r) => r.status === 'not-checkable').length },
  }) as CheckReport
const html = (check: CheckPanelState | undefined, stale = false) => renderToStaticMarkup(<CheckPanel check={check} stale={stale} onRun={() => undefined} canRun />)
const done = (r: CheckReport): CheckPanelState => ({ state: 'done', report: r, at: '2026-10-17T10:00:00Z' })

describe('CheckPanel', () => {
  it('shows not-run, running and error states', () => {
    expect(html(undefined)).toContain('Not run yet')
    expect(html({ state: 'running' })).toContain('Measuring the model')
    expect(html({ state: 'error', message: 'No kernel' })).toContain('No kernel')
  })

  it('lists a row per measure with value, bound ID, result and source', () => {
    const out = html(
      done(
        report([
          row({ measured: { value: 3.5, unit: 'mm' }, bound: bound as CheckResult['bound'], binding: { parameter: 'wall' }, provenance: { source: 'kernel', kernel: { name: 'OCCT', version: '8' }, measuredOn: 'solid' } }),
          row({ checkId: 'p:h', quantity: 'Height', status: 'violated', measured: { value: 9, unit: 'mm' }, bound: { ...bound, key: 'CST-005', operator: '<=', value: 5 } as CheckResult['bound'] }),
        ]),
      ),
    )
    expect((out.match(/data-testid="check-result"/g) ?? []).length).toBe(2)
    expect(out).toContain('CST-004')
    expect(out).toContain('CST-005')
    expect(out).toContain('&gt;= 3 mm')
    expect(out).toContain('Pass')
    expect(out).toContain('Fail')
    expect(out).toContain('Kernel')
    expect(out).not.toContain('Outdated')
  })

  it('shows an empty state when no parameter is bound', () => {
    const out = html(done(report([])))
    expect(out).toContain('No parameter is bound to a design constraint')
    expect(out).not.toContain('data-testid="check-result"')
  })

  it('says why an item is not checkable', () => {
    const out = html(done(report([row({ status: 'not-checkable', reason: 'The constraint has no numeric bound.' })])))
    expect(out).toContain('Not checkable')
    expect(out).toContain('The constraint has no numeric bound.')
  })

  it('marks an old report as outdated and never as a current pass', () => {
    const out = html(done(report([row({ measured: { value: 3.5, unit: 'mm' } })])), true)
    expect(out).toContain('Outdated, run again')
    expect(out).toContain('1 pass (outdated)')
  })

  it('puts aria-live on the summary line only', () => {
    const out = html(done(report([row({})])))
    expect((out.match(/aria-live/g) ?? []).length).toBe(1)
    expect(out).toMatch(/data-testid="check-summary"[^>]*aria-live|aria-live[^>]*data-testid="check-summary"/)
  })

  it('formats bounds', () => {
    expect(describeBound({ operator: 'in-range', min: 2, max: 4, unit: 'mm' } as never)).toBe('between 2 and 4 mm')
  })
})
