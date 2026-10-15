import { findElements, summarize, type Model } from '@ews/sysml-core'
import { SysmlClientError, type CommitInfo, type ProjectInfo, type SysmlClient } from './types'

/**
 * Read client for other modules (CR-SYSML-01, proposed SDK 1.8 `PlatformServices.sysml`). The types below
 * are the exact proposal for `packages/platform-sdk/src/contract/sysml.ts` (framework-free, no
 * @ews/sysml-core types); `createSysmlModelService(client)` implements them over the SysML client, so the
 * host can expose it as `services.sysml` when the SDK declares the field. Read-only: changes stay with
 * the SysML Modeler's commands.
 *
 * References follow C3 / CR-SYSML-02: `{ module: 'sysml', kind: 'sysml-model-element',
 * id: '<sysmlProjectId>/<elementId>', revision?: <commit number on the project's default branch> }`.
 * With `revision` the element is read at that commit (pinned); without it, at the default-branch head.
 */

export const SYSML_SERVICE_CONTRACT_VERSION = '1.0.0'

export interface SysmlElementRef {
  module: 'sysml'
  kind: 'sysml-model-element'
  /** `<sysmlProjectId>/<elementId>` */
  id: string
  /** Commit number on the project's default branch; absent = follow the latest. */
  revision?: number
}

export interface SysmlProjectSummary {
  /** SysML project UUID. */
  id: string
  name: string
  platformProjectId: string
  /** Head commit number of the default branch. */
  revision: number
}

export interface SysmlElementSummary {
  ref: SysmlElementRef
  sysmlProjectId: string
  elementId: string
  /** KerML/SysML metaclass, e.g. 'PartDefinition'. */
  metaclass: string
  name?: string
  shortName?: string
  /** Display text, not identity. */
  qualifiedName?: string
  /** Types (usages) or generals (definitions), by qualified name. */
  types: string[]
  documentation?: string
  /** Commit number the summary was read at. */
  revision: number
  /** Head commit number of the default branch now (a pinned ref is stale when lower and the element changed since). */
  latestRevision: number
}

export type SysmlResolution =
  | { status: 'resolved'; ref: SysmlElementRef; element: SysmlElementSummary }
  /** The project, commit or element does not exist (any more) in this platform project. */
  | { status: 'missing'; ref: SysmlElementRef }
  /** The caller may not read it (no tool:sysml, or not a member). */
  | { status: 'forbidden'; ref: SysmlElementRef }

export interface SysmlModelEvent {
  eventId: string
  sysmlProjectId: string
  type: 'project-created' | 'commit-created' | 'tag-created' | 'branch-created'
  /** Commit number for commit events. */
  revision?: number
  occurredAt: string
}

export interface SysmlModelService {
  readonly contractVersion: string
  /** 'api': the PostgreSQL-backed service. 'demo': the explicit in-browser repository. */
  readonly mode: 'api' | 'demo'
  /** SysML projects of a platform project. */
  listProjects(platformProjectId: string): Promise<SysmlProjectSummary[]>
  /** Resolves references; never throws for missing or forbidden ones. Refs of other platform projects are 'missing'. */
  resolve(platformProjectId: string, refs: SysmlElementRef[]): Promise<SysmlResolution[]>
  /** Element search at the default-branch heads (definitions and usages by name, qualified name or short name). */
  find(platformProjectId: string, query: { text?: string; metaclass?: string; sysmlProjectId?: string; limit?: number }): Promise<SysmlElementSummary[]>
  /** Committed changes of the platform project's SysML projects (after commit, at least once; dedupe by eventId). */
  subscribe(platformProjectId: string, listener: (event: SysmlModelEvent) => void): () => void
}

