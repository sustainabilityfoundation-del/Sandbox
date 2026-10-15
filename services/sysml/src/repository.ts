import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import {
  Model,
  applyTransaction,
  crossReferences,
  diagnosticsDelta,
  affectedElements,
  diffModels,
  fromJson,
  platformLibrary,
  semanticsOf,
  summarizeChanges,
  describeSummary,
  toJson,
  validate,
  type Command,
  type Diagnostic,
  type DiagnosticsDelta,
  type Element,
  type ElementChange,
  type JsonElement,
  type ValidationPolicy,
} from '@ews/sysml-core'
import { SysmlServiceError, conflict, invalid, notFound } from './errors'
import { emit } from './events'

/**
 * The SysML repository over PostgreSQL schema `sysml` (ADR-0033). Commits are immutable change sets
 * of element versions; branches point at head commits and keep a head index (`branch_elements`).
 * Models are materialized in memory per commit (immutable, cached) and every modification runs
 * through the core's typed commands and validation (ADR-0034).
 */

export interface CommitSource {
  kind: 'user' | 'assistant' | 'import' | 'api' | 'revert' | 'seed'
  conversationId?: string
  proposalId?: string
  messageId?: string
  revertedCommitId?: string
  tool?: string
}

export interface ProjectRow {
  id: string
  platform_project_id: string
  name: string
  description: string
  root_element_id: string
  default_branch_id: string | null
  created_at: Date
  created_by: string
}

export interface BranchRow {
  id: string
  project_id: string
  name: string
  head_commit_id: string | null
  revision: number
  created_at: Date
  created_by: string
}

export interface CommitRow {
  id: string
  project_id: string
  number: number
  parent_ids: string[]
  branch_id: string | null
  actor: string
  source: CommitSource
  description: string
  commands: unknown
  change_count: number
  summary: string
  created_at: Date
}

export interface TagRow {
  id: string
  project_id: string
  name: string
  commit_id: string
  created_at: Date
  created_by: string
}

export interface ChangeView {
  id: string
  kind: ElementChange['kind']
  metaclass: string
  /** Element state after the change (absent for deletions). */
  after?: JsonElement
}

export interface TransactionOutcome {
  dryRun: boolean
  rebased: boolean
  commit?: CommitRow
  baseCommitId: string
  summary: { id: string; kind: string; metaclass: string; label: string }[]
  summaryText: string
  changes: ChangeView[]
  createdIds: Record<string, string>
  diagnostics: DiagnosticsDelta
}

export interface TransactionRequest {
  baseCommitId?: string
  commands: Command[]
  dryRun?: boolean
  validationPolicy?: ValidationPolicy
  reason?: string
  source?: CommitSource
}

type Db = Pick<PoolClient, 'query'>

const MAX_CACHE = 24

export class SysmlRepository {
  private cache = new Map<string, Model>()
  private validations = new Map<string, Diagnostic[]>()
  readonly library: Model

  constructor(
    readonly pool: Pool,
    library?: Model,
  ) {
    this.library = library ?? platformLibrary()
  }

