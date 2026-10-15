import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { ConceptsEventType } from '@ews/platform-sdk'
import { ServiceError } from '../errors'
import type { Basis } from '../domain/rules'

/** How a change came about (brief §6, §11): recorded with revisions, links, scores and audit events. */
export interface Provenance {
  sourceKind: 'user' | 'assistant' | 'import' | 'system'
  conversationId?: string
  proposalId?: string
  messageId?: string
}

/** Everything a store function needs: one transaction, the acting user, the project and the provenance. */
export interface Ctx {
  db: PoolClient
  projectId: string
  actor: string
  /** Transaction time; every timestamp written in one transaction is the same instant. */
  now: Date
  provenance: Provenance
  /** Role of the actor in the project (for rules that depend on it, e.g. approval gates). */
  role: string | null
}

export type Queryable = Pick<PoolClient, 'query'>

const SERIALIZATION_FAILURE = '40001'
const DEADLOCK = '40P01'

const UNAVAILABLE = 'The Conceptualize database is not reachable. Nothing was changed; try again later.'

/** Runs `fn` in one transaction. PostgreSQL errors are mapped; serialization failures are retried once. */
export async function withTransaction<T>(pool: Pool, base: Omit<Ctx, 'db' | 'now'>, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
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
      const code = (error as { code?: string }).code
      if ((code === SERIALIZATION_FAILURE || code === DEADLOCK) && attempt === 0) continue
      throw mapDatabaseError(error)
    } finally {
      client.release()
    }
  }
}

/** Read-only work (one snapshot via REPEATABLE READ). */
export async function withReadTransaction<T>(pool: Pool, base: Omit<Ctx, 'db' | 'now'>, fn: (ctx: Ctx) => Promise<T>): Promise<T> {
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
      return new ServiceError('invalid', 'A value is not allowed (it violates a database rule).')
    case '23001':
      return new ServiceError('invalid', 'The change is not permitted: the record is immutable.')
    case 'ECONNREFUSED':
    case '57P01':
    case '57P03':
    case '08006':
    case '08001':
      return new ServiceError('unavailable', `The Conceptualize database is not available (${e.code}).`)
    default:
      return error
  }
}

export const iso = (d: Date | string | null | undefined): string | null => (d == null ? null : new Date(d).toISOString())
export const isoRequired = (d: Date | string): string => new Date(d).toISOString()

export interface AuditInput {
  entityType: 'concept' | 'relationship' | 'decomposition' | 'alternative-set' | 'decision' | 'trade-study' | 'evidence' | 'implementation' | 'link' | 'exploration' | 'realization-request' | 'function' | 'constraint' | 'assumption' | 'design-link' | 'link-type' | 'batch'
  entityId: string
  conceptIds?: string[]
  action: string
  revision?: number | null
  reason?: string
  details?: Record<string, unknown>
}

/** Appends an audit event with the request's provenance (append-only; the table refuses updates and deletes). */
export async function audit(ctx: Ctx, input: AuditInput): Promise<void> {
  const p = ctx.provenance
  await ctx.db.query(
    `INSERT INTO conceptualize.audit_events (project_id, entity_type, entity_id, concept_ids, action, revision, actor, occurred_at, reason, source_kind, conversation_id, proposal_id, message_id, details)
     VALUES ($1, $2, $3, $4::uuid[], $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [ctx.projectId, input.entityType, input.entityId, input.conceptIds ?? [], input.action, input.revision ?? null, ctx.actor, ctx.now, input.reason ?? '', p.sourceKind, p.conversationId ?? null, p.proposalId ?? null, p.messageId ?? null, JSON.stringify(input.details ?? {})],
  )
}

/** Writes a committed-change notification to the outbox in the current transaction. */
/** Event types: the SDK ConceptsEventType plus the design-knowledge events of CR-C12 (SDK addition requested, CR-S3). */
export type ConceptsOutboxType = ConceptsEventType | 'function.created' | 'function.revised' | 'function.retired' | 'constraint.created' | 'constraint.revised' | 'constraint.status-changed' | 'assumption.created' | 'assumption.revised' | 'assumption.validation-changed' | 'evidence.recorded' | 'evidence.reviewed' | 'decision.review-flagged' | 'decision.invalidated' | 'link.created' | 'link.removed'

export async function emit(ctx: Ctx, type: ConceptsOutboxType, entityId: string, committedRevision: number): Promise<string> {
  const eventId = randomUUID()
  await ctx.db.query(
    `INSERT INTO conceptualize.outbox (event_id, project_id, type, entity_id, committed_revision, occurred_at, actor) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [eventId, ctx.projectId, type, entityId, committedRevision, ctx.now, ctx.actor],
  )
  return eventId
}

/** Provenance columns (source_kind, conversation_id, proposal_id) for inserts. */
export const prov = (ctx: Ctx): [string, string | null, string | null] => [ctx.provenance.sourceKind, ctx.provenance.conversationId ?? null, ctx.provenance.proposalId ?? null]

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

/** Assistant-sourced writes may only use these bases (brief §11: AI output is never promoted silently). */
export const ASSISTANT_BASES: Basis[] = ['ai-hypothesis', 'assumption', 'assessment', 'estimate']

export async function nextKey(ctx: Ctx, prefix: string, table: string): Promise<string> {
  for (;;) {
    const { rows } = await ctx.db.query<{ v: number }>(
      `INSERT INTO conceptualize.key_counters (project_id, prefix, next_value) VALUES ($1, $2, 2)
       ON CONFLICT (project_id, prefix) DO UPDATE SET next_value = conceptualize.key_counters.next_value + 1
       RETURNING next_value - 1 AS v`,
      [ctx.projectId, prefix],
    )
    const key = `${prefix}-${String(rows[0].v).padStart(3, '0')}`
    const taken = await ctx.db.query(`SELECT 1 FROM conceptualize.${table} WHERE project_id = $1 AND key = $2`, [ctx.projectId, key])
    if (!taken.rowCount) return key
  }
}
