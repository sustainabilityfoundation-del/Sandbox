import type {
  ActivityDraft,
  ActivitySource,
  ActivityEntry,
  ChangeMeta,
  ChangeResult,
  EngineeringObject,
  ModelChange,
  ModelSnapshot,
  OutputDraft,
  OutputRecord,
  ReviewStatus,
} from '../domain/types'
import { pinBaseline } from '../domain/configuration'
import { actingModules, canCreate, canWriteProperties, relationshipOwner, validateRelationship } from '../domain/ownership'
import type { Baseline, BaselineDraft, ObjectRevision, ObjectType, Scenario } from '../domain/types'
import { RepositoryError, type EngineeringRepository } from './EngineeringRepository'
import { upgradeLegacyDatabase, type LegacyDatabase } from './upgrade'
import { PROJECT_ID, seedActivity, seedModel, seedOutputs } from './seed'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DemoDatabase {
  /** 3: adds revision history and baselines to schema 2 (SysML, CAD, versioned artifacts). */
  schema: 3
  model: ModelSnapshot
  outputs: OutputRecord[]
  activity: ActivityEntry[]
  /** Every revision of every object and scenario since history began (append-only). */
  history: ObjectRevision[]
  baselines: Baseline[]
}

/** Schema 2 as stored before revision history existed. */
export type DatabaseV2 = Omit<DemoDatabase, 'schema' | 'history' | 'baselines'> & { schema: 2 }

/** History entries for the current state of every object and scenario. */
function historyFromCurrentState(model: ModelSnapshot, changedBy: string, summary: string, at: string): ObjectRevision[] {
  return [
    ...model.objects.map((o) => ({ id: o.id, kind: 'object' as const, revision: o.revision, snapshot: structuredClone(o), changedAt: at, changedBy, summary })),
    ...model.scenarios.map((sc) => ({ id: sc.id, kind: 'scenario' as const, revision: sc.revision, snapshot: structuredClone(sc), changedAt: at, changedBy, summary })),
  ]
}

/**
 * Non-destructive upgrade from schema 2: everything stored is kept as it is;
 * revision history starts with the current state and there are no baselines yet.
 */
export function upgradeToSchema3(db: DatabaseV2): DemoDatabase {
  return {
    ...db,
    schema: 3,
    history: historyFromCurrentState(db.model, 'import', 'State when revision history began', new Date().toISOString()),
    baselines: [],
  }
}

/**
 * Storage keys. Data saved by version 0.1 under the legacy key is copied and
 * extended (never modified or deleted) the first time this version loads.
 */
export const STORAGE_KEY = 'ews.demo-repository.v3'
export const LEGACY_STORAGE_KEY = 'ews.demo-repository.v2'
const MAX_ACTIVITY = 300

function seedDatabase(): DemoDatabase {
  const model = seedModel()
  return {
    schema: 3,
    model,
    outputs: seedOutputs(),
    activity: seedActivity(),
    history: historyFromCurrentState(model, 'import', 'Sample data', '2026-10-01T09:00:00.000Z'),
    baselines: [],
  }
}

/** Storage of the twin of a project other than PRJ-ACT100 (CR-PM-MS-1). */
export const projectStorageKey = (projectId: string) => `ews.twin.${projectId}.v1`
export const PROJECT_INDEX_KEY = 'ews.twin.projects.v1'

/** The twin of a new project: genuinely empty (no sample data), one base configuration. */
export function emptyDatabase(project: { id: string; name: string }): DemoDatabase {
  return {
    schema: 3,
    model: { project: { id: project.id, name: project.name }, configurations: [{ id: 'CFG-BASE', name: 'Baseline', description: 'Base configuration' }], scenarios: [], objects: [], relationships: [], modelRevision: 0 },
    outputs: [],
    activity: [],
    history: [],
    baselines: [],
  }
}

/** Records saved before artifacts were versioned are read as schema version 1. */
function normalize(db: DemoDatabase): DemoDatabase {
  for (const o of db.outputs) if (typeof o.schemaVersion !== 'number') o.schemaVersion = 1
  return db
}

