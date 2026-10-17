import { serialize } from '@ews/sysml-core'
import { describe, expect, it } from 'vitest'
import { applyOutcome } from './apply'
import { SysmlClientError, type SysmlClient, type SysmlEvent } from './types'

/**
 * Contract test suite for SysmlClient adapters (HTTP and local must behave alike).
 * `setup` returns a client and a platform project the client's user may edit.
 */
export function defineSysmlClientContract(name: string, setup: () => Promise<{ client: SysmlClient; platformProjectId: string }>) {
  describe(`SysmlClient contract: ${name}`, () => {
    const fresh = async () => {
      const { client, platformProjectId } = await setup()
      const project = await client.createProject({ name: `Contract ${Date.now()}`, platformProjectId, initialText: 'package C { part def Motor { attribute power : ScalarValues::Real = 300; } part def Drive { part motor : Motor; } }' })
      const branch = await client.getBranch(project.id, project.defaultBranchId)
      return { client, project, branch }
    }

    it('creates a project with branch main and an initial commit; loads its model', async () => {
      const { client, project, branch } = await fresh()
      expect(branch.name).toBe('main')
      const commits = await client.listCommits(project.id)
      expect(commits.map((c) => c.number)).toEqual([1])
      const model = await client.loadModel(project.id, branch.headCommitId!)
      expect(serialize(model)).toContain('part def Motor')
      expect((await client.listProjects(project.platformProjectId)).map((p) => p.id)).toContain(project.id)
    })

    it('dry-runs and commits typed commands with provenance; the outcome updates a loaded model incrementally', async () => {
      const { client, project, branch } = await fresh()
      const before = await client.loadModel(project.id, branch.headCommitId!)
      const cmds = [{ op: 'createElement' as const, ownerId: 'C', kind: 'PartDefinition' as const, name: 'Battery' }]
      const dry = await client.transact(project.id, branch.id, { commands: cmds, dryRun: true })
      expect(dry.commit).toBeUndefined()
      expect((await client.getBranch(project.id, branch.id)).headCommitId).toBe(branch.headCommitId)
      const done = await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: cmds, source: { kind: 'assistant', proposalId: 'p1' } })
      expect(done.commit).toMatchObject({ number: 2, source: { kind: 'assistant', proposalId: 'p1' } })
      expect(done.summaryText).toBe('Created C::Battery')
      const local = applyOutcome(before, done)
      const fetched = await client.loadModel(project.id, done.commit!.id)
      expect(serialize(local)).toBe(serialize(fetched))
    })

    it('refuses invalid commands, stale overlapping changes and unchecked writes', async () => {
      const { client, project, branch } = await fresh()
      const bad = await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: [{ op: 'rename', elementId: 'C::Nope', name: 'X' }] }).catch((e) => e)
      expect(bad).toBeInstanceOf(SysmlClientError)
      expect(bad.code).toBe('not-found')
      await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: [{ op: 'setValue', elementId: 'C::Motor::power', expression: '400' }] })
      const stale = await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: [{ op: 'setValue', elementId: 'C::Motor::power', expression: '500' }] }).catch((e) => e)
      expect(stale.code).toBe('conflict')
      const rebased = await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: [{ op: 'rename', elementId: 'C::Drive', name: 'Drivetrain' }] })
      expect(rebased.rebased).toBe(true)
      const rejected = await client.transact(project.id, branch.id, { baseCommitId: rebased.commit!.id, commands: [{ op: 'setTyping', elementId: 'C::Drivetrain::motor', typeIds: ['ScalarValues::Real'] }], validationPolicy: 'reject-new-errors' }).catch((e) => e)
      expect(rejected.code).toBe('rejected')
    })

    it('undoes a commit with a compensating commit', async () => {
      const { client, project, branch } = await fresh()
      const done = await client.transact(project.id, branch.id, { baseCommitId: branch.headCommitId!, commands: [{ op: 'createElement', ownerId: 'C', kind: 'PartDefinition', name: 'Temp' }] })
      const undo = await client.revert(project.id, done.commit!.id, branch.id)
      expect(undo.commit?.source).toMatchObject({ revertedCommitId: done.commit!.id })
      expect(serialize(await client.loadModel(project.id, undo.commit!.id))).not.toContain('Temp')
    })

    it('reports validation, describes commands, and notifies committed changes', async () => {
      const { client, project, branch } = await fresh()
      expect((await client.validation(project.id, branch.headCommitId!)).counts.error).toBe(0)
      expect((await client.describeCommands()).commands.map((c) => c.op)).toContain('applyText')
      const events: SysmlEvent[] = []
      const off = client.subscribe(project.id, (e) => events.push(e))
      // Deterministic under load: the subscription may connect after a commit, so commit again until an
      // event of a commit made while subscribed arrives (generous deadline), instead of a fixed sleep.
      let base = branch.headCommitId!
      const deadline = Date.now() + 45000
      let n = 0
      const committed = () => events.some((e) => e.type === 'sysml.commit-created' && (e.commitNumber ?? 0) >= 2)
      while (!committed() && Date.now() < deadline) {
        const out = await client.transact(project.id, branch.id, { baseCommitId: base, commands: [{ op: 'setDocumentation', elementId: 'C', text: `Contract ${++n}.` }] })
        base = out.commit!.id
        const until = Date.now() + 2000
        while (!committed() && Date.now() < until) await new Promise((r) => setTimeout(r, 50))
      }
      off()
      expect(committed()).toBe(true)
    })

    it('branches and tags', async () => {
      const { client, project, branch } = await fresh()
      const b2 = await client.createBranch(project.id, 'variant-a', branch.headCommitId!)
      await client.transact(project.id, b2.id, { baseCommitId: b2.headCommitId!, commands: [{ op: 'rename', elementId: 'C::Motor', name: 'Engine' }] })
      expect(serialize(await client.loadModel(project.id, (await client.getBranch(project.id, branch.id)).headCommitId!))).toContain('Motor')
      const tag = await client.createTag(project.id, 'v1', branch.headCommitId!)
      expect((await client.listTags(project.id)).map((t) => t.id)).toContain(tag.id)
    })
  })
}
