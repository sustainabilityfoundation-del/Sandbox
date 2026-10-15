import { describe, expect, it } from 'vitest'
import { createLocalSysmlClient, LOCAL_SEED_PROJECT_ID } from './local'
import { createSysmlModelService } from './service'

describe('SysmlModelService (proposed SDK 1.8 PlatformServices.sysml, CR-SYSML-01)', () => {
  it('lists projects, finds elements and resolves pinned and latest references; foreign and missing refs are "missing"', async () => {
    const client = createLocalSysmlClient({ seed: true })
    const service = createSysmlModelService(client)
    expect(service.mode).toBe('demo')
    const [project] = await service.listProjects('PRJ-ACT100')
    expect(project).toMatchObject({ id: LOCAL_SEED_PROJECT_ID, platformProjectId: 'PRJ-ACT100', revision: 1 })
    expect(await service.listProjects('PRJ-EMPTY')).toEqual([])

    const [rod] = await service.find('PRJ-ACT100', { text: 'Rod', metaclass: 'PartDefinition' })
    expect(rod).toMatchObject({ metaclass: 'PartDefinition', name: 'Rod', qualifiedName: 'ActuatorSystem::Mechanical::Rod', revision: 1, latestRevision: 1 })
    expect(rod.ref).toEqual({ module: 'sysml', kind: 'sysml-model-element', id: `${LOCAL_SEED_PROJECT_ID}/${rod.elementId}` })

    // A new commit: the pinned reference still reads revision 1, the latest one reads revision 2.
    const p = await client.getProject(LOCAL_SEED_PROJECT_ID)
    const b = await client.getBranch(p.id, p.defaultBranchId)
    await client.transact(p.id, b.id, { baseCommitId: b.headCommitId!, commands: [{ op: 'rename', elementId: rod.elementId, name: 'PushRod' }] })
    const [pinned, latest, missing, foreign] = await service.resolve('PRJ-ACT100', [
      { ...rod.ref, revision: 1 },
      rod.ref,
      { module: 'sysml', kind: 'sysml-model-element', id: `${p.id}/00000000-0000-4000-8000-000000000000` },
      { module: 'sysml', kind: 'sysml-model-element', id: `${p.id}/${rod.elementId}`, revision: 99 },
    ])
    expect(pinned).toMatchObject({ status: 'resolved', element: { name: 'Rod', revision: 1, latestRevision: 2 } })
    expect(latest).toMatchObject({ status: 'resolved', element: { name: 'PushRod', revision: 2 } })
    expect(missing.status).toBe('missing')
    expect(foreign.status).toBe('missing')
    // The same reference asked for in another platform project is missing (C13).
    expect((await service.resolve('PRJ-OTHER', [rod.ref]))[0].status).toBe('missing')
  })
})
