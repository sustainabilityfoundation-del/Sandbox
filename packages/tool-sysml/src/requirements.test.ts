import { sampleModel } from '@ews/platform-sdk/testing'
import { describe, expect, it } from 'vitest'
import { createRequirementChanges, diagramModel, textNotation } from './domain'
import { unreferencedRequirements, waitForObject } from './requirements'

describe('requirements in SysML', () => {
  const model = sampleModel()

  it('lists requirements not yet referenced by a usage, by key', () => {
    // SYS-005 and SYS-006 reference REQ-001 and REQ-002.
    expect(unreferencedRequirements(model).map((r) => r.id)).toEqual(['REQ-003'])
  })

  it('a usage stores only a reference: no statement on the SysML element', () => {
    const changes = createRequirementChanges(model.get('REQ-003')!)
    const add = changes.find((c) => c.kind === 'add-object')!
    expect(add.kind === 'add-object' && add.object.properties).toEqual({ kind: 'requirement' })
    expect(changes).toContainEqual({ kind: 'add-relationship', relationship: { type: 'references', from: '$req', to: 'REQ-003' } })
  })

  it('the text notation shows the canonical text read from the referenced requirement', () => {
    const text = textNotation(model, diagramModel(model))
    expect(text).toMatch(/requirement operatingLoad \{ {2}\/\/ SYS-005 references REQ-001/)
    expect(text).toContain('doc /* REQ-001 Operating load: The actuator shall withstand')
  })

  it('waits until a newly created object appears in the model, or times out', async () => {
    let current = model
    setTimeout(() => (current = { ...model, get: (id: string) => (id === 'NEW-1' ? model.get('REQ-001') : model.get(id)) } as typeof model), 120)
    expect(await waitForObject(() => current, 'NEW-1', 2000, 20)).toBeTruthy()
    expect(await waitForObject(() => model, 'MISSING', 100, 20)).toBeUndefined()
  })
})