export function createSysmlModelService(client: SysmlClient): SysmlModelService {
  const heads = new Map<string, { project: ProjectInfo; head: CommitInfo }>()

  async function projectsOf(platformProjectId: string): Promise<ProjectInfo[]> {
    return client.listProjects(platformProjectId)
  }

  async function headOf(project: ProjectInfo): Promise<CommitInfo> {
    const branch = await client.getBranch(project.id, project.defaultBranchId)
    const head = await client.getCommit(project.id, branch.headCommitId!)
    heads.set(project.id, { project, head })
    return head
  }

  async function commitByNumber(project: ProjectInfo, n: number): Promise<CommitInfo | undefined> {
    const commits = await client.listCommits(project.id, { branchId: project.defaultBranchId, limit: 500 })
    return commits.find((c) => c.number === n)
  }

  function summary(model: Model, project: ProjectInfo, elementId: string, revision: number, latest: number, pinned: boolean): SysmlElementSummary | undefined {
    const s = summarize(model, elementId)
    if (!s || model.isLibrary(elementId)) return undefined
    return {
      ref: { module: 'sysml', kind: 'sysml-model-element', id: `${project.id}/${elementId}`, ...(pinned ? { revision } : {}) },
      sysmlProjectId: project.id,
      elementId,
      metaclass: s.metaclass,
      ...(s.name ? { name: s.name } : {}),
      ...(s.shortName ? { shortName: s.shortName } : {}),
      ...(s.qualifiedName ? { qualifiedName: s.qualifiedName } : {}),
      types: s.types ?? s.generals ?? [],
      ...(s.documentation ? { documentation: s.documentation } : {}),
      revision,
      latestRevision: latest,
    }
  }

  return {
    contractVersion: SYSML_SERVICE_CONTRACT_VERSION,
    mode: client.mode === 'api' ? 'api' : 'demo',

    async listProjects(platformProjectId) {
      const out: SysmlProjectSummary[] = []
      for (const p of await projectsOf(platformProjectId)) out.push({ id: p.id, name: p.name, platformProjectId: p.platformProjectId, revision: (await headOf(p)).number })
      return out
    },

    async resolve(platformProjectId, refs) {
      let projects: ProjectInfo[]
      try {
        projects = await projectsOf(platformProjectId)
      } catch (e) {
        if (e instanceof SysmlClientError && (e.code === 'forbidden' || e.code === 'unauthenticated')) return refs.map((ref) => ({ status: 'forbidden' as const, ref }))
        throw e
      }
      const byId = new Map(projects.map((p) => [p.id, p]))
      const out: SysmlResolution[] = []
      for (const ref of refs) {
        const [pid, eid] = ref.module === 'sysml' && ref.kind === 'sysml-model-element' ? ref.id.split('/') : []
        const project = pid ? byId.get(pid) : undefined
        if (!project || !eid) {
          out.push({ status: 'missing', ref })
          continue
        }
        try {
          const head = await headOf(project)
          const commit = ref.revision !== undefined ? await commitByNumber(project, ref.revision) : head
          if (!commit) {
            out.push({ status: 'missing', ref })
            continue
          }
          const model = await client.loadModel(project.id, commit.id)
          const element = summary(model, project, eid, commit.number, head.number, ref.revision !== undefined)
          out.push(element ? { status: 'resolved', ref, element } : { status: 'missing', ref })
        } catch (e) {
          if (e instanceof SysmlClientError && e.code === 'forbidden') out.push({ status: 'forbidden', ref })
          else if (e instanceof SysmlClientError && e.code === 'not-found') out.push({ status: 'missing', ref })
          else throw e
        }
      }
      return out
    },

    async find(platformProjectId, query) {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), 500)
      const out: SysmlElementSummary[] = []
      for (const project of await projectsOf(platformProjectId)) {
        if (query.sysmlProjectId && project.id !== query.sysmlProjectId) continue
        const head = await headOf(project)
        const model = await client.loadModel(project.id, head.id)
        for (const hit of findElements(model, { text: query.text, metaclass: query.metaclass, limit })) {
          const s = summary(model, project, hit.id, head.number, head.number, false)
          if (s) out.push(s)
          if (out.length >= limit) return out
        }
      }
      return out
    },

    subscribe(platformProjectId, listener) {
      const offs: (() => void)[] = []
      let closed = false
      void projectsOf(platformProjectId).then((projects) => {
        if (closed) return
        for (const p of projects)
          offs.push(
            client.subscribe(p.id, (e) => listener({ eventId: e.eventId, sysmlProjectId: e.projectId, type: e.type.replace('sysml.', '') as SysmlModelEvent['type'], ...(e.commitNumber !== undefined ? { revision: e.commitNumber } : {}), occurredAt: e.occurredAt })),
          )
      })
      return () => {
        closed = true
        for (const off of offs) off()
      }
    },
  }
}
