import { createLocalSysmlClient } from '@ews/sysml-client'
import { representations, serialize } from '@ews/sysml-core'
import { describe, expect, it } from 'vitest'
import { createSysmlModelerTool } from '.'
import { LIVE_CP16_TEXT, LIVE_PRODUCT, LIVE_REQUIREMENTS, liveContext, runLiveArchitecture } from '../test/live-architecture'

/**
 * The live D1 run's architecture turn (transcript CP-16): the model created a SysML project with its
 * text but no requirement or product links, because those needed separate follow-up proposals after
 * Apply. With the improved operations, one create_project proposal carries the model, the requirement
 * allocations and the represents links; errors say what to do next.
 */

describe('live D1 architecture turn (model-like sequence)', () => {
  it('one create_project proposal creates parts, functions, allocations, requirement links and the represents link', async () => {
    const client = createLocalSysmlClient({})
    const tool = createSysmlModelerTool({ client })
    const out = await runLiveArchitecture(tool as never, 'PRJ-LIVE')
    expect(out.validationErrors).toBe(0)
    expect(out.created.proposal.preview.map((p) => p.label)).toEqual(['Create SysML project', 'Initial model', 'Link', 'Link', 'Link'])
    expect(out.created.applied.summary).toMatch(/projectId [0-9a-f-]{36}\) with 3 link\(s\)\. Next: propose_text/)
    expect(out.coverage.map((c) => c.status)).toEqual(['satisfied', 'satisfied', 'satisfied'])
    expect(out.coverage.map((c) => c.managedRequirementId).sort()).toEqual([LIVE_REQUIREMENTS[0].id, LIVE_REQUIREMENTS[1].id, '9a7d3c11-2b4e-4f6a-8c0d-112233445566'].sort())
    // Both commits carry assistant provenance (the creation used to be recorded as a user commit).
    const commits = await client.listCommits(out.sysmlProjectId)
    expect(commits.map((c) => c.source.kind)).toEqual(['assistant', 'assistant'])
    expect(commits[1].source).toMatchObject({ kind: 'assistant', conversationId: 'live', proposalId: 'CP-1' })
    const p = await client.getProject(out.sysmlProjectId)
    const model = await client.loadModel(p.id, (await client.getBranch(p.id, p.defaultBranchId)).headCommitId!)
    expect(representations(model).map((r) => r.ref)).toEqual([{ module: 'product', kind: 'product-element', id: LIVE_PRODUCT, revision: 1 }])
    expect(serialize(model)).toContain('allocate carryAndPresentBits to body;')
  })

  it('refuses clearly: a product element not applied yet, an unknown requirement, a wrong element name, invalid text, no model yet', async () => {
    const tool = createSysmlModelerTool({ client: createLocalSysmlClient({}) })
    const ctx = liveContext('PRJ-LIVE-2')
    const run = (name: string, args: Record<string, unknown>) => Promise.resolve().then(() => tool.assistant!.actions.find((a) => a.name === `sysml-modeler.${name}`)!.run(args, ctx))
    await expect(run('create_project', { name: 'x', initialText: LIVE_CP16_TEXT, productElements: [{ element: 'BitHolderArchitecture::BitHolder', productElement: 'PE-001' }] })).rejects.toThrow(/UUID.*appl/)
    await expect(run('create_project', { name: 'x', initialText: LIVE_CP16_TEXT, productElements: [{ element: 'BitHolderArchitecture::BitHolder', productElement: '00000000-0000-4000-8000-000000000000' }] })).rejects.toThrow(/does not know product element.*apply that proposal first/)
    await expect(run('create_project', { name: 'x', initialText: LIVE_CP16_TEXT, requirements: [{ requirement: 'REQ-999', satisfiedBy: ['BitHolderArchitecture::holder'] }] })).rejects.toThrow(/No managed requirement REQ-999/)
    await expect(run('create_project', { name: 'x', initialText: LIVE_CP16_TEXT, requirements: [{ requirement: 'REQ-001', satisfiedBy: ['BitHolderArchitecture::Holder'] }] })).rejects.toThrow(/Did you mean: .*BitHolderArchitecture::holder/)
    await expect(run('create_project', { name: 'x', initialText: 'package A { part x : Nope; }' })).rejects.toThrow(/not valid SysML.*line 1/)
    await expect(run('validate', {})).rejects.toThrow(/create_project/)
  })
})
