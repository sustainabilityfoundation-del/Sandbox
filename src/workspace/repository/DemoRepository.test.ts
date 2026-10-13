import { describe, expect, it } from 'vitest'
import { outputFreshness } from '../domain/freshness'
import { buildModelIndex } from '../domain/modelIndex'
import type { OutputDraft } from '../domain/types'
import { assess, readInputs } from '../tools/analysis/assessment'
import { DemoRepository, type StorageLike } from './DemoRepository'
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

const meta = { toolId: 'test', configurationId: 'CFG-BASE', summary: 'test change' }

function repo(storage = memoryStorage()) {
  return new DemoRepository({ storage, latencyMs: [0, 0] })
}

function analysisDraft(overrides: Partial<OutputDraft> = {}): OutputDraft {
  return {
    toolId: 'analysis',
    kind: 'structural-assessment',
    title: 'Rod buckling assessment',
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
    result: [{ key: 'margin', label: 'Margin', value: 0.095, unit: '-' }],
    summary: 'MS +0.10',
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
      meta,
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
      properties: { designFactor: { value: 2.5, unit: '-' } },
    }
    await r.submitChanges(PROJECT_ID, [change], meta)
    await expect(r.submitChanges(PROJECT_ID, [change], meta)).rejects.toMatchObject({ code: 'conflict' })
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
        meta,
      ),
    ).rejects.toMatchObject({ code: 'not-found' })
    const model = await r.loadModel(PROJECT_ID)
    expect(model.modelRevision).toBe(6)
    expect(model.relationships.some((x) => x.from === 'REQ-003' && x.to === 'ROD-120')).toBe(false)
  })

  it('saves outputs as drafts with new IDs and rejects unknown configurations or scenarios', async () => {
    const r = repo()
    const saved = await r.saveOutput(analysisDraft())
    expect(saved.id).toBe('OUT-0003')
    expect(saved.reviewStatus).toBe('draft')
    await expect(r.saveOutput(analysisDraft({ configurationId: 'CFG-X' }))).rejects.toMatchObject({ code: 'invalid' })
    await expect(r.saveOutput(analysisDraft({ scenarioId: 'SCN-X' }))).rejects.toMatchObject({ code: 'invalid' })
    await expect(r.saveOutput(analysisDraft({ inputRevision: 99 }))).rejects.toMatchObject({ code: 'invalid' })
  })

  it('keeps old outputs and marks them potentially stale when an input changes', async () => {
    const r = repo()
    const saved = await r.saveOutput(analysisDraft())
    let model = buildModelIndex(await r.loadModel(PROJECT_ID))
    expect(outputFreshness(saved, model).stale).toBe(false)

    await r.submitChanges(
      PROJECT_ID,
      [{ kind: 'update-properties', targetId: 'SCN-MAX', baseRevision: 3, properties: { operatingLoad: { value: 14, unit: 'kN' } } }],
      meta,
    )
    model = buildModelIndex(await r.loadModel(PROJECT_ID))
    const outputs = await r.listOutputs(PROJECT_ID)
    const after = outputs.find((o) => o.id === saved.id)!
    expect(after).toEqual(saved) // the snapshot itself is untouched
    expect(outputFreshness(after, model)).toMatchObject({ stale: true })
    // An output that depends on a different scenario is unaffected.
    expect(outputFreshness(outputs.find((o) => o.id === 'OUT-0001')!, model).stale).toBe(false)
  })

  it('persists changes and outputs across instances (page reloads)', async () => {
    const storage = memoryStorage()
    const first = repo(storage)
    await first.saveOutput(analysisDraft())
    await first.submitChanges(
      PROJECT_ID,
      [{ kind: 'add-relationship', relationship: { type: 'evidence-for', from: 'OUT-0003', to: 'VP-001' } }],
      meta,
    )
    const second = repo(storage)
    const model = await second.loadModel(PROJECT_ID)
    expect(model.relationships.some((x) => x.type === 'evidence-for' && x.from === 'OUT-0003')).toBe(true)
    expect((await second.listOutputs(PROJECT_ID)).map((o) => o.id)).toContain('OUT-0003')
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

describe('demo assessment', () => {
  it('matches the seeded nominal result and gives a positive margin at maximum load', async () => {
    const model = buildModelIndex(await repo().loadModel(PROJECT_ID))
    const rod = model.get('ROD-120')!
    const nominal = readInputs(rod, model.scenario('SCN-NOM')!)
    const maximum = readInputs(rod, model.scenario('SCN-MAX')!)
    expect(nominal.inputs && maximum.inputs).toBeTruthy()
    const nom = assess(nominal.inputs!)
    expect(nom.criticalLoadKN).toBeCloseTo(26.28, 2)
    expect(nom.allowableLoadKN).toBeCloseTo(13.14, 2)
    expect(nom.margin).toBeCloseTo(0.643, 3)
    const max = assess(maximum.inputs!)
    expect(max.margin).toBeGreaterThan(0)
    expect(max.margin).toBeLessThan(0.15)
  })

  it('reports missing inputs instead of guessing', async () => {
    const model = buildModelIndex(await repo().loadModel(PROJECT_ID))
    const result = readInputs(model.get('HSG-110')!, model.scenario('SCN-MAX')!)
    expect(result.inputs).toBeNull()
    expect(result.missing.length).toBeGreaterThan(0)
  })
})
