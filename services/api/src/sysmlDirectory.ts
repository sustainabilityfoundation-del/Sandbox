import type { Pool } from 'pg'
import type { SysmlElementDirectory } from '@ews/requirements-service'
import { SysmlRepository, createSysmlArtifactSource, type SysmlEventHub } from '@ews/sysml-service'

/**
 * Host adapter (D1, requirements.allocate): validates System Model elements as Requirements allocation
 * targets, in process, through the SysML module's own read path (its ArtifactSource `describe`, which
 * answers for named elements at the default-branch head). The Requirements service never reads the
 * `sysml` schema itself.
 */
export function sysmlElementDirectory(pool: Pool): SysmlElementDirectory {
  // describe() needs no events; subscribe() is never called on this instance.
  const noEvents = { subscribeAll: () => () => undefined } as unknown as SysmlEventHub
  const source = createSysmlArtifactSource(new SysmlRepository(pool), noEvents)
  return {
    description: 'System Model, default-branch heads',
    async lookup(projectId, ids) {
      const refs = [...new Set(ids)].filter((id) => /^[^/]+\/[^/]+$/.test(id)).map((id) => ({ module: 'sysml', kind: 'sysml-model-element', id }))
      if (!refs.length) return new Map()
      const found = await source.describe(projectId, refs)
      return new Map(
        found
          .filter((d) => d.ref.kind === 'sysml-model-element')
          .map((d) => [d.ref.id, { id: d.ref.id, name: d.title, ...(d.moduleState ? { metaclass: d.moduleState } : {}), revision: Number(d.version.value) }]),
      )
    },
  }
}
