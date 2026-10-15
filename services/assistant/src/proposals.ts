import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { ExpectedRevision, ModuleOperation } from '@ews/platform-sdk'
import { AssistantError, type Principal } from './service'

/**
 * Persisted proposals (integration milestone 1 C9, ADR-0042). The workspace stores every proposal it shows
 * here, so it reopens after a reload or restart:
 * - `declarative`: module API operations, executed HERE at Apply after revalidating identity, permissions,
 *   project scope (C13), expected revisions and idempotency. Operations are resolved against the module's
 *   OpenAPI document by operationId; a proposal cannot target an arbitrary URL.
 * - `twin`: changes to the browser twin, applied in the browser with its revision checks; the outcome is
 *   recorded here.
 * - `closure`: a module still returns an `apply` closure (SDK 1.5 fallback); it can be applied only in the
 *   window that prepared it. After a reload it is shown, labelled, and cannot be applied.
 */

/** A module API the gateway may call (registered by the host). */
export interface ModuleApi {
  id: string
  label: string
  /** e.g. /api/concepts/v1 */
  basePath: string
  /** Server-side entitlement the person needs (checked before execution; the module checks again). */
  entitlement?: string
  /** Path parameter that holds the PLATFORM project ID (C13 check); absent when the module uses its own project IDs. */
  projectParam?: string
}

/** Calls a module API in-process as the authenticated person (the host forwards their identity). */
export type ModuleCaller = (request: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => Promise<{ status: number; body: unknown }>

interface ResolvedOperation {
  operationId: string
  method: string
  template: string
  regex: RegExp
  params: string[]
}

export type ProposalKind = 'declarative' | 'twin' | 'closure'
export type ProposalStatus = 'pending' | 'applying' | 'applied' | 'rejected' | 'conflict' | 'failed'

interface ProposalRow {
  id: string
  schema_version: number
  project_id: string
  actor_id: string
  conversation_id: string
  message_id: string | null
  key: string
  kind: ProposalKind
  module: string
  title: string
  explanation: string
  preview: unknown
  assumptions: string[]
  operations: ModuleOperation[]
  expected: ExpectedRevision[]
  confirmation: { phrase: string; prompt: string } | null
  status: ProposalStatus
  message: string | null
  results: OperationResult[]
  created_at: Date
  updated_at: Date
  applied_at: Date | null
}

export interface OperationResult {
  index: number
  status: 'succeeded' | 'failed'
  httpStatus: number
  summary: string
  createdId?: string
  body?: unknown
}

export interface ProposalInput {
  projectId: string
  conversationId: string
  messageId?: string
  key: string
  kind: ProposalKind
  module: string
  title: string
  explanation?: string
  preview: unknown
  assumptions?: string[]
  operations?: ModuleOperation[]
  expected?: ExpectedRevision[]
  confirmation?: { phrase: string; prompt: string }
}

export const PROPOSAL_SCHEMA_VERSION = 1
const MAX_OPERATIONS = 50
const PLACEHOLDER = /^\$result\[(\d+)\]\.([A-Za-z0-9_.]+)$/
const STUCK_MS = 120_000

export function publicProposal(r: ProposalRow) {
  return {
    id: r.id,
    version: r.schema_version,
    key: r.key,
    projectId: r.project_id,
    actor: r.actor_id,
    conversationId: r.conversation_id,
    messageId: r.message_id,
    kind: r.kind,
    module: r.module,
    title: r.title,
    explanation: r.explanation,
    preview: r.preview,
    assumptions: r.assumptions,
    operations: r.operations,
    expected: r.expected,
    confirmation: r.confirmation ? { prompt: r.confirmation.prompt } : null,
    status: r.status,
    message: r.message,
    results: r.results.map(({ body: _body, ...rest }) => rest),
    createdIds: r.results.map((x) => x.createdId).filter(Boolean),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    appliedAt: r.applied_at?.toISOString() ?? null,
  }
}

const get = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value)

