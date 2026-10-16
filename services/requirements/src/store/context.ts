import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { RequirementsEventType } from '@ews/platform-sdk'
import { ServiceError } from '../errors'

/** Everything a store function needs: one transaction, the acting user and the project. */
export interface Ctx {
  db: PoolClient
  projectId: string
  actor: string
  /** Transaction time; every timestamp written in one transaction is the same instant. */
  now: Date
  /** Configuration context of the request, recorded with events. */
  configurationId?: string
  /** Assistant proposal the write executes (`<conversationId>/<key>`, header x-ews-proposal), recorded in the audit trail. */
  proposal?: string
}

export type Queryable = Pick<PoolClient, 'query'>

const SERIALIZATION_FAILURE = '40001'
const DEADLOCK = '40P01'

/** Runs `fn` in one transaction. PostgreSQL errors are mapped; serialization failures are retried once. */
export async function withTransaction<T>(pool: Pool, base: Omit<Ctx, 'db' | 'now'>, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch (error) {
      throw new ServiceError('unavailable', 'The requirements database is not reachable. Nothing was changed; try again later.')
    }
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
      const result = await fn({ ...base, db: client, now: rows[0].now })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      const code = (error as { code?: string }).code
      if ((code === SERIALIZATION_FAILURE || code === DEADLOCK) && attempt === 0) continue
      throw mapDatabaseError(error)
    } finally {
      client.release()
    }
  }
}

/** Read-only work outside a write transaction (still one snapshot via REPEATABLE READ). */
export async function withReadTransaction<T>(pool: Pool, base: Omit<Ctx, 'db' | 'now'>, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  let client: PoolClient
  try {
    client = await pool.connect()
  } catch (error) {
    throw new ServiceError('unavailable', 'The requirements database is not reachable. Nothing was changed; try again later.')
  }
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
    const result = await fn({ ...base, db: client, now: rows[0].now })
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw mapDatabaseError(error)
  } finally {
    client.release()
  }
}

export function mapDatabaseError(error: unknown): unknown {
  if (error instanceof ServiceError) return error
  const e = error as { code?: string; message?: string; constraint?: string; detail?: string }
  switch (e.code) {
    case '23505':
      return new ServiceError('conflict', 'A record with the same unique value already exists.')
    case '23503':
      return new ServiceError('invalid', 'A referenced record does not exist.')
    case '23514':
    case '22P02':
    case '22001':
      return new ServiceError('invalid', 'A value is not allowed (it violates a database rule).')
    case '23001':
      return new ServiceError('invalid', 'The change is not permitted: the record is immutable.')
    case 'ECONNREFUSED':
    case '57P01':
    case '57P03':
    case '08006':
    case '08001':
      return new ServiceError('unavailable', `The requirements database is not available (${e.code}).`)
    default:
      return error
  }
}

export const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString())
export const isoRequired = (d: Date | string): string => new Date(d).toISOString()

export interface AuditInput {
  entityType: 'requirement' | 'relationship' | 'collection' | 'baseline' | 'review' | 'attribute-definition' | 'saved-view' | 'conventions' | 'import' | 'export' | 'comment' | 'external-reference' | 'quality'
  entityId: string
  action: string
  revision?: number | null
  reason?: string
  details?: Record<string, unknown>
}

/** Appends an audit event in the current transaction (append-only; the table refuses updates and deletes). */
export async function audit(ctx: Ctx, input: AuditInput): Promise<void> {
  await ctx.db.query(
    `INSERT INTO requirements.audit_events (project_id, entity_type, entity_id, action, revision, actor, occurred_at, reason, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [ctx.projectId, input.entityType, input.entityId, input.action, input.revision ?? null, ctx.actor, ctx.now, input.reason || (ctx.proposal ? `Assistant proposal ${ctx.proposal}` : ''), JSON.stringify({ ...(input.details ?? {}), ...(ctx.proposal ? { source: 'assistant', proposal: ctx.proposal } : {}) })],
  )
}

/** Writes a committed-change notification to the outbox in the current transaction. */
export async function emit(ctx: Ctx, type: RequirementsEventType, entityId: string, committedRevision: number): Promise<string> {
  const eventId = randomUUID()
  await ctx.db.query(
    `INSERT INTO requirements.outbox (event_id, project_id, type, entity_id, committed_revision, configuration_id, occurred_at, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [eventId, ctx.projectId, type, entityId, committedRevision, ctx.configurationId ?? null, ctx.now, ctx.actor],
  )
  return eventId
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
