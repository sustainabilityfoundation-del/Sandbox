import { applyTransaction, createDocument } from '@ews/cad-core'
import { describe, expect, it } from 'vitest'
import { mapHandoff, parameterName, type ConceptHandoff } from './handoff'

/** Mapping a Conceptualize CAD handoff package to CAD commands: nothing invented, gaps reported. */

const H: ConceptHandoff = {
  id: 'h-1',
  key: 'HND-001',
  projectId: 'PRJ-X',
  conceptId: 'c-1',
  conceptRevision: 3,
  package: {
    schema: 'conceptualize.cad-handoff/1',
    concept: { id: 'c-1', key: 'CON-001', name: 'Bit holder', revision: 3 },
    components: [{ id: 'C1', name: 'Holder block', kind: 'part' }, { id: 'C2', name: 'Clip', kind: 'purchased' }],
    interfaces: [{ id: 'F1', name: 'Drill mount', parameterIds: ['P2'] }],
    parameters: [
      { id: 'P1', symbol: 'af', name: 'Pocket across flats', value: 6.6, min: null, max: null, unit: 'mm', basis: 'user-assertion', componentId: 'C1', constraintId: 'k-1' },
      { id: 'P2', symbol: 'hole spacing', name: 'Mount hole spacing', value: 1.25, min: null, max: null, unit: 'in', basis: 'assumption', componentId: 'C1', constraintId: null },
      { id: 'P3', symbol: 'n', name: 'Pockets', value: 6, min: null, max: null, unit: '', basis: 'user-assertion', componentId: 'C1', constraintId: 'k-missing' },
      { id: 'P4', symbol: 'wall', name: 'Wall', value: null, min: 2, max: 4, unit: 'mm', basis: 'ai-hypothesis', componentId: 'C1', constraintId: null },
      { id: 'P5', symbol: 'mass', name: 'Mass', value: 0.12, min: null, max: null, unit: 'kg', basis: 'estimate', componentId: null, constraintId: null },
      { id: 'P6', symbol: 'sin', name: 'Reserved name', value: 3, min: null, max: null, unit: 'mm', basis: 'user-assertion', componentId: null, constraintId: null },
    ],
    constraints: [{ id: 'k-1', key: 'CST-001', revision: 2, statement: 'Across flats 6.4–6.8 mm' }],
    unresolved: [{ kind: 'open-question', text: 'Which drill interface?', ref: 's-1' }],
  },
}

describe('handoff mapping', () => {
  it('creates the part, bound parameters and provenance; lists every gap', () => {
    const m = mapHandoff(H)
    expect(m.title).toBe('CON-001 Bit holder')
    expect(m.partName).toBe('Holder block')
    expect(m.parameters.map((p) => [p.name, p.expression, p.unit, p.constraint?.key ?? null])).toEqual([
      ['af', '6.6', 'mm', 'CST-001'],
      ['hole_spacing', '1.25 in', 'mm', null],
      ['n', '6', 'none', null],
      ['sin_p', '3', 'mm', null],
    ])
    const kinds = m.gaps.map((g) => [g.source, g.kind])
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['handoff', 'open-question'],
        ['mapping', 'unbound-constraint'],
        ['mapping', 'parameter-range'],
        ['mapping', 'unsupported-unit'],
        ['mapping', 'interface-to-model'],
        ['mapping', 'multiple-components'],
      ]),
    )
    expect(m.gaps.find((g) => g.kind === 'interface-to-model')!.text).toMatch(/hole_spacing/)
    // The commands are valid against a fresh document; the binding pins the package's constraint revision.
    const r = applyTransaction(createDocument({ title: m.title }), { commands: m.commands })
    if (!r.ok) throw new Error(r.error.message)
    const part = r.doc.parts[0]
    expect(part.name).toBe('Holder block')
    expect(part.parameters.find((p) => p.name === 'af')!.binding).toEqual({ ref: { module: 'conceptualize', kind: 'constraint', id: 'k-1', revision: 2 }, quantity: 'Pocket across flats' })
    expect(part.parameters.find((p) => p.name === 'wall')).toBeUndefined() // a range is never turned into a value
    expect(r.doc.metadata.source).toEqual({ concept: { module: 'conceptualize', kind: 'concept', id: 'c-1', revision: 3, label: 'CON-001 Bit holder' }, handoff: { id: 'h-1', revision: 1 } })
    expect(r.doc.references).toEqual([expect.objectContaining({ subject: part.id, role: 'realizes', target: expect.objectContaining({ module: 'conceptualize', id: 'c-1', revision: 3 }) })])
  })

  it('derives valid unique parameter names', () => {
    const taken = new Set<string>()
    expect([parameterName('2 holes', taken), parameterName('a-b', taken), parameterName('a b', taken), parameterName('pi', taken)]).toEqual(['p_2_holes', 'a_b', 'a_b_2', 'pi_p'])
  })
})
