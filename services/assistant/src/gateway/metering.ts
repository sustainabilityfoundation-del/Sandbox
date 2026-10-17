import type { Pool } from 'pg'
import { AssistantError } from '../errors'
import { UsageLedger, type UsageEventInput } from '../ledger'
import { Money } from '../pricing'
import { budgetState, lockBudget, type BudgetState } from './budget'

/**
 * What the gateway needs from the ledger. `PgMetering` is the real implementation over PostgreSQL; the mock-tier tests use
 * an in-memory one, so the fail-safe sequence can be tested without a database.
 */
export interface Metering {
  /**
   * Writes the `started` row. With a reservation, the month's budget is checked and the worst case reserved in the same
   * transaction, under an advisory lock, so concurrent requests cannot overrun the budget. Throws AssistantError
   * `budget-exceeded` when the worst case does not fit; any other failure means the ledger is unavailable.
   */
  begin(started: UsageEventInput, reservation?: { limit: string; at: Date; extraUsed: string }): Promise<void>
  /** Appends an end event (completed, failed, cancelled). Idempotent by key. */
  record(event: UsageEventInput): Promise<void>
  state(limit: string, at: Date, extraUsed?: string): Promise<BudgetState>
}

export class PgMetering implements Metering {
  readonly ledger: UsageLedger
  constructor(private readonly pool: Pool) {
    this.ledger = new UsageLedger(pool)
  }

  async begin(started: UsageEventInput, reservation?: { limit: string; at: Date; extraUsed: string }): Promise<void> {
    if (!reservation) {
      await this.ledger.record(started)
      return
    }
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await lockBudget(client, reservation.at)
      const state = await budgetState(client, reservation.limit, reservation.at, reservation.extraUsed)
      const worst = new Money(started.reservedCost ?? '0')
      if (worst.gt(state.remaining)) {
        await client.query('ROLLBACK')
        throw new AssistantError('budget-exceeded', `The monthly development budget would be exceeded: ${state.remaining} USD remain of ${state.limit} USD (${state.used} used, ${state.reserved} reserved by requests in progress), and this request could cost up to ${worst.toFixed(10)} USD.`, 429, { budget: state, worstCase: worst.toFixed(10) })
      }
      await new UsageLedger(client).record(started)
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw e
    } finally {
      client.release()
    }
  }

  async record(event: UsageEventInput): Promise<void> {
    await this.ledger.record(event)
  }

  state(limit: string, at: Date, extraUsed = '0'): Promise<BudgetState> {
    return budgetState(this.pool, limit, at, extraUsed)
  }
}
