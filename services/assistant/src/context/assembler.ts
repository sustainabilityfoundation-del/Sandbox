import { randomBytes } from 'node:crypto'
import type { Pool } from 'pg'
import type { ArtifactRef, ContextMode, ContextOmission, ContextPackage, ContextRef, ContextSnapshotItem, ContextTask, SelectContextRequest, SelectContextResponse } from '@ews/platform-sdk'
import { AssistantError } from '../errors'
import type { ModuleCaller } from '../proposals'
import { applySharing, budgetFor, itemKey, pack } from './pack'
import { DIGEST_SECTIONS } from './render'
import { ContextStore, contentHash } from './store'

/**
 * The context assembler (ADR-0085, ECII plan Amendment 2): calls each module's `selectContext` read operation in-process through the
 * existing `ModuleCaller`, as the signed-in person (their identity headers are forwarded, so module permissions and project scope
 * apply), packs the items mandatory-first within the budget and stores an immutable snapshot. It makes no model call and keeps no
 * second copy of the project: a snapshot holds references with exact revisions and bounded projections.
 */

/** A module's declared selector, as the host collects it from the server manifests. */
export interface ContextSelectorSpec {
  module: string
  basePath: string
  path: string
  operations: string[]
  version: string
}

export interface ContextAssemblerOptions {
  pool: Pool
  selectors: ContextSelectorSpec[]
  callModule: ModuleCaller
  roleOf: (userId: string, projectId: string) => Promise<string | null>
  log?: { warn: (obj: unknown, msg?: string) => void }
  now?: () => Date
}

export interface AssembleInput {
  projectId: string
  mode: Exclude<ContextMode, 'off'>
  task: ContextTask
  configurationId?: string
  conversationId?: string
  /** Setting `ai.context.max-tokens`. */
  maxTokens?: number
  /** Smallest context limit of the models the request can reach (tokens); a quarter of it bounds the package. */
  modelContextLimit?: number
  /** Which module selectors the person's AI access settings allow (ai.access.<module> not off). Default: all. */
  allow?: (module: string) => boolean
  /** Whether the person's AI access allows items whose reference belongs to a module (a selector may describe another module's artifacts). Default: all. */
  allowRef?: (refModule: string) => boolean
  /** The person's ai.sharing.* settings, applied to projections. Default: share everything. */
  sharing?: Sharing
}

export interface Sharing {
  requirementText: boolean
  elementDetails: boolean
}

/** Drops omitted references of modules the person's AI access does not allow; a count that covered them shrinks to the references left. */
function filterOmitted(omitted: ContextOmission[], allowRef: (refModule: string) => boolean): ContextOmission[] {
  const out: ContextOmission[] = []
  for (const o of omitted) {
    if (o.reason === 'not-authorized' || !o.refs) {
      out.push(o)
      continue
    }
    const refs = o.refs.filter((r) => allowRef(r.module))
    if (refs.length === o.refs.length) out.push(o)
    else if (refs.length) out.push({ reason: o.reason, count: refs.length, refs })
  }
  return out
}

const moduleOf = (item: ContextSnapshotItem): string => item.selectedBy ?? item.ref.module

const DIGEST_MAX_TOKENS = 2000
const DIGEST_MAX_ITEMS = 60

export const newContextId = (): string => `CTX-${randomBytes(5).toString('hex').toUpperCase()}`


export class ContextAssembler {
  readonly store: ContextStore
  constructor(private readonly o: ContextAssemblerOptions) {
    this.store = new ContextStore(o.pool)
  }

  get selectorCount(): number {
    return this.o.selectors.length
  }

  private async member(userId: string, projectId: string) {
    if (!(await this.o.roleOf(userId, projectId))) throw new AssistantError('forbidden', `You are not a member of project ${projectId}.`, 403)
  }

