import { applyOutcome, SysmlClientError, type BranchInfo, type CommitInfo, type ProjectInfo, type SysmlClient, type TransactionOutcome, type TransactionRequest } from '@ews/sysml-client'
import type { Command, Model, ValidationPolicy } from '@ews/sysml-core'

/**
 * Client-side session of one SysML project/branch: the loaded head model, recent commits and a
 * transaction entry point shared by every view and by the assistant actions of the tool. It never
 * writes except through `SysmlClient.transact` / `revert` (the validated command boundary).
 */

export interface SessionState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'empty'
  error?: string
  projects: ProjectInfo[]
  project?: ProjectInfo
  branches: BranchInfo[]
  branch?: BranchInfo
  headCommitId?: string
  model?: Model
  commits: CommitInfo[]
  /** Incremented on every model change (views key caches on it). */
  revision: number
  busy: boolean
  /** A newer commit exists on the server than the loaded model (another user or window). */
  stale?: boolean
}

type Listener = () => void

export class ModelerSession {
  state: SessionState = { status: 'idle', projects: [], branches: [], commits: [], revision: 0, busy: false }
  private listeners = new Set<Listener>()
  private unsubscribe?: () => void
  private platformProjectId?: string
  private loading?: Promise<void>

  constructor(readonly client: SysmlClient) {}

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getState = (): SessionState => this.state

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  /** Opens the first SysML project of a platform project (or the given one) on its default branch. */
  open(platformProjectId: string, projectId?: string, branchId?: string): Promise<void> {
    if (this.loading && this.state.status === 'loading' && this.platformProjectId === platformProjectId && (!projectId || projectId === this.state.project?.id)) return this.loading
    this.platformProjectId = platformProjectId
    this.loading = (async () => {
      this.set({ status: 'loading', error: undefined })
      try {
        const projects = await this.client.listProjects(platformProjectId)
        const project = projects.find((p) => p.id === projectId) ?? projects[0]
        if (!project) {
          this.set({ status: 'empty', projects, project: undefined, model: undefined })
          return
        }
        const branches = await this.client.listBranches(project.id)
        const branch = branches.find((b) => b.id === (branchId ?? project.defaultBranchId)) ?? branches[0]
        await this.loadHead(project, branches, branch)
        this.set({ projects })
        this.unsubscribe?.()
        this.unsubscribe = this.client.subscribe(project.id, (e) => {
          if (e.type !== 'sysml.commit-created' || e.branchId !== this.state.branch?.id) return
          if (e.entityId === this.state.headCommitId) return
          void this.refresh()
        })
      } catch (e) {
        this.set({ status: 'error', error: message(e) })
      }
    })()
    return this.loading
  }

  private async loadHead(project: ProjectInfo, branches: BranchInfo[], branch: BranchInfo) {
    const fresh = await this.client.getBranch(project.id, branch.id)
    const model = await this.client.loadModel(project.id, fresh.headCommitId!)
    const commits = await this.client.listCommits(project.id, { branchId: fresh.id, limit: 50 })
    this.set({ status: 'ready', project, branches, branch: fresh, headCommitId: fresh.headCommitId!, model, commits, revision: this.state.revision + 1, stale: false })
  }

  /** Reloads the head (after another user's or window's commit). */
  async refresh(): Promise<void> {
    const { project, branches, branch } = this.state
    if (!project || !branch) return
    try {
      await this.loadHead(project, branches, branch)
    } catch (e) {
      this.set({ error: message(e) })
    }
  }

  async switchBranch(branchId: string) {
    const { project, branches } = this.state
    const b = branches.find((x) => x.id === branchId)
    if (project && b) await this.loadHead(project, branches, b)
  }

  async createProject(name: string, initialText?: string) {
    if (!this.platformProjectId) throw new Error('No platform project.')
    const p = await this.client.createProject({ name, platformProjectId: this.platformProjectId, initialText })
    this.loading = undefined
    await this.open(this.platformProjectId, p.id)
  }

  /**
   * Lazy creation: a platform project has no SysML project until someone starts modelling. Creates
   * one (an empty package `SystemModel`, nothing else) when the platform project has none.
   */
  async ensureProject(): Promise<void> {
    if (this.getState().status === 'ready') return
    if (!this.platformProjectId) throw new Error('No platform project.')
    const existing = await this.client.listProjects(this.platformProjectId)
    if (existing.length) return this.open(this.platformProjectId, existing[0].id)
    await this.createProject(`System model (${this.platformProjectId})`, 'package SystemModel;')
  }

  /** Dry run of commands against the loaded head. */
  async preview(commands: Command[], validationPolicy: ValidationPolicy = 'report'): Promise<TransactionOutcome> {
    const { project, branch, headCommitId } = this.need()
    return this.client.transact(project.id, branch.id, { baseCommitId: headCommitId, commands, dryRun: true, validationPolicy })
  }

  /** Commits commands (base = the loaded head; the service rebases or refuses on conflict). */
  async run(commands: Command[], options: Omit<TransactionRequest, 'commands' | 'baseCommitId'> = {}): Promise<TransactionOutcome> {
    const { project, branch, headCommitId, model } = this.need()
    this.set({ busy: true })
    try {
      const out = await this.client.transact(project.id, branch.id, { ...options, baseCommitId: headCommitId, commands })
      this.afterCommit(out, model, headCommitId)
      return out
    } catch (e) {
      if (e instanceof SysmlClientError && e.code === 'conflict') void this.refresh()
      throw e
    } finally {
      this.set({ busy: false })
    }
  }

  async revert(commitId: string): Promise<TransactionOutcome> {
    const { project, branch, headCommitId, model } = this.need()
    this.set({ busy: true })
    try {
      const out = await this.client.revert(project.id, commitId, branch.id, { source: { kind: 'user' } })
      this.afterCommit(out, model, headCommitId)
      return out
    } finally {
      this.set({ busy: false })
    }
  }

  private afterCommit(out: TransactionOutcome, model: Model, base: string) {
    if (!out.commit) return
    // Incremental update when the commit sits directly on the loaded head; otherwise reload.
    if (!out.rebased && out.baseCommitId === base) {
      const next = applyOutcome(model, out)
      this.set({ model: next, headCommitId: out.commit.id, branch: this.state.branch && { ...this.state.branch, headCommitId: out.commit.id }, commits: [out.commit, ...this.state.commits].slice(0, 50), revision: this.state.revision + 1 })
    } else void this.refresh()
  }

  private need() {
    const { project, branch, headCommitId, model } = this.state
    if (!project || !branch || !headCommitId || !model) throw new Error('No SysML model is loaded.')
    return { project, branch, headCommitId, model }
  }

  dispose() {
    this.unsubscribe?.()
  }
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// ---- module-level registry: one client and one session per platform project -------------------
let client: SysmlClient | undefined
const sessions = new Map<string, ModelerSession>()

export function configureClient(c: SysmlClient) {
  client = c
  for (const s of sessions.values()) s.dispose()
  sessions.clear()
}

export function getClient(): SysmlClient | undefined {
  return client
}

/** The shared session for a platform project (views and assistant actions use the same one). */
export function sessionFor(platformProjectId: string): ModelerSession | undefined {
  if (!client) return undefined
  let s = sessions.get(platformProjectId)
  if (!s) {
    s = new ModelerSession(client)
    sessions.set(platformProjectId, s)
  }
  return s
}
