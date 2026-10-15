import { describe, expect, it } from 'vitest'
import { PROJECTS_CONTRACT_VERSION, type ProjectsService } from '@ews/platform-sdk'

/**
 * Contract test suite for every adapter of the SDK `ProjectsService` (HTTP against the real API, the in-memory
 * contract-test adapter). The factory supplies a project the adapter's user can read, one artifact in it and,
 * optionally, a way to create a committed change and wait for its event.
 */
export interface ProjectsContractFixture {
  service: ProjectsService
  projectId: string
  /** A native ref registered in that project. */
  knownRef: { module: string; kind: string; id: string }
  /** Makes a committed change in the project (for subscribe); omitted when the adapter has no events. */
  change?: () => Promise<void>
  /** Waits until committed events are delivered. */
  settle?: () => Promise<void>
}

export function defineProjectsServiceContract(name: string, factory: () => Promise<ProjectsContractFixture>) {
  describe(`ProjectsService contract: ${name}`, () => {
    it('declares its contract version and mode', async () => {
      const { service } = await factory()
      expect(service.contractVersion).toBe(PROJECTS_CONTRACT_VERSION)
      expect(['api', 'demo']).toContain(service.mode)
    })

    it('lists and gets projects with the caller’s role', async () => {
      const { service, projectId } = await factory()
      const page = await service.list({ state: 'all', limit: 200 })
      const listed = page.items.find((p) => p.id === projectId)
      expect(listed).toBeDefined()
      expect(['reader', 'editor', 'reviewer', 'administrator']).toContain(listed!.role)
      expect(await service.get(projectId)).toMatchObject({ id: projectId, key: listed!.key })
      expect(await service.get('00000000-0000-0000-0000-00000000dead')).toBeUndefined()
    })

    it('resolves registered refs and returns nothing for unknown ones', async () => {
      const { service, projectId, knownRef } = await factory()
      const [hit] = await service.resolve(projectId, [knownRef])
      expect(hit).toMatchObject({ ref: knownRef, availability: 'available' })
      expect(hit.artifactId).toMatch(/^[0-9a-f-]{36}$/)
      expect(await service.resolve(projectId, [{ ...knownRef, id: 'does-not-exist' }])).toEqual([])
      const page = await service.artifacts(projectId, { limit: 200 })
      expect(page.items.map((a) => a.artifactId)).toContain(hit.artifactId)
    })

    it('delivers committed changes of a project to its subscribers only', async () => {
      const fixture = await factory()
      if (!fixture.change) return
      const seen: string[] = []
      const off = fixture.service.subscribe(fixture.projectId, (e) => seen.push(e.projectId))
      try {
        await fixture.change()
        await fixture.settle?.()
        for (let i = 0; i < 50 && !seen.length; i++) await new Promise((r) => setTimeout(r, 100))
        expect(seen.length).toBeGreaterThan(0)
        expect(new Set(seen)).toEqual(new Set([fixture.projectId]))
      } finally {
        off()
      }
    })
  })
}
