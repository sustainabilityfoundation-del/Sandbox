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
import { PROJECT_ID, seedActivity, seedModel, seedOutputs } from './seed'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface DemoDatabase {
  schema: 1
  model: ModelSnapshot
  outputs: OutputRecord[]
  activity: ActivityEntry[]
}

// v2: sample twin adds a maximum-load analysis and sets SCN-MAX to 11 kN.
const STORAGE_KEY = 'ews.demo-repository.v2'
const MAX_ACTIVITY = 300

function seedDatabase(): DemoDatabase {
  return { schema: 1, model: seedModel(), outputs: seedOutputs(), activity: seedActivity() }
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

  constructor(options: { storage?: StorageLike | null; latencyMs?: [number, number] } = {}) {
    this.storage = options.storage ?? null
    this.latency = options.latencyMs ?? [150, 400]
    this.db = this.read()
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
            const id = nextId(change.idPrefix, model.objects.map((o) => o.id), 3)
            model.objects.push({ ...change.object, id, revision })
            createdIds.push(id)
            break
          }
          case 'add-relationship': {
            const { type, from, to } = change.relationship
            if (model.relationships.some((r) => r.type === type && r.from === from && r.to === to)) break
            const id = nextId('REL', model.relationships.map((r) => r.id), 4)
            model.relationships.push({ ...change.relationship, id, revision })
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
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DemoDatabase
        if (parsed.schema === 1 && parsed.model && Array.isArray(parsed.outputs)) return parsed
      }
    } catch {
      // Corrupt or inaccessible storage: fall back to the sample data.
    }
    return seedDatabase()
  }

  private write() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.db))
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
