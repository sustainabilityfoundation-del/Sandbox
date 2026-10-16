import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { GenerationSubject, JobChangedEvent, JobState } from '@ews/visualization-client'

/**
 * Job events (transactional outbox). Every state change writes a row in its own transaction; writers take a
 * transaction-scoped advisory lock first, so `seq` order equals commit order and a reader that resumes after a
 * sequence never misses a row. One poller per process fans rows out to subscribers. Events are hints: consumers
 * re-read the job.
 */
const LOCK = 0x5649_5a31 // "VIZ1"

export async function emitJobChanged(db: Pick<PoolClient, 'query'>, job: { id: string; project_id: string; batch_id: string | null; state: JobState; subject: GenerationSubject; client_ref: string | null }): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [LOCK])
  await db.query('INSERT INTO visualization.outbox (event_id, project_id, job_id, batch_id, state, subject, client_ref) VALUES ($1,$2,$3,$4,$5,$6,$7)', [
    randomUUID(),
    job.project_id,
    job.id,
    job.batch_id,
    job.state,
    JSON.stringify(job.subject),
    job.client_ref,
  ])
}

type Row = { seq: string; event_id: string; project_id: string; job_id: string; batch_id: string | null; state: JobState; subject: GenerationSubject; client_ref: string | null; occurred_at: Date }

const toEvent = (r: Row): JobChangedEvent => ({
  eventId: r.event_id,
  seq: Number(r.seq),
  type: 'visualization.job-changed',
  projectId: r.project_id,
  jobId: r.job_id,
  batchId: r.batch_id,
  state: r.state,
  subject: r.subject,
  clientRef: r.client_ref,
  occurredAt: new Date(r.occurred_at).toISOString(),
})

export interface VisualizationEventHub {
  subscribe(projectId: string, listener: (e: JobChangedEvent) => void): () => void
  subscribeAll(listener: (e: JobChangedEvent) => void): () => void
  /** Events of a project after a sequence (oldest first, at most 500). */
  readAfter(projectId: string, after: number): Promise<JobChangedEvent[]>
  /** Delivers everything committed so far (tests, after a write). */
  flush(): Promise<void>
  close(): Promise<void>
}

export async function createVisualizationEventHub(pool: Pool, options: { pollMs?: number; onError?: (e: unknown) => void } = {}): Promise<VisualizationEventHub> {
  const listeners = new Map<string, Set<(e: JobChangedEvent) => void>>()
  const all = new Set<(e: JobChangedEvent) => void>()
  const onError = options.onError ?? ((e) => console.error('[visualization events]', e))
  let last = Number((await pool.query<{ m: string | null }>('SELECT max(seq) AS m FROM visualization.outbox')).rows[0].m ?? 0)
  let closed = false
  let running: Promise<void> | null = null

  async function cycle() {
    const { rows } = await pool.query<Row>('SELECT * FROM visualization.outbox WHERE seq > $1 ORDER BY seq LIMIT 1000', [last])
    for (const r of rows) {
      last = Math.max(last, Number(r.seq))
      const e = toEvent(r)
      for (const l of listeners.get(e.projectId) ?? []) safe(l, e)
      for (const l of all) safe(l, e)
    }
  }
  const safe = (l: (e: JobChangedEvent) => void, e: JobChangedEvent) => {
    try {
      l(e)
    } catch (err) {
      onError(err)
    }
  }
  const tick = () => {
    if (closed || running) return running ?? Promise.resolve()
    running = cycle()
      .catch(onError)
      .finally(() => (running = null))
    return running
  }
  const timer = setInterval(() => void tick(), options.pollMs ?? 500)
  timer.unref?.()
  return {
    subscribe(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(listener)
      listeners.set(projectId, set)
      return () => set.delete(listener)
    },
    subscribeAll(listener) {
      all.add(listener)
      return () => all.delete(listener)
    },
    async readAfter(projectId, after) {
      const { rows } = await pool.query<Row>('SELECT * FROM visualization.outbox WHERE project_id = $1 AND seq > $2 ORDER BY seq LIMIT 500', [projectId, after])
      return rows.map(toEvent)
    },
    async flush() {
      await running
      await tick()
    },
    async close() {
      if (closed) return
      closed = true
      clearInterval(timer)
      await running
    },
  }
}
