import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

/**
 * Committed-change notifications of the CAD document store (transactional outbox + SSE), following
 * the platform pattern: rows are written in the save's transaction; one publisher at a time (by
 * advisory lock) assigns delivery order; every process tails published rows and fans them out.
 * Delivery may repeat: consumers dedupe by `eventId` and reread the document.
 */

export type CadEventType = 'cad.document-created' | 'cad.revision-created' | 'cad.document-archived' | 'cad.document-restored'

/** A part of the document as announced in events and summaries: stable UUID, document-local ID, name. */
export interface CadPartDescriptor {
  /** Stable UUID (version 5 of the part ID in the document UUID namespace; entityUuid in @ews/cad-core). */
  uuid: string
  id: string
  name: string
}

export interface CadEvent {
  eventId: string
  type: CadEventType
  /** Platform project ID. */
  projectId: string
  documentId: string
  /** Entity kind of the document ('cad-document'); parts are listed in `parts`. */
  kind: 'cad-document'
  /** Document title at the time of the event (older events: the title when migration 0002 ran). */
  name: string
  revision?: number
  occurredAt: string
  actor: string
  /** Same as occurredAt / actor: when and by whom the entity was last changed. */
  updatedAt: string
  updatedBy: string
  sourceKind: string
  /** Parts of the revision the event announces (absent on events written before migration 0002). */
  parts?: CadPartDescriptor[]
}

type Row = { kind: string; name: string | null; parts: CadPartDescriptor[] | null; event_id: string; type: CadEventType; project_id: string; document_id: string; revision: number | null; occurred_at: Date; actor: string; source_kind: string; delivery_seq: string }

const toEvent = (r: Row): CadEvent => ({
  eventId: r.event_id,
  type: r.type,
  projectId: r.project_id,
  documentId: r.document_id,
  kind: 'cad-document',
  name: r.name ?? '',
  ...(r.revision !== null ? { revision: r.revision } : {}),
  occurredAt: new Date(r.occurred_at).toISOString(),
  actor: r.actor,
  updatedAt: new Date(r.occurred_at).toISOString(),
  updatedBy: r.actor,
  sourceKind: r.source_kind,
  ...(r.parts ? { parts: r.parts } : {}),
})

export async function emit(db: Pick<PoolClient, 'query'>, e: { type: CadEventType; projectId: string; documentId: string; name: string; parts: CadPartDescriptor[]; revision?: number; actor: string; sourceKind: string; at: Date }): Promise<string> {
  const id = randomUUID()
  await db.query('INSERT INTO cad.outbox (event_id, project_id, type, document_id, revision, occurred_at, actor, source_kind, kind, name, parts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [
    id,
    e.projectId,
    e.type,
    e.documentId,
    e.revision ?? null,
    e.at,
    e.actor,
    e.sourceKind,
    'cad-document',
    e.name,
    JSON.stringify(e.parts),
  ])
  await db.query(`SELECT pg_notify('cad_outbox', '')`)
  return id
}

export interface CadEventHub {
  subscribe(projectId: string, listener: (e: CadEvent) => void): () => void
  /** Every project's published events (artifact source for Project Management). */
  subscribeAll(listener: (e: CadEvent) => void): () => void
  /** Published events after `afterEventId`; unknown ID → undefined (client must reload). */
  readAfter(projectId: string, afterEventId: string | null): Promise<CadEvent[] | undefined>
  flush(): Promise<void>
  close(): Promise<void>
}

const LOCK = 0x4341_4444 // "CADD"

export async function createCadEventHub(pool: Pool, options: { pollMs?: number; onError?: (e: unknown) => void } = {}): Promise<CadEventHub> {
  const listeners = new Map<string, Set<(e: CadEvent) => void>>()
  const everyProject = new Set<(e: CadEvent) => void>()
  const onError = options.onError ?? ((e) => console.error('[cad events]', e))
  let last = Number((await pool.query<{ m: string | null }>('SELECT max(delivery_seq) AS m FROM cad.outbox')).rows[0].m ?? 0)
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
        `UPDATE cad.outbox o SET published_at = clock_timestamp(), delivery_seq = nextval('cad.outbox_delivery_seq')
         FROM (SELECT seq FROM cad.outbox WHERE published_at IS NULL ORDER BY seq LIMIT 1000 FOR UPDATE) p WHERE o.seq = p.seq`,
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
      const { rows } = await pool.query<Row>('SELECT * FROM cad.outbox WHERE delivery_seq > $1 ORDER BY delivery_seq LIMIT 1000', [last])
      if (!rows.length) return
      for (const r of rows) {
        last = Math.max(last, Number(r.delivery_seq))
        const ev = toEvent(r)
        for (const l of [...(listeners.get(r.project_id) ?? []), ...everyProject]) {
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
    await listener.query('LISTEN cad_outbox')
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
    subscribeAll(l) {
      everyProject.add(l)
      return () => everyProject.delete(l)
    },
    async readAfter(projectId, after) {
      if (!after) return []
      const { rows } = await pool.query<{ delivery_seq: string | null }>('SELECT delivery_seq FROM cad.outbox WHERE event_id::text = $1 AND project_id = $2', [after, projectId])
      if (!rows[0]?.delivery_seq) return undefined
      const res = await pool.query<Row>('SELECT * FROM cad.outbox WHERE project_id = $1 AND delivery_seq > $2 ORDER BY delivery_seq LIMIT 1000', [projectId, rows[0].delivery_seq])
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
