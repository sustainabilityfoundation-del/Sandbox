import { describe, expect, it } from 'vitest'
import type { DesignConstraint } from '@ews/conceptualize-client'
import { boundText } from './domain'
import { constraintSubject } from './inspectorSubjects'

const base = { id: '9f873c52-0000-4000-8000-000000000001', key: 'CST-001', statement: 'The holder shall stay under the mass limit for the long mounting statement that used to be cut', basis: 'user-assertion', status: 'active', strength: 'hard', kind: 'mathematical', revision: 2, source: { kind: 'stated' } } as unknown as DesignConstraint

describe('boundText', () => {
  it('shows symbol, operator, value, unit and tolerance in full', () => {
    expect(boundText({ bound: { symbol: 'm', operator: '<=', quantity: { value: 12, unit: 'kg', min: 11.5, max: 12.5 } } })).toBe('m <= 12 kg (11.5–12.5)')
  })
  it('shows a range and a one-sided bound', () => {
    expect(boundText({ bound: { symbol: 'T', operator: 'in-range', quantity: { unit: '°C', min: 20, max: 80 } } })).toBe('T in 20–80 °C')
    expect(boundText({ bound: { operator: '>=', quantity: { unit: 'mm', min: 3 } } })).toBe('>= 3 mm')
    expect(boundText({ bound: null })).toBe('')
  })
  it('shows the min–max range of an = bound with no nominal value, and the limit of a one-sided bound with no value', () => {
    expect(boundText({ bound: { symbol: 'L', operator: '=', quantity: { unit: 'mm', min: 99, max: 101 } } })).toBe('L = 99–101 mm')
    expect(boundText({ bound: { operator: '<=', quantity: { unit: 'kg', max: 12 } } })).toBe('<= 12 kg')
    expect(boundText({ bound: { operator: '<', quantity: { unit: 'kg', max: 5 } } })).toBe('< 5 kg')
  })
})

describe('constraintSubject', () => {
  it('carries the human key and the full bound, never the UUID as the key', () => {
    const s = constraintSubject({ ...base, bound: { symbol: 'm', operator: '<=', quantity: { value: 12, unit: 'kg' } } })
    expect(s.key).toBe('CST-001')
    expect(s.kind).toBe('Constraint')
    expect(s.title).toBe(base.statement)
    expect(s.sections[0].fields[0]).toEqual({ label: 'Bound', value: 'm <= 12 kg' })
  })
})
