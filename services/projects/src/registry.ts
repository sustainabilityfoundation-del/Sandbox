import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { ARTIFACT_CATEGORIES, type ArtifactCategory, type ArtifactChange, type ArtifactDescriptor, type ArtifactSource, type NativeRef } from '@ews/platform-sdk'

/**
 * Artifact registry consumer and reconciliation (ADR-0062, integration milestone 1 C5).
 *
 * - Module sources deliver committed changes (at least once); the consumer dedupes by event ID, asks the module to
 *   describe the refs and upserts the registry in one transaction with an observation per record and outbox events.
 * - Reconciliation pages through each module's `list` and makes the registry converge: new and changed records are
 *   upserted, records the module no longer lists become `missing-in-module`, records of modules that are not
 *   installed become `module-unavailable`. Nothing is ever deleted.
 * - Only projects known to the registry are indexed (events of other projects are ignored).
 */
export interface RegistryOptions {
  pool: Pool
  sources: ArtifactSource[]
  onError?: (error: unknown) => void
}

type Db = Pick<PoolClient, 'query'>

const MODULES_OWNED_HERE = new Set(['projects', 'product'])

function categoryOf(source: ArtifactSource, kind: string): ArtifactCategory {
  const info = source.describeModule().kinds.find((k) => k.kind === kind)
  return info && (ARTIFACT_CATEGORIES as readonly string[]).includes(info.category) ? info.category : 'model'
}

async function emit(db: Db, projectId: string, type: string, entityId: string, revision: number, actor: string) {
  await db.query(`INSERT INTO projects.outbox (event_id, project_id, type, entity_id, committed_revision, occurred_at, actor) VALUES ($1,$2,$3,$4,$5, now(), $6)`, [randomUUID(), projectId, type, entityId, revision, actor])
}

/** Upserts one descriptor; returns the artifact ID and whether anything changed. */
export async function upsertDescriptor(db: Db, source: ArtifactSource, projectId: string, d: ArtifactDescriptor, via: string): Promise<{ id: string; changed: boolean }> {
  const { rows } = await db.query<{ id: string; version_value: string; lifecycle: string; title: string; key: string; availability: string; module_state: string | null; revision: number }>(
    'SELECT id, version_value, lifecycle, title, key, availability, module_state, revision FROM projects.artifacts WHERE project_id = $1 AND module = $2 AND kind = $3 AND native_id = $4 FOR UPDATE',
    [projectId, d.ref.module, d.ref.kind, d.ref.id],
  )
  let container: string | null = null
  if (d.container) {
    const c = await db.query<{ id: string }>('SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = $2 AND kind = $3 AND native_id = $4', [projectId, d.container.module, d.container.kind, d.container.id])
    container = c.rows[0]?.id ?? null
  }
  const version = String(d.version.value)
  const existing = rows[0]
  if (existing) {
    const same = existing.version_value === version && existing.lifecycle === d.lifecycle && existing.title === d.title && existing.key === d.key && existing.availability === 'available' && (existing.module_state ?? null) === (d.moduleState ?? null)
    if (same) {
      await db.query('UPDATE projects.artifacts SET confirmed_at = now() WHERE id = $1', [existing.id])
      return { id: existing.id, changed: false }
    }
    const upd = await db.query<{ revision: number }>(
      `UPDATE projects.artifacts SET key = $2, title = $3, lifecycle = $4, module_state = $5, version_value = $6, version_label = $7, version_at = $8, container_id = coalesce($9, container_id),
         availability = 'available', open_link = coalesce($10, open_link), modified_at = $11, modified_by = $12, confirmed_at = now(), revision = revision + 1 WHERE id = $1 RETURNING revision`,
      [existing.id, d.key, d.title, d.lifecycle, d.moduleState ?? null, version, d.version.label ?? null, d.version.at, container, d.open ? JSON.stringify(d.open) : null, d.modifiedAt, d.modifiedBy],
    )
    await db.query(`INSERT INTO projects.artifact_observations (artifact_id, record_revision, version_value, lifecycle, availability, observed_at, via, actor) VALUES ($1,$2,$3,$4,'available', now(), $5, $6)`, [
      existing.id,
      upd.rows[0].revision,
      version,
      d.lifecycle,
      via,
      d.modifiedBy,
    ])
    await emit(db, projectId, existing.availability === 'available' ? 'artifact.updated' : 'artifact.availability-changed', existing.id, upd.rows[0].revision, d.modifiedBy)
    return { id: existing.id, changed: true }
  }
  const id = randomUUID()
  await db.query(
    `INSERT INTO projects.artifacts (id, project_id, module, kind, native_id, category, key, title, lifecycle, module_state, version_value, version_label, version_at, container_id, source, open_link, created_at, created_by, modified_at, modified_by, confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'module',$15,$16,$17,$18,$19, now())`,
    [id, projectId, d.ref.module, d.ref.kind, d.ref.id, categoryOf(source, d.ref.kind), d.key, d.title, d.lifecycle, d.moduleState ?? null, version, d.version.label ?? null, d.version.at, container, d.open ? JSON.stringify(d.open) : null, d.createdAt, d.createdBy, d.modifiedAt, d.modifiedBy],
  )
  await db.query(`INSERT INTO projects.artifact_observations (artifact_id, record_revision, version_value, lifecycle, availability, observed_at, via, actor) VALUES ($1,1,$2,$3,'available', now(), $4, $5)`, [id, version, d.lifecycle, via, d.createdBy])
  await emit(db, projectId, 'artifact.registered', id, 1, d.createdBy)
  return { id, changed: true }
}

