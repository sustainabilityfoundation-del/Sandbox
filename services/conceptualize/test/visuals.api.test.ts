import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BASE, assistant, createTestEnv, expectConforms, idem, type TestEnv } from './helpers'

/**
 * Visual concept exploration (concept-visualization-contracts.md): engineering definition with stable IDs,
 * visual revisions pinned to Concept revisions, annotations bound to one revision, generation records, and
 * derived staleness. A generic wall bracket is used here (product data stays out of the product logic).
 */
let env: TestEnv
beforeAll(async () => {
  env = await createTestEnv()
})
afterAll(async () => {
  await env?.close()
})

const post = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'POST', `${BASE}${path}`, body, idem(headers))
const patch = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'PATCH', `${BASE}${path}`, body, idem(headers))
const put = (path: string, body: unknown, user = 'eli', headers: Record<string, string> = {}) => env.call(user, 'PUT', `${BASE}${path}`, body, idem(headers))
const get = (path: string, user = 'rho') => env.call(user, 'GET', `${BASE}${path}`)

const BRACKET = {
  intent: 'Hold a 2 kg shelf on a wall',
  components: [
    { name: 'Wall plate', kind: 'part' },
    { name: 'Arm', kind: 'part' },
  ],
  parameters: [
    { symbol: 'plate_h', name: 'Plate height', value: 80, unit: 'mm' },
    { symbol: 'arm_l', name: 'Arm length', value: 120, unit: 'mm' },
    { symbol: 'thk', name: 'Thickness', value: 4, unit: 'mm' },
  ],
}
const withLayout = (def: { components: { id: string }[]; parameters: { id: string; symbol: string }[] }) => {
  const [plate, arm] = def.components
  const pid = (s: string) => def.parameters.find((p) => p.symbol === s)!.id
  return {
    view: 'side',
    items: [
      { componentId: plate.id, x: 0, y: 0, width: { parameter: pid('thk') }, height: { parameter: pid('plate_h') } },
      { componentId: arm.id, x: 4, y: 0, width: { parameter: pid('arm_l') }, height: 10 },
    ],
    dimensions: [
      { parameterId: pid('plate_h'), componentId: plate.id, axis: 'y' },
      { parameterId: pid('arm_l'), componentId: arm.id, axis: 'x' },
    ],
  }
}

async function bracket(name = 'Wall bracket') {
  const c = await post('/concepts', { name, definition: BRACKET })
  expect(c.status, JSON.stringify(c.body)).toBe(201)
  const def = c.body.definition
  const r = await patch(`/concepts/${c.body.id}`, { expectedRevision: 1, stage: 'layout', definition: { ...stripIds(def, false), layout: withLayout(def) }, reason: 'Layout' })
  expect(r.status, JSON.stringify(r.body)).toBe(200)
  return r.body
}
const stripIds = (def: Record<string, unknown>, _drop: boolean) => ({ intent: def.intent, components: def.components, relationships: def.relationships, interfaces: def.interfaces, parameters: def.parameters })

