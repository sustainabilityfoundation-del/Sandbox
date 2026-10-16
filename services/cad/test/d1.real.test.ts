import { randomBytes } from 'node:crypto'
import { CadEngine, createDocument, type CadDocument, type CommandCall } from '@ews/cad-core'
import { sharedNodeKernel } from '@ews/cad-kernel/node'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createHttpCadClient } from '../../../packages/cad-client/src'
import { createHttpConceptsService, getConceptsModuleClient } from '../../../packages/conceptualize-client/src'
import { runChecks } from '../../../packages/tool-cad-modeler/src/checks'

/**
 * D1 on the real stack: the CAD check reads constraint bounds through the real Conceptualize
 * getConstraint (HTTP, SDK 1.8), measures a stored CAD revision, and the result is recorded as
 * evidence through the real Conceptualize API (basis estimate, CAD source at its revision, tool and
 * kernel version). Conceptualize computes each status from the bound on its own; both sides must agree.
 * Fixture: a generic block with hexagonal pockets.
 */

let env: TestEnv
let origin = ''
const PROJECT = 'PRJ-ACT100'
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
}, 180_000)
afterAll(async () => env?.close())

const assistant = { sourceKind: 'assistant' as const, conversationId: 'c-d1-real', proposalId: 'p-d1-real' }

function model(afId: string, afRevision: number): CommandCall[] {
  return [
    { command: 'create_part', input: { name: 'Block', ref: '$p' } },
    { command: 'create_parameter', input: { partId: '$p', name: 'af', expression: '7' } },
    { command: 'create_parameter', input: { partId: '$p', name: 'pitch', expression: '12' } },
    { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
    { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 20 } },
    { command: 'extrude_profile', input: { sketchId: '$s', distance: 20 } },
    { command: 'create_sketch', input: { partId: '$p', plane: 'XY', offset: 20, ref: '$h' } },
    { command: 'add_regular_polygon', input: { sketchId: '$h', center: [12, 10], sides: 6, size: { acrossFlats: 'af' }, rotation: 30 } },
    { command: 'extrude_profile', input: { sketchId: '$h', distance: 12, direction: 'reverse', operation: 'cut', ref: '$pocket' } },
    { command: 'pattern_linear', input: { features: ['$pocket'], direction: 'x', count: 4, spacing: 'pitch' } },
    { command: 'bind_parameter', input: { partId: '$p', name: 'af', ref: { module: 'conceptualize', kind: 'constraint', id: afId, revision: afRevision }, quantity: 'pocket across flats' } },
  ]
}

describe('D1: CAD check against real Conceptualize constraints, recorded as evidence', () => {
  it('reads bounds through getConstraint, measures a stored revision, and Conceptualize agrees with the statuses', async () => {
    const concepts = createHttpConceptsService({ baseUrl: `${origin}/api/concepts/v1`, devUser: 'eli' })
    const mc = getConceptsModuleClient(concepts, PROJECT)!
    const af = await mc.createConstraint({ kind: 'dimensional', statement: 'Pocket across flats 6.5–7.5 mm', bound: { symbol: 'af', operator: 'in-range', quantity: { min: 6.5, max: 7.5, unit: 'mm' } }, status: 'active' } as never, { idempotencyKey: randomBytes(6).toString('hex') })
    const wall = await mc.createConstraint({ kind: 'dimensional', statement: 'Wall between pockets at least 2 mm', bound: { symbol: 't', operator: '>=', quantity: { value: 2, unit: 'mm' } }, status: 'active' } as never, { idempotencyKey: randomBytes(6).toString('hex') })

    // CAD model, stored as revision 1 in the CAD service.
    const engine = new CadEngine({ kernel: await sharedNodeKernel(), document: createDocument({ title: 'Real-stack block' }) })
    const r = await engine.execute({ commands: model(af.id, af.revision) })
    if (!r.ok) throw new Error(r.error.message)
    const cad = createHttpCadClient({ baseUrl: `${origin}/api/cad/v1`, devUser: 'eli' })
    const stored = await cad.create(PROJECT, engine.document as CadDocument, { idempotencyKey: randomBytes(6).toString('hex') })
    expect(stored.summary.revision).toBe(1)
    const regen = (await engine.regenerate())!
    const pattern = engine.document.parts[0].features.find((f) => f.type === 'pattern-linear')!.id

    const report = await runChecks(engine.document, regen, {
      projectId: PROJECT,
      concepts,
      requests: [{ measure: { kind: 'pattern-gap', featureId: pattern }, constraint: { id: wall.id } }],
      storedRevision: 1,
      unsavedChanges: false,
      toolVersion: 'test',
    })
    const afResult = report.results.find((x) => x.quantity === 'parameter af')!
    const gapResult = report.results.find((x) => x.quantity.startsWith('pattern'))!
    expect(afResult).toMatchObject({ status: 'satisfied', measured: { value: 7, unit: 'mm' }, bound: { constraint: { id: af.id, revision: 1 }, key: af.key, operator: 'in-range', min: 6.5, max: 7.5 }, documentRevision: 1 })
    expect(gapResult).toMatchObject({ status: 'satisfied', bound: { key: wall.key, operator: '>=', value: 2 } })
    expect(gapResult.measured!.value).toBeCloseTo(12 - 7, 6)
    expect(report.kernel.version).toBeTruthy()

    // Record the check as evidence (what conceptualize.record_evidence submits).
    const ev = report.evidence!
    expect(ev).toMatchObject({ basis: 'estimate', source: { module: 'cad', kind: 'cad-modeler-entity', revision: 1 }, tool: { name: expect.stringMatching(/CAD Modeler check/) } })
    const recorded = await mc.createEvidence(
      {
        subjects: ev.subjects.map((id) => ({ module: 'conceptualize', type: 'constraint', id })),
        kind: ev.kind,
        title: ev.title,
        summary: ev.summary,
        basis: ev.basis,
        source: ev.source,
        tool: ev.tool,
        results: ev.results.map((x) => ({ name: x.name, value: x.value, unit: x.unit, qualification: { kind: 'point' }, constraint: { module: 'conceptualize', type: 'constraint', id: x.constraintId }, note: x.note })),
      } as never,
      { provenance: assistant, idempotencyKey: randomBytes(6).toString('hex') },
    )
    const statuses = (recorded as unknown as { results: { name: string; status: string | null }[] }).results.map((x) => [x.name, x.status])
    expect(statuses).toEqual(ev.results.map((x) => [x.name, report.results.find((y) => y.quantity === x.name)!.status]))
    expect(recorded).toMatchObject({ basis: 'estimate', source: { module: 'cad', revision: 1 }, tool: ev.tool })

    // The constraint is revised: the next check uses revision 2 and reports the outdated binding.
    await mc.updateConstraint(af.id, { bound: { symbol: 'af', operator: 'in-range', quantity: { min: 7.2, max: 7.8, unit: 'mm' } } } as never, { expectedRevision: af.revision, idempotencyKey: randomBytes(6).toString('hex') })
    const again = await runChecks(engine.document, regen, { projectId: PROJECT, concepts, storedRevision: 1, unsavedChanges: false })
    expect(again.results.find((x) => x.quantity === 'parameter af')).toMatchObject({ status: 'violated', bound: { constraint: { revision: 2 }, latestRevision: 2, min: 7.2 } })
    expect(again.assumptions.some((a) => a.includes(`bound to ${af.key} revision 1`))).toBe(true)
  })
})
