import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

/**
 * Committed-change notifications of the SysML repository (transactional outbox + SSE), following
 * the platform pattern: rows are written in the commit's transaction; one publisher at a time (by
 * advisory lock) assigns delivery order; every process tails published rows and fans them out.
 * Delivery may repeat: consumers dedupe by `eventId` and reread authoritative data.
 */

export type SysmlEventType = 'sysml.project-created' | 'sysml.commit-created' | 'sysml.branch-created' | 'sysml.tag-created'

export interface SysmlEvent {
  eventId: string
  type: SysmlEventType
  /** SysML project UUID. */
  projectId: string
  /** Commit, branch, tag or project. */
  entityId: string
  /** Commit number, for commit events. */
  commitNumber?: number
  branchId?: string
  occurredAt: string
  actor: string
}

type Row = { event_id: string; type: SysmlEventType; project_id: string; entity_id: string; commit_number: number | null; branch_id: string | null; occurred_at: Date; actor: string; delivery_seq: string }

const toEvent = (r: Row): SysmlEvent => ({
  eventId: r.event_id,
  type: r.type,
  projectId: r.project_id,
  entityId: r.entity_id,
  ...(r.commit_number !== null ? { commitNumber: r.commit_number } : {}),
  ...(r.branch_id ? { branchId: r.branch_id } : {}),
  occurredAt: new Date(r.occurred_at).toISOString(),
  actor: r.actor,
})

export async function emit(db: Pick<PoolClient, 'query'>, e: { type: SysmlEventType; projectId: string; entityId: string; commitNumber?: number; branchId?: string; actor: string; at: Date }): Promise<string> {
  const id = randomUUID()
  await db.query(
    'INSERT INTO sysml.outbox (event_id, project_id, type, entity_id, commit_number, branch_id, occurred_at, actor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, e.projectId, e.type, e.entityId, e.commitNumber ?? null, e.branchId ?? null, e.at, e.actor],
  )
  await db.query(`SELECT pg_notify('sysml_outbox', '')`)
  return id
}

export interface SysmlEventHub {
  subscribe(projectId: string, listener: (e: SysmlEvent) => void): () => void
  /** Published events after `afterEventId`; unknown ID → undefined (client must reload). */
  readAfter(projectId: string, afterEventId: string | null): Promise<SysmlEvent[] | undefined>
  flush(): Promise<void>
  close(): Promise<void>
}

const LOCK = 0x5359_534d // "SYSM"

export async function createSysmlEventHub(pool: Pool, options: { pollMs?: number; onError?: (e: unknown) => void } = {}): Promise<SysmlEventHub> {
  const listeners = new Map<string, Set<(e: SysmlEvent) => void>>()
  const onError = options.onError ?? ((e) => console.error('[sysml events]', e))
  let last = Number((await pool.query<{ m: string | null }>('SELECT max(delivery_seq) AS m FROM sysml.outbox')).rows[0].m ?? 0)
  let closed = false
  let running: Promise<void> | null = null
  let again = false

  async function publish() {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS locked', [LOCK])
      if (!rows[0].locked) {
        await client.query('ROLLBACK')
        return
      }
      await client.query(
        `UPDATE sysml.outbox o SET published_at = clock_timestamp(), delivery_seq = nextval('sysml.outbox_delivery_seq')
         FROM (SELECT seq FROM sysml.outbox WHERE published_at IS NULL ORDER BY seq LIMIT 1000 FOR UPDATE) p WHERE o.seq = p.seq`,
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }

  async function deliver() {
    for (;;) {
      const { rows } = await pool.query<Row>('SELECT * FROM sysml.outbox WHERE delivery_seq > $1 ORDER BY delivery_seq LIMIT 1000', [last])
      if (!rows.length) return
      for (const r of rows) {
        last = Math.max(last, Number(r.delivery_seq))
        const ev = toEvent(r)
        for (const l of listeners.get(r.project_id) ?? []) {
          try {
            l(ev)
          } catch (e) {
            onError(e)
          }
        }
      }
    }
  }

  function cycle(): Promise<void> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        try {
          await publish()
          await deliver()
        } catch (e) {
          if (!closed) onError(e)
        }
      } while (again && !closed)
    })().finally(() => (running = null))
    return running
  }

  let listener: PoolClient | null = null
  try {
    listener = await pool.connect()
    listener.on('notification', () => void cycle())
    listener.on('error', (e) => onError(e))
    await listener.query('LISTEN sysml_outbox')
  } catch (e) {
    onError(e)
  }
  const timer = setInterval(() => void cycle(), options.pollMs ?? 1000)
  timer.unref?.()

  return {
    subscribe(projectId, l) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(l)
      listeners.set(projectId, set)
      return () => set.delete(l)
    },
    async readAfter(projectId, after) {
      if (!after) return []
      const { rows } = await pool.query<{ delivery_seq: string | null }>('SELECT delivery_seq FROM sysml.outbox WHERE event_id = $1 AND project_id = $2', [after, projectId])
      if (!rows[0]?.delivery_seq) return undefined
      const res = await pool.query<Row>('SELECT * FROM sysml.outbox WHERE project_id = $1 AND delivery_seq > $2 ORDER BY delivery_seq LIMIT 1000', [projectId, rows[0].delivery_seq])
      return res.rows.map(toEvent)
    },
    async flush() {
      await cycle()
      await cycle()
    },
    async close() {
      closed = true
      clearInterval(timer)
      await running
      if (listener) {
        await listener.query('UNLISTEN *').catch(() => undefined)
        listener.release()
      }
    },
  }
}