describe('engineering definition', () => {
  it('assigns stable IDs, keeps them across revisions and never reuses one', async () => {
    const c = await post('/concepts', { name: 'Bracket IDs', definition: BRACKET })
    expect(c.status).toBe(201)
    expect(c.body.stage).toBe('exploration')
    expect(c.body.definition.components.map((x: { id: string }) => x.id)).toEqual(['C1', 'C2'])
    expect(c.body.definition.parameters.map((x: { id: string }) => x.id)).toEqual(['P3', 'P4', 'P5'])
    expect(c.body.definition.parameters[0]).toMatchObject({ symbol: 'plate_h', value: 80, unit: 'mm', basis: 'user-assertion', componentId: null })
    await expectConforms(env, 'createConcept', 201, c.body)
    // Remove C2 and add a component: it gets C6, not C2.
    const d = c.body.definition
    const r = await patch(`/concepts/${c.body.id}`, { expectedRevision: 1, definition: { components: [d.components[0], { name: 'Brace' }], parameters: d.parameters } })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.revision).toBe(2)
    expect(r.body.definition.components.map((x: { id: string }) => x.id)).toEqual(['C1', 'C6'])
    const old = await get(`/concepts/${c.body.id}?revision=1`)
    expect(old.body.definition.components.map((x: { id: string }) => x.id)).toEqual(['C1', 'C2'])
  })

  it('refuses broken references, bad units and verification claims; the assistant cannot assert but can carry a person’s values', async () => {
    const bad = await post('/concepts', { name: 'Bad', definition: { components: [{ name: 'A' }], relationships: [{ type: 'drives', from: 'C1', to: 'C9' }], parameters: [{ symbol: 'w', value: 3, unit: 'furlongs/s' }, { symbol: 'q', unit: 'mm' }] } })
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.body.error.details.fields)).toEqual(expect.arrayContaining(['definition.relationships[0].to', 'definition.parameters[0].unit', 'definition.parameters[1].value']))
    const verified = await post('/concepts', { name: 'Verified?', definition: { parameters: [{ symbol: 'w', value: 3, unit: 'mm', basis: 'evidence' }] } })
    expect(verified.status).toBe(400)
    const c = await post('/concepts', { name: 'Carry', definition: BRACKET })
    const asserted = await patch(`/concepts/${c.body.id}`, { expectedRevision: 1, definition: { ...c.body.definition, idSeq: undefined, layout: undefined, parameters: [...c.body.definition.parameters, { symbol: 'gap', value: 2, unit: 'mm', basis: 'user-assertion' }] } }, 'eli', assistant())
    expect(asserted.status).toBe(422)
    const carried = await patch(`/concepts/${c.body.id}`, { expectedRevision: 1, definition: { components: c.body.definition.components, parameters: [...c.body.definition.parameters, { symbol: 'gap', value: 2, unit: 'mm' }] } }, 'eli', assistant())
    expect(carried.status, JSON.stringify(carried.body)).toBe(200)
    expect(carried.body.definition.parameters.map((p: { basis: string }) => p.basis)).toEqual(['user-assertion', 'user-assertion', 'user-assertion', 'ai-hypothesis'])
    const layoutBad = await patch(`/concepts/${c.body.id}`, { expectedRevision: 2, definition: { components: c.body.definition.components, parameters: c.body.definition.parameters, layout: { items: [{ componentId: 'C1', x: 0, y: 0, width: { parameter: 'P9' }, height: -1 }], dimensions: [{ parameterId: 'P3', componentId: 'C2', axis: 'x' }] } } })
    expect(layoutBad.status).toBe(422)
    expect(Object.keys(layoutBad.body.error.details.fields)).toEqual(expect.arrayContaining(['definition.layout.items[0].width', 'definition.layout.items[0].height', 'definition.layout.dimensions[0].componentId']))
  })
})

