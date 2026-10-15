import { describe, expect, it } from 'vitest'
import {
  COMMANDS,
  DocumentHistory,
  applyTransaction,
  commandCatalog,
  createDocument,
  dependencyGraph,
  downstreamOf,
  evaluate,
  evaluateParameters,
  extractProfile,
  parseDocument,
  serializeDocument,
  solveSketch,
  validateDocument,
  type CadDocument,
  type SketchFeature,
} from './index'

const DOC_ID = '00000000-0000-4000-8000-000000000001'

function plateDoc(): CadDocument {
  const r = applyTransaction(createDocument({ documentId: DOC_ID, title: 'Plate' }), {
    commands: [
      { command: 'create_part', input: { name: 'Plate', ref: '$p' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'width', expression: '80' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'height', expression: 'width / 2' } },
      { command: 'create_parameter', input: { partId: '$p', name: 'thickness', expression: '10' } },
      { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
      { command: 'add_rectangle', input: { sketchId: '$s', width: 'width', height: 'height', ref: '$r' } },
      { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness', ref: '$e' } },
    ],
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.doc
}

describe('expressions', () => {
  it('evaluates arithmetic, functions, constants and units', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14)
    expect(evaluate('2 ^ 3 ^ 2')).toBe(512)
    expect(evaluate('-(1 + 2)')).toBe(-3)
    expect(evaluate('1 in')).toBeCloseTo(25.4)
    expect(evaluate('pi rad')).toBeCloseTo(180)
    expect(evaluate('sin(30)')).toBeCloseTo(0.5)
    expect(evaluate('max(1, 5, 3) + sqrt(16)')).toBe(9)
    expect(evaluate('w / 2', (n) => (n === 'w' ? 10 : undefined))).toBe(5)
  })
  it('rejects bad input with clear errors', () => {
    expect(() => evaluate('2 +')).toThrow(/Unexpected end/)
    expect(() => evaluate('foo(1)')).toThrow(/Unknown function/)
    expect(() => evaluate('1 / 0')).toThrow(/Division by zero/)
    expect(() => evaluate('x')).toThrow(/Unknown parameter/)
    expect(() => evaluate('2 $ 3')).toThrow(/Unexpected character/)
  })
  it('evaluates parameters in dependency order and reports cycles', () => {
    const s = evaluateParameters({ parameters: [
      { id: 'a', name: 'a', expression: 'b * 2', unit: 'mm' },
      { id: 'b', name: 'b', expression: '5', unit: 'mm' },
      { id: 'c', name: 'c', expression: 'd + 1', unit: 'mm' },
      { id: 'd', name: 'd', expression: 'c + 1', unit: 'mm' },
      { id: 'e', name: 'e', expression: 'c', unit: 'mm' },
    ] })
    expect(s.values.get('a')).toBe(10)
    expect(s.parameters.find((p) => p.name === 'c')?.error?.code).toBe('cycle')
    expect(s.parameters.find((p) => p.name === 'e')?.error?.message).toMatch(/Depends on “c”/)
  })
})

const sketch = (entities: SketchFeature['entities'], constraints: SketchFeature['constraints']) => ({ entities, constraints })

describe('sketch solver', () => {
  const rectEntities: SketchFeature['entities'] = [
    { id: 'p1', type: 'point', x: 0.3, y: -0.2 },
    { id: 'p2', type: 'point', x: 38, y: 1 },
    { id: 'p3', type: 'point', x: 41, y: 22 },
    { id: 'p4', type: 'point', x: -2, y: 19 },
    { id: 'l1', type: 'line', start: 'p1', end: 'p2' },
    { id: 'l2', type: 'line', start: 'p2', end: 'p3' },
    { id: 'l3', type: 'line', start: 'p3', end: 'p4' },
    { id: 'l4', type: 'line', start: 'p4', end: 'p1' },
  ]
  const rectConstraints: SketchFeature['constraints'] = [
    { id: 'c1', type: 'horizontal', entities: ['l1'] },
    { id: 'c2', type: 'vertical', entities: ['l2'] },
    { id: 'c3', type: 'horizontal', entities: ['l3'] },
    { id: 'c4', type: 'vertical', entities: ['l4'] },
    { id: 'c5', type: 'coincident', entities: ['origin', 'p1'] },
    { id: 'c6', type: 'length', entities: ['l1'], value: 40 },
    { id: 'c7', type: 'length', entities: ['l2'], value: 20 },
  ]

  it('solves a fully constrained rectangle exactly', () => {
    const s = solveSketch(sketch(rectEntities, rectConstraints), { values: { c6: 40, c7: 20 } })
    expect(s.status).toBe('fully-constrained')
    expect(s.dof).toBe(0)
    expect(s.points.p1).toEqual([0, 0])
    expect(s.points.p3[0]).toBeCloseTo(40, 9)
    expect(s.points.p3[1]).toBeCloseTo(20, 9)
    expect(s.freePoints).toEqual([])
  })

  it('reports remaining degrees of freedom and free points', () => {
    const s = solveSketch(sketch(rectEntities, rectConstraints.filter((c) => c.id !== 'c7' && c.id !== 'c5')), { values: { c6: 40 } })
    expect(s.status).toBe('under-constrained')
    expect(s.dof).toBe(3) // x, y position and height
    expect(s.freePoints.sort()).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('detects redundant and conflicting constraints', () => {
    const redundant = solveSketch(sketch(rectEntities, [...rectConstraints, { id: 'c8', type: 'perpendicular', entities: ['l1', 'l2'] }]), { values: { c6: 40, c7: 20 } })
    expect(redundant.status).toBe('over-constrained')
    expect(redundant.redundant).toEqual(['c8'])
    const conflict = solveSketch(sketch(rectEntities, [...rectConstraints, { id: 'c9', type: 'length', entities: ['l3'], value: 55 }]), { values: { c6: 40, c7: 20, c9: 55 } })
    expect(conflict.status).toBe('conflicting')
    expect(conflict.conflicting).toContain('c9')
    expect(conflict.conflicting).toContain('c6')
  })

  it('measures driven dimensions without solving for them', () => {
    const s = solveSketch(sketch(rectEntities, [...rectConstraints, { id: 'd1', type: 'distance', entities: ['p1', 'p3'], driving: false }]), { values: { c6: 40, c7: 20 } })
    expect(s.status).toBe('fully-constrained')
    expect(s.driven.d1).toBeCloseTo(Math.hypot(40, 20), 9)
  })

  it('solves circles, tangency, angles and arcs', () => {
    const s = solveSketch(
      sketch(
        [
          { id: 'c', type: 'point', x: 1, y: 1 },
          { id: 'k', type: 'circle', center: 'c', radius: 3 },
          { id: 'a', type: 'point', x: -10, y: 6 },
          { id: 'b', type: 'point', x: 10, y: 4 },
          { id: 'l', type: 'line', start: 'a', end: 'b' },
          { id: 'q', type: 'point', x: 0, y: 0 },
          { id: 'r', type: 'point', x: 8, y: 6 },
          { id: 'm', type: 'line', start: 'q', end: 'r' },
        ],
        [
          { id: 'k1', type: 'coincident', entities: ['c', 'origin'] },
          { id: 'k2', type: 'diameter', entities: ['k'], value: 10 },
          { id: 'k3', type: 'horizontal', entities: ['l'] },
          { id: 'k4', type: 'tangent', entities: ['l', 'k'] },
          { id: 'k5', type: 'coincident', entities: ['q', 'origin'] },
          { id: 'k6', type: 'angle', entities: ['x-axis', 'm'], value: 30 },
          { id: 'k7', type: 'length', entities: ['m'], value: 20 },
        ],
      ),
      { values: { k2: 10, k6: 30, k7: 20 } },
    )
    expect(s.converged).toBe(true)
    expect(s.radii.k).toBeCloseTo(5, 9)
    expect(s.points.a[1]).toBeCloseTo(5, 9)
    expect(s.points.r[0]).toBeCloseTo(20 * Math.cos(Math.PI / 6), 8)
    expect(s.points.r[1]).toBeCloseTo(10, 8)
  })

  it('is deterministic', () => {
    const a = solveSketch(sketch(rectEntities, rectConstraints), { values: { c6: 40, c7: 20 } })
    const b = solveSketch(sketch(rectEntities, rectConstraints), { values: { c6: 40, c7: 20 } })
    expect(a).toEqual(b)
  })
})

describe('profiles', () => {
  it('finds an outer loop with a hole and reports open profiles', () => {
    const entities: SketchFeature['entities'] = [
      { id: 'p1', type: 'point', x: 0, y: 0 },
      { id: 'p2', type: 'point', x: 40, y: 0 },
      { id: 'p3', type: 'point', x: 40, y: 20 },
      { id: 'p4', type: 'point', x: 0, y: 20 },
      { id: 'l1', type: 'line', start: 'p1', end: 'p2' },
      { id: 'l2', type: 'line', start: 'p2', end: 'p3' },
      { id: 'l3', type: 'line', start: 'p3', end: 'p4' },
      { id: 'l4', type: 'line', start: 'p4', end: 'p1' },
      { id: 'pc', type: 'point', x: 20, y: 10 },
      { id: 'h', type: 'circle', center: 'pc', radius: 5 },
    ]
    const sol = solveSketch({ entities, constraints: [] }, { values: {} })
    const prof = extractProfile(entities, [], sol)
    expect(prof.issues).toEqual([])
    expect(prof.regions).toHaveLength(1)
    expect(prof.regions[0].holes).toHaveLength(1)
    expect(prof.regions[0].area).toBeCloseTo(800 - Math.PI * 25, 6)
    const open = extractProfile(entities.filter((e) => e.id !== 'l4'), [], sol)
    expect(open.issues.map((i) => i.code)).toContain('open-profile')
  })
})

describe('commands and transactions', () => {
  it('creates a parametric plate in one transaction with placeholders and deterministic IDs', () => {
    const doc = plateDoc()
    expect(doc.version).toBe(1)
    expect(doc.parts[0].id).toBe('part-1')
    expect(doc.parts[0].features.map((f) => f.id)).toEqual(['sk-5', 'ext-21'])
    expect(validateDocument(doc)).toEqual([])
    expect(serializeDocument(plateDoc())).toBe(serializeDocument(doc))
  })

  it('is atomic: a failing command leaves the document unchanged', () => {
    const doc = plateDoc()
    const r = applyTransaction(doc, { commands: [
      { command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '100' } },
      { command: 'set_parameter', input: { partId: 'part-1', name: 'nope', expression: '1' } },
    ] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failedIndex).toBe(1)
      expect(r.error.code).toBe('not-found')
    }
    expect(doc.parts[0].parameters[0].expression).toBe('80')
  })

  it('validates inputs, version and preconditions', () => {
    const doc = plateDoc()
    const bad = (commands: { command: string; input: Record<string, unknown> }[], expectedVersion?: number) => {
      const r = applyTransaction(doc, { commands, expectedVersion })
      return r.ok ? 'ok' : r.error.code
    }
    expect(bad([{ command: 'nope', input: {} }])).toBe('unknown-command')
    expect(bad([{ command: 'extrude_profile', input: { sketchId: 'sk-5', distance: -1 } }])).toBe('invalid-input')
    expect(bad([{ command: 'extrude_profile', input: { sketchId: 'sk-5', distance: 1, extra: true } }])).toBe('invalid-input')
    expect(bad([{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: 'height' } }])).toBe('cycle')
    expect(bad([{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: 'depth' } }])).toBe('invalid-expression')
    expect(bad([{ command: 'delete_parameter', input: { partId: 'part-1', name: 'thickness' } }])).toBe('in-use')
    expect(bad([{ command: 'delete_feature', input: { featureId: 'sk-5' } }])).toBe('in-use')
    expect(bad([{ command: 'apply_constraint', input: { sketchId: 'sk-5', type: 'radius', entities: ['ln-10'], value: 3 } }])).toBe('invalid-input')
    expect(bad([{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '90' } }], 0)).toBe('version-conflict')
    expect(bad([{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '90' } }], 1)).toBe('ok')
  })

  it('undo and redo are versioned and the operation log is complete', () => {
    const h = new DocumentHistory(plateDoc(), { clock: () => 'T' })
    const r = h.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '120' } }], source: 'assistant' })
    expect(r.ok && r.affected.modified).toEqual(['par-2'])
    expect(h.version).toBe(2)
    h.undo()
    expect(h.version).toBe(3)
    expect(h.document.parts[0].parameters[0].expression).toBe('80')
    h.redo()
    expect(h.version).toBe(4)
    expect(h.document.parts[0].parameters[0].expression).toBe('120')
    expect(h.execute({ commands: [{ command: 'set_parameter', input: { partId: 'part-1', name: 'width', expression: '1' } }], expectedVersion: 2 }).ok).toBe(false)
    expect(h.operations().map((o) => o.kind)).toEqual(['open', 'transaction', 'undo', 'redo', 'rejected'])
    expect(h.operations()[1].source).toBe('assistant')
  })

  it('round-trips through the native format and rejects invalid files', () => {
    const doc = plateDoc()
    const text = serializeDocument(doc)
    expect(parseDocument(text)).toEqual(JSON.parse(text))
    expect(() => parseDocument('{')).toThrow(/not valid JSON/)
    expect(() => parseDocument(JSON.stringify({ ...doc, formatVersion: '2.0.0' }))).toThrow(/not supported/)
    const broken = JSON.parse(text)
    broken.parts[0].features.reverse()
    expect(() => parseDocument(JSON.stringify(broken))).toThrow(/does not exist earlier/)
  })

  it('exposes the dependency graph', () => {
    const doc = plateDoc()
    const g = dependencyGraph(doc, 'part-1')
    expect(g.edges).toContainEqual({ from: 'param:width', to: 'param:height', kind: 'parameter' })
    expect(g.edges).toContainEqual({ from: 'sk-5', to: 'ext-21', kind: 'sketch' })
    expect(downstreamOf(doc, 'part-1', 'param:width').sort()).toEqual(['ext-21', 'param:height', 'sk-5'])
  })

  it('publishes a catalogue entry with a schema for every command', () => {
    const cat = commandCatalog()
    expect(cat.commands.map((c) => c.name)).toEqual(COMMANDS.map((c) => c.name))
    for (const c of cat.commands) {
      expect(c.input.type).toBe('object')
      expect(c.preconditions).toBeDefined()
      expect(c.errors.length).toBeGreaterThan(0)
    }
  })
})

describe('stable entity UUIDs', () => {
  it('derives RFC 9562 version-5 UUIDs (checked against a reference value) per document and entity', async () => {
    const { uuidV5, entityUuid } = await import('./model/uuid')
    // Reference: uuid v5 of "www.example.com" in the RFC DNS namespace.
    expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
    const a = entityUuid('00000000-0000-4000-8000-000000000001', 'part-1')
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(entityUuid('00000000-0000-4000-8000-000000000001', 'part-1')).toBe(a)
    expect(entityUuid('00000000-0000-4000-8000-000000000002', 'part-1')).not.toBe(a)
  })
})