  // ---- transactions ---------------------------------------------------------------------------
  async tx<T>(fn: (db: PoolClient, now: Date) => Promise<T>): Promise<T> {
    let client: PoolClient
    try {
      client = await this.pool.connect()
    } catch {
      throw new SysmlServiceError('unavailable', 'The SysML database is not reachable. Nothing was changed; try again later.')
    }
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
      const out = await fn(client, rows[0].now)
      await client.query('COMMIT')
      return out
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw mapDbError(e)
    } finally {
      client.release()
    }
  }

  private async q<T extends object>(sql: string, params: unknown[] = [], db: Db = this.pool): Promise<T[]> {
    try {
      return (await db.query<T>(sql, params)).rows
    } catch (e) {
      throw mapDbError(e)
    }
  }

  // ---- projects -------------------------------------------------------------------------------
  async listProjects(platformProjectIds?: string[]): Promise<ProjectRow[]> {
    if (platformProjectIds && !platformProjectIds.length) return []
    return platformProjectIds
      ? this.q<ProjectRow>('SELECT * FROM sysml.projects WHERE platform_project_id = ANY($1) ORDER BY created_at, id', [platformProjectIds])
      : this.q<ProjectRow>('SELECT * FROM sysml.projects ORDER BY created_at, id')
  }

  async getProject(id: string, db: Db = this.pool): Promise<ProjectRow> {
    if (!isUuid(id)) throw notFound(`No SysML project ${id}.`)
    const [p] = await this.q<ProjectRow>('SELECT * FROM sysml.projects WHERE id = $1', [id], db)
    if (!p) throw notFound(`No SysML project ${id}.`)
    return p
  }

  /** Creates a project with branch `main` and commit #1 (the root namespace, plus optional initial text). */
  async createProject(actor: string, input: { name: string; description?: string; platformProjectId: string; initialText?: string; source?: CommitSource; id?: string }): Promise<{ project: ProjectRow; branch: BranchRow; commit: CommitRow }> {
    const empty = new Model({ library: this.library })
    let model = empty
    let commands: Command[] = []
    if (input.initialText?.trim()) {
      commands = [{ op: 'applyText', namespaceId: empty.rootId, text: input.initialText, mode: 'append' }]
      const r = applyTransaction(empty, { commands })
      if (!r.ok) throw invalid(`The initial text is not valid: ${r.error.message}`, { diagnostics: r.error.diagnostics })
      model = r.model
    }
    return this.tx(async (db, now) => {
      const projectId = input.id ?? randomUUID()
      const branchId = randomUUID()
      await db.query('INSERT INTO sysml.projects (id, platform_project_id, name, description, root_element_id, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [projectId, input.platformProjectId, input.name, input.description ?? '', model.rootId, now, actor])
      await db.query('INSERT INTO sysml.branches (id, project_id, name, created_at, created_by) VALUES ($1,$2,$3,$4,$5)', [branchId, projectId, 'main', now, actor])
      await db.query('UPDATE sysml.projects SET default_branch_id = $2 WHERE id = $1', [projectId, branchId])
      const changes: ElementChange[] = [...model.elements()].map((e) => ({ id: e['@id'], kind: 'created' as const, metaclass: e['@type'], after: e }))
      const commit = await this.writeCommit(db, now, { projectId, branchId, parentIds: [], actor, source: input.source ?? { kind: 'user' }, description: input.initialText ? 'Project created with initial model' : 'Project created', commands, model, changes, summary: input.initialText ? 'Initial model' : 'Created the root namespace' })
      await emit(db, { type: 'sysml.project-created', projectId, entityId: projectId, actor, at: now })
      const [project] = await this.q<ProjectRow>('SELECT * FROM sysml.projects WHERE id = $1', [projectId], db)
      const [branch] = await this.q<BranchRow>('SELECT * FROM sysml.branches WHERE id = $1', [branchId], db)
      this.remember(commit.id, model)
      return { project, branch, commit }
    })
  }

  // ---- branches, tags, commits ----------------------------------------------------------------
  listBranches(projectId: string): Promise<BranchRow[]> {
    return this.q<BranchRow>('SELECT * FROM sysml.branches WHERE project_id = $1 ORDER BY created_at, name', [projectId])
  }

  async getBranch(projectId: string, branchId: string, db: Db = this.pool): Promise<BranchRow> {
    if (!isUuid(branchId)) throw notFound(`No branch ${branchId}.`)
    const [b] = await this.q<BranchRow>('SELECT * FROM sysml.branches WHERE id = $1 AND project_id = $2', [branchId, projectId], db)
    if (!b) throw notFound(`No branch ${branchId} in this project.`)
    return b
  }

  async createBranch(projectId: string, actor: string, name: string, headCommitId: string): Promise<BranchRow> {
    const commit = await this.getCommit(projectId, headCommitId)
    const model = await this.loadModel(projectId, commit.id)
    return this.tx(async (db, now) => {
      const id = randomUUID()
      await db.query('INSERT INTO sysml.branches (id, project_id, name, head_commit_id, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, projectId, name, commit.id, now, actor]).catch((e) => {
        throw (e as { code?: string }).code === '23505' ? conflict(`A branch named “${name}” already exists.`) : e
      })
      // Head index of the new branch: the versions current at the commit.
      const versions = await this.versionsAt(projectId, commit.id, db)
      await db.query(
        `INSERT INTO sysml.branch_elements (branch_id, element_id, version_id, metaclass, name, owner_id)
         SELECT $1, x.element_id, x.version_id, x.metaclass, x.name, x.owner_id FROM jsonb_to_recordset($2::jsonb) AS x(element_id uuid, version_id uuid, metaclass text, name text, owner_id uuid)`,
        [id, JSON.stringify(versions)],
      )
      await emit(db, { type: 'sysml.branch-created', projectId, entityId: id, branchId: id, actor, at: now })
      void model
      const [b] = await this.q<BranchRow>('SELECT * FROM sysml.branches WHERE id = $1', [id], db)
      return b
    })
  }

  listTags(projectId: string): Promise<TagRow[]> {
    return this.q<TagRow>('SELECT * FROM sysml.tags WHERE project_id = $1 ORDER BY created_at, name', [projectId])
  }

  async createTag(projectId: string, actor: string, name: string, commitId: string): Promise<TagRow> {
    const commit = await this.getCommit(projectId, commitId)
    return this.tx(async (db, now) => {
      const id = randomUUID()
      await db.query('INSERT INTO sysml.tags (id, project_id, name, commit_id, created_at, created_by) VALUES ($1,$2,$3,$4,$5,$6)', [id, projectId, name, commit.id, now, actor]).catch((e) => {
        throw (e as { code?: string }).code === '23505' ? conflict(`A tag named “${name}” already exists.`) : e
      })
      await emit(db, { type: 'sysml.tag-created', projectId, entityId: id, commitNumber: commit.number, actor, at: now })
      const [t] = await this.q<TagRow>('SELECT * FROM sysml.tags WHERE id = $1', [id], db)
      return t
    })
  }

  listCommits(projectId: string, options: { branchId?: string; limit?: number; before?: number } = {}): Promise<CommitRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 500)
    if (options.branchId) {
      return this.q<CommitRow>(
        `WITH RECURSIVE anc(id) AS (SELECT head_commit_id FROM sysml.branches WHERE id = $2 AND project_id = $1 UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN anc ON c.id = anc.id)
         SELECT c.* FROM sysml.commits c WHERE c.id IN (SELECT id FROM anc) AND ($4::int IS NULL OR c.number < $4) ORDER BY c.number DESC LIMIT $3`,
        [projectId, options.branchId, limit, options.before ?? null],
      )
    }
    return this.q<CommitRow>('SELECT * FROM sysml.commits WHERE project_id = $1 AND ($3::int IS NULL OR number < $3) ORDER BY number DESC LIMIT $2', [projectId, limit, options.before ?? null])
  }

  async getCommit(projectId: string, commitId: string, db: Db = this.pool): Promise<CommitRow> {
    if (!isUuid(commitId)) throw notFound(`No commit ${commitId}.`)
    const [c] = await this.q<CommitRow>('SELECT * FROM sysml.commits WHERE id = $1 AND project_id = $2', [commitId, projectId], db)
    if (!c) throw notFound(`No commit ${commitId} in this project.`)
    return c
  }

  async commitChanges(projectId: string, commitId: string): Promise<{ version_id: string; element_id: string; metaclass: string; payload: JsonElement | null }[]> {
    await this.getCommit(projectId, commitId)
    return this.q('SELECT version_id, element_id, metaclass, payload FROM sysml.element_versions WHERE commit_id = $1 ORDER BY metaclass, element_id', [commitId])
  }

  // ---- reading models -------------------------------------------------------------------------
  private remember(commitId: string, model: Model) {
    this.cache.delete(commitId)
    this.cache.set(commitId, model)
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!)
  }

  /** Current version of every live element at a commit (via the head index when it is a head). */
  private async versionsAt(projectId: string, commitId: string, db: Db = this.pool): Promise<{ element_id: string; version_id: string; metaclass: string; name: string | null; owner_id: string | null; payload: JsonElement }[]> {
    const [head] = await this.q<{ id: string }>('SELECT id FROM sysml.branches WHERE project_id = $1 AND head_commit_id = $2 LIMIT 1', [projectId, commitId], db)
    if (head) {
      return this.q(
        'SELECT be.element_id, be.version_id, be.metaclass, be.name, be.owner_id, ev.payload FROM sysml.branch_elements be JOIN sysml.element_versions ev ON ev.version_id = be.version_id WHERE be.branch_id = $1',
        [head.id],
        db,
      )
    }
    const rows = await this.q<{ element_id: string; version_id: string; metaclass: string; name: string | null; owner_id: string | null; payload: JsonElement | null }>(
      `WITH RECURSIVE anc(id) AS (SELECT $2::uuid UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN anc ON c.id = anc.id)
       SELECT DISTINCT ON (ev.element_id) ev.element_id, ev.version_id, ev.metaclass, ev.name, ev.owner_id, ev.payload
       FROM sysml.element_versions ev WHERE ev.project_id = $1 AND ev.commit_id IN (SELECT id FROM anc)
       ORDER BY ev.element_id, ev.commit_number DESC`,
      [projectId, commitId],
      db,
    )
    return rows.filter((r): r is typeof r & { payload: JsonElement } => r.payload !== null)
  }

  /** The model at a commit (immutable; callers must not modify it). */
  async loadModel(projectId: string, commitId: string, db: Db = this.pool): Promise<Model> {
    const hit = this.cache.get(commitId)
    if (hit) {
      this.remember(commitId, hit)
      return hit
    }
    const project = await this.getProject(projectId, db)
    await this.getCommit(projectId, commitId, db)
    const versions = await this.versionsAt(projectId, commitId, db)
    const model = new Model({ library: this.library, rootId: project.root_element_id, elements: versions.map((v) => fromJson(v.payload)) })
    this.remember(commitId, model)
    return model
  }

  async headCommitId(projectId: string, branchId: string): Promise<string> {
    const b = await this.getBranch(projectId, branchId)
    if (!b.head_commit_id) throw notFound('The branch has no commits.')
    return b.head_commit_id
  }

  async validation(projectId: string, commitId: string): Promise<Diagnostic[]> {
    const hit = this.validations.get(commitId)
    if (hit) return hit
    const model = await this.loadModel(projectId, commitId)
    const d = validate(model)
    this.validations.set(commitId, d)
    if (this.validations.size > MAX_CACHE) this.validations.delete(this.validations.keys().next().value!)
    return d
  }

  // ---- writing --------------------------------------------------------------------------------
  private async ancestors(commitId: string, db: Db): Promise<Set<string>> {
    const rows = await this.q<{ id: string }>('WITH RECURSIVE anc(id) AS (SELECT $1::uuid UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN anc ON c.id = anc.id) SELECT id FROM anc', [commitId], db)
    return new Set(rows.map((r) => r.id))
  }

  /** Element IDs changed by commits reachable from `head` but not from `base`. */
  private async changedSince(base: string, head: string, db: Db): Promise<Set<string>> {
    const rows = await this.q<{ element_id: string }>(
      `WITH RECURSIVE a(id) AS (SELECT $2::uuid UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN a ON c.id = a.id),
                      b(id) AS (SELECT $1::uuid UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN b ON c.id = b.id)
       SELECT DISTINCT element_id FROM sysml.element_versions WHERE commit_id IN (SELECT id FROM a EXCEPT SELECT id FROM b)`,
      [base, head],
      db,
    )
    return new Set(rows.map((r) => r.element_id))
  }

  private async writeCommit(
    db: Db,
    now: Date,
    c: { projectId: string; branchId: string; parentIds: string[]; actor: string; source: CommitSource; description: string; commands: unknown; model: Model; changes: ElementChange[]; summary: string },
  ): Promise<CommitRow> {
    const [{ n }] = await this.q<{ n: number }>('SELECT coalesce(max(number), 0) + 1 AS n FROM sysml.commits WHERE project_id = $1', [c.projectId], db)
    const id = randomUUID()
    await db.query(
      'INSERT INTO sysml.commits (id, project_id, number, parent_ids, branch_id, actor, source, description, commands, change_count, summary, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [id, c.projectId, n, c.parentIds, c.branchId, c.actor, JSON.stringify(c.source), c.description, JSON.stringify(c.commands ?? []), c.changes.length, c.summary, now],
    )
    const s = semanticsOf(c.model)
    const versions = c.changes.map((ch) => {
      const el = ch.kind === 'deleted' ? undefined : ch.after!
      return {
        version_id: randomUUID(),
        element_id: ch.id,
        metaclass: ch.metaclass,
        name: el && typeof el.declaredName === 'string' ? el.declaredName : null,
        owner_id: el ? (s.owner(ch.id)?.['@id'] ?? null) : null,
        payload: el ? toJson(c.model, el) : null,
        refs: el ? crossReferences(el).map(([property, target]) => ({ property, target })) : [],
      }
    })
    for (let k = 0; k < versions.length; k += 2000) {
      const chunk = versions.slice(k, k + 2000)
      await db.query(
        `INSERT INTO sysml.element_versions (version_id, project_id, element_id, commit_id, commit_number, metaclass, name, owner_id, payload)
         SELECT x.version_id, $1, x.element_id, $2, $3, x.metaclass, x.name, x.owner_id, x.payload FROM jsonb_to_recordset($4::jsonb) AS x(version_id uuid, element_id uuid, metaclass text, name text, owner_id uuid, payload jsonb)`,
        [c.projectId, id, n, JSON.stringify(chunk.map(({ refs: _r, ...v }) => v))],
      )
      const refs = chunk.flatMap((v) => v.refs.filter((r) => isUuid(r.target)).map((r) => ({ version_id: v.version_id, target_id: r.target, property: r.property })))
      if (refs.length) {
        await db.query('INSERT INTO sysml.element_refs (version_id, target_id, property) SELECT x.version_id, x.target_id, x.property FROM jsonb_to_recordset($1::jsonb) AS x(version_id uuid, target_id uuid, property text)', [JSON.stringify(refs)])
      }
      const live = chunk.filter((v) => v.payload)
      const gone = chunk.filter((v) => !v.payload).map((v) => v.element_id)
      if (gone.length) await db.query('DELETE FROM sysml.branch_elements WHERE branch_id = $1 AND element_id = ANY($2::uuid[])', [c.branchId, gone])
      if (live.length) {
        await db.query(
          `INSERT INTO sysml.branch_elements (branch_id, element_id, version_id, metaclass, name, owner_id)
           SELECT $1, x.element_id, x.version_id, x.metaclass, x.name, x.owner_id FROM jsonb_to_recordset($2::jsonb) AS x(element_id uuid, version_id uuid, metaclass text, name text, owner_id uuid)
           ON CONFLICT (branch_id, element_id) DO UPDATE SET version_id = EXCLUDED.version_id, metaclass = EXCLUDED.metaclass, name = EXCLUDED.name, owner_id = EXCLUDED.owner_id`,
          [c.branchId, JSON.stringify(live.map(({ payload: _p, refs: _r, ...v }) => v))],
        )
      }
    }
    await db.query('UPDATE sysml.branches SET head_commit_id = $2, revision = revision + 1 WHERE id = $1', [c.branchId, id])
    await emit(db, { type: 'sysml.commit-created', projectId: c.projectId, entityId: id, commitNumber: n, branchId: c.branchId, actor: c.actor, at: now })
    const [row] = await this.q<CommitRow>('SELECT * FROM sysml.commits WHERE id = $1', [id], db)
    return row
  }

  private outcome(dryRun: boolean, rebased: boolean, baseCommitId: string, model: Model, changes: ElementChange[], extra: { summary: TransactionOutcome['summary']; summaryText: string; createdIds: Record<string, string>; diagnostics: DiagnosticsDelta; commit?: CommitRow }): TransactionOutcome {
    return {
      dryRun,
      rebased,
      baseCommitId,
      ...extra,
      changes: changes.map((c) => ({ id: c.id, kind: c.kind, metaclass: c.metaclass, ...(c.after ? { after: toJson(model, c.after) } : {}) })),
    }
  }

  /** Runs typed commands on a branch (ADR-0034): dry run, element-level concurrency, commit with provenance. */
  async transact(projectId: string, branchId: string, actor: string, req: TransactionRequest): Promise<TransactionOutcome> {
    const branch = await this.getBranch(projectId, branchId)
    if (!branch.head_commit_id) throw notFound('The branch has no commits.')
    const base = req.baseCommitId ?? branch.head_commit_id
    const baseCommit = await this.getCommit(projectId, base)
    let model = await this.loadModel(projectId, baseCommit.id)
    let result = applyTransaction(model, { commands: req.commands, validationPolicy: req.validationPolicy })
    if (!result.ok) throw transactionError(result.error)
    if (req.dryRun) {
      return this.outcome(true, false, base, result.model, result.changes, { summary: result.summary, summaryText: result.summaryText, createdIds: result.createdIds, diagnostics: result.diagnostics })
    }
    return this.tx(async (db, now) => {
      await db.query('SELECT id FROM sysml.projects WHERE id = $1 FOR UPDATE', [projectId])
      const current = await this.getBranch(projectId, branchId, db)
      let rebased = false
      if (current.head_commit_id !== base) {
        const anc = await this.ancestors(current.head_commit_id!, db)
        if (!anc.has(base)) throw conflict('The base commit is not part of this branch’s history.', { headCommitId: current.head_commit_id })
        const changed = await this.changedSince(base, current.head_commit_id!, db)
        const touched = new Set(result.ok ? result.touched : [])
        const overlap = [...touched].filter((id) => changed.has(id))
        if (overlap.length) {
          const s = semanticsOf(model)
          throw conflict(`The model changed since commit ${baseCommit.number}: ${[...new Set(overlap.map((id) => labelOf(s, id)))].slice(0, 5).join(', ')} ${overlap.length === 1 ? 'was' : 'were'} changed by someone else. Reload and try again.`, { headCommitId: current.head_commit_id, conflictingElementIds: overlap.slice(0, 50) })
        }
        // No overlap: re-run the same commands on the current head.
        model = await this.loadModel(projectId, current.head_commit_id!, db)
        result = applyTransaction(model, { commands: req.commands, validationPolicy: req.validationPolicy })
        if (!result.ok) throw transactionError(result.error)
        rebased = true
      }
      if (!result.ok) throw new Error('unreachable')
      if (!result.changes.length) throw invalid('The commands change nothing.', undefined, 422)
      const commit = await this.writeCommit(db, now, {
        projectId,
        branchId,
        parentIds: [current.head_commit_id!],
        actor,
        source: req.source ?? { kind: 'user' },
        description: req.reason ?? result.summaryText,
        commands: req.commands,
        model: result.model,
        changes: result.changes,
        summary: result.summaryText,
      })
      this.remember(commit.id, result.model)
      return this.outcome(false, rebased, current.head_commit_id!, result.model, result.changes, { summary: result.summary, summaryText: result.summaryText, createdIds: result.createdIds, diagnostics: result.diagnostics, commit })
    })
  }

  /** Undo: a compensating commit restoring the versions before `commitId` (refused when later commits changed the same elements). */
  async revert(projectId: string, commitId: string, branchId: string, actor: string, options: { reason?: string; source?: CommitSource; dryRun?: boolean } = {}): Promise<TransactionOutcome> {
    const target = await this.getCommit(projectId, commitId)
    if (!target.parent_ids.length) throw invalid('The first commit of a project cannot be reverted.')
    const run = async (db: Db) => {
      const branch = await this.getBranch(projectId, branchId, db)
      const head = branch.head_commit_id!
      if (!(await this.ancestors(head, db)).has(commitId)) throw invalid('That commit is not part of this branch.')
      const headModel = await this.loadModel(projectId, head, db)
      const versions = await this.q<{ element_id: string; payload: JsonElement | null }>('SELECT element_id, payload FROM sysml.element_versions WHERE commit_id = $1', [commitId], db)
      const ids = versions.map((v) => v.element_id)
      const before = await this.q<{ element_id: string; payload: JsonElement | null }>(
        `WITH RECURSIVE anc(id) AS (SELECT unnest($2::uuid[]) UNION SELECT unnest(c.parent_ids) FROM sysml.commits c JOIN anc ON c.id = anc.id)
         SELECT DISTINCT ON (element_id) element_id, payload FROM sysml.element_versions WHERE element_id = ANY($1::uuid[]) AND commit_id IN (SELECT id FROM anc) ORDER BY element_id, commit_number DESC`,
        [ids, target.parent_ids],
        db,
      )
      const beforeById = new Map(before.map((b) => [b.element_id, b.payload]))
      const s = semanticsOf(headModel)
      const changedLater: string[] = []
      for (const v of versions) {
        const current = headModel.own(v.element_id)
        const expected = v.payload ? fromJson(v.payload) : undefined
        if (!sameState(current, expected)) changedLater.push(v.element_id)
      }
      if (changedLater.length) throw conflict(`Commit ${target.number} cannot be undone: ${[...new Set(changedLater.map((id) => labelOf(s, id)))].slice(0, 5).join(', ')} changed afterwards.`, { conflictingElementIds: changedLater.slice(0, 50) })
      const model = headModel.clone()
      for (const v of versions) {
        const prev = beforeById.get(v.element_id)
        if (prev) model.put(fromJson(prev))
        else model.remove(v.element_id)
      }
      const changes = diffModels(headModel, model)
      const affected = affectedElements(headModel, model, changes)
      const diagnostics = diagnosticsDelta(headModel, model, affected)
      const summary = summarizeChanges(headModel, model, changes)
      return { head, model, changes, diagnostics, summary }
    }
    if (options.dryRun) {
      const r = await run(this.pool)
      return this.outcome(true, false, r.head, r.model, r.changes, { summary: r.summary, summaryText: `Undo commit ${target.number}: ${describeSummary(r.summary)}`, createdIds: {}, diagnostics: r.diagnostics })
    }
    return this.tx(async (db, now) => {
      await db.query('SELECT id FROM sysml.projects WHERE id = $1 FOR UPDATE', [projectId])
      const r = await run(db)
      if (!r.changes.length) throw invalid('Nothing to undo.')
      const text = `Undo commit ${target.number}: ${describeSummary(r.summary)}`
      const commit = await this.writeCommit(db, now, { projectId, branchId, parentIds: [r.head], actor, source: options.source ?? { kind: 'revert', revertedCommitId: commitId }, description: options.reason ?? text, commands: [{ op: 'revert', commitId }], model: r.model, changes: r.changes, summary: text })
      this.remember(commit.id, r.model)
      return this.outcome(false, false, r.head, r.model, r.changes, { summary: r.summary, summaryText: text, createdIds: {}, diagnostics: r.diagnostics, commit })
    })
  }

  /** Systems Modeling API commit: raw element versions (validated for well-formedness by the core). */
  async rawCommit(projectId: string, branchId: string, actor: string, input: { change: { payload: JsonElement | null; identity?: { '@id': string } }[]; description?: string; previousCommitId?: string }): Promise<CommitRow> {
    return this.tx(async (db, now) => {
      await db.query('SELECT id FROM sysml.projects WHERE id = $1 FOR UPDATE', [projectId])
      const branch = await this.getBranch(projectId, branchId, db)
      if (input.previousCommitId && input.previousCommitId !== branch.head_commit_id) throw conflict('previousCommit is not the head of the branch; read the latest commit and retry.', { headCommitId: branch.head_commit_id })
      const head = await this.loadModel(projectId, branch.head_commit_id!, db)
      const model = head.clone()
      for (const [k, dv] of input.change.entries()) {
        const id = dv.payload?.['@id'] ?? dv.identity?.['@id']
        if (!id || !isUuid(id)) throw invalid(`change[${k}]: each data version needs payload["@id"] or identity["@id"] (a UUID).`)
        if (head.isLibrary(id)) throw invalid(`change[${k}]: library elements are read-only.`)
        if (dv.payload) {
          if (dv.identity && dv.identity['@id'] !== id) throw invalid(`change[${k}]: identity and payload IDs differ.`)
          let el: Element
          try {
            el = fromJson(dv.payload)
          } catch (e) {
            throw invalid(`change[${k}]: ${e instanceof Error ? e.message : String(e)}`)
          }
          model.put(el)
        } else model.remove(id)
      }
      if (model.own(head.rootId)?.['@type'] !== 'Namespace') throw invalid('The root namespace cannot be deleted or replaced.')
      const changes = diffModels(head, model)
      if (!changes.length) throw invalid('The commit changes nothing.')
      const affected = affectedElements(head, model, changes)
      const delta = diagnosticsDelta(head, model, affected)
      const structural = delta.introduced.filter((d) => d.ruleId === 'SYSML-REF-DANGLING' || d.ruleId === 'SYSML-OWNERSHIP')
      if (structural.length) throw new SysmlServiceError('rejected', `The commit would make the model inconsistent: ${structural[0].message}`, { diagnostics: structural.slice(0, 50) })
      for (const c of changes) if (c.kind === 'deleted') for (const r of model.referencesTo(c.id)) if (model.own(r)) throw new SysmlServiceError('rejected', `Deleting ${c.id} would leave ${r} referring to it.`)
      const summary = describeSummary(summarizeChanges(head, model, changes))
      const commit = await this.writeCommit(db, now, { projectId, branchId, parentIds: [branch.head_commit_id!], actor, source: { kind: 'api' }, description: input.description ?? summary, commands: [], model, changes, summary })
      this.remember(commit.id, model)
      return commit
    })
  }
}