function nextId(prefix: string, existing: Iterable<string>, width: number): string {
  let max = 0
  const pattern = new RegExp(`^${prefix}-(\\d+)$`)
  for (const id of existing) {
    const match = pattern.exec(id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${String(max + 1).padStart(width, '0')}`
}

/**
 * Simulates a cloud repository: every call is asynchronous with latency, data
 * is deep-copied across the boundary, and state persists in browser storage.
 */
export class DemoRepository implements EngineeringRepository {
  readonly info = {
    label: 'Demo repository',
    description: 'Simulated cloud repository. Data is stored only in this browser.',
  }

  /** Demo control: make every call fail as if the service were unreachable. */
  offline = false

  /** The example project PRJ-ACT100 (storage key unchanged). */
  private db: DemoDatabase
  /** Other projects (CR-PM-MS-1): one database each, under `ews.twin.<projectId>.v1`. Empty when created; never seeded. */
  private extra = new Map<string, DemoDatabase>()
  private readonly storage: StorageLike | null
  private readonly latency: [number, number]
  private readonly storageKey: string
  private readonly legacyKey: string | null
  /** Set when stored data was upgraded on read, so the upgrade is persisted at once. */
  private upgraded = false
  /**
   * Objects owned by another service (today: requirements from the Requirements API), registered
   * by the host. Twin relationships and artifacts may reference them; they are never stored or
   * edited here (contracts §2–3, docs/specifications/requirements-contracts.md).
   */
  private external = new Map<string, { type: ObjectType; revision: number }>()

  constructor(
    options: {
      storage?: StorageLike | null
      latencyMs?: [number, number]
      /** Separate keys let a development harness keep its own sample data. */
      storageKey?: string
      legacyStorageKey?: string | null
    } = {},
  ) {
    this.storage = options.storage ?? null
    this.latency = options.latencyMs ?? [150, 400]
    this.storageKey = options.storageKey ?? STORAGE_KEY
    this.legacyKey = options.legacyStorageKey === undefined ? LEGACY_STORAGE_KEY : options.legacyStorageKey
    this.db = this.read()
    // Persist an upgraded copy right away so every window reads the same IDs.
    if (this.storage && (this.upgraded || !this.storage.getItem(this.storageKey))) this.write()
  }

  /** Demo control: discard local data and restore the sample digital twin. */
  async reset(): Promise<void> {
    this.db = seedDatabase()
    this.write()
  }

  /**
   * Creates an empty twin for a project in this browser (CR-PM-MS-1). Idempotent. Never seeds: a new project has
   * no objects, scenarios, relationships, outputs or baselines, and one base configuration. PRJ-ACT100 keeps its data.
   */
  async ensureProject(project: { id: string; name: string }): Promise<void> {
    if (project.id === PROJECT_ID) return
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(project.id)) throw new RepositoryError('invalid', `Invalid project ID ${project.id}.`)
    await withStorageLock(() => {
      if (!this.dbOf(project.id)) {
        this.extra.set(project.id, emptyDatabase(project))
        this.write(project.id)
      }
      try {
        const raw = this.storage?.getItem(PROJECT_INDEX_KEY)
        const listed = raw ? (JSON.parse(raw) as { id: string; name: string }[]) : []
        if (!listed.some((p) => p.id === project.id)) this.storage?.setItem(PROJECT_INDEX_KEY, JSON.stringify([...listed, { id: project.id, name: project.name }]))
      } catch {
        // Storage blocked: the project works in memory for this session.
      }
    })
  }

  /** Projects with a twin in this browser: the example project first. */
  async listProjects(): Promise<{ id: string; name: string }[]> {
    const others = this.knownProjectIds()
      .map((id) => this.dbOf(id))
      .filter((d): d is DemoDatabase => !!d)
      .map((d) => ({ id: d.model.project.id, name: d.model.project.name }))
    return [{ id: PROJECT_ID, name: this.db.model.project.name }, ...others]
  }

  loadModel(projectId: string) {
    return this.call(projectId, (db) => {
      return db.model
    })
  }

  submitChanges(projectId: string, changes: ModelChange[], meta: ChangeMeta) {
    return this.mutate(projectId, (db): ChangeResult => {
      const model = db.model
      const revision = model.modelRevision + 1
      const changedIds: string[] = []
      const createdIds: string[] = []
      /** Placeholders from add-object changes (e.g. "$new1") → assigned IDs. */
      const refs = new Map<string, string>()
      const resolve = (id: string) => refs.get(id) ?? id
      const modules = actingModules(meta)
      const forbid = (check: { ok: boolean; message?: string }) => {
        if (!check.ok) throw new RepositoryError('forbidden', check.message!)
      }
      const typeOf = (id: string): ObjectType | 'artifact' | undefined =>
        model.objects.find((o) => o.id === id)?.type ?? this.external.get(id)?.type ?? (db.outputs.some((o) => o.id === id) ? 'artifact' : undefined)

      for (const change of changes) {
        switch (change.kind) {
          case 'update-properties': {
            const target: { revision: number; name: string; properties: EngineeringObject['properties'] } | undefined =
              model.objects.find((o) => o.id === change.targetId) ??
              model.scenarios.find((s) => s.id === change.targetId)
            if (!target) throw new RepositoryError('not-found', `${change.targetId} does not exist.`)
            const object = model.objects.find((o) => o.id === change.targetId)
            forbid(canWriteProperties(modules, object ? object.type : 'scenario', change.targetId, Object.keys(change.properties), change.name !== undefined))
            if (target.revision !== change.baseRevision) {
              throw new RepositoryError(
                'conflict',
                `${change.targetId} was changed by someone else (rev ${change.baseRevision} → ${target.revision}). Reload and try again.`,
              )
            }
            target.properties = { ...target.properties, ...change.properties }
            if (change.name !== undefined) target.name = change.name
            target.revision = revision
            changedIds.push(change.targetId)
            break
          }
          case 'add-object': {
            if (!/^[A-Z]{2,4}$/.test(change.idPrefix)) throw new RepositoryError('invalid', `Invalid ID prefix ${change.idPrefix}.`)
            forbid(canCreate(modules, change.object.type))
            const parentId = change.object.parentId ? resolve(change.object.parentId) : undefined
            if (parentId && !model.objects.some((o) => o.id === parentId)) {
              throw new RepositoryError('not-found', `Parent ${parentId} does not exist.`)
            }
            const id = nextId(change.idPrefix, model.objects.map((o) => o.id), 3)
            model.objects.push({ ...change.object, ...(parentId ? { parentId } : {}), id, revision })
            if (change.ref) refs.set(change.ref, id)
            createdIds.push(id)
            break
          }
          case 'add-relationship': {
            const from = resolve(change.relationship.from)
            const to = resolve(change.relationship.to)
            const type = change.relationship.type
            const known = (id: string) =>
              model.objects.some((o) => o.id === id) || this.external.has(id) || db.outputs.some((o) => o.id === id)
            if (!known(from) || !known(to)) {
              throw new RepositoryError('not-found', `${!known(from) ? from : to} does not exist.`)
            }
            const fromType = typeOf(from)!
            const valid = validateRelationship(type, fromType, typeOf(to)!)
            if (!valid.ok) throw new RepositoryError('invalid', valid.message)
            forbid(this.canWriteRelationship(db, modules, type, from, fromType))
            if (model.relationships.some((r) => r.type === type && r.from === from && r.to === to)) break
            const id = nextId('REL', model.relationships.map((r) => r.id), 4)
            model.relationships.push({ type, from, to, id, revision })
            changedIds.push(from, to)
            break
          }
          case 'remove-relationship': {
            const existing = model.relationships.find((r) => r.id === change.relationshipId)
            if (!existing) break
            forbid(this.canWriteRelationship(db, modules, existing.type, existing.from, typeOf(existing.from) ?? 'artifact'))
            model.relationships = model.relationships.filter((r) => r.id !== change.relationshipId)
            changedIds.push(existing.from, existing.to)
            break
          }
        }
      }

      model.modelRevision = revision
      // Append the new revision of every changed or created object and scenario (immutable history).
      const at = new Date().toISOString()
      for (const id of new Set([...changedIds, ...createdIds])) {
        const object = model.objects.find((o) => o.id === id && o.revision === revision)
        const scenario = model.scenarios.find((sc) => sc.id === id && sc.revision === revision)
        const snapshot: EngineeringObject | Scenario | undefined = object ?? scenario
        if (snapshot) {
          db.history.push({ id, kind: object ? 'object' : 'scenario', revision, snapshot: structuredClone(snapshot), changedAt: at, changedBy: meta.toolId === 'assistant' ? `assistant for ${modules.join(', ')}` : meta.toolId, summary: meta.summary })
        }
      }
      this.log(db, {
        kind: 'change',
        toolId: meta.toolId,
        message: `${meta.summary} (model rev ${revision})`,
        objectIds: [...new Set([...changedIds, ...createdIds])],
        configurationId: meta.configurationId,
        source: meta.source,
      })
      return { snapshot: model, modelRevision: revision, changedIds, createdIds }
    })
  }

  listOutputs(projectId: string) {
    return this.call(projectId, (db) => db.outputs.filter((o) => o.projectId === projectId), [])
  }

  /** Replaces the set of externally owned objects twin data may reference (host-registered, not persisted). */
  registerExternalObjects(objects: { id: string; type: ObjectType; revision: number }[]): void {
    this.external = new Map(objects.map((o) => [o.id, { type: o.type, revision: o.revision }]))
  }

  saveOutput(draft: OutputDraft, options: { source?: ActivitySource } = {}) {
    return this.mutate(draft.projectId, (db) => {
      const model = db.model
      if (!model.configurations.some((c) => c.id === draft.configurationId)) {
        throw new RepositoryError('invalid', `Unknown configuration ${draft.configurationId}.`)
      }
      if (draft.scenarioId !== null && !model.scenarios.some((s) => s.id === draft.scenarioId)) {
        throw new RepositoryError('invalid', `Unknown scenario ${draft.scenarioId}.`)
      }
      if (draft.inputRevision > model.modelRevision) {
        throw new RepositoryError('invalid', 'Output refers to a model revision that does not exist.')
      }
      const known = new Set([...model.objects.map((o) => o.id), ...this.external.keys()])
      const missing = draft.objectIds.filter((id) => !known.has(id))
      if (missing.length) throw new RepositoryError('invalid', `Unknown objects: ${missing.join(', ')}.`)
      for (const ref of draft.references ?? []) {
        const isObject = known.has(ref.id)
        const exists = isObject || db.outputs.some((o) => o.id === ref.id) || db.baselines.some((b) => b.id === ref.id)
        if (!exists) throw new RepositoryError('invalid', `Reference to unknown ${ref.id}.`)
        // External objects keep their history in their own service, which validated the revision.
        if (ref.revision !== undefined && isObject && !this.external.has(ref.id) && !db.history.some((h) => h.id === ref.id && h.revision === ref.revision)) {
          throw new RepositoryError('invalid', `${ref.id} has no revision ${ref.revision}.`)
        }
      }

      const output: OutputRecord = {
        ...draft,
        schemaVersion: draft.schemaVersion ?? 1,
        id: nextId('OUT', db.outputs.map((o) => o.id), 4),
        createdAt: new Date().toISOString(),
        reviewStatus: 'draft',
      }
      db.outputs.push(output)
      this.log(db, {
        kind: 'save',
        toolId: draft.toolId,
        message: `Saved ${output.id} ${output.title}`,
        objectIds: output.objectIds,
        configurationId: output.configurationId,
        scenarioId: output.scenarioId,
        source: options.source,
      })
      return output
    })
  }

  setReviewStatus(outputId: string, status: ReviewStatus, meta: ChangeMeta) {
    return this.mutate(this.projectOfOutput(outputId), (db) => {
      const output = db.outputs.find((o) => o.id === outputId)
      if (!output) throw new RepositoryError('not-found', `${outputId} does not exist.`)
      output.reviewStatus = status
      this.log(db, {
        kind: 'review',
        toolId: meta.toolId,
        message: meta.summary,
        objectIds: output.objectIds,
        configurationId: output.configurationId,
        scenarioId: output.scenarioId,
        source: meta.source,
      })
      return output
    })
  }

  listActivity(projectId: string, limit = 100) {
    return this.call(projectId, (db) => {
      return db.activity.slice(0, limit)
    })
  }

  addActivity(projectId: string, entry: ActivityDraft) {
    return this.mutate(projectId, (db) => {
      return this.log(db, entry)
    })
  }

  // ---- revisions and baselines --------------------------------------------------

  /** One exact revision of an object or scenario (revision-qualified reference). */
  getRevision(projectId: string, id: string, revision: number) {
    return this.call(projectId, (db) => {
      const entry = db.history.find((h) => h.id === id && h.revision === revision)
      if (!entry) throw new RepositoryError('not-found', `${id} has no recorded revision ${revision}.`)
      return entry
    })
  }

  /** Revision history of an object or scenario, newest first. */
  listHistory(projectId: string, id: string) {
    return this.call(projectId, (db) => {
      return db.history.filter((h) => h.id === id).sort((a, b) => b.revision - a.revision)
    })
  }

  listBaselines(projectId: string) {
    return this.call(projectId, (db) => db.baselines.filter((b) => b.projectId === projectId), [])
  }

  /** Pins the current revision of every object, scenario and relationship. */
  createBaseline(projectId: string, draft: BaselineDraft, meta: { toolId: string }) {
    return this.mutate(projectId, (db) => {
      const name = draft.name.trim()
      if (!name) throw new RepositoryError('invalid', 'A baseline needs a name.')
      if (db.baselines.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
        throw new RepositoryError('invalid', `A baseline named “${name}” already exists.`)
      }
      if (!db.model.configurations.some((c) => c.id === draft.configurationId)) {
        throw new RepositoryError('invalid', `Unknown configuration ${draft.configurationId}.`)
      }
      const external = draft.external
      const unknown = external?.objects.filter((o) => !this.external.has(o.id)) ?? []
      if (unknown.length) throw new RepositoryError('invalid', `Unknown external objects: ${unknown.map((o) => o.id).join(', ')}.`)
      const pinned: ModelSnapshot = external
        ? {
            ...db.model,
            objects: [
              ...db.model.objects.filter((o) => !external.replaces.includes(o.id)),
              ...external.objects.map((o) => ({ id: o.id, type: this.external.get(o.id)!.type, name: '', properties: {}, revision: o.revision })),
            ],
            relationships: external.relationships,
          }
        : db.model
      const baseline = pinBaseline(pinned, {
        id: nextId('BL', db.baselines.map((b) => b.id), 3),
        name,
        description: draft.description?.trim() ?? '',
        configurationId: draft.configurationId,
        createdAt: new Date().toISOString(),
        createdBy: meta.toolId,
      })
      db.baselines.push(baseline)
      this.log(db, {
        kind: 'baseline',
        toolId: meta.toolId,
        message: `Baseline ${baseline.id} “${name}” pins model rev ${baseline.modelRevision} (${baseline.objects.length} objects, ${baseline.relationships.length} relationships)`,
        objectIds: [],
        configurationId: draft.configurationId,
      })
      return baseline
    })
  }

  // ---- internals -----------------------------------------------------------

  /** Relationships are owned by the module that owns their `from` end. */
  private canWriteRelationship(db: DemoDatabase, modules: string[], type: string, from: string, fromType: ObjectType | 'artifact') {
    const producer = fromType === 'artifact' ? db.outputs.find((o) => o.id === from)?.toolId : undefined
    const owner = relationshipOwner(fromType, producer)
    if (modules.includes(owner) || (owner === 'product' && modules.includes('platform'))) return { ok: true as const }
    return { ok: false as const, message: `“${type}” links from ${from} are owned by the ${owner} module; ${modules.join(', ') || 'this writer'} may not change them.` }
  }

  /** The database of a project (re-read from storage), or undefined when this browser has no twin for it. */
  private dbOf(projectId: string): DemoDatabase | undefined {
    if (projectId === PROJECT_ID) return this.db
    if (this.storage) {
      const raw = this.storage.getItem(projectStorageKey(projectId))
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as DemoDatabase
          if (parsed.schema === 3 && parsed.model && Array.isArray(parsed.outputs)) this.extra.set(projectId, normalize(parsed))
        } catch {
          // Corrupt entry: keep what is in memory (never replaced by sample data).
        }
      }
    }
    return this.extra.get(projectId)
  }

  private setDb(projectId: string, db: DemoDatabase) {
    if (projectId === PROJECT_ID) this.db = db
    else this.extra.set(projectId, db)
  }

  private projectOfOutput(outputId: string): string {
    for (const id of [PROJECT_ID, ...this.knownProjectIds()]) if (this.dbOf(id)?.outputs.some((o) => o.id === outputId)) return id
    return PROJECT_ID
  }

  private knownProjectIds(): string[] {
    try {
      const raw = this.storage?.getItem(PROJECT_INDEX_KEY)
      const listed = raw ? (JSON.parse(raw) as { id: string }[]).map((p) => p.id) : []
      return [...new Set([...listed, ...this.extra.keys()])]
    } catch {
      return [...this.extra.keys()]
    }
  }

  private log(db: DemoDatabase, entry: ActivityDraft): ActivityEntry {
    const record: ActivityEntry = {
      ...entry,
      id: nextId('LOG', db.activity.map((a) => a.id), 5),
      at: new Date().toISOString(),
    }
    db.activity = [record, ...db.activity].slice(0, MAX_ACTIVITY)
    return record
  }

  private async delay() {
    const [min, max] = this.latency
    const ms = min + Math.random() * (max - min)
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms))
    if (this.offline) throw new RepositoryError('unavailable', 'Demo repository is unreachable (simulated outage).')
  }

  /** Read-only call: results are copied so callers can't mutate stored data. `fallback`: result for a project this browser has no twin for. */
  private async call<T>(projectId: string, read: (db: DemoDatabase) => T, fallback?: T): Promise<T> {
    await this.delay()
    this.refresh()
    const db = this.dbOf(projectId)
    if (!db) {
      if (fallback !== undefined) return fallback
      throw new RepositoryError('not-found', `Project ${projectId} not found.`)
    }
    return structuredClone(read(db))
  }

  /**
   * Write call: works on a copy and commits only if the whole operation succeeds.
   * Other windows share the same storage, so the latest data is reread inside a
   * cross-window lock first; revision checks then see edits made elsewhere.
   */
  private async mutate<T>(projectId: string, write: (db: DemoDatabase) => T): Promise<T> {
    await this.delay()
    return withStorageLock(() => {
      this.refresh()
      const current = this.dbOf(projectId)
      if (!current) throw new RepositoryError('not-found', `Project ${projectId} not found.`)
      const draft = structuredClone(current)
      const result = write(draft)
      this.setDb(projectId, draft)
      this.write(projectId)
      return structuredClone(result)
    })
  }

  /** Reloads from storage, which other windows may have written to. */
  private refresh() {
    if (this.storage) this.db = this.read()
  }

  private read(): DemoDatabase {
    try {
      const raw = this.storage?.getItem(this.storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDatabase | DatabaseV2
        if (parsed.schema === 3 && parsed.model && Array.isArray(parsed.outputs)) return normalize(parsed)
        if (parsed.schema === 2 && parsed.model && Array.isArray(parsed.outputs)) {
          this.upgraded = true
          return normalize(upgradeToSchema3(parsed))
        }
      }
      // First load after upgrading: copy data saved by version 0.1 and add the new
      // representations. The legacy entry itself is left untouched.
      const legacy = this.legacyKey ? this.storage?.getItem(this.legacyKey) : null
      if (legacy) {
        const parsed = JSON.parse(legacy) as LegacyDatabase
        if (parsed.schema === 1 && parsed.model && Array.isArray(parsed.outputs)) return upgradeToSchema3(upgradeLegacyDatabase(parsed))
      }
    } catch {
      // Corrupt or inaccessible storage: fall back to the sample data.
    }
    return seedDatabase()
  }

  private write(projectId: string = PROJECT_ID) {
    try {
      if (projectId === PROJECT_ID) this.storage?.setItem(this.storageKey, JSON.stringify(this.db))
      else this.storage?.setItem(projectStorageKey(projectId), JSON.stringify(this.extra.get(projectId)))
    } catch {
      // Storage full or blocked; the session keeps working in memory.
    }
  }
}

/** Serialises writes across windows of the same origin (Web Locks API), where available. */
async function withStorageLock<T>(fn: () => T): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
  if (!locks) return fn()
  return locks.request('ews-demo-repository', async () => fn())
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
