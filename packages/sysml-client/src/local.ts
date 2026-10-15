import {
  ACTUATOR_EXAMPLE,
  ACTUATOR_EXAMPLE_NAME,
  COMMAND_SCHEMAS,
  CREATABLE_KINDS,
  Model,
  affectedElements,
  allMetaclasses,
  applyTransaction,
  attributesOf,
  describeSummary,
  diagnosticsDelta,
  diffModels,
  fromJson,
  platformLibrary,
  referencesOfCached,
  semanticsOf,
  summarizeChanges,
  toJson,
  validate,
  type Diagnostic,
  type ElementChange,
  type JsonElement,
} from '@ews/sysml-core'
import { SysmlClientError, type BranchInfo, type CommitInfo, type CommitSource, type ProjectInfo, type SysmlClient, type SysmlEvent, type TagInfo, type TransactionOutcome } from './types'

/**
 * Explicit in-browser repository (mode 'local'): the same commit/branch semantics, typed commands,
 * validation, element-level concurrency and revert as the service, on the same core, without a
 * server. For the standalone harness, demos and offline experiments. It has NO access control
 * (single local user) and keeps data only in the given storage (or memory). Never a fallback.
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LocalOptions {
  /** Seed the actuator example for this platform project (default PRJ-ACT100) when empty. */
  seed?: boolean | { platformProjectId: string }
  storage?: StorageLike
  storageKey?: string
  actor?: string
  /** Simulated latency in ms. */
  latencyMs?: number
}

export const LOCAL_SEED_PROJECT_ID = 'a1c7e5d0-5153-4d4c-9a3e-000000000100'

interface LocalCommit {
  info: CommitInfo
  model: Model
  changes: ElementChange[]
}