  /** Calls every selector as the person. A selector that fails is skipped (a turn is not lost to one module); 403 on a requested target is reported without a count. */
  private async select(headers: Record<string, string>, req: SelectContextRequest, allow: (module: string) => boolean = () => true, allowRef: (refModule: string) => boolean = () => true): Promise<{ responses: SelectContextResponse[]; denied: ContextOmission[] }> {
    const responses: SelectContextResponse[] = []
    const denied: ContextOmission[] = []
    await Promise.all(
      this.o.selectors.filter((spec) => allow(spec.module)).map(async (spec) => {
        const url = `${spec.basePath}${spec.path.replace('{projectId}', encodeURIComponent(req.projectId))}`
        try {
          const res = await this.o.callModule({ method: 'POST', url, headers, body: req })
          if (res.status === 403) {
            // Only a requested target the person cannot read is reported; traversal never reveals what exists (brief 13).
            const mine = req.targets.some((t) => (spec.module === 'projects' ? t.module !== 'conceptualize' : t.module === spec.module))
            if (mine && !denied.length) denied.push({ reason: 'not-authorized' })
            return
          }
          if (res.status !== 200 || !res.body || !Array.isArray((res.body as SelectContextResponse).items)) {
            this.o.log?.warn({ module: spec.module, status: res.status }, 'context selector did not answer')
            return
          }
          const body = res.body as SelectContextResponse
          // A selector may describe another module's artifacts (Projects registry records): the owner's AI access applies to them too.
          responses.push({ ...body, items: body.items.filter((i) => allowRef(i.ref.module)), omitted: filterOmitted(body.omitted, allowRef) })
        } catch (e) {
          this.o.log?.warn({ module: spec.module, err: (e as Error).message }, 'context selector failed')
        }
      }),
    )
    responses.sort((a, b) => a.module.localeCompare(b.module))
    return { responses, denied }
  }

  /** Assembles, packs and stores a package (or reuses an identical stored one). */
  async assemble(principal: { userId: string }, headers: Record<string, string>, input: AssembleInput): Promise<ContextPackage> {
    await this.member(principal.userId, input.projectId)
    // The stored task never names an artifact of a module the person's AI access does not allow.
    const task = { ...input.task, targets: input.task.targets.filter((t) => (input.allowRef ?? (() => true))(t.module)) }
    const digest = input.mode === 'digest'
    const base = budgetFor(input.maxTokens, input.modelContextLimit)
    const budget = digest ? { ...base, maxTokens: Math.min(base.maxTokens, DIGEST_MAX_TOKENS), maxItems: Math.min(base.maxItems, DIGEST_MAX_ITEMS) } : base
    const { responses, denied } = await this.select(headers, {
      projectId: input.projectId,
      ...(input.configurationId ? { configurationId: input.configurationId } : {}),
      operation: input.task.operation,
      targets: task.targets,
      budget,
      ...(digest ? { sections: DIGEST_SECTIONS } : {}),
    }, input.allow, input.allowRef)
    // Selector-side budget cuts are re-derived by packing; not-found omissions (with their references) are carried.
    const carried: ContextOmission[] = [...denied, ...responses.flatMap((r) => r.omitted.filter((o) => o.reason === 'not-found'))]
    const packed = pack(applySharing(responses.flatMap((r) => r.items), input.sharing ?? { requirementText: true, elementDetails: true }), budget, carried)
    const readiness = responses.find((r) => r.readiness)?.readiness
    const body: Omit<ContextPackage, 'contextId' | 'assembledAt'> & { notes?: string[] } = {
      schemaVersion: 1,
      projectId: input.projectId,
      ...(input.configurationId ? { configurationId: input.configurationId } : {}),
      mode: input.mode,
      task: task,
      items: packed.items,
      omitted: packed.omitted,
      ...(readiness ? { readiness } : {}),
      budget,
      used: packed.used,
      overBudget: packed.overBudget,
      selectors: responses.map((r) => ({ module: r.module, version: r.selectorVersion })),
      assembledFor: principal.userId,
      ...(packed.notes.length ? { notes: packed.notes } : {}),
    }
    const hash = contentHash(body)
    const same = await this.store.findSame(input.projectId, principal.userId, input.mode, hash, input.conversationId)
    if (same) return same
    const pkg: ContextPackage = { contextId: newContextId(), ...body, assembledAt: (this.o.now?.() ?? new Date()).toISOString() }
    await this.store.insert(pkg, { conversationId: input.conversationId, hash })
    return pkg
  }

