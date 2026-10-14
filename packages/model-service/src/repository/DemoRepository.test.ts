import { describe, expect, it } from 'vitest'
import { outputFreshness } from '../domain/freshness'
import { buildModelIndex } from '../domain/modelIndex'
import type { OutputDraft } from '../domain/types'
import { compareWithBaseline } from '../domain/configuration'
import { DemoRepository, LEGACY_STORAGE_KEY, STORAGE_KEY, type StorageLike } from './DemoRepository'
import { legacyActivityV2, legacyModelV2, legacyOutputsV2 } from './__fixtures__/legacySeedV2'
import { PROJECT_ID } from './seed'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

/** Change metadata for a write made as a given module (writes are checked against artifact ownership). */
const as = (toolId: string) => ({ toolId, configurationId: 'CFG-BASE', summary: 'test change' })

function repo(storage = memoryStorage()) {
  return new DemoRepository({ storage, latencyMs: [0, 0] })
}

function artifactDraft(overrides: Partial<OutputDraft> = {}): OutputDraft {
  return {
    toolId: 'cad',
    kind: 'cad-representation',
    title: 'Rod representation snapshot',
    projectId: PROJECT_ID,
    configurationId: 'CFG-BASE',
    scenarioId: 'SCN-MAX',
    objectIds: ['ROD-120'],
    inputRevision: 6,
    inputs: [
      { id: 'ROD-120', revision: 2 },
      { id: 'SCN-MAX', revision: 3 },
    ],
    completion: 'complete',
    result: [{ key: 'diameter', label: 'Diameter', value: 25, unit: 'mm' }],
    summary: 'Ø25 mm',
    ...overrides,
  }
}

