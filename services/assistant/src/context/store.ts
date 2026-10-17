import { createHash } from 'node:crypto'
import type { Pool } from 'pg'
import type { ContextPackage } from '@ews/platform-sdk'

/**
 * `assistant.context_snapshots` (migration 0005): immutable, insert-only. A snapshot belongs to one person and one project;
 * reads are always scoped to both, so another project's (or another person's) snapshot is invisible, not merely forbidden.
 */

const stable = (v: unknown): string =>
  v === null || typeof v !== 'object'
    ? JSON.stringify(v) ?? 'null'
    : Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : `{${Object.keys(v as object)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(',')}}`

/** Hash of what a package says (not its ID or time): an identical assembly is reused. */
export function contentHash(pkg: Omit<ContextPackage, 'contextId' | 'assembledAt'>): string {
  return createHash('sha256').update(stable(pkg)).digest('hex')
}

interface Row {
  package: ContextPackage
}

export class ContextStore {
  constructor(private readonly pool: Pool) {}

  /** The newest snapshot of this person, project and conversation with the same content, if any (never one from another conversation). */
  async findSame(projectId: string, actorId: string, mode: string, hash: string, conversationId?: string): Promise<ContextPackage | undefined> {
    const { rows } = await this.pool.query<Row>(
      `SELECT package FROM assistant.context_snapshots WHERE project_id = $1 AND actor_id = $2 AND mode = $3 AND content_hash = $4 AND conversation_id IS NOT DISTINCT FROM $5 ORDER BY created_at DESC LIMIT 1`,
      [projectId, actorId, mode, hash, conversationId ?? null],
    )
    return rows[0]?.package
  }

  async insert(pkg: ContextPackage, extra: { conversationId?: string; hash: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO assistant.context_snapshots (id, schema_version, project_id, actor_id, conversation_id, mode, operation, content_hash, package, item_count, estimated_tokens, bytes, over_budget, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [pkg.contextId, pkg.schemaVersion, pkg.projectId, pkg.assembledFor, extra.conversationId ?? null, pkg.mode, pkg.task.operation, extra.hash, JSON.stringify(pkg), pkg.used.items, pkg.used.estimatedTokens, pkg.used.bytes, pkg.overBudget, pkg.assembledAt],
    )
  }

  /** One snapshot of this person in this project (undefined for any other combination). */
  async get(projectId: string, actorId: string, contextId: string): Promise<ContextPackage | undefined> {
    const { rows } = await this.pool.query<Row>(`SELECT package FROM assistant.context_snapshots WHERE id = $1 AND project_id = $2 AND actor_id = $3`, [contextId, projectId, actorId])
    return rows[0]?.package
  }

  /** Whether a snapshot exists for this person in this project (proposals may only cite such a snapshot). */
  async exists(projectId: string, actorId: string, contextId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`SELECT 1 FROM assistant.context_snapshots WHERE id = $1 AND project_id = $2 AND actor_id = $3`, [contextId, projectId, actorId])
    return !!rowCount
  }
}