export function isUuid(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function labelOf(s: ReturnType<typeof semanticsOf>, id: string): string {
  let cur: string | undefined = id
  for (let k = 0; cur && k < 30; k++) {
    const el = s.get(cur)
    if (!el) return id
    if (typeof el.declaredName === 'string') return s.label(cur)
    cur = s.owner(cur)?.['@id']
  }
  return id
}

function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
}

function sameState(a: Element | undefined, b: Element | undefined): boolean {
  if (!a || !b) return !a && !b
  return stable(a) === stable(b)
}

function transactionError(e: { code: string; message: string; commandIndex?: number; diagnostics?: Diagnostic[] }): SysmlServiceError {
  const details = { ...(e.commandIndex !== undefined ? { commandIndex: e.commandIndex } : {}), ...(e.diagnostics?.length ? { diagnostics: e.diagnostics.slice(0, 50) } : {}) }
  if (e.code === 'not-found') return new SysmlServiceError('not-found', e.message, details)
  if (e.code === 'not-allowed') return new SysmlServiceError('forbidden', e.message, details)
  if (e.code === 'rejected') return new SysmlServiceError('rejected', e.message, details)
  return new SysmlServiceError('invalid', e.message, details)
}

function mapDbError(e: unknown): unknown {
  if (e instanceof SysmlServiceError) return e
  const code = (e as { code?: string }).code
  if (code === '23505') return conflict('A record with the same unique value already exists.')
  if (code === '23503' || code === '23514' || code === '22P02') return invalid('A value is not allowed (it violates a database rule).')
  if (code === '23001') return new SysmlServiceError('forbidden', 'History is append-only.')
  if (code === 'ECONNREFUSED' || code === '57P01' || code === '08006' || code === '08001') return new SysmlServiceError('unavailable', `The SysML database is not available (${code}).`)
  return e
}