async function markMissing(db: Db, ids: string[], availability: 'missing-in-module' | 'module-unavailable', via: string) {
  for (const id of ids) {
    const { rows } = await db.query<{ project_id: string; version_value: string; lifecycle: string; revision: number }>(
      `UPDATE projects.artifacts SET availability = $2, revision = revision + 1 WHERE id = $1 AND availability <> $2 RETURNING project_id, version_value, lifecycle, revision`,
      [id, availability],
    )
    const r = rows[0]
    if (!r) continue
    await db.query(`INSERT INTO projects.artifact_observations (artifact_id, record_revision, version_value, lifecycle, availability, observed_at, via, actor) VALUES ($1,$2,$3,$4,$5, now(), $6, 'system:projects')`, [
      id,
      r.revision,
      r.version_value,
      r.lifecycle,
      availability,
      via,
    ])
    await emit(db, r.project_id, 'artifact.availability-changed', id, r.revision, 'system:projects')
  }
}

async function tx<T>(pool: Pool, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw e
  } finally {
    client.release()
  }
}

export interface ReconcileReport {
  modules: { module: string; status: 'reconciled' | 'unavailable' | 'failed'; listed?: number; upserted?: number; missing?: number; error?: string }[]
  unavailableModules: string[]
}

/** Makes the registry of a project converge with every installed module. */
export async function reconcileProject(options: RegistryOptions, projectId: string, actor = 'system:projects'): Promise<ReconcileReport> {
  const { pool, sources } = options
  const run = await pool.query<{ id: string }>(`INSERT INTO projects.reconciliation_runs (project_id, started_at, actor) VALUES ($1, now(), $2) RETURNING id`, [projectId, actor])
  const report: ReconcileReport = { modules: [], unavailableModules: [] }
  for (const source of sources) {
    try {
      const seen = new Set<string>()
      let upserted = 0
      let cursor: string | undefined
      do {
        const page = await source.list(projectId, { cursor, limit: 500 })
        await tx(pool, async (db) => {
          for (const d of page.items) {
            const r = await upsertDescriptor(db, source, projectId, d, 'reconcile')
            seen.add(r.id)
            if (r.changed) upserted++
          }
        })
        cursor = page.nextCursor
      } while (cursor)
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM projects.artifacts WHERE project_id = $1 AND module = $2 AND availability <> 'missing-in-module'`, [projectId, source.module])
      const missing = rows.map((r) => r.id).filter((id) => !seen.has(id))
      if (missing.length) await tx(pool, (db) => markMissing(db, missing, 'missing-in-module', 'reconcile'))
      report.modules.push({ module: source.module, status: 'reconciled', listed: seen.size, upserted, missing: missing.length })
    } catch (e) {
      report.modules.push({ module: source.module, status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
  }
  // Records of modules that are not installed here are kept and labelled.
  const installed = new Set([...sources.map((s) => s.module), ...MODULES_OWNED_HERE])
  const { rows } = await pool.query<{ id: string; module: string }>(`SELECT id, module FROM projects.artifacts WHERE project_id = $1 AND availability = 'available'`, [projectId])
  const orphaned = rows.filter((r) => !installed.has(r.module))
  if (orphaned.length) {
    await tx(pool, (db) => markMissing(db, orphaned.map((r) => r.id), 'module-unavailable', 'reconcile'))
    report.unavailableModules = [...new Set(orphaned.map((r) => r.module))]
  }
  await pool.query(`UPDATE projects.reconciliation_runs SET finished_at = now(), report = $2 WHERE id = $1`, [run.rows[0].id, JSON.stringify(report)])
  return report
}

/** Registers refs the registry has not seen yet by asking their modules (synchronous registration, ADR-0062). */
export async function describeAndRegister(options: RegistryOptions, projectId: string, refs: NativeRef[]): Promise<number> {
  let registered = 0
  for (const source of options.sources) {
    const mine = refs.filter((r) => r.module === source.module)
    if (!mine.length) continue
    const descriptors = await source.describe(projectId, mine)
    await tx(options.pool, async (db) => {
      for (const d of descriptors) if ((await upsertDescriptor(db, source, projectId, d, 'resolve')).changed) registered++
    })
  }
  return registered
}

/**
 * Subscribes to every source; returns a stop function. Changes are applied one at a time per process, in order.
 * A failed change is not marked consumed, so a redelivery (or the next reconciliation) applies it.
 */
export function startRegistryConsumer(options: RegistryOptions): { stop: () => void; idle: () => Promise<void> } {
  const { pool, sources } = options
  const onError = options.onError ?? ((e) => console.error('[projects registry]', e))
  let chain: Promise<void> = Promise.resolve()
  const handle = (source: ArtifactSource, change: ArtifactChange) => {
    chain = chain
      .then(async () => {
        const known = await pool.query('SELECT 1 FROM projects.projects WHERE id = $1', [change.projectId])
        if (!known.rowCount) return
        const done = await pool.query('SELECT 1 FROM projects.consumed_events WHERE module = $1 AND event_id = $2', [source.module, change.eventId])
        if (done.rowCount) return
        if (change.kind === 'reconcile') {
          await reconcileProject(options, change.projectId)
        } else {
          const descriptors = await source.describe(change.projectId, change.refs)
          await tx(pool, async (db) => {
            for (const d of descriptors) await upsertDescriptor(db, source, change.projectId, d, `event:${change.eventId}`)
            const described = new Set(descriptors.map((d) => `${d.ref.kind}/${d.ref.id}`))
            const gone = change.refs.filter((r) => !described.has(`${r.kind}/${r.id}`))
            if (gone.length) {
              const { rows } = await db.query<{ id: string }>(
                `SELECT a.id FROM projects.artifacts a JOIN unnest($2::text[], $3::text[]) AS g(kind, id) ON a.kind = g.kind AND a.native_id = g.id WHERE a.project_id = $1 AND a.module = $4`,
                [change.projectId, gone.map((g) => g.kind), gone.map((g) => g.id), source.module],
              )
              await markMissing(db, rows.map((r) => r.id), 'missing-in-module', `event:${change.eventId}`)
            }
          })
        }
        await pool.query('INSERT INTO projects.consumed_events (module, event_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [source.module, change.eventId])
      })
      .catch(onError)
  }
  const unsubscribes = sources.map((s) => s.subscribe((change) => handle(s, change)))
  return {
    stop: () => unsubscribes.forEach((u) => u()),
    idle: () => chain,
  }
}
