import { describe, expect, it } from 'vitest'
import { bounded, quantitiesOf } from './contextSelect'

describe('context selector helpers', () => {
  it('keeps values exactly and derives a tolerance without float noise', () => {
    expect(quantitiesOf('d', { value: 6.6, unit: 'mm', min: 6.3, max: 6.9 })).toEqual([{ name: 'd', value: 6.6, unit: 'mm', tolerance: { minus: 0.3, plus: 0.3 } }])
    expect(quantitiesOf('L', { value: 100, unit: 'mm' })).toEqual([{ name: 'L', value: 100, unit: 'mm' }])
    expect(quantitiesOf('w', { unit: 'mm', min: 2, max: 4 }, 'face A')).toEqual([
      { name: 'w (min)', value: 2, unit: 'mm', datum: 'face A' },
      { name: 'w (max)', value: 4, unit: 'mm', datum: 'face A' },
    ])
    expect(quantitiesOf('x', null)).toEqual([])
  })

  it('bounds summaries to 2,000 characters', () => {
    expect(bounded('a'.repeat(2500))).toHaveLength(2000)
    expect(bounded('short')).toBe('short')
  })
})
