import { readSysmlElement } from '@ews/platform-sdk'
import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import { connectionKind, createPartChanges, diagramModel, identifier, layoutDiagram, textNotation } from './domain'

const model = sampleModel()
const d = diagramModel(model)
const el = (id: string) => readSysmlElement(model.get(id)!)

describe('SysML diagram model', () => {
  it('groups parts under their definition and lists requirement usages', () => {
    expect(d.definitions.map((e) => e.id)).toEqual(['SYS-001'])
    expect(d.usagesOf('SYS-001').map((e) => e.name)).toEqual(['housing', 'rod', 'motor'])
    expect(d.requirements.map((e) => e.id)).toEqual(['SYS-005', 'SYS-006'])
    expect(layoutDiagram(d).boxes.size).toBe(6)
  })

  it('allows connections from parts only, and makes part → requirement a satisfy link', () => {
    expect(connectionKind(el('SYS-004'), el('SYS-003'))).toEqual({ kind: 'connects' })
    expect(connectionKind(el('SYS-003'), el('SYS-005'))).toEqual({ kind: 'satisfies' })
    expect(connectionKind(el('SYS-005'), el('SYS-003'))).toHaveProperty('error')
    expect(connectionKind(el('SYS-003'), el('SYS-003'))).toHaveProperty('error')
  })

  it('creates a part linked to an existing component rather than a new component', () => {
    const changes = createPartChanges({ name: 'seal', ownerId: 'SYS-001', representsId: 'HSG-110' })
    expect(changes[0]).toMatchObject({ kind: 'add-object', object: { type: 'sysml-element', parentId: 'SYS-001' } })
    expect(changes[1]).toMatchObject({ kind: 'add-relationship', relationship: { type: 'represents', from: '$part', to: 'HSG-110' } })
  })

  it('generates illustrative text notation from the model', () => {
    const text = textNotation(model, d)
    expect(text).toContain('Illustrative')
    expect(text).toContain('part def ActuatorSystem')
    expect(text).toContain('part rod : Rod;')
    expect(text).toContain('connect motor to rod;')
    expect(text).toContain('satisfy operatingLoad by rod;')
  })

  it('turns display names into identifiers', () => {
    expect(identifier('Ingress protection')).toBe('ingressProtection')
    expect(identifier('  ')).toBe('element')
  })
})
