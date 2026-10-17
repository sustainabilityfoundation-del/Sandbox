import type { Pool, PoolClient } from 'pg'
import { Money, MONEY_SCALE } from '../pricing'

type Queryable = Pick<Pool | PoolClient, 'query'>

/** A reservation whose request never wrote an end event (a crash) stops counting after this long (longer than any request timeout). */
export const RESERVATION_TTL_MINUTES = 15

/** The calendar month (UTC) containing `at`: start inclusive, end exclusive, and a label such as `2026-10`. */
export function monthOf(at: Date): { from: string; to: string; label: string } {
  const from = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1))
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1))
  return { from: from.toISOString(), to: to.toISOString(), label: from.toISOString().slice(0, 7) }
}

export interface BudgetState {
  period: string
  currency: 'USD'
  limit: string
  /** Estimated cost of finished developer-key requests this month (real, not simulated). */
  used: string
  /** Worst-case cost reserved by requests still in flight. */
  reserved: string
  remaining: string
}

/**
 * The development budget this month. Only developer-key usage counts: people's own connections are billed to their own
 * accounts and mock usage costs nothing. The cost of a finished request is the provider's reported cost when settled,
 * otherwise the estimate; in-flight requests count at their reserved worst case.
 */
export async function budgetState(db: Queryable, limit: string, at: Date, extraUsed = '0'): Promise<BudgetState> {
  const m = monthOf(at)
  const used = await db.query(
    `SELECT COALESCE(sum(COALESCE(actual_provider_cost, estimated_provider_cost)), 0)::text AS v FROM assistant.usage_events
     WHERE source = 'developer-key' AND simulated = false AND event IN ('completed', 'failed', 'cancelled', 'correction') AND occurred_at >= $1 AND occurred_at < $2`,
    [m.from, m.to],
  )
  const reserved = await db.query(
    `SELECT COALESCE(sum(s.reserved_cost), 0)::text AS v FROM assistant.usage_events s
     WHERE s.event = 'started' AND s.source = 'developer-key' AND s.simulated = false AND s.occurred_at >= $1 AND s.occurred_at < $2
       AND s.occurred_at > now() - make_interval(mins => $3)
       AND NOT EXISTS (SELECT 1 FROM assistant.usage_events t WHERE t.request_id = s.request_id AND t.event IN ('completed', 'failed', 'cancelled'))`,
    [m.from, m.to, RESERVATION_TTL_MINUTES],
  )
  const usedMoney = new Money(used.rows[0].v).plus(extraUsed)
  const reservedMoney = new Money(reserved.rows[0].v)
  const remaining = new Money(limit).minus(usedMoney).minus(reservedMoney)
  return {
    period: m.label,
    currency: 'USD',
    limit: new Money(limit).toFixed(MONEY_SCALE),
    used: usedMoney.toFixed(MONEY_SCALE),
    reserved: reservedMoney.toFixed(MONEY_SCALE),
    remaining: (remaining.isNegative() ? new Money(0) : remaining).toFixed(MONEY_SCALE),
  }
}

/** Serialises budget decisions for a month across every request and server process: held until the transaction ends. */
export async function lockBudget(client: PoolClient, at: Date): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`assistant.budget:${monthOf(at).label}`])
}
