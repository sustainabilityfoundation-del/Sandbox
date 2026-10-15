import type { Pool, PoolClient } from 'pg'
import type { ConceptsEvent, ConceptsEventType } from '@ews/platform-sdk'

/**
 * Committed-change notifications (contracts §7).
 *
 * - Store functions insert outbox rows in the same transaction as the change.
 * - A publisher (one at a time across all API processes, by advisory lock) marks committed rows as
 *   published and assigns `delivery_seq` in commit order.
 * - Every process tails published rows by `delivery_seq` and fans them out to its SSE clients.
 * - Clients resume with `after` / `Last-Event-ID`; delivery may repeat, so consumers dedupe by
 *   `eventId` and reread authoritative records.
 */

type OutboxRow = {
  event_id: string
  type: ConceptsEventType
  project_id: string
  entity_id: string
  committed_revision: number
  occurred_at: Date
  actor: string
  delivery_seq: string
}

export const toEvent = (r: OutboxRow): ConceptsEvent => ({
  eventId: r.event_id,
  type: r.type,
  projectId: r.project_id,
  entityId: r.entity_id,
  committedRevision: r.committed_revision,
  occurredAt: new Date(r.occurred_at).toISOString(),
  actor: r.actor,
})

export interface EventHub {
  subscribe(projectId: string, listener: (event: ConceptsEvent) => void): () => void
  /** Published events after `afterEventId` (exclusive), oldest first. Unknown ID → `undefined`. */
  readAfter(projectId: string, afterEventId: string | null, limit?: number): Promise<ConceptsEvent[] | undefined>
  /** Publish and deliver pending events now (tests and shutdown). */
  flush(): Promise<void>
  /**
   * Deletes delivered events older than the retention window (and expired idempotency records).
   * Never deletes unpublished events. Returns the number of events deleted.
   */
  purge(): Promise<number>
  readonly retentionHours: number
  close(): Promise<void>
}

const PUBLISH_LOCK = 0x434f_4e31 // "CON1"

export const DEFAULT_RETENTION_HOURS = 168

export async function createEventHub(pool: Pool, options: { pollMs?: number; onError?: (error: unknown) => void; retentionHours?: number; purgeIntervalMs?: number } = {}): Promise<EventHub> {
  const retentionHours = options.retentionHours ?? DEFAULT_RETENTION_HOURS
  if (!(retentionHours > 0)) throw new Error('The outbox retention must be a positive number of hours.')
  const listeners = new Map<string, Set<(e: ConceptsEvent) => void>>()
  const onError = options.onError ?? ((e) => console.error('[conceptualize events]', e))
  let lastDelivered = Number((await pool.query<{ m: string | null }>('SELECT max(delivery_seq) AS m FROM conceptualize.outbox')).rows[0].m ?? 0)
  let closed = false
  let running: Promise<void> | null = null
  let again = false

  async function publish() {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_xact_lock($1) AS locked', [PUBLISH_LOCK])
      if (!rows[0].locked) {
        await client.query('ROLLBACK')
        return
      }
      const res = await client.query(
        `UPDATE conceptualize.outbox o SET published_at = clock_timestamp(), delivery_seq = nextval('conceptualize.outbox_delivery_seq')
         FROM (SELECT seq FROM conceptualize.outbox WHERE published_at IS NULL ORDER BY seq LIMIT 1000 FOR UPDATE) p WHERE o.seq = p.seq`,
      )
      if (res.rowCount) await client.query(`SELECT pg_notify('conceptualize_published', '')`)
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
      const { rows } = await pool.query<OutboxRow>('SELECT * FROM conceptualize.outbox WHERE delivery_seq > $1 ORDER BY delivery_seq LIMIT 1000', [lastDelivered])
      if (!rows.length) return
      for (const r of rows) {
        lastDelivered = Math.max(lastDelivered, Number(r.delivery_seq))
        const event = toEvent(r)
        for (const l of listeners.get(r.project_id) ?? []) {
          try {
            l(event)
          } catch (e) {
            onError(e)
          }
        }
      }
    }
  }

  async function cycle() {
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
    await listener.query('LISTEN conceptualize_outbox')
    await listener.query('LISTEN conceptualize_published')
  } catch (e) {
    onError(e)
  }
  // Polling covers missed notifications (e.g. after a reconnect).
  const timer = setInterval(() => void cycle(), options.pollMs ?? 1000)
  timer.unref?.()
  async function purge(): Promise<number> {
    const res = await pool.query(
      `DELETE FROM conceptualize.outbox WHERE published_at IS NOT NULL AND published_at < now() - make_interval(secs => $1)`,
      [retentionHours * 3600],
    )
    await pool.query(`DELETE FROM conceptualize.idempotency_keys WHERE created_at < now() - interval '24 hours'`)
    return res.rowCount ?? 0
  }
  const purgeTimer = setInterval(() => void purge().catch((e) => !closed && onError(e)), options.purgeIntervalMs ?? 3600_000)
  purgeTimer.unref?.()
  void purge().catch((e) => onError(e))

  return {
    subscribe(projectId, l) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(l)
      listeners.set(projectId, set)
      return () => set.delete(l)
    },
    async readAfter(projectId, afterEventId, limit = 1000) {
      let after = 0
      if (afterEventId) {
        const { rows } = await pool.query<{ delivery_seq: string | null }>('SELECT delivery_seq FROM conceptualize.outbox WHERE event_id = $1 AND project_id = $2', [afterEventId, projectId])
        if (!rows[0]?.delivery_seq) return undefined
        after = Number(rows[0].delivery_seq)
      } else return []
      const { rows } = await pool.query<OutboxRow>('SELECT * FROM conceptualize.outbox WHERE project_id = $1 AND delivery_seq > $2 ORDER BY delivery_seq LIMIT $3', [projectId, after, limit])
      return rows.map(toEvent)
    },
    async flush() {
      await cycle()
      await cycle()
    },
    purge,
    retentionHours,
    async close() {
      closed = true
      clearInterval(timer)
      clearInterval(purgeTimer)
      await running
      if (listener) {
        await listener.query('UNLISTEN *').catch(() => undefined)
        listener.release()
      }
    },
  }
}
