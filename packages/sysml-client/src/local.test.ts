import { describe, expect, it } from 'vitest'
import { serialize } from '@ews/sysml-core'
import { defineSysmlClientContract } from './contractTests'
import { LOCAL_SEED_PROJECT_ID, createLocalSysmlClient, type StorageLike } from './local'

defineSysmlClientContract('local adapter', async () => ({ client: createLocalSysmlClient(), platformProjectId: 'PRJ-TEST' }))

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('local adapter specifics', () => {
  it('seeds the actuator example and persists commits to the given storage', async () => {
    const storage = memory()
    const a = createLocalSysmlClient({ seed: true, storage })
    const p = await a.getProject(LOCAL_SEED_PROJECT_ID)
    const b = await a.getBranch(p.id, p.defaultBranchId)
    const done = await a.transact(p.id, b.id, { baseCommitId: b.headCommitId!, commands: [{ op: 'rename', elementId: 'ActuatorSystem::Mechanical::Rod', name: 'PistonRod' }] })
    // A second client on the same storage restores the history exactly.
    const c = createLocalSysmlClient({ seed: true, storage })
    const head = (await c.getBranch(p.id, b.id)).headCommitId!
    expect(head).toBe(done.commit!.id)
    expect(serialize(await c.loadModel(p.id, head))).toBe(serialize(await a.loadModel(p.id, head)))
    const undo = await c.revert(p.id, head, b.id)
    expect(serialize(await c.loadModel(p.id, undo.commit!.id))).toContain('part def Rod')
  })
})
