import { createHttpSysmlClient } from '@ews/sysml-client'
import { createSysmlModelerTool } from '@ews/tool-sysml-modeler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { D1_PRODUCT, D1_REQUIREMENT, runD1Sequence } from '../../../packages/tool-sysml-modeler/test/d1-sequence'
import { LIVE_PRODUCT, runLiveArchitecture } from '../../../packages/tool-sysml-modeler/test/live-architecture'
import { createTestEnv, type TestEnv } from '../../api/test/helpers'
import { createSysmlArtifactSource } from '../src/artifacts'
import { createSysmlEventHub } from '../src/events'
import { SysmlRepository } from '../src/repository'

/**
 * D1-SYS (demo-ai-engineering.md, step 4): the architecture step through the System Model assistant
 * operations, headless, over HTTP against the real API and PostgreSQL, in a NEW, empty platform project.
 * Then Project Management's view of the result through the SysML artifact source.
 */

let env: TestEnv
const D1 = 'PRJ-D1-ARCH'
let origin: string | undefined
const listen = async () => (origin ??= await env.listen())

beforeAll(async () => {
  env = await createTestEnv()
  await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ($1, 'eli', 'administrator')`, [D1])
})
afterAll(async () => env?.close())

describe('D1-SYS architecture step (API, PostgreSQL)', () => {
  it('runs headless through the assistant in a new platform project and validates without errors', async () => {
    const address = await listen()
    const client = createHttpSysmlClient({ baseUrl: `${address}/api/sysml/v1`, devUser: 'eli' })
    expect(await client.listProjects(D1)).toEqual([]) // a new platform project starts empty
    const tool = createSysmlModelerTool({ client })
    const out = await runD1Sequence(tool as never, D1)
    expect(out.validationErrors).toBe(0)
    expect(out.coverage).toEqual([expect.objectContaining({ status: 'satisfied' })])
    expect(out.steps.map((s) => s.split(':')[0])).toEqual(['create_project', 'propose_text', 'link_requirement', 'link_product_element', 'link_product_element'])

    // Every change is a commit with assistant provenance.
    const commits = await client.listCommits(out.sysmlProjectId)
    expect(commits.map((c) => c.source.kind)).toEqual(['assistant', 'assistant', 'assistant', 'assistant', 'assistant'])
    expect(commits[0].source).toMatchObject({ conversationId: 'd1' })

    // Project Management sees the elements and their links through the artifact source.
    const repo = new SysmlRepository(env.pool)
    const hub = await createSysmlEventHub(env.pool, { pollMs: 200 })
    try {
      const source = createSysmlArtifactSource(repo, hub)
      const listed = (await source.list(D1)).items
      const byKey = new Map(listed.map((d) => [d.key, d]))
      expect(byKey.get('Gripper::Functions::GraspPart')?.title).toBe('action def GraspPart')
      expect(byKey.get('Gripper::Physical::Gripper')?.relations).toContainEqual({ type: 'represents', to: { module: 'product', kind: 'product-element', id: D1_PRODUCT.gripper }, toRevision: 3 })
      expect(byKey.get('Gripper::Physical::gripper')?.relations?.some((r) => r.type === 'satisfies')).toBe(true)
      expect(byKey.get('Gripper::Requirements::gripForce')?.relations).toContainEqual({ type: 'stands-for', to: { module: 'requirements', kind: 'requirement', id: D1_REQUIREMENT.id }, toRevision: 2 })
    } finally {
      await hub.close()
    }
  })

  it('the live run architecture turn: one create_project proposal with links; commits carry assistant provenance', async () => {
    await env.pool.query(`INSERT INTO platform.project_memberships (project_id, user_id, role) VALUES ('PRJ-D1-LIVE', 'eli', 'administrator')`)
    const client = createHttpSysmlClient({ baseUrl: `${await listen()}/api/sysml/v1`, devUser: 'eli' })
    const out = await runLiveArchitecture(createSysmlModelerTool({ client }) as never, 'PRJ-D1-LIVE')
    expect(out.validationErrors).toBe(0)
    expect(out.coverage.map((c) => c.status)).toEqual(['satisfied', 'satisfied', 'satisfied'])
    const commits = await client.listCommits(out.sysmlProjectId)
    expect(commits.map((c) => c.source)).toEqual([expect.objectContaining({ kind: 'assistant', proposalId: 'CP-2' }), expect.objectContaining({ kind: 'assistant', conversationId: 'live', proposalId: 'CP-1' })])
    const text = (await env.call('eli', 'GET', `/api/sysml/v1/projects/${out.sysmlProjectId}/commits/${commits[0].id}/text`)).body.text as string
    expect(text).toContain(`productElementId = "${LIVE_PRODUCT}"`)
  })
})