interface LocalProject {
  info: ProjectInfo
  commits: Map<string, LocalCommit>
  branches: Map<string, BranchInfo>
  tags: TagInfo[]
}

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`)

export function createLocalSysmlClient(options: LocalOptions = {}): SysmlClient & { reset(): void } {
  const projects = new Map<string, LocalProject>()
  const listeners = new Map<string, Set<(e: SysmlEvent) => void>>()
  const actor = options.actor ?? 'local-user'
  const key = options.storageKey ?? 'ews.sysml-modeler.local.v1'
  const delay = () => (options.latencyMs ? new Promise((r) => setTimeout(r, options.latencyMs)) : Promise.resolve())

  function emit(projectId: string, type: SysmlEvent['type'], entityId: string, extra: Partial<SysmlEvent> = {}) {
    const e: SysmlEvent = { eventId: uuid(), type, projectId, entityId, occurredAt: new Date().toISOString(), actor, ...extra }
    for (const l of listeners.get(projectId) ?? []) queueMicrotask(() => l(e))
  }

  function project(id: string): LocalProject {
    const p = projects.get(id)
    if (!p) throw new SysmlClientError('not-found', `No SysML project ${id}.`)
    return p
  }
  function branch(p: LocalProject, id: string): BranchInfo {
    const b = p.branches.get(id)
    if (!b) throw new SysmlClientError('not-found', `No branch ${id} in this project.`)
    return b
  }
  function commit(p: LocalProject, id: string): LocalCommit {
    const c = p.commits.get(id)
    if (!c) throw new SysmlClientError('not-found', `No commit ${id} in this project.`)
    return c
  }
  function ancestors(p: LocalProject, id: string): string[] {
    const out: string[] = []
    let cur: string | undefined = id
    while (cur) {
      out.push(cur)
      cur = p.commits.get(cur)?.info.parentIds[0]
    }
    return out
  }

  function addCommit(p: LocalProject, branchId: string, model: Model, changes: ElementChange[], meta: { description: string; summary: string; source: CommitSource; parentIds: string[] }): CommitInfo {
    const info: CommitInfo = { id: uuid(), projectId: p.info.id, number: p.commits.size + 1, parentIds: meta.parentIds, branchId, actor, source: meta.source, description: meta.description, summary: meta.summary, changeCount: changes.length, created: new Date().toISOString() }
    p.commits.set(info.id, { info, model, changes })
    const b = branch(p, branchId)
    p.branches.set(branchId, { ...b, headCommitId: info.id, revision: b.revision + 1 })
    persist()
    emit(p.info.id, 'sysml.commit-created', info.id, { commitNumber: info.number, branchId })
    return info
  }

  function createProjectSync(input: { name: string; platformProjectId: string; description?: string; initialText?: string; id?: string; source?: CommitSource }): ProjectInfo {
    const empty = new Model({ library: platformLibrary() })
    let model = empty
    if (input.initialText?.trim()) {
      const r = applyTransaction(empty, { commands: [{ op: 'applyText', namespaceId: empty.rootId, text: input.initialText, mode: 'append' }] })
      if (!r.ok) throw new SysmlClientError('invalid', `The initial text is not valid: ${r.error.message}`, { diagnostics: r.error.diagnostics })
      model = r.model
    }
    const id = input.id ?? uuid()
    const branchId = uuid()
    const info: ProjectInfo = { id, name: input.name, description: input.description ?? '', platformProjectId: input.platformProjectId, defaultBranchId: branchId, rootElementId: model.rootId, created: new Date().toISOString() }
    const p: LocalProject = { info, commits: new Map(), branches: new Map([[branchId, { id: branchId, name: 'main', projectId: id, headCommitId: null, revision: 1, created: info.created }]]), tags: [] }
    projects.set(id, p)
    const changes = [...model.elements()].map((e) => ({ id: e['@id'], kind: 'created' as const, metaclass: e['@type'], after: e }))
    addCommit(p, branchId, model, changes, { description: input.initialText ? 'Project created with initial model' : 'Project created', summary: input.initialText ? 'Initial model' : 'Created the root namespace', source: input.source ?? { kind: 'user' }, parentIds: [] })
    emit(id, 'sysml.project-created', id)
    return info
  }

  // ---- persistence (event-sourced: commits as change sets) ----------------------------------
  function persist() {
    if (!options.storage) return
    const data = [...projects.values()].map((p) => ({
      info: p.info,
      branches: [...p.branches.values()],
      tags: p.tags,
      commits: [...p.commits.values()].map((c) => ({ info: c.info, changes: c.changes.map((ch) => ({ id: ch.id, kind: ch.kind, metaclass: ch.metaclass, after: ch.after ? toJson(c.model, ch.after) : undefined })) })),
    }))
    try {
      options.storage.setItem(key, JSON.stringify({ version: 1, projects: data }))
    } catch {
      // Storage full or unavailable: data stays in memory for this session.
    }
  }

  function restore(): boolean {
    const raw = options.storage?.getItem(key)
    if (!raw) return false
    try {
      const data = JSON.parse(raw) as { version: number; projects: { info: ProjectInfo; branches: BranchInfo[]; tags: TagInfo[]; commits: { info: CommitInfo; changes: { id: string; kind: ElementChange['kind']; metaclass: string; after?: JsonElement }[] }[] }[] }
      for (const pd of data.projects) {
        const p: LocalProject = { info: pd.info, commits: new Map(), branches: new Map(pd.branches.map((b) => [b.id, b])), tags: pd.tags }
        for (const cd of [...pd.commits].sort((a, b) => a.info.number - b.info.number)) {
          const parent = cd.info.parentIds[0] ? p.commits.get(cd.info.parentIds[0]) : undefined
          const model = parent ? parent.model.clone() : new Model({ library: platformLibrary(), rootId: pd.info.rootElementId })
          const changes: ElementChange[] = []
          for (const ch of cd.changes) {
            const before = model.own(ch.id)
            if (ch.kind === 'deleted') model.remove(ch.id)
            else model.put(fromJson(ch.after!))
            changes.push({ id: ch.id, kind: ch.kind, metaclass: ch.metaclass, before, after: model.own(ch.id) })
          }
          p.commits.set(cd.info.id, { info: cd.info, model, changes })
        }
        projects.set(p.info.id, p)
      }
      return true
    } catch {
      return false
    }
  }

  function init() {
    if (!restore() && options.seed) {
      const platformProjectId = typeof options.seed === 'object' ? options.seed.platformProjectId : 'PRJ-ACT100'
      createProjectSync({ id: LOCAL_SEED_PROJECT_ID, name: ACTUATOR_EXAMPLE_NAME, description: 'Seeded example (local, in this browser).', platformProjectId, initialText: ACTUATOR_EXAMPLE, source: { kind: 'seed' } })
    }
  }
  init()

  function outcome(dryRun: boolean, rebased: boolean, base: string, model: Model, changes: ElementChange[], extra: Omit<TransactionOutcome, 'dryRun' | 'rebased' | 'baseCommitId' | 'changes'>): TransactionOutcome {
    return { dryRun, rebased, baseCommitId: base, ...extra, changes: changes.map((c) => ({ id: c.id, kind: c.kind, metaclass: c.metaclass, ...(c.after ? { after: toJson(model, c.after) } : {}) })) }
  }

  const client: SysmlClient & { reset(): void } = {
    mode: 'local',
    reset() {
      projects.clear()
      options.storage?.setItem(key, '')
      init()
    },
    async listProjects(platformProjectId) {
      await delay()
      return [...projects.values()].map((p) => p.info).filter((p) => !platformProjectId || p.platformProjectId === platformProjectId)
    },
    async createProject(input) {
      await delay()
      return createProjectSync(input)
    },
    async getProject(projectId) {
      await delay()
      return project(projectId).info
    },
    async listBranches(projectId) {
      await delay()
      return [...project(projectId).branches.values()]
    },
    async getBranch(projectId, branchId) {
      await delay()
      return branch(project(projectId), branchId)
    },
    async createBranch(projectId, name, headCommitId) {
      await delay()
      const p = project(projectId)
      commit(p, headCommitId)
      if ([...p.branches.values()].some((b) => b.name === name)) throw new SysmlClientError('conflict', `A branch named “${name}” already exists.`)
      const b: BranchInfo = { id: uuid(), name, projectId, headCommitId, revision: 1, created: new Date().toISOString() }
      p.branches.set(b.id, b)
      persist()
      emit(projectId, 'sysml.branch-created', b.id, { branchId: b.id })
      return b
    },
    async listTags(projectId) {
      await delay()
      return project(projectId).tags
    },
    async createTag(projectId, name, commitId) {
      await delay()
      const p = project(projectId)
      const c = commit(p, commitId)
      if (p.tags.some((t) => t.name === name)) throw new SysmlClientError('conflict', `A tag named “${name}” already exists.`)
      const t: TagInfo = { id: uuid(), name, commitId: c.info.id, created: new Date().toISOString() }
      p.tags.push(t)
      persist()
      emit(projectId, 'sysml.tag-created', t.id, { commitNumber: c.info.number })
      return t
    },
    async listCommits(projectId, options = {}) {
      await delay()
      const p = project(projectId)
      const all = options.branchId ? ancestors(p, branch(p, options.branchId).headCommitId!).map((id) => p.commits.get(id)!.info) : [...p.commits.values()].map((c) => c.info).reverse()
      return all.sort((a, b) => b.number - a.number).slice(0, options.limit ?? 50)
    },
    async getCommit(projectId, commitId) {
      await delay()
      return commit(project(projectId), commitId).info
    },
    async loadModel(projectId, commitId) {
      await delay()
      return commit(project(projectId), commitId).model
    },
    async transact(projectId, branchId, req) {
      await delay()
      const p = project(projectId)
      const b = branch(p, branchId)
      const head = b.headCommitId!
      const base = req.baseCommitId ?? head
      if (!req.dryRun && !req.baseCommitId) throw new SysmlClientError('invalid', 'Send baseCommitId; changes are never applied without a version check.', undefined, 400)
      const baseCommit = commit(p, base)
      let result = applyTransaction(baseCommit.model, { commands: req.commands, validationPolicy: req.validationPolicy })
      if (!result.ok) throw toError(result.error)
      if (req.dryRun) return outcome(true, false, base, result.model, result.changes, { summary: result.summary, summaryText: result.summaryText, createdIds: result.createdIds, diagnostics: result.diagnostics })
      let rebased = false
      if (base !== head) {
        const anc = ancestors(p, head)
        const idx = anc.indexOf(base)
        if (idx < 0) throw new SysmlClientError('conflict', 'The base commit is not part of this branch’s history.', { headCommitId: head })
        const changed = new Set(anc.slice(0, idx).flatMap((id) => p.commits.get(id)!.changes.map((c) => c.id)))
        const overlap = result.touched.filter((id) => changed.has(id))
        if (overlap.length) {
          const s = semanticsOf(baseCommit.model)
          throw new SysmlClientError('conflict', `The model changed since commit ${baseCommit.info.number}: ${[...new Set(overlap.map((id) => s.label(id)))].slice(0, 5).join(', ')} changed. Reload and try again.`, { headCommitId: head, conflictingElementIds: overlap.slice(0, 50) })
        }
        result = applyTransaction(commit(p, head).model, { commands: req.commands, validationPolicy: req.validationPolicy })
        if (!result.ok) throw toError(result.error)
        rebased = true
      }
      if (!result.changes.length) throw new SysmlClientError('invalid', 'The commands change nothing.')
      const info = addCommit(p, branchId, result.model, result.changes, { description: req.reason ?? result.summaryText, summary: result.summaryText, source: req.source ?? { kind: 'user' }, parentIds: [head] })
      return outcome(false, rebased, head, result.model, result.changes, { summary: result.summary, summaryText: result.summaryText, createdIds: result.createdIds, diagnostics: result.diagnostics, commit: info })
    },
    async revert(projectId, commitId, branchId, opts = {}) {
      await delay()
      const p = project(projectId)
      const target = commit(p, commitId)
      if (!target.info.parentIds.length) throw new SysmlClientError('invalid', 'The first commit of a project cannot be reverted.')
      const b = branch(p, branchId)
      const head = b.headCommitId!
      if (!ancestors(p, head).includes(commitId)) throw new SysmlClientError('invalid', 'That commit is not part of this branch.')
      const headModel = commit(p, head).model
      const later = target.changes.filter((c) => headModel.own(c.id) !== c.after)
      if (later.length) {
        const s = semanticsOf(headModel)
        throw new SysmlClientError('conflict', `Commit ${target.info.number} cannot be undone: ${[...new Set(later.map((c) => s.label(c.id)))].slice(0, 5).join(', ')} changed afterwards.`, { conflictingElementIds: later.map((c) => c.id).slice(0, 50) })
      }
      const model = headModel.clone()
      for (const c of target.changes) {
        if (c.before) model.put(c.before)
        else model.remove(c.id)
      }
      const changes = diffModels(headModel, model)
      const diagnostics = diagnosticsDelta(headModel, model, affectedElements(headModel, model, changes))
      const summary = summarizeChanges(headModel, model, changes)
      const text = `Undo commit ${target.info.number}: ${describeSummary(summary)}`
      if (opts.dryRun) return outcome(true, false, head, model, changes, { summary, summaryText: text, createdIds: {}, diagnostics })
      const info = addCommit(p, branchId, model, changes, { description: opts.reason ?? text, summary: text, source: opts.source ? { ...opts.source, revertedCommitId: commitId } : { kind: 'revert', revertedCommitId: commitId }, parentIds: [head] })
      return outcome(false, false, head, model, changes, { summary, summaryText: text, createdIds: {}, diagnostics, commit: info })
    },
    async validation(projectId, commitId) {
      await delay()
      const d: Diagnostic[] = validate(commit(project(projectId), commitId).model)
      return { commitId, counts: { error: d.filter((x) => x.severity === 'error').length, warning: d.filter((x) => x.severity === 'warning').length, info: d.filter((x) => x.severity === 'info').length }, diagnostics: d }
    },
    async describeCommands() {
      return {
        commands: COMMAND_SCHEMAS,
        creatableKinds: CREATABLE_KINDS,
        metaclasses: allMetaclasses().map((m) => ({ name: m.name, supers: m.supers, abstract: !!m.abstract, layer: m.layer, attributes: Object.keys(attributesOf(m.name)), references: Object.keys(referencesOfCached(m.name)) })),
        notes: 'Local mode: same commands and validation as the service; no access control.',
      }
    },
    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(listener)
      listeners.set(projectId, set)
      return () => set.delete(listener)
    },
  }
  return client
}

function toError(e: { code: string; message: string; commandIndex?: number; diagnostics?: Diagnostic[] }): SysmlClientError {
  const details = { ...(e.commandIndex !== undefined ? { commandIndex: e.commandIndex } : {}), ...(e.diagnostics?.length ? { diagnostics: e.diagnostics } : {}) }
  const code = e.code === 'not-allowed' ? 'forbidden' : e.code === 'not-found' ? 'not-found' : e.code === 'rejected' ? 'rejected' : 'invalid'
  return new SysmlClientError(code, e.message, details)
}