describe('visuals, annotations and staleness', () => {
  it('creates a layout visual pinned to the Concept revision; reserved kinds and layouts without structure are refused', async () => {
    const plain = await post('/concepts', { name: 'No layout', definition: BRACKET })
    const noLayout = await post('/visuals', { conceptId: plain.body.id, kind: 'layout' })
    expect(noLayout.status).toBe(422)
    expect(noLayout.body.error.message).toMatch(/drawn only from structured data/)
    expect((await post('/visuals', { conceptId: plain.body.id, kind: 'envelope-3d' })).body.error.message).toMatch(/reserved/)

    const c = await bracket()
    const v = await post('/visuals', { conceptId: c.id, kind: 'layout' })
    expect(v.status, JSON.stringify(v.body)).toBe(201)
    expect(v.body).toMatchObject({ kind: 'layout', revision: 1, conceptRevision: 2, view: 'side', notToScale: false, generation: null, annotations: [], staleness: { outdated: false, currentConceptRevision: 2, changes: [] } })
    expect(v.body.key).toMatch(/^VIS-\d{3}$/)
    await expectConforms(env, 'createVisual', 201, v.body)
    // An illustration is never to scale.
    const ill = await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'Side view sketch of a wall bracket' })
    expect(ill.body.notToScale).toBe(true)
  })

  it('marks dependent visuals possibly outdated when a parameter changes, without regenerating anything', async () => {
    const c = await bracket('Staleness bracket')
    const layout = (await post('/visuals', { conceptId: c.id, kind: 'layout' })).body
    const ill = (await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'sketch' })).body
    // Intent change: the illustration may be outdated, the layout is not.
    const def = c.definition
    const r3 = await patch(`/concepts/${c.id}`, { expectedRevision: 2, definition: { ...def, idSeq: undefined, intent: 'Hold a 3 kg shelf' } })
    expect(r3.status, JSON.stringify(r3.body)).toBe(200)
    expect((await get(`/visuals/${layout.id}`)).body.staleness.outdated).toBe(false)
    expect((await get(`/visuals/${ill.id}`)).body.staleness).toMatchObject({ outdated: true, changes: [{ area: 'intent' }] })
    // Parameter change: both possibly outdated, with the exact parameter.
    const params = r3.body.definition.parameters.map((p: { symbol: string; value: number }) => (p.symbol === 'arm_l' ? { ...p, value: 150 } : p))
    const r4 = await patch(`/concepts/${c.id}`, { expectedRevision: 3, definition: { ...r3.body.definition, idSeq: undefined, parameters: params } })
    expect(r4.status).toBe(200)
    const stale = (await get(`/visuals/${layout.id}`)).body
    expect(stale.revision).toBe(1)
    expect(stale.conceptRevision).toBe(2)
    expect(stale.staleness).toMatchObject({ outdated: true, currentConceptRevision: 4, changes: [{ area: 'parameter', change: 'changed', label: 'arm_l = 150 mm' }] })
    const deps = await get(`/concepts/${c.id}/dependents`)
    expect(deps.status).toBe(200)
    expect(deps.body.dependents.filter((d: { staleness: { outdated: boolean } }) => d.staleness.outdated).map((d: { id: string }) => d.id).sort()).toEqual([layout.id, ill.id].sort())
    await expectConforms(env, 'listConceptDependents', 200, deps.body)
    const downstream = await get(`/concepts/${c.id}/staleness?revision=2&purpose=downstream`)
    expect(downstream.body).toMatchObject({ outdated: true, changes: [{ area: 'parameter' }] })
    expect((await get(`/concepts/${c.id}/staleness?revision=4`)).body.outdated).toBe(false)
    // A new layout revision pinned to the current Concept revision is current again.
    const re = await post(`/visuals/${layout.id}/revisions`, { expectedRevision: 1, reason: 'Re-render after arm length change' })
    expect(re.status, JSON.stringify(re.body)).toBe(201)
    expect(re.body).toMatchObject({ revision: 2, conceptRevision: 4, staleness: { outdated: false } })
  })

  it('binds annotations to one exact revision with structured component IDs and never carries them forward', async () => {
    const c = await bracket('Annotated bracket')
    const v = (await post('/visuals', { conceptId: c.id, kind: 'layout' })).body
    const pin = await post(`/visuals/${v.id}/revisions/1/annotations`, { shape: 'pin', x: 0.6, y: 0.2, instruction: 'Make the arm shorter', componentId: 'C2' })
    expect(pin.status, JSON.stringify(pin.body)).toBe(201)
    expect(pin.body).toMatchObject({ number: 1, revision: 1, componentId: 'C2', componentBasis: 'structured', width: null })
    await expectConforms(env, 'addVisualAnnotation', 201, pin.body)
    const rect = await post(`/visuals/${v.id}/revisions/1/annotations`, { shape: 'rect', x: 0, y: 0, width: 0.2, height: 0.9, instruction: 'Thicker plate here' }, 'eli', assistant())
    expect(rect.body).toMatchObject({ number: 2, shape: 'rect', componentId: null, provenance: { sourceKind: 'assistant' } })
    expect((await post(`/visuals/${v.id}/revisions/1/annotations`, { shape: 'rect', x: 0.9, y: 0, width: 0.2, height: 0.5, instruction: 'x' })).status).toBe(422)
    expect((await post(`/visuals/${v.id}/revisions/1/annotations`, { shape: 'pin', x: 0.5, y: 0.5, instruction: 'x', componentId: 'C99' })).status).toBe(422)
    // Refinement: new Concept revision, new visual revision answering the pin. The annotations stay on revision 1.
    const params = c.definition.parameters.map((p: { symbol: string; value: number }) => (p.symbol === 'arm_l' ? { ...p, value: 100 } : p))
    const r = await patch(`/concepts/${c.id}`, { expectedRevision: c.revision, definition: { ...c.definition, idSeq: undefined, parameters: params }, reason: 'Annotation 1: make the arm shorter' })
    const v2 = await post(`/visuals/${v.id}/revisions`, { expectedRevision: 1, conceptRevision: r.body.revision, refinedFrom: [pin.body.id], instruction: 'Make the arm shorter' })
    expect(v2.status).toBe(201)
    expect(v2.body).toMatchObject({ revision: 2, annotations: [], refinedFrom: [pin.body.id] })
    const first = await get(`/visuals/${v.id}?revision=1`)
    expect(first.body.annotations.map((a: { number: number }) => a.number)).toEqual([1, 2])
    expect((await get(`/visuals/${v.id}/revisions`)).body.map((x: { revision: number; annotations: unknown[] }) => [x.revision, x.annotations.length])).toEqual([[1, 2], [2, 0]])
    // On an illustration a component is an inference; the assistant cannot claim a person named it.
    const ill = (await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'sketch' })).body
    const inferred = await post(`/visuals/${ill.id}/revisions/1/annotations`, { shape: 'pin', x: 0.3, y: 0.3, instruction: 'this hinge', componentId: 'C1' }, 'eli', assistant())
    expect(inferred.body.componentBasis).toBe('inferred')
    expect((await post(`/visuals/${ill.id}/revisions/1/annotations`, { shape: 'pin', x: 0.3, y: 0.3, instruction: 'x', componentId: 'C1', componentBasis: 'structured' })).status).toBe(422)
    expect((await post(`/visuals/${ill.id}/revisions/1/annotations`, { shape: 'pin', x: 0.3, y: 0.3, instruction: 'x', componentId: 'C1', componentBasis: 'user' }, 'eli', assistant())).status).toBe(422)
  })

  it('records generation per illustration: a failure or refusal never affects a sibling; layouts are never generated', async () => {
    const c = await bracket('Generated bracket')
    const a = (await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'A' })).body
    const b = (await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'B' })).body
    const sha = 'a'.repeat(64)
    expect((await put(`/visuals/${a.id}/revisions/1/generation`, { jobId: 'job-a', state: 'pending', adapter: 'fake-test', model: 'fake-1' })).status).toBe(200)
    expect((await put(`/visuals/${a.id}/revisions/1/generation`, { jobId: 'job-a', state: 'succeeded' })).status).toBe(422)
    const done = await put(`/visuals/${a.id}/revisions/1/generation`, { jobId: 'job-a', state: 'succeeded', adapter: 'fake-test', model: 'fake-1', assetId: 'asset-1', assetSha256: sha, mediaType: 'image/svg+xml', testAsset: true })
    expect(done.body.generation).toMatchObject({ state: 'succeeded', assetId: 'asset-1', testAsset: true })
    await expectConforms(env, 'recordVisualGeneration', 200, done.body)
    const failed = await put(`/visuals/${b.id}/revisions/1/generation`, { jobId: 'job-b', state: 'failed', error: { code: 'provider-rate-limit', message: 'Rate limited', retryable: true } })
    expect(failed.body.generation).toMatchObject({ state: 'failed', error: { code: 'provider-rate-limit', retryable: true } })
    expect((await get(`/visuals/${a.id}`)).body.generation.state).toBe('succeeded')
    // Another job for the same revision is refused (a new request is a new revision).
    expect((await put(`/visuals/${b.id}/revisions/1/generation`, { jobId: 'job-other', state: 'pending' })).status).toBe(422)
    const retried = await put(`/visuals/${b.id}/revisions/1/generation`, { jobId: 'job-b', state: 'running', attempt: 2 })
    expect(retried.body.generation).toMatchObject({ state: 'running', attempt: 2 })
    const refusedVisual = (await post('/visuals', { conceptId: c.id, kind: 'illustration', instruction: 'C' })).body
    const refused = await put(`/visuals/${refusedVisual.id}/revisions/1/generation`, { state: 'refused', error: { code: 'not-connected', message: 'No AI account is connected.' } })
    expect(refused.body.generation).toMatchObject({ state: 'refused', jobId: null, assetId: null })
    const layout = (await post('/visuals', { conceptId: c.id, kind: 'layout' })).body
    expect((await put(`/visuals/${layout.id}/revisions/1/generation`, { jobId: 'x', state: 'pending' })).status).toBe(422)
    // Everything is kept: list shows all four with their states.
    const list = await get(`/visuals?conceptId=${c.id}`)
    expect(list.body.map((v: { kind: string; generation: { state: string } | null }) => [v.kind, v.generation?.state ?? null])).toEqual([
      ['illustration', 'succeeded'],
      ['illustration', 'running'],
      ['illustration', 'refused'],
      ['layout', null],
    ])
  })
})
