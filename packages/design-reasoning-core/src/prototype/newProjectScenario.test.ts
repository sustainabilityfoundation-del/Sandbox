import { describe, expect, it } from 'vitest'
import { runNewProjectScenario } from './newProjectScenario'

// Contract-adapter run of the new-project scenario (the real-service run is in test/scenarios.db.test.ts).
describe('new-project scenario on the contract adapter', () => {
  it('shows demonstrated and possible impact of a requirement revision without actuator IDs', async () => {
    const t = await runNewProjectScenario({ projectId: 'PRJ-NEW-UNIT', now: () => new Date('2026-10-15T08:00:00Z') })
    expect(t.emptyAtStart).toEqual({ functions: 0, concepts: 0, decisions: 0, constraints: 0 })
    expect(t.steps.every((s) => !s.backing?.startsWith('real service'))).toBe(true)
    expect(t.calculation.checks[0].status).toBe('satisfied')
    const cls = (r: typeof t.requirementImpact, id: string) => r.items.find((i) => i.ref.id === id)?.classification
    expect(cls(t.requirementImpact, t.ids.constraint)).toBe('demonstrated')
    expect(cls(t.requirementImpact, t.ids.decision)).toBe('demonstrated')
    expect(cls(t.requirementImpact, t.ids.vise)).toBe('possible')
    expect(cls(t.requirementImpact, t.ids.evidence)).toBe('checked-unaffected')
    expect(cls(t.reformalizationImpact, t.ids.evidence)).toBe('demonstrated')
    expect(t.allRefs.join(' ')).not.toMatch(/ROD-|CAD-|SYS-|ACT-/)
  })
})