/** `/projects/{projectId}/concepts/{conceptId}` → a regex with one capture group per parameter. */
function templateRegex(template: string): { regex: RegExp; params: string[] } {
  const params: string[] = []
  const source = template
    .split('/')
    .map((segment) => {
      const m = /^\{(\w+)\}$/.exec(segment)
      if (m) {
        params.push(m[1])
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
    })
    .join('/')
  return { regex: new RegExp(`^${source}$`), params }
}

export class ProposalService {
  private readonly specs = new Map<string, Promise<Map<string, ResolvedOperation>>>()

  constructor(
    private readonly pool: Pool,
    private readonly modules: ModuleApi[],
    private readonly call: ModuleCaller,
    private readonly roleOf: (userId: string, projectId: string) => Promise<string | null>,
  ) {}

  private module(id: string): ModuleApi {
    const m = this.modules.find((x) => x.id === id)
    if (!m) throw new AssistantError('invalid', `Module “${id}” has no API registered for proposals.`, 422)
    return m
  }

  /** operationId → method and path template, from the module's own OpenAPI document. */
  private operations(m: ModuleApi, auth: Record<string, string>): Promise<Map<string, ResolvedOperation>> {
    let p = this.specs.get(m.id)
    if (!p) {
      p = this.call({ method: 'GET', url: `${m.basePath}/openapi.json`, headers: auth }).then(({ status, body }) => {
        if (status !== 200 || !body || typeof body !== 'object') throw new AssistantError('unavailable', `The ${m.label} API description is not available.`, 503)
        const out = new Map<string, ResolvedOperation>()
        for (const [path, methods] of Object.entries((body as { paths?: Record<string, Record<string, { operationId?: string }>> }).paths ?? {})) {
          const template = path.startsWith(m.basePath) ? path.slice(m.basePath.length) : path
          for (const [method, op] of Object.entries(methods)) {
            if (!op?.operationId) continue
            const { regex, params } = templateRegex(template)
            out.set(op.operationId, { operationId: op.operationId, method: method.toUpperCase(), template, regex, params })
          }
        }
        return out
      })
      p.catch(() => this.specs.delete(m.id))
      this.specs.set(m.id, p)
    }
    return p
  }

  /**
   * Validates one operation: registered module, existing operationId with this method, a concrete path
   * matching its template, and (C13) the platform project in the path equals the proposal's project.
   */
  async validateOperation(op: ModuleOperation, projectId: string, auth: Record<string, string>): Promise<{ api: ModuleApi; spec: ResolvedOperation }> {
    const api = this.module(op.module)
    const spec = (await this.operations(api, auth)).get(op.operationId)
    const where = `${op.module}.${op.operationId}`
    if (!spec) throw new AssistantError('invalid', `${where} is not an operation of the ${api.label} API.`, 422)
    if (spec.method !== String(op.method).toUpperCase()) throw new AssistantError('invalid', `${where} is ${spec.method}, not ${op.method}.`, 422)
    if (typeof op.path !== 'string' || !op.path.startsWith('/') || /\.\.|\/\/|[?#\s]/.test(op.path)) throw new AssistantError('invalid', `${where}: the path must be a plain path relative to the module API.`, 422)
    const m = spec.regex.exec(op.path)
    if (!m) throw new AssistantError('invalid', `${where}: the path does not match ${spec.template}.`, 422)
    if (api.projectParam) {
      const i = spec.params.indexOf(api.projectParam)
      if (i >= 0 && decodeURIComponent(m[i + 1]) !== projectId) throw new AssistantError('project-mismatch', `${where} targets project ${decodeURIComponent(m[i + 1])}, but the proposal belongs to ${projectId}. Nothing was stored.`, 409)
    }
    return { api, spec }
  }

  private async member(principal: Principal, projectId: string) {
    if (!(await this.roleOf(principal.userId, projectId))) throw new AssistantError('forbidden', `You are not a member of project ${projectId}.`, 403)
  }

  async create(principal: Principal, input: ProposalInput, auth: Record<string, string>) {
    await this.member(principal, input.projectId)
    const operations = input.operations ?? []
    const expected = input.expected ?? []
    if (input.kind === 'declarative') {
      if (!operations.length) throw new AssistantError('invalid', 'A declarative proposal needs at least one operation.', 422)
      if (operations.length > MAX_OPERATIONS) throw new AssistantError('invalid', `At most ${MAX_OPERATIONS} operations per proposal.`, 422)
      for (const op of operations) await this.validateOperation(op, input.projectId, auth)
      for (const e of expected) {
        const { spec } = await this.validateOperation({ module: e.module, operationId: e.read.operationId, method: 'GET', path: e.read.path }, input.projectId, auth)
        if (spec.method !== 'GET') throw new AssistantError('invalid', `Expected revision of ${e.label}: ${e.read.operationId} is not a read operation.`, 422)
      }
    } else if (operations.length) throw new AssistantError('invalid', `A ${input.kind} proposal has no module operations.`, 422)
    const id = randomUUID()
    const { rows } = await this.pool.query<ProposalRow>(
      `INSERT INTO assistant.proposals (id, schema_version, project_id, actor_id, conversation_id, message_id, key, kind, module, title, explanation, preview, assumptions, operations, expected, confirmation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (actor_id, conversation_id, key) DO NOTHING RETURNING *`,
      [id, PROPOSAL_SCHEMA_VERSION, input.projectId, principal.userId, input.conversationId, input.messageId ?? null, input.key, input.kind, input.module, input.title, input.explanation ?? '', JSON.stringify(input.preview ?? null), JSON.stringify(input.assumptions ?? []), JSON.stringify(operations), JSON.stringify(expected), input.confirmation ? JSON.stringify(input.confirmation) : null],
    )
    if (rows[0]) return publicProposal(rows[0])
    // Same key again (a retried request): return the stored one if it is the same proposal.
    const existing = await this.pool.query<ProposalRow>('SELECT * FROM assistant.proposals WHERE actor_id = $1 AND conversation_id = $2 AND key = $3', [principal.userId, input.conversationId, input.key])
    const row = existing.rows[0]
    if (row.project_id !== input.projectId || row.title !== input.title || JSON.stringify(row.operations) !== JSON.stringify(operations)) throw new AssistantError('conflict', `Proposal ${input.key} already exists with different content.`, 409)
    return publicProposal(row)
  }

  async list(principal: Principal, filter: { projectId: string; conversationId?: string; open?: boolean }) {
    await this.member(principal, filter.projectId)
    const { rows } = await this.pool.query<ProposalRow>(
      `SELECT * FROM assistant.proposals WHERE actor_id = $1 AND project_id = $2 AND ($3::text IS NULL OR conversation_id = $3)
       AND (NOT $4 OR status IN ('pending', 'conflict', 'failed', 'applying')) ORDER BY created_at DESC LIMIT 200`,
      [principal.userId, filter.projectId, filter.conversationId ?? null, filter.open === true],
    )
    return rows.map(publicProposal)
  }

  private async row(principal: Principal, id: string, client: Pool | PoolClient = this.pool, lock = false): Promise<ProposalRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AssistantError('not-found', 'No such proposal.', 404)
    const { rows } = await client.query<ProposalRow>(`SELECT * FROM assistant.proposals WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id])
    const r = rows[0]
    // Identity: only the person who prepared it sees or applies it.
    if (!r || r.actor_id !== principal.userId) throw new AssistantError('not-found', 'No such proposal (or it belongs to another person).', 404)
    return r
  }

  async getOne(principal: Principal, id: string) {
    return publicProposal(await this.row(principal, id))
  }

  private async update(id: string, patch: { status?: ProposalStatus; message?: string | null; results?: OperationResult[]; applied?: boolean }) {
    const { rows } = await this.pool.query<ProposalRow>(
      `UPDATE assistant.proposals SET status = COALESCE($2, status), message = CASE WHEN $3::boolean THEN $4 ELSE message END,
       results = COALESCE($5, results), applied_at = CASE WHEN $6 THEN now() ELSE applied_at END, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, patch.status ?? null, patch.message !== undefined, patch.message ?? null, patch.results ? JSON.stringify(patch.results) : null, patch.applied === true],
    )
    return rows[0]
  }

  /** Records the outcome of a proposal applied in the browser (twin, closure), or a rejection. */
  async outcome(principal: Principal, id: string, input: { status: 'applied' | 'failed' | 'conflict' | 'rejected'; message?: string }) {
    const r = await this.row(principal, id)
    if (r.kind === 'declarative' && input.status !== 'rejected') throw new AssistantError('invalid', 'Declarative proposals are applied by the server (POST …/apply).', 409)
    if (r.status === 'applied' || r.status === 'rejected') throw new AssistantError('conflict', `Proposal ${r.key} is already ${r.status}.`, 409)
    return publicProposal(await this.update(id, { status: input.status, message: input.message ?? null, applied: input.status === 'applied' }))
  }

  /**
   * Apply a declarative proposal: revalidate, then execute its operations through the module APIs in order.
   * Idempotent: each operation carries `<proposalId>:<index>` (or its own key), and a retry resumes after the
   * operations that already succeeded.
   */
  async apply(principal: Principal, id: string, input: { currentProjectId: string; confirmation?: string }, auth: Record<string, string>) {
    // 1. Lock and claim the proposal.
    const client = await this.pool.connect()
    let r: ProposalRow
    try {
      await client.query('BEGIN')
      r = await this.row(principal, id, client, true)
      if (r.kind !== 'declarative') throw new AssistantError('apply-in-browser', r.kind === 'closure' ? `${r.key} was prepared by a module that does not yet describe its changes as data; it can only be applied in the window that prepared it. Ask again to prepare it here.` : `${r.key} changes the workspace model and is applied in the browser.`, 409)
      if (r.status === 'applied') {
        await client.query('COMMIT')
        return { proposal: publicProposal(r), alreadyApplied: true }
      }
      if (r.status === 'rejected') throw new AssistantError('conflict', `${r.key} was rejected; prepare it again if you still want it.`, 409)
      if (r.status === 'applying' && Date.now() - r.updated_at.getTime() < STUCK_MS) throw new AssistantError('in-progress', `${r.key} is being applied right now.`, 409)
      // 2. Project scope (C13).
      if (input.currentProjectId !== r.project_id) throw new AssistantError('project-mismatch', `${r.key} belongs to project ${r.project_id}, but the current project is ${input.currentProjectId}. Nothing was applied; open ${r.project_id} to apply it.`, 409)
      await client.query(`UPDATE assistant.proposals SET status = 'applying', updated_at = now() WHERE id = $1`, [id])
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
    const fail = async (status: ProposalStatus, message: string, httpStatus: number, code: string, results?: OperationResult[]) => {
      const row = await this.update(id, { status, message, results })
      throw new AssistantError(code, message, httpStatus, { proposal: publicProposal(row) })
    }
    try {
      // 3. Membership and entitlements now (the module APIs check roles again).
      if (!(await this.roleOf(principal.userId, r.project_id))) await fail('failed', `You are no longer a member of ${r.project_id}. Nothing was applied.`, 403, 'forbidden')
      for (const m of new Set(r.operations.map((o) => o.module))) {
        const api = this.module(m)
        if (api.entitlement && !principal.entitlements.includes(api.entitlement)) await fail('failed', `Applying needs ${api.label} (${api.entitlement}), which is not in your subscription. Nothing was applied.`, 403, 'not-entitled')
      }
      if (r.confirmation && input.confirmation !== r.confirmation.phrase) await fail('pending', `Type “${r.confirmation.phrase}” to confirm. ${r.confirmation.prompt}`, 422, 'confirmation-required')
      // Re-validate every operation (a module API may have changed since the preview).
      for (const op of r.operations) await this.validateOperation(op, r.project_id, auth)
      const done = r.results.filter((x) => x.status === 'succeeded')
      // 4. Expected revisions, before anything is written (not after a partial apply: those writes are ours).
      if (!done.length && r.expected.length) {
        const changed: string[] = []
        for (const e of r.expected) {
          const res = await this.call({ method: 'GET', url: `${this.module(e.module).basePath}${e.read.path}`, headers: auth })
          if (res.status === 404) changed.push(`${e.label} no longer exists.`)
          else if (res.status >= 400) changed.push(`${e.label} could not be read again (HTTP ${res.status}).`)
          else {
            const now = get(res.body, e.read.field)
            if (String(now) !== String(e.revision)) changed.push(`${e.label} changed since the preview: revision ${e.revision} → ${now}.`)
          }
        }
        if (changed.length) await fail('conflict', `Not applied: ${changed.join(' ')} Nothing was changed; prepare the proposal again to see the current state.`, 409, 'stale')
      }
      // 5. Execute in order, resuming after succeeded operations.
      const results = [...done]
      const resolve = (v: unknown): unknown => {
        if (typeof v === 'string') {
          const p = PLACEHOLDER.exec(v)
          if (!p) return v
          const source = results.find((x) => x.index === Number(p[1]))
          if (!source) throw new AssistantError('invalid', `Placeholder ${v} refers to an operation that has not run.`, 422)
          return get(source.body, p[2])
        }
        if (Array.isArray(v)) return v.map(resolve)
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, resolve(x)]))
        return v
      }
      for (const [index, op] of r.operations.entries()) {
        if (results.some((x) => x.index === index)) continue
        const path = op.path.split('/').map((seg) => (PLACEHOLDER.test(seg) ? encodeURIComponent(String(resolve(seg))) : seg)).join('/')
        const query = op.query ? `?${new URLSearchParams(op.query).toString()}` : ''
        const headers: Record<string, string> = {
          ...auth,
          'idempotency-key': op.idempotencyKey ?? `${r.id}:${index}`,
          'x-ews-source': 'assistant',
          'x-ews-proposal': `${r.conversation_id}/${r.key}`,
          ...(op.ifMatch ? { 'if-match': op.ifMatch } : {}),
        }
        const res = await this.call({ method: op.method, url: `${this.module(op.module).basePath}${path}${query}`, headers, body: op.body === undefined ? undefined : resolve(op.body) })
        const body = res.body as { id?: unknown; key?: unknown; error?: { code?: string; message?: string } } | undefined
        if (res.status >= 400) {
          const why = body?.error?.message ?? `HTTP ${res.status}`
          const partial = results.length ? ` ${results.length} of ${r.operations.length} operations had already been applied; applying again resumes after them.` : ' Nothing was changed.'
          const stale = res.status === 409 || res.status === 412
          await fail(stale ? 'conflict' : 'failed', `Not applied: ${op.module} refused ${op.operationId}: ${why}.${partial}`, stale ? 409 : 422, stale ? 'stale' : 'module-refused', [...results, { index, status: 'failed', httpStatus: res.status, summary: why }])
        }
        results.push({ index, status: 'succeeded', httpStatus: res.status, summary: `${op.operationId} (${res.status})`, createdId: res.status === 201 && typeof body?.id === 'string' ? body.id : undefined, body })
        await this.update(id, { results })
      }
      const row = await this.update(id, { status: 'applied', message: null, results, applied: true })
      return { proposal: publicProposal(row), alreadyApplied: false }
    } catch (e) {
      if (e instanceof AssistantError) throw e
      await this.update(id, { status: 'failed', message: 'Applying stopped because of an internal error; applying again resumes safely.' }).catch(() => undefined)
      throw e
    }
  }
}
