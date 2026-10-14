import type { Static } from '@sinclair/typebox'
import type { BulkOperation } from '../http/schemas'
import { ServiceError, forbidden } from '../errors'
import { roleAllows, type Role } from '../domain/rules'
import { addNode } from './collections'
import { mapDatabaseError, type Ctx } from './context'
import { setArchived, transition, updateRequirement } from './requirements'

type Op = Static<typeof BulkOperation>
export interface BulkOutcome {
  requirementId: string
  ok: boolean
  revision?: number
  error?: { code: ServiceError['code']; message: string; details?: Record<string, unknown> }
}

async function apply(ctx: Ctx, op: Op, role: Role | null, reason: string): Promise<number> {
  let revision = op.expectedRevision
  const needsAuthor = op.set || op.archive !== undefined || op.addToCollectionId
  if (needsAuthor && !roleAllows(role, 'author')) throw forbidden('Your role may not edit requirements.')
  if (op.set) {
    const { requirement } = await updateRequirement(ctx, op.requirementId, { ...op.set, reason }, revision, { role, reason })
    revision = requirement.revision
  }
  if (op.addToCollectionId) await addNode(ctx, op.addToCollectionId, { kind: 'requirement', requirementId: op.requirementId }, null)
  if (op.transition) revision = (await transition(ctx, op.requirementId, op.transition, revision, role, reason)).revision
  if (op.archive !== undefined) revision = (await setArchived(ctx, op.requirementId, op.archive, revision, reason)).revision
  return revision
}

const toError = (e: unknown): BulkOutcome['error'] => {
  const mapped = mapDatabaseError(e)
  if (mapped instanceof ServiceError) return { code: mapped.code, message: mapped.message, details: mapped.details }
  return { code: 'unavailable', message: mapped instanceof Error ? mapped.message : String(mapped) }
}

/** Raised to roll back an atomic bulk request; carries the per-item outcomes. */
export class BulkRollback extends ServiceError {
  constructor(readonly outcomes: BulkOutcome[]) {
    const conflictFirst = outcomes.find((o) => o.error?.code === 'conflict')
    super(conflictFirst ? 'conflict' : (outcomes.find((o) => o.error)?.error?.code ?? 'invalid'), 'The bulk operation was not applied: at least one item failed, so nothing was changed.', { outcomes })
  }
}

/**
 * Bulk operations. `atomic` (default): every operation is applied in one transaction; if any
 * fails, none is applied and the error lists each item's outcome. Non-atomic: each operation is
 * isolated by a savepoint; failures are reported per item and successful items commit.
 */
export async function runBulk(ctx: Ctx, ops: Op[], atomic: boolean, role: Role | null, reason = ''): Promise<{ atomic: boolean; committed: boolean; outcomes: BulkOutcome[] }> {
  const seen = new Set<string>()
  for (const op of ops) {
    if (seen.has(op.requirementId)) throw new ServiceError('invalid', 'Each requirement may appear only once in a bulk request.', { fields: { operations: `duplicate ${op.requirementId}` } })
    seen.add(op.requirementId)
  }
  const outcomes: BulkOutcome[] = []
  for (const [i, op] of ops.entries()) {
    await ctx.db.query(`SAVEPOINT bulk_${i}`)
    try {
      const revision = await apply(ctx, op, role, reason)
      await ctx.db.query(`RELEASE SAVEPOINT bulk_${i}`)
      outcomes.push({ requirementId: op.requirementId, ok: true, revision })
    } catch (e) {
      await ctx.db.query(`ROLLBACK TO SAVEPOINT bulk_${i}`)
      outcomes.push({ requirementId: op.requirementId, ok: false, error: toError(e) })
    }
  }
  if (atomic && outcomes.some((o) => !o.ok)) throw new BulkRollback(outcomes.map((o) => (o.ok ? { requirementId: o.requirementId, ok: false, error: { code: 'invalid' as const, message: 'Not applied because another item failed.' } } : o)))
  return { atomic, committed: outcomes.some((o) => o.ok), outcomes }
}
