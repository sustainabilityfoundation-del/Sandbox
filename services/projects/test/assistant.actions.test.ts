import { applyTransaction, createDocument } from '@ews/cad-core'
import type { AssistantActionContext, ServiceProposal } from '@ews/platform-sdk'
import { createHttpProjectsService, getProjectsClient } from '@ews/projects-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { projectsAssistant } from '../../../apps/workspace/src/projects/assistant'
import { createTestEnv, idem, type TestEnv } from './helpers'

/**
 * D1-PM: the projects.* assistant operations run headless (no view mounted) against the real API and the real
 * module services; every change is a service proposal applied with the conversation's provenance.
 */
let env: TestEnv
let origin: string
beforeAll(async () => {
  env = await createTestEnv()
  origin = await env.listen()
})
afterAll(async () => env?.close())

const actions = projectsAssistant().actions
const run = (name: string, args: Record<string, unknown>, ctx: AssistantActionContext) => actions.find((a) => a.name === name)!.run(args, ctx)
const provenance = (n: number) => ({ conversationId: 'CONV-d1', proposalId: `PRP-${n}`, messageId: `MSG-${n}` })

function ctxFor(projectId: string, user = 'eli'): AssistantActionContext {
  const projects = createHttpProjectsService({ baseUrl: `${origin}/api/projects/v1`, devUser: user })
  return { model: undefined as never, artifacts: [], captured: { projectId, configurationId: 'CFG-BASE', scenarioId: '', modelRevision: 0, selectedIds: [] } as never, services: { projects } }
}

