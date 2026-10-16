import { describe, expect, it } from 'vitest'
import type { EngineeringDefinition } from '@ews/conceptualize-client'
import { componentAt, definitionDifferences, layoutSpanMm, parameterLabel, renderLayout, toSvg } from './renderLayout'

const param = (id: string, symbol: string, value: number, unit = 'mm') => ({ id, symbol, name: symbol, value, min: null, max: null, unit, basis: 'user-assertion' as const, componentId: null, constraintId: null, note: '' })
const comp = (id: string, name: string, kind: 'part' | 'envelope' = 'part') => ({ id, name, kind, description: '', basis: 'user-assertion' as const })

const bracket = (armLength = 120, armUnit = 'mm'): EngineeringDefinition => ({
  intent: 'Hold a shelf',
  components: [comp('C1', 'Wall plate'), comp('C2', 'Arm'), comp('C3', 'Envelope', 'envelope'), comp('C4', 'Screw')],
  relationships: [],
  interfaces: [{ id: 'I1', name: 'Bolted joint', kind: 'mechanical', between: ['C1', 'C2'], description: '', parameterIds: [] }],
  parameters: [param('P1', 'plate_h', 80), param('P2', 'arm_l', armLength, armUnit), param('P3', 'thk', 4), param('P4', 'env_w', 140)],
  layout: {
    view: 'side',
    unit: 'mm',
    items: [
      { componentId: 'C1', x: 0, y: 0, width: { parameter: 'P3' }, height: { parameter: 'P1' }, shape: 'rect' },
      { componentId: 'C2', x: 4, y: 0, width: { parameter: 'P2' }, height: 10, shape: 'rect' },
      { componentId: 'C3', x: 0, y: -5, width: 140, height: 90, shape: 'rect' },
    ],
    dimensions: [
      { id: 'D1', parameterId: 'P1', componentId: 'C1', axis: 'y' },
      { id: 'D2', parameterId: 'P2', componentId: 'C2', axis: 'x' },
    ],
  },
  idSeq: 4,
})

describe('structured layout renderer', () => {
  it('labels every dimension exactly from its parameter and keeps stable component IDs', () => {
    const def = bracket()
    const d = renderLayout(def, { caption: { key: 'CON-001', name: 'Bracket', revision: 3 } })!
    expect(d.dimensions.map((x) => x.label)).toEqual(['plate_h = 80 mm', 'arm_l = 120 mm'])
    for (const dim of d.dimensions) expect(dim.label).toBe(parameterLabel(def.parameters.find((p) => p.id === dim.parameterId)!))
    expect(d.components.map((c) => c.componentId)).toEqual(['C1', 'C2', 'C3'])
    expect(d.unplaced).toEqual([{ componentId: 'C4', name: 'Screw' }])
    expect(d.notToScale).toBe(false)
    const svg = toSvg(d)
    expect(svg).toContain('data-component-id="C2"')
    expect(svg).toContain('data-parameter-id="P2"')
    expect(svg).toContain('>arm_l = 120 mm<')
    expect(svg).not.toMatch(/fill="#|stroke="#|style=/)
    expect(d.caption).toBe('CON-001 rev 3: Bracket · side view · mm · dimensions from parameters')
  })

  it('is deterministic and draws parameter-bound extents to scale, converting units', () => {
    expect(toSvg(renderLayout(bracket())!)).toBe(toSvg(renderLayout(bracket())!))
    const mm = renderLayout(bracket(120, 'mm'))!
    const cm = renderLayout(bracket(12, 'cm'))!
    expect(cm.components.find((c) => c.componentId === 'C2')!.w).toBe(mm.components.find((c) => c.componentId === 'C2')!.w)
    expect(cm.dimensions[1].label).toBe('arm_l = 12 cm')
    // Arm drawn 120 mm vs plate 80 mm at the same scale.
    const arm = mm.components.find((c) => c.componentId === 'C2')!
    const plate = mm.components.find((c) => c.componentId === 'C1')!
    expect(arm.w / plate.h).toBeCloseTo(120 / 80, 2)
  })

  it('marks the drawing not to scale when a dimensioned extent is not bound to its parameter', () => {
    const def = bracket()
    def.layout!.dimensions.push({ id: 'D3', parameterId: 'P4', componentId: 'C3', axis: 'x' })
    const d = renderLayout(def)!
    expect(d.notToScale).toBe(true)
    expect(d.dimensions.find((x) => x.id === 'D3')).toMatchObject({ label: 'env_w = 140 mm', toScale: false })
    expect(toSvg(d)).toContain('env_w = 140 mm (n.t.s.)')
    expect(d.caption).toMatch(/NOT TO SCALE/)
  })

  it('finds the structured component under a normalized point (smallest first)', () => {
    const d = renderLayout(bracket())!
    const arm = d.components.find((c) => c.componentId === 'C2')!
    expect(componentAt(d, arm.box.x + arm.box.w / 2, arm.box.y + arm.box.h / 2)?.componentId).toBe('C2')
    expect(componentAt(d, 0.999, 0.999)).toBeNull()
  })

  it('highlights what differs between alternatives', () => {
    const a = bracket(120)
    const b = bracket(150)
    b.components = [...b.components, comp('C9', 'Gusset')]
    const diff = definitionDifferences([a, b])
    expect([...diff.components[1]]).toEqual(['C9'])
    expect([...diff.components[0]]).toEqual([])
    expect([...diff.parameters[0]]).toEqual(['P2'])
    const d = renderLayout(b, { highlightComponents: diff.components[1], highlightParameters: diff.parameters[1] })!
    expect(d.dimensions.find((x) => x.parameterId === 'P2')!.highlighted).toBe(true)
  })

  it('returns null without a layout (never an invented drawing)', () => {
    expect(renderLayout({ ...bracket(), layout: null })).toBeNull()
  })
})

describe('common comparison scale', () => {
  it('draws alternatives at one scale when given the largest extent', () => {
    const small = bracket(60)
    const large = bracket(150)
    const spans = [layoutSpanMm(small)!, layoutSpanMm(large)!]
    expect(spans[1].x).toBeGreaterThan(spans[0].x)
    const common = { x: Math.max(...spans.map((s) => s.x)), y: Math.max(...spans.map((s) => s.y)) }
    const a = renderLayout(small, { width: 500, commonSpanMm: common })!
    const b = renderLayout(large, { width: 500, commonSpanMm: common })!
    expect(a.scale).toBeCloseTo(b.scale, 6)
    expect(a.components.find((c) => c.componentId === 'C2')!.w / b.components.find((c) => c.componentId === 'C2')!.w).toBeCloseTo(60 / 150, 2)
    expect(a.caption).toMatch(/common scale/)
  })
})
