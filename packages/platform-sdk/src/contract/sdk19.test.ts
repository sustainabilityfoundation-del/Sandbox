import { describe, expect, it } from 'vitest'
import {
  FILES_CONTRACT_VERSION,
  SDK_VERSION,
  createMemoryFilesService,
  isSdkCompatible,
  type ConceptDefinitionSummary,
  type ConceptHandoffSummary,
  type ConceptRevisionStaleness,
  type ConceptsService,
  type ConceptsEventType,
  type PlatformServices,
} from '../index'

describe('SDK 1.9 additive contract', () => {
  it('is an additive minor version', () => {
    expect(SDK_VERSION).toBe('1.14.0')
    expect(isSdkCompatible('^1.8.0')).toBe(true)
    expect(isSdkCompatible('^1.9.0')).toBe(true)
    expect(isSdkCompatible('^1.10.0')).toBe(true)
    expect(isSdkCompatible('^1.11.0')).toBe(true)
    expect(isSdkCompatible('^1.13.0')).toBe(true)
    expect(isSdkCompatible('^1.14.0')).toBe(true)
    expect(isSdkCompatible('^1.15.0')).toBe(false)
  })

  it('keeps the new ConceptsService members optional (older hosts stay valid)', () => {
    const older: ConceptsService = {
      contractVersion: '1.0.0',
      mode: 'demo',
      get: async () => undefined,
      list: async () => ({ items: [] }),
      conceptsForArtifact: async () => [],
      implementations: async () => [],
      subscribe: () => () => undefined,
    }
    expect(older.getDefinition).toBeUndefined()
    expect(older.getHandoff).toBeUndefined()
    expect(older.listHandoffs).toBeUndefined()
    expect(older.revisionStaleness).toBeUndefined()
    const services: PlatformServices = { concepts: older }
    expect(services.files).toBeUndefined()
  })

  it('types the definition, handoff and staleness members as specified', async () => {
    const staleness: ConceptRevisionStaleness = { outdated: true, currentConceptRevision: 3, changes: [{ area: 'parameter', id: 'PAR-1', change: 'changed', label: 'Width' }] }
    const definition: ConceptDefinitionSummary = {
      intent: 'Hold the part',
      components: [{ id: 'CMP-1', name: 'Bracket', kind: 'part', basis: 'user-assertion' }],
      interfaces: [],
      parameters: [{ id: 'PAR-1', symbol: 'w', name: 'Width', value: 40, min: null, max: null, unit: 'mm', basis: 'user-assertion', componentId: 'CMP-1', constraintId: null }],
    }
    const handoff: ConceptHandoffSummary = {
      id: 'h1',
      key: 'HND-001',
      projectId: 'p',
      conceptId: 'c',
      conceptRevision: 2,
      target: 'cad',
      package: { schema: 'conceptualize.cad-handoff/1', unresolved: [{ kind: 'missing-definition', text: 'none', ref: null }] },
      staleness,
      createdAt: '2026-10-16T00:00:00Z',
    }
    const concepts: Pick<ConceptsService, 'getDefinition' | 'getHandoff' | 'listHandoffs' | 'revisionStaleness'> = {
      getDefinition: async (id, scope) => (id === 'c' && scope.projectId === 'p' ? definition : undefined),
      getHandoff: async (id) => (id === 'h1' ? handoff : undefined),
      listHandoffs: async (conceptId) => (conceptId === 'c' ? [handoff] : []),
      revisionStaleness: async (_c, revision, scope) => (revision === 2 && scope.purpose === 'handoff' ? staleness : undefined),
    }
    expect((await concepts.getDefinition!('c', { projectId: 'p' }))?.parameters[0]?.unit).toBe('mm')
    expect(await concepts.getDefinition!('x', { projectId: 'p' })).toBeUndefined()
    expect((await concepts.getHandoff!('h1', { projectId: 'p' }))?.package.schema).toBe('conceptualize.cad-handoff/1')
    expect(await concepts.listHandoffs!('c', { projectId: 'p' })).toHaveLength(1)
    expect((await concepts.revisionStaleness!('c', 2, { projectId: 'p', purpose: 'handoff' }))?.outdated).toBe(true)
  })

  it('names the new Conceptualize event types', () => {
    const types: ConceptsEventType[] = ['visual.created', 'visual.revised', 'visual.annotated', 'visual.generation-changed', 'handoff.created']
    expect(new Set(types).size).toBe(5)
  })
})

describe('SDK 1.9 FilesService (CR-PM-SDK-4)', () => {
  it('stages, describes, reads and discards a file with its provenance and SHA-256', async () => {
    const files = createMemoryFilesService()
    expect(files.contractVersion).toBe(FILES_CONTRACT_VERSION)
    const bytes = new TextEncoder().encode('abc')
    const staged = await files.stage({ bytes, fileName: 'a.step', mediaType: 'model/step', provenance: { source: { module: 'cad', kind: 'cad-document', id: 'D1', revision: 4 }, tool: { name: 'cad-modeler.export', version: '1' } } })
    expect(staged.byteSize).toBe(3)
    expect(staged.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(staged.provenance?.source?.revision).toBe(4)
    expect(files.describe(staged.handle)).toEqual(staged)
    expect(Array.from(await files.read(staged.handle))).toEqual([97, 98, 99])
    files.discard(staged.handle)
    expect(files.describe(staged.handle)).toBeUndefined()
    await expect(files.read(staged.handle)).rejects.toThrow(/No staged file/)
  })

  it('isolates staged bytes from later changes to the caller buffer', async () => {
    const files = createMemoryFilesService()
    const bytes = new Uint8Array([1, 2, 3])
    const staged = await files.stage({ bytes, fileName: 'b.bin', mediaType: 'application/octet-stream' })
    bytes[0] = 9
    expect(Array.from(await files.read(staged.handle))).toEqual([1, 2, 3])
  })
})