describe('projects.* assistant operations (headless, real services)', () => {
  it('creates a blank project, builds a product structure, lists artifacts and stores an exported file with provenance', async () => {
    // projects.create: validated on the server before the preview; nothing exists until Apply.
    const start = ctxFor('PRJ-ACT100')
    const proposal = (await run('projects.create', { name: 'Drill bit holder', disciplines: ['mechanical'], unitSystem: 'si' }, start)) as ServiceProposal
    expect(proposal.kind).toBe('service-proposal')
    expect(proposal.title).toContain('DBH')
    const before = await getProjectsClient(start.services!.projects!)!.listProjects({ q: 'Drill bit holder' })
    expect(before.total).toBe(0)
    const applied = await proposal.apply(provenance(1))
    const projectId = applied.createdIds![0]
    const audit = await env.pool.query(`SELECT source_kind, proposal_id FROM projects.audit_events WHERE project_id = $1 AND action = 'created'`, [projectId])
    expect(audit.rows[0]).toEqual({ source_kind: 'assistant', proposal_id: 'PRP-1' })
    // A duplicate key is refused before any preview is shown.
    await expect(run('projects.create', { name: 'Drill bit holder' }, start)).rejects.toThrow(/already used/)

    // projects.open proposes switching (applied by the window, not tested here) and refuses unknown projects.
    const open = (await run('projects.open', { project: 'DBH' }, start)) as ServiceProposal
    expect(open.title).toContain('DBH')
    await expect(run('projects.open', { project: 'NOPE' }, start)).rejects.toThrow(/No active project/)

    // Product structure in the new project.
    const ctx = ctxFor(projectId)
    const product = (await (await run('projects.create_product_element', { name: 'Bit holder', elementKind: 'product' }, ctx) as ServiceProposal).apply(provenance(2))).createdIds![0]
    const block = (await (
      (await run('projects.create_product_element', { name: 'Holder block', elementKind: 'part', parentId: product, properties: { mass: { value: 0.05, unit: 'kg' } } }, ctx)) as ServiceProposal
    ).apply(provenance(3))).createdIds![0]
    const clip = (await (await run('projects.create_product_element', { name: 'Belt clip', elementKind: 'part' }, ctx) as ServiceProposal).apply(provenance(4))).createdIds![0]
    await (await run('projects.add_breakdown_edge', { childId: clip, parentId: product, quantity: 1 }, ctx) as ServiceProposal).apply(provenance(5))
    await expect(run('projects.add_breakdown_edge', { childId: 'missing', parentId: product }, ctx)).rejects.toThrow(/No product element/)
    const client = getProjectsClient(ctx.services!.projects!)!
    const [bd] = await client.breakdowns(projectId)
    const tree = await client.breakdownTree(projectId, bd.id)
    expect(tree.roots[0].element?.name).toBe('Bit holder')
    expect(tree.roots[0].children.map((n) => n.element?.name).sort()).toEqual(['Belt clip', 'Holder block'])
    expect((await client.productElement(projectId, block)).properties).toEqual({ mass: { value: 0.05, unit: 'kg' } })

    // A CAD document in the project (real CAD service), indexed by the registry.
    const doc = applyTransaction(createDocument({ title: 'Holder block' }), {
      commands: [
        { command: 'create_part', input: { name: 'Block', ref: '$p' } },
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
        { command: 'add_rectangle', input: { sketchId: '$s', width: 60, height: 25 } },
        { command: 'extrude_profile', input: { sketchId: '$s', distance: 18 } },
      ],
    })
    if (!doc.ok) throw new Error(doc.error.message)
    expect((await env.call('eli', 'POST', `/api/cad/v1/projects/${projectId}/documents`, { document: doc.doc, message: 'first' }, idem())).status).toBe(201)
    let listed: { data: unknown } | undefined
    for (let i = 0; i < 50; i++) {
      await env.server.projectsRegistry()?.idle()
      listed = (await run('projects.list_artifacts', { module: 'cad' }, ctx)) as { data: unknown }
      if ((listed.data as unknown[]).length) break
      await new Promise((r) => setTimeout(r, 200))
    }
    const cadDoc = (listed!.data as { ref: { kind: string; id: string }; version: number }[]).find((a) => a.ref.kind === 'cad-document')!
    expect(cadDoc).toBeDefined()
    const all = (await run('projects.list_artifacts', {}, ctx)) as { data: { category: string }[] }
    expect(all.data.filter((a) => a.category === 'product-element')).toHaveLength(3)

    // projects.store_document: a STEP export with its provenance; linked to the CAD document it came from.
    const step = 'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
    const store = (await run(
      'projects.store_document',
      {
        title: 'Holder block STEP export',
        fileName: 'holder-block.step',
        mediaType: 'model/step',
        contentBase64: Buffer.from(step).toString('base64'),
        source: { module: 'cad', kind: 'cad-document', id: cadDoc.ref.id, revision: 1 },
        tool: { name: 'CAD Modeler', version: '0.1.0' },
        notes: 'STEP AP242, geometry only',
      },
      ctx,
    )) as ServiceProposal
    expect(store.preview.map((p) => p.label)).toEqual(['Document', 'File', 'Produced from', 'Produced by'])
    const storedId = (await store.apply(provenance(6))).createdIds![0]
    const stored = await client.transport.request<{ versions: { provenance?: { source?: { id: string; revision: number }; tool?: { name: string } } }[]; artifactId: string }>('GET', `/projects/${projectId}/documents/${storedId}`)
    expect(stored.data.versions[0].provenance).toMatchObject({ source: { module: 'cad', kind: 'cad-document', id: cadDoc.ref.id, revision: 1 }, tool: { name: 'CAD Modeler', version: '0.1.0' } })
    const links = await client.links(projectId, { artifactId: stored.data.artifactId })
    expect(links).toContainEqual(expect.objectContaining({ type: 'describes', to: { artifactId: expect.any(String), revision: '1' } }))
    const bytes = await env.call('eli', 'GET', `/api/projects/v1/projects/${projectId}/documents/${storedId}/versions/1/content`)
    expect(bytes.status).toBe(200)

    // Reads and proposals only ever touch the captured project (C13).
    const other = ctxFor('PRJ-ACT100')
    const otherList = (await run('projects.list_artifacts', { module: 'product' }, other)) as { data: { title: string }[] }
    expect(otherList.data.map((a) => a.title)).not.toContain('Holder block')
  })
})
