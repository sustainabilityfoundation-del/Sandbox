import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import { dimensionChanges, layoutOf, mappedProperty, partForComponent, partsOf, validateDimension } from './domain'

const model = sampleModel()
const parts = partsOf(model)

describe('CAD representations and the explicit dimension mapping', () => {
  it('finds each representation with the component it represents', () => {
    expect(parts.map((p) => [p.rep.id, p.component?.id, p.rep.shape])).toEqual([
      ['CAD-110', 'HSG-110', 'housing'],
      ['CAD-120', 'ROD-120', 'rod'],
      ['CAD-130', 'MTR-130', 'motor'],
    ])
  })

  it('maps parameters only to properties that exist on the component', () => {
    expect(mappedProperty(model.get('ROD-120'), 'length')).toBe('effectiveLength')
    expect(mappedProperty(model.get('HSG-110'), 'length')).toBe('length')
    expect(mappedProperty(model.get('MTR-130'), 'length')).toBeUndefined()
  })

  it('updates the representation and the mapped component property with base revisions, in one batch', () => {
    const rod = partForComponent(parts, 'ROD-120')!
    expect(dimensionChanges(rod, [{ parameter: 'diameter', value: 28 }])).toEqual([
      { kind: 'update-properties', targetId: 'CAD-120', baseRevision: 5, properties: { diameter: { value: 28, unit: 'mm' } } },
      { kind: 'update-properties', targetId: 'ROD-120', baseRevision: 2, properties: { diameter: { value: 28, unit: 'mm' } } },
    ])
    const motor = partForComponent(parts, 'MTR-130')!
    expect(dimensionChanges(motor, [{ parameter: 'length', value: 180 }])).toHaveLength(1) // representation only
  })

  it('reflects dimensions in the mock geometry', () => {
    expect(layoutOf(parts).rod).toMatchObject({ d: 25, length: 600 })
  })

  it('validates values and ranges', () => {
    expect(validateDimension('diameter', '28')).toEqual({ ok: true, value: 28 })
    expect(validateDimension('diameter', 'abc')).toMatchObject({ ok: false })
    expect(validateDimension('diameter', '900')).toMatchObject({ ok: false })
  })
})
