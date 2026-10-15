import { describe, expect, it } from 'vitest'
import { draftConcept, extractName, extractQuantities, extractRequestedCount } from './nl'

const OWNER = 'Develop three alternative concepts for a compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope.'

describe('natural-language Concept drafts', () => {
  it('interprets the owner’s example', () => {
    const d = draftConcept(OWNER, 'ai-hypothesis')
    expect(d.name).toBe('Compact mechanical actuator')
    expect(d.requestedAlternatives).toBe(3)
    expect(d.description).toBe(OWNER)
    expect(d.classifications).toEqual(['actuator'])
    expect(d.quantities.map((q) => [q.label, q.quantity])).toEqual([
      ['Linear force', { value: 500, unit: 'N' }],
      ['Envelope', { max: 100, unit: 'mm' }],
    ])
    expect(d.statements.find((s) => s.kind === 'function')?.text).toBe('Deliver linear force')
    expect(d.statements.every((s) => s.basis === 'ai-hypothesis')).toBe(true)
  })

  it('reads bounds, ranges, questions and assumptions', () => {
    const d = draftConcept('A gripper that holds parts of at least 2 kg and opens in no more than 0.5 s. Stroke 10–20 mm. Assume compressed air at 6 bar is available. Should it be electric?')
    expect(d.quantities.map((q) => q.quantity)).toEqual([{ min: 2, unit: 'kg' }, { max: 0.5, unit: 's' }, { min: 10, max: 20, unit: 'mm' }, { value: 6, unit: 'bar' }])
    expect(d.quantities[2].label).toBe('Stroke')
    expect(d.statements.filter((s) => s.kind === 'question').map((s) => s.text)).toEqual(['Should it be electric?'])
    expect(d.statements.find((s) => s.kind === 'assumption')?.basis).toBe('assumption')
  })

  it('names, counts and notes what it could not interpret', () => {
    expect(extractName('Design a bracket that mounts a camera.')).toBe('Bracket')
    expect(extractRequestedCount('Show me 4 concepts')).toBe(4)
    expect(extractRequestedCount('a concept')).toBeNull()
    expect(extractQuantities('in 3 steps')).toEqual([])
    expect(draftConcept('Something nice.').notes).toHaveLength(2)
  })
})
