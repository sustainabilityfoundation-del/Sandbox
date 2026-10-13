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
import { RepositoryError, type EngineeringRepository } from './EngineeringRepository'
import { upgradeLegacyDatabase, type LegacyDatabase } from './upgrade'
import { PROJECT_ID, seedActivity, seedModel, seedOutputs } from './seed'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface DemoDatabase {
  /** 2: SysML elements, CAD representations and versioned artifacts. */
  schema: 2
  model: ModelSnapshot
  outputs: OutputRecord[]
  activity: ActivityEntry[]
}

/**
 * Storage keys. Data saved by version 0.1 under the legacy key is copied and
 * extended (never modified or deleted) the first time this version loads.
 */
export const STORAGE_KEY = 'ews.demo-repository.v3'
export const LEGACY_STORAGE_KEY = 'ews.demo-repository.v2'
const MAX_ACTIVITY = 300

function seedDatabase(): DemoDatabase {
  return { schema: 2, model: seedModel(), outputs: seedOutputs(), activity: seedActivity() }
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

  private db: DemoDatabase
  private readonly storage: StorageLike | null
  private readonly latency: [number, number]
  private readonly storageKey: string
  private readonly legacyKey: string | null

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
    if (this.storage && !this.storage.getItem(this.storageKey)) this.write()
  }

  /** Demo control: discard local data and restore the sample digital twin. */
  async reset(): Promise<void> {
    this.db = seedDatabase()
    this.write()
  }

  loadModel(projectId: string) {
    return this.call((db) => {
      this.assertProject(projectId)
      return db.model
    })
  }

  submitChanges(projectId: string, changes: ModelChange[], meta: ChangeMeta) {
    return this.mutate((db): ChangeResult => {
      this.assertProject(projectId)
      const model = db.model
      const revision = model.modelRevision + 1
      const changedIds: string[] = []
      const createdIds: string[] = []
      /** Placeholders from add-object changes (e.g. "$new1") → assigned IDs. */
      const refs = new Map<string, string>()
      const resolve = (id: string) => refs.get(id) ?? id

      for (const change of changes) {
        switch (change.kind) {
          case 'update-properties': {
            const target: { revision: number; name: string; properties: EngineeringObject['properties'] } | undefined =
              model.objects.find((o) => o.id === change.targetId) ??
              model.scenarios.find((s) => s.id === change.targetId)
            if (!target) throw new RepositoryError('not-found', `${change.targetId} does not exist.`)
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
              model.objects.some((o) => o.id === id) || db.outputs.some((o) => o.id === id)
            if (!known(from) || !known(to)) {
              throw new RepositoryError('not-found', `${!known(from) ? from : to} does not exist.`)
            }
            if (model.relationships.some((r) => r.type === type && r.from === from && r.to === to)) break
            const id = nextId('REL', model.relationships.map((r) => r.id), 4)
            model.relationships.push({ type, from, to, id, revision })
            changedIds.push(from, to)
            break
          }
          case 'remove-relationship': {
            const existing = model.relationships.find((r) => r.id === change.relationshipId)
            if (!existing) break
            model.relationships = model.relationships.filter((r) => r.id !== change.relationshipId)
            changedIds.push(existing.from, existing.to)
            break
          }
        }
      }

      model.modelRevision = revision
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
    return this.call((db) => db.outputs.filter((o) => o.projectId === projectId))
  }

  saveOutput(draft: OutputDraft, options: { source?: ActivitySource } = {}) {
    return this.mutate((db) => {
      this.assertProject(draft.projectId)
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
      const known = new Set(model.objects.map((o) => o.id))
      const missing = draft.objectIds.filter((id) => !known.has(id))
      if (missing.length) throw new RepositoryError('invalid', `Unknown objects: ${missing.join(', ')}.`)

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
    return this.mutate((db) => {
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
    return this.call((db) => {
      this.assertProject(projectId)
      return db.activity.slice(0, limit)
    })
  }

  addActivity(projectId: string, entry: ActivityDraft) {
    return this.mutate((db) => {
      this.assertProject(projectId)
      return this.log(db, entry)
    })
  }

  // ---- internals -----------------------------------------------------------

  private assertProject(projectId: string) {
    if (projectId !== PROJECT_ID) throw new RepositoryError('not-found', `Project ${projectId} not found.`)
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

  /** Read-only call: results are copied so callers can't mutate stored data. */
  private async call<T>(read: (db: DemoDatabase) => T): Promise<T> {
    await this.delay()
    this.refresh()
    return structuredClone(read(this.db))
  }

  /**
   * Write call: works on a copy and commits only if the whole operation succeeds.
   * Other windows share the same storage, so the latest data is reread inside a
   * cross-window lock first; revision checks then see edits made elsewhere.
   */
  private async mutate<T>(write: (db: DemoDatabase) => T): Promise<T> {
    await this.delay()
    return withStorageLock(() => {
      this.refresh()
      const draft = structuredClone(this.db)
      const result = write(draft)
      this.db = draft
      this.write()
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
        const parsed = JSON.parse(raw) as DemoDatabase
        if (parsed.schema === 2 && parsed.model && Array.isArray(parsed.outputs)) return normalize(parsed)
      }
      // First load after upgrading: copy data saved by version 0.1 and add the new
      // representations. The legacy entry itself is left untouched.
      const legacy = this.legacyKey ? this.storage?.getItem(this.legacyKey) : null
      if (legacy) {
        const parsed = JSON.parse(legacy) as LegacyDatabase
        if (parsed.schema === 1 && parsed.model && Array.isArray(parsed.outputs)) return upgradeLegacyDatabase(parsed)
      }
    } catch {
      // Corrupt or inaccessible storage: fall back to the sample data.
    }
    return seedDatabase()
  }

  private write() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.db))
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