describe('DemoRepository', () => {
  it('bumps the model revision and the changed object revision', async () => {
    const r = repo()
    const result = await r.submitChanges(
      PROJECT_ID,
      [
        {
          kind: 'update-properties',
          targetId: 'SCN-MAX',
          baseRevision: 3,
          properties: { operatingLoad: { value: 13, unit: 'kN' } },
        },
      ],
      as('platform'),
    )
    expect(result.modelRevision).toBe(7)
    const scenario = result.snapshot.scenarios.find((s) => s.id === 'SCN-MAX')!
    expect(scenario.revision).toBe(7)
    expect(scenario.properties.operatingLoad).toEqual({ value: 13, unit: 'kN' })
  })

  it('rejects edits based on an outdated revision', async () => {
    const r = repo()
    const change = {
      kind: 'update-properties' as const,
      targetId: 'ROD-120',
      baseRevision: 2,
      properties: { diameter: { value: 26, unit: 'mm' } },
    }
    await r.submitChanges(PROJECT_ID, [change], as('cad'))
    await expect(r.submitChanges(PROJECT_ID, [change], as('cad'))).rejects.toMatchObject({ code: 'conflict' })
  })

  it('applies a batch atomically', async () => {
    const r = repo()
    await expect(
      r.submitChanges(
        PROJECT_ID,
        [
          { kind: 'add-relationship', relationship: { type: 'allocated-to', from: 'REQ-003', to: 'ROD-120' } },
          { kind: 'update-properties', targetId: 'NOPE', baseRevision: 1, properties: {} },
        ],
        as('requirements'),
      ),
    ).rejects.toMatchObject({ code: 'not-found' })
    const model = await r.loadModel(PROJECT_ID)
    expect(model.modelRevision).toBe(6)
    expect(model.relationships.some((x) => x.from === 'REQ-003' && x.to === 'ROD-120')).toBe(false)
  })

  it('saves outputs as drafts with new IDs and rejects unknown configurations or scenarios', async () => {
    const r = repo()
    const saved = await r.saveOutput(artifactDraft())
    expect(saved.id).toBe('OUT-0002')
    expect(saved.reviewStatus).toBe('draft')
    expect(saved.schemaVersion).toBe(1)
    await expect(r.saveOutput(artifactDraft({ configurationId: 'CFG-X' }))).rejects.toMatchObject({ code: 'invalid' })
    await expect(r.saveOutput(artifactDraft({ scenarioId: 'SCN-X' }))).rejects.toMatchObject({ code: 'invalid' })
    await expect(r.saveOutput(artifactDraft({ inputRevision: 99 }))).rejects.toMatchObject({ code: 'invalid' })
  })

  it('keeps old outputs and marks them potentially stale when an input changes', async () => {
    const r = repo()
    const saved = await r.saveOutput(artifactDraft())
    let model = buildModelIndex(await r.loadModel(PROJECT_ID))
    expect(outputFreshness(saved, model).stale).toBe(false)

    await r.submitChanges(
      PROJECT_ID,
      [{ kind: 'update-properties', targetId: 'SCN-MAX', baseRevision: 3, properties: { operatingLoad: { value: 14, unit: 'kN' } } }],
      as('platform'),
    )
    model = buildModelIndex(await r.loadModel(PROJECT_ID))
    const outputs = await r.listOutputs(PROJECT_ID)
    const after = outputs.find((o) => o.id === saved.id)!
    expect(after).toEqual(saved) // the snapshot itself is untouched
    expect(outputFreshness(after, model)).toMatchObject({ stale: true })
    // An output that depends on a different scenario is unaffected.
    expect(outputFreshness(outputs.find((o) => o.id === 'OUT-0001')!, model).stale).toBe(false) // depends on ROD-120 and CAD-120 only
  })

  it('persists changes and outputs across instances (page reloads)', async () => {
    const storage = memoryStorage()
    const first = repo(storage)
    await first.saveOutput(artifactDraft())
    await first.submitChanges(
      PROJECT_ID,
      [{ kind: 'add-relationship', relationship: { type: 'allocated-to', from: 'REQ-003', to: 'ROD-120' } }],
      as('requirements'),
    )
    const second = repo(storage)
    const model = await second.loadModel(PROJECT_ID)
    expect(model.relationships.some((x) => x.type === 'allocated-to' && x.from === 'REQ-003' && x.to === 'ROD-120')).toBe(true)
    expect((await second.listOutputs(PROJECT_ID)).map((o) => o.id)).toContain('OUT-0002')
    expect((await second.listActivity(PROJECT_ID))[0].message).toContain('test change (model rev 7)')
  })

  it('returns copies so callers cannot mutate stored data', async () => {
    const r = repo()
    const model = await r.loadModel(PROJECT_ID)
    model.objects[0].name = 'Mutated'
    expect((await r.loadModel(PROJECT_ID)).objects[0].name).not.toBe('Mutated')
  })

  it('fails every call while offline', async () => {
    const r = repo()
    r.offline = true
    await expect(r.loadModel(PROJECT_ID)).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('batches that create objects', () => {
  it('lets later changes refer to a new object through its placeholder', async () => {
    const r = repo()
    const result = await r.submitChanges(
      PROJECT_ID,
      [
        { kind: 'add-object', idPrefix: 'SYS', ref: '$part', object: { type: 'sysml-element', name: 'seal', parentId: 'SYS-001', properties: { kind: 'part' } } },
        { kind: 'add-relationship', relationship: { type: 'represents', from: '$part', to: 'HSG-110' } },
      ],
      as('sysml'),
    )
    expect(result.createdIds).toEqual(['SYS-007'])
    const model = buildModelIndex(result.snapshot)
    expect(model.linked('SYS-007', 'represents', 'out')).toEqual(['HSG-110'])
    expect(model.get('SYS-007')?.parentId).toBe('SYS-001')
  })

  it('rejects relationships to objects that do not exist, atomically', async () => {
    const r = repo()
    await expect(
      r.submitChanges(PROJECT_ID, [{ kind: 'add-relationship', relationship: { type: 'represents', from: '$missing', to: 'HSG-110' } }], as('sysml')),
    ).rejects.toMatchObject({ code: 'not-found' })
    expect((await r.loadModel(PROJECT_ID)).modelRevision).toBe(6)
  })
})

describe('upgrading data saved by version 0.1', () => {
  function legacyStorage() {
    const storage = memoryStorage()
    const legacy = { schema: 1, model: legacyModelV2(), outputs: legacyOutputsV2(), activity: legacyActivityV2() }
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy))
    return { storage, raw: storage.getItem(LEGACY_STORAGE_KEY) }
  }

  it('keeps every legacy object, relationship, artifact and activity entry', async () => {
    const { storage } = legacyStorage()
    const r = repo(storage)
    const model = await r.loadModel(PROJECT_ID)
    const legacy = legacyModelV2()
    for (const o of legacy.objects) expect(model.objects.find((x) => x.id === o.id)).toEqual(o)
    for (const rel of legacy.relationships) expect(model.relationships.find((x) => x.id === rel.id)).toEqual(rel)
    const outputs = await r.listOutputs(PROJECT_ID)
    for (const o of legacyOutputsV2()) expect(outputs.find((x) => x.id === o.id)).toEqual({ ...o, schemaVersion: 1 })
    const activity = await r.listActivity(PROJECT_ID)
    for (const a of legacyActivityV2()) expect(activity.find((x) => x.id === a.id)).toEqual(a)
  })

  it('adds SysML and CAD representations linked to the existing components, as one new revision', async () => {
    const { storage } = legacyStorage()
    const model = buildModelIndex(await repo(storage).loadModel(PROJECT_ID))
    expect(model.revision).toBe(7)
    expect(model.linked('ROD-120', 'represents', 'in').sort()).toEqual(['CAD-120', 'SYS-003'])
    // Representations point at the existing component; no second rod is created.
    expect(model.objects.filter((o) => o.type === 'part' && o.name === 'Rod')).toHaveLength(1)
    expect(model.get('SYS-003')?.revision).toBe(7)
    // Relationship IDs continue after the legacy ones instead of reusing them.
    const ids = model.relationships.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves the legacy entry untouched and stores the upgrade under the new key', () => {
    const { storage, raw } = legacyStorage()
    repo(storage)
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(raw)
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schema).toBe(3)
  })

  it('upgrades only once', async () => {
    const { storage } = legacyStorage()
    await repo(storage).submitChanges(
      PROJECT_ID,
      [{ kind: 'update-properties', targetId: 'CAD-120', baseRevision: 7, properties: { diameter: { value: 28, unit: 'mm' } } }],
      as('cad'),
    )
    const again = await repo(storage).loadModel(PROJECT_ID)
    expect(again.modelRevision).toBe(8)
    expect(again.objects.find((o) => o.id === 'CAD-120')?.properties.diameter).toEqual({ value: 28, unit: 'mm' })
  })
})

describe('module ownership and relationship rules', () => {
  it('lets each module change only what it owns', async () => {
    const r = repo()
    const editReq = { kind: 'update-properties' as const, targetId: 'REQ-001', baseRevision: 4, properties: { rationale: 'x' } }
    await expect(r.submitChanges(PROJECT_ID, [editReq], as('sysml'))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(r.submitChanges(PROJECT_ID, [editReq], as('requirements'))).resolves.toBeTruthy()
    const editRep = { kind: 'update-properties' as const, targetId: 'CAD-120', baseRevision: 5, properties: { length: { value: 650, unit: 'mm' } } }
    await expect(r.submitChanges(PROJECT_ID, [editRep], as('requirements'))).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('allows only the documented delegation from CAD to component geometry', async () => {
    const r = repo()
    const geometry = { kind: 'update-properties' as const, targetId: 'ROD-120', baseRevision: 2, properties: { diameter: { value: 26, unit: 'mm' } } }
    await expect(r.submitChanges(PROJECT_ID, [geometry], as('cad'))).resolves.toBeTruthy()
    const material = { kind: 'update-properties' as const, targetId: 'ROD-120', baseRevision: 7, properties: { material: 'Ti' } }
    await expect(r.submitChanges(PROJECT_ID, [material], as('cad'))).rejects.toMatchObject({ code: 'forbidden' })
    await expect(r.submitChanges(PROJECT_ID, [{ ...geometry, baseRevision: 7 }], as('sysml'))).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('lets the assistant act only on behalf of the modules named in the change', async () => {
    const r = repo()
    const edit = { kind: 'update-properties' as const, targetId: 'REQ-001', baseRevision: 4, properties: { status: 'draft' } }
    await expect(r.submitChanges(PROJECT_ID, [edit], { ...as('assistant'), onBehalfOf: ['cad'] })).rejects.toMatchObject({ code: 'forbidden' })
    await expect(r.submitChanges(PROJECT_ID, [edit], { ...as('assistant'), onBehalfOf: ['requirements'] })).resolves.toBeTruthy()
  })

  it('validates relationship semantics', async () => {
    const r = repo()
    const wrong = { kind: 'add-relationship' as const, relationship: { type: 'allocated-to' as const, from: 'REQ-001', to: 'REQ-002' } }
    await expect(r.submitChanges(PROJECT_ID, [wrong], as('requirements'))).rejects.toMatchObject({ code: 'invalid' })
    // Relationships belong to the module owning the `from` end.
    const link = { kind: 'add-relationship' as const, relationship: { type: 'allocated-to' as const, from: 'REQ-003', to: 'ROD-120' } }
    await expect(r.submitChanges(PROJECT_ID, [link], as('sysml'))).rejects.toMatchObject({ code: 'forbidden' })
  })
})

describe('revision history and baselines', () => {
  it('keeps every revision, so an exact revision can always be retrieved', async () => {
    const r = repo()
    await r.submitChanges(PROJECT_ID, [{ kind: 'update-properties', targetId: 'REQ-001', baseRevision: 4, properties: { statement: 'New text.' } }], as('requirements'))
    const old = await r.getRevision(PROJECT_ID, 'REQ-001', 4)
    expect((old.snapshot as { properties: Record<string, unknown> }).properties.statement).toContain('12 kN')
    const latest = await r.getRevision(PROJECT_ID, 'REQ-001', 7)
    expect(latest).toMatchObject({ changedBy: 'requirements', summary: 'test change' })
    expect((await r.listHistory(PROJECT_ID, 'REQ-001')).map((h) => h.revision)).toEqual([7, 4])
  })

  it('pins exact revisions in a baseline and reports what changed since', async () => {
    const r = repo()
    const baseline = await r.createBaseline(PROJECT_ID, { name: 'PDR', configurationId: 'CFG-BASE' }, { toolId: 'platform' })
    expect(baseline).toMatchObject({ id: 'BL-001', modelRevision: 6 })
    expect(baseline.objects.find((o) => o.id === 'REQ-001')).toEqual({ id: 'REQ-001', revision: 4 })
    await r.submitChanges(PROJECT_ID, [{ kind: 'update-properties', targetId: 'REQ-001', baseRevision: 4, properties: { statement: 'Changed.' } }], as('requirements'))
    const diff = compareWithBaseline(baseline, buildModelIndex(await r.loadModel(PROJECT_ID)))
    expect(diff.changed).toEqual([{ id: 'REQ-001', pinned: 4, current: 7 }])
    expect(diff.identical).toBe(false)
    // The pinned revision is still retrievable.
    expect(await r.getRevision(PROJECT_ID, 'REQ-001', 4)).toBeTruthy()
    await expect(r.createBaseline(PROJECT_ID, { name: 'pdr', configurationId: 'CFG-BASE' }, { toolId: 'platform' })).rejects.toMatchObject({ code: 'invalid' })
  })

  it('validates revision-qualified references on saved artifacts', async () => {
    const r = repo()
    await expect(r.saveOutput(artifactDraft({ references: [{ id: 'REQ-001', revision: 4, role: 'verifies' }] }))).resolves.toBeTruthy()
    await expect(r.saveOutput(artifactDraft({ references: [{ id: 'REQ-001', revision: 99, role: 'verifies' }] }))).rejects.toMatchObject({ code: 'invalid' })
    await expect(r.saveOutput(artifactDraft({ references: [{ id: 'BL-404', role: 'baseline' }] }))).rejects.toMatchObject({ code: 'invalid' })
  })

  it('upgrades schema 2 data in place by adding history, without changing stored records', () => {
    const storage = memoryStorage()
    const v2 = { schema: 2, model: buildModelIndex(repoSnapshot()).snapshot, outputs: [], activity: [] }
    storage.setItem(STORAGE_KEY, JSON.stringify(v2))
    repo(storage)
    const stored = JSON.parse(storage.getItem(STORAGE_KEY)!)
    expect(stored.schema).toBe(3)
    expect(stored.model).toEqual(v2.model)
    expect(stored.history.length).toBe(v2.model.objects.length + v2.model.scenarios.length)
    expect(stored.baselines).toEqual([])
  })
})

function repoSnapshot() {
  return JSON.parse(JSON.stringify(new DemoRepository({ latencyMs: [0, 0] })['db'].model))
}

describe('externally owned objects', () => {
  it('lets twin links and artifacts reference registered external objects without storing them', async () => {
    const repo = new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] })
    const uuid = '5b1c7e2a-0004-4e6a-9c1d-6f0a3d2b1004'
    await expect(
      repo.submitChanges(PROJECT_ID, [{ kind: 'add-relationship', relationship: { type: 'references', from: 'SYS-006', to: uuid } }], { toolId: 'sysml', configurationId: 'CFG-BASE', summary: 'x' }),
    ).rejects.toMatchObject({ code: 'not-found' })
    repo.registerExternalObjects([{ id: uuid, type: 'requirement', revision: 2 }])
    await repo.submitChanges(PROJECT_ID, [{ kind: 'add-relationship', relationship: { type: 'references', from: 'SYS-006', to: uuid } }], { toolId: 'sysml', configurationId: 'CFG-BASE', summary: 'x' })
    const model = await repo.loadModel(PROJECT_ID)
    expect(model.relationships.some((r) => r.to === uuid)).toBe(true)
    expect(model.objects.some((o) => o.id === uuid)).toBe(false)
    const out = await repo.saveOutput({
      kind: 'verification-record', title: 't', toolId: 'requirements', projectId: PROJECT_ID, configurationId: 'CFG-BASE', scenarioId: null,
      inputRevision: model.modelRevision, objectIds: [uuid], inputs: [{ id: uuid, revision: 2 }], references: [{ id: uuid, revision: 2, role: 'verifies' }],
      completion: 'complete', result: [], summary: 's',
    })
    expect(out.objectIds).toEqual([uuid])
  })
})

describe('baselines with externally owned objects', () => {
  it('pins external revisions in place of the legacy twin objects they replace', async () => {
    const repo = new DemoRepository({ storage: memoryStorage(), latencyMs: [0, 0] })
    const uuid = '5b1c7e2a-0001-4e6a-9c1d-6f0a3d2b1001'
    const model = await repo.loadModel(PROJECT_ID)
    const draft = { name: 'With requirements', configurationId: 'CFG-BASE', external: { objects: [{ id: uuid, revision: 7 }], replaces: ['REQ-001'], relationships: model.relationships } }
    await expect(repo.createBaseline(PROJECT_ID, draft, { toolId: 'platform' })).rejects.toMatchObject({ code: 'invalid' })
    repo.registerExternalObjects([{ id: uuid, type: 'requirement', revision: 7 }])
    const baseline = await repo.createBaseline(PROJECT_ID, draft, { toolId: 'platform' })
    expect(baseline.objects).toContainEqual({ id: uuid, revision: 7 })
    expect(baseline.objects.some((o) => o.id === 'REQ-001')).toBe(false)
  })
})
