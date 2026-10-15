import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { ProjectsEventType } from '@ews/platform-sdk'
import { ServiceError } from '../errors'
import type { BlobStore } from '../blob/blobStore'
import type { MembershipPort, ProjectSettingsPort } from '../ports'

/** How a change came about: recorded with revisions, links and audit events. */
export interface Provenance {
  sourceKind: 'user' | 'assistant' | 'import' | 'system'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

/** Host capabilities a store function may need. */
export interface StoreServices {
  memberships: MembershipPort
  blobs: BlobStore
  settings?: ProjectSettingsPort
}

/** Everything a store function needs: one transaction, the acting user, the project and the provenance. */
export interface Ctx {
  db: PoolClient
  /** Empty for operations that are not scoped to a project yet (create, list). */
  projectId: string
  actor: string
  /** Transaction time; every timestamp written in one transaction is the same instant. */
  now: Date
  provenance: Provenance
  role: string | null
  services: StoreServices
}

export type CtxBase = Omit<Ctx, 'db' | 'now'>

const SERIALIZATION_FAILURE = '40001'
const DEADLOCK = '40P01'
const UNAVAILABLE = 'The Project Management database is not reachable. Nothing was changed; try again later.'

/** Thrown inside a transaction to roll back a dry run while returning its result. */
export class DryRunResult<T> {
  constructor(readonly value: T) {}
}

/** Runs `fn` in one transaction. PostgreSQL errors are mapped; serialization failures are retried once. */
export async function withTransaction<T>(pool: Pool, base: CtxBase, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let client: PoolClient
    try {
      client = await pool.connect()
    } catch {
      throw new ServiceError('unavailable', UNAVAILABLE)
    }
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ now: Date }>('SELECT now() AS now')
      const result = await fn({ ...base, db: client, now: rows[0].now })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof DryRunResult) return error.value as T
      const code = (error as { code?: string }).code
      if ((code === SERIALIZATION_FAILURE || code === DEADLOCK) && attempt === 0) continue
      throw mapDatabaseError(error)
    } finally {
      client.release()
    }
  }
}

/** Read-only work (one snapshot via REPEATABLE READ). */
export async function withReadTransaction<T>(pool: Pool, base: CtxBase, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  let client: PoolClient
  try {
    client = await pool.connect()
  } catch {
    throw new ServiceError('unavailable', UNAVAILABLE)
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
  const e = error as { code?: string }
  switch (e.code) {
    case '23505':
      return new ServiceError('conflict', 'A record with the same unique value already exists.')
    case '23503':
      return new ServiceError('invalid', 'A referenced record does not exist.')
    case '23514':
    case '22P02':
    case '22001':
    case '22007':
    case '22008':
      return new ServiceError('invalid', 'A value is not allowed (it violates a database rule).')
    case '23001':
      return new ServiceError('invalid', 'The change is not permitted: the record is immutable.')
    case 'ECONNREFUSED':
    case '57P01':
    case '57P03':
    case '08006':
    case '08001':
      return new ServiceError('unavailable', `The Project Management database is not available (${e.code}).`)
    default:
      return error
  }
}

export const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString())
export const isoRequired = (d: Date | string): string => new Date(d).toISOString()
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

export interface AuditInput {
  entityType: 'project' | 'membership' | 'artifact' | 'link' | 'work-item' | 'milestone' | 'document'
  entityId: string
  action: string
  revision?: number | null
  reason?: string
  details?: Record<string, unknown>
  /** Defaults to the context's project. */
  projectId?: string
}

/** Appends an audit event with the request's provenance (append-only; the table refuses updates and deletes). */
export async function audit(ctx: Ctx, input: AuditInput): Promise<void> {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO projects.audit_events (project_id, entity_type, entity_id, action, revision, actor, occurred_at, reason, source_kind, conversation_id, proposal_id, message_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [input.projectId ?? ctx.projectId, input.entityType, input.entityId, input.action, input.revision ?? null, ctx.actor, ctx.now, input.reason ?? '', p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, JSON.stringify(input.details ?? {})],
  )
}

/** Writes a committed-change notification to the outbox in the current transaction. */
export async function emit(ctx: Ctx, type: ProjectsEventType, entityId: string, committedRevision: number, projectId = ctx.projectId): Promise<string> {
  const eventId = randomUUID()
  await ctx.db.query(`INSERT INTO projects.outbox (event_id, project_id, type, entity_id, committed_revision, occurred_at, actor) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
    eventId,
    projectId,
    type,
    entityId,
    committedRevision,
    ctx.now,
    ctx.actor,
  ])
  return eventId
}

/** Next display key for a prefix within the project (TSK-001 …). */
export async function nextKey(ctx: Ctx, prefix: string, table: string): Promise<string> {
  for (;;) {
    const { rows } = await ctx.db.query<{ v: number }>(
      `INSERT INTO projects.key_counters (project_id, prefix, next_value) VALUES ($1, $2, 2)
       ON CONFLICT (project_id, prefix) DO UPDATE SET next_value = projects.key_counters.next_value + 1
       RETURNING next_value - 1 AS v`,
      [ctx.projectId, prefix],
    )
    const key = `${prefix}-${String(rows[0].v).padStart(3, '0')}`
    const taken = await ctx.db.query(`SELECT 1 FROM projects.${table} WHERE project_id = $1 AND key = $2`, [ctx.projectId, key])
    if (!taken.rowCount) return key
  }
}