  /** One stored snapshot of this person in this project. */
  async get(principal: { userId: string }, projectId: string, contextId: string): Promise<ContextPackage> {
    await this.member(principal.userId, projectId)
    const pkg = await this.store.get(projectId, principal.userId, contextId)
    if (!pkg) throw new AssistantError('not-found', `No context ${contextId} in this project.`, 404)
    return pkg
  }

  /**
   * Targeted retrieval from a stored snapshot. Stale items are flagged on the copy returned (the snapshot itself never changes).
   * With `refs`, the snapshot's items for them are returned, and references the snapshot left out (budget) are read fresh from the
   * selectors and returned apart, so the person's permissions apply again at this read.
   */
  async retrieve(principal: { userId: string }, headers: Record<string, string>, input: { projectId: string; contextId: string; refs?: ArtifactRef[]; checkStale?: boolean; allow?: (module: string) => boolean; allowRef?: (refModule: string) => boolean; sharing?: Sharing }) {
    const pkg = await this.get(principal, input.projectId, input.contextId)
    const current = input.checkStale === false ? undefined : await this.currentRevisions(headers, pkg, input.allow, input.allowRef)
    const flag = (item: ContextSnapshotItem): ContextSnapshotItem => {
      const now = current?.get(itemKey(item))
      return now !== undefined && item.revision !== null && now > item.revision ? { ...item, stale: true } : item
    }
    // References the person's AI access does not allow are not even echoed back (asking for them returns nothing).
    const wanted = input.refs?.length ? input.refs.filter((r) => (input.allowRef ?? (() => true))(r.module)) : undefined
    const match = (item: ContextSnapshotItem) => !wanted || wanted.some((r) => r.module === item.ref.module && r.id === item.ref.id && (!r.kind || r.kind === item.ref.kind))
    const allowed = input.allow ?? (() => true)
    const allowRef = input.allowRef ?? (() => true)
    const items = applySharing(pkg.items.filter((i) => allowed(moduleOf(i)) && allowRef(i.ref.module)).filter(match).map(flag), input.sharing ?? { requirementText: true, elementDetails: true })
    let fetched: ContextSnapshotItem[] = []
    let missing: ContextRef[] = []
    if (wanted) {
      const have = new Set(items.map((i) => `${i.ref.module}:${i.ref.id}`))
      const need = wanted.filter((r) => !have.has(`${r.module}:${r.id}`))
      if (need.length) {
        const { responses, denied } = await this.select(headers, { projectId: pkg.projectId, operation: pkg.task.operation, targets: need, budget: pkg.budget }, input.allow, input.allowRef)
        fetched = pack(applySharing(responses.flatMap((r) => r.items.filter((i) => need.some((n) => n.module === i.ref.module && n.id === i.ref.id))), input.sharing ?? { requirementText: true, elementDetails: true }), pkg.budget).items
        missing = need.filter((n) => !fetched.some((f) => f.ref.module === n.module && f.ref.id === n.id)).map((n) => ({ module: n.module, id: n.id, ...(n.kind ? { kind: n.kind } : {}) }))
        if (denied.length) missing = []
      }
    }
    return { contextId: pkg.contextId, mode: pkg.mode, task: { ...pkg.task, targets: pkg.task.targets.filter((t) => allowRef(t.module)) }, items, fetched, notFound: missing, stale: items.filter((i) => i.stale).length, omitted: filterOmitted(pkg.omitted, allowRef), ...(pkg.readiness && allowed('conceptualize') ? { readiness: pkg.readiness } : {}), overBudget: pkg.overBudget, used: pkg.used, budget: pkg.budget, assembledAt: pkg.assembledAt }
  }

  /** Revision of every item now (by item key), for stale flags: the selectors are asked again for the package's own task. */
  private async currentRevisions(headers: Record<string, string>, pkg: ContextPackage, allow?: (module: string) => boolean, allowRef?: (refModule: string) => boolean): Promise<Map<string, number>> {
    const { responses } = await this.select(headers, { projectId: pkg.projectId, operation: pkg.task.operation, targets: pkg.task.targets, budget: { ...pkg.budget, maxItems: 400 } }, allow, allowRef)
    const map = new Map<string, number>()
    for (const item of responses.flatMap((r) => r.items)) if (item.revision !== null) map.set(itemKey(item), Math.max(map.get(itemKey(item)) ?? 0, item.revision))
    return map
  }
}
