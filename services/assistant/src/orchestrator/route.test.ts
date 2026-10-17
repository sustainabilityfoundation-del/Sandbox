import { describe, expect, it } from 'vitest'
import type { PricingFile } from '../pricing'
import { evaluate, route, RoutingError, type Candidate, type RouteRequest } from './route'

/** Prices below are TEST FIXTURES, not provider prices. */
const priced = (provider: string, models: Record<string, { input: string; output: string; verified?: boolean }>): PricingFile => ({
  schemaVersion: 1,
  provider,
  records: Object.entries(models).map(([model, p]) => ({
    pricingVersion: 'test-1',
    model,
    effectiveFrom: '2026-01-01',
    currency: 'USD',
    verified: p.verified ?? true,
    sourceUrl: null,
    retrievedAt: null,
    rates: { input: { price: p.input, per: 1_000_000 }, output: { price: p.output, per: 1_000_000 } },
  })),
})

const pricing = priced('acme', { cheap: { input: '1', output: '2' }, mid: { input: '3', output: '6' }, top: { input: '10', output: '30' }, unrated: { input: '0.5', output: '1' }, shaky: { input: '0.1', output: '0.1', verified: false } })

const dev = (model: string, over: Partial<Candidate> = {}): Candidate => ({
  accountId: 'dev:acme',
  source: 'developer-key',
  billing: 'meter_only',
  simulated: false,
  provider: 'acme',
  providerLabel: 'Acme',
  method: 'api-key',
  chatgptPlan: false,
  model,
  label: model,
  known: true,
  toolsCapable: true,
  isDefault: false,
  pricing,
  ...over,
})

const FLEET: Candidate[] = [dev('cheap', { tier: 1 }), dev('mid', { tier: 2 }), dev('top', { tier: 3 }), dev('unrated', { tier: undefined })]
const base: RouteRequest = { mode: 'balanced', needTools: true, estimatedInputTokens: 1000, maxOutputTokens: 2000, allowUnverifiedPricing: true }

describe('automatic selection (brief criterion 6)', () => {
  it('quality picks the highest tier, balanced the cheapest of tier 2 or higher, economy the cheapest', () => {
    expect(route(FLEET, { ...base, mode: 'quality' }).candidate.model).toBe('top')
    expect(route(FLEET, { ...base, mode: 'balanced' }).candidate.model).toBe('mid')
    expect(route(FLEET, { ...base, mode: 'economy' }).candidate.model).toBe('unrated')
  })

  it('records why, and which other models were considered', () => {
    const d = route(FLEET, { ...base, mode: 'balanced' })
    expect(d.reason).toMatch(/Balanced/)
    expect(d.considered.map((c) => c.model).sort()).toEqual(['cheap', 'mid', 'top', 'unrated'])
    expect(d.mode).toBe('balanced')
  })

  it('economy needs reliable tool calling when tools are offered', () => {
    const fleet = [dev('cheap', { tier: 1, toolsCapable: false }), dev('mid', { tier: 2 })]
    expect(route(fleet, { ...base, mode: 'economy' }).candidate.model).toBe('mid')
  })

  it('balanced falls back to the best available when nothing is rated tier 2', () => {
    const d = route([dev('cheap', { tier: 1 }), dev('unrated', { tier: undefined })], { ...base, mode: 'balanced' })
    expect(d.candidate.model).toBe('unrated')
    expect(d.reason).toMatch(/no available model is rated tier 2/)
  })

  it('skips a model whose worst case exceeds the remaining development budget', () => {
    const d = route(FLEET, { ...base, mode: 'quality', remainingBudget: '0.01' })
    expect(d.candidate.model).not.toBe('top')
  })
})

describe('filters', () => {
  it('excludes switched-off providers and refuses when nothing is left', () => {
    const e = evaluate(FLEET, { ...base, disallowedProviders: new Set(['acme']) })
    expect(e.every((x) => !x.eligible && /switched off/.test(x.reason!))).toBe(true)
    expect(() => route(FLEET, { ...base, disallowedProviders: new Set(['acme']) })).toThrow(RoutingError)
  })

  it('a model with no price cannot be used with developer keys; a user connection may be unpriced', () => {
    const nameless = dev('mystery', { tier: 3, pricing })
    expect(evaluate([nameless], base)[0]).toMatchObject({ eligible: false, reason: expect.stringMatching(/No price is known/) })
    const own = dev('mystery', { tier: 3, source: 'user-connection', billing: 'byok', accountId: 'conn:1', pricing: undefined })
    expect(evaluate([own], base)[0].eligible).toBe(true)
  })

  it('unverified prices are usable when allowed (development default) and refused otherwise', () => {
    const shaky = dev('shaky', { tier: 2 })
    expect(evaluate([shaky], { ...base, allowUnverifiedPricing: true })[0].eligible).toBe(true)
    expect(evaluate([shaky], { ...base, allowUnverifiedPricing: false })[0]).toMatchObject({ eligible: false, reason: expect.stringMatching(/unverified/) })
  })

  it('unknown models and ChatGPT plan connections are Manual only', () => {
    const unknown = dev('cheap', { tier: undefined, known: false })
    const plan = dev('cheap', { chatgptPlan: true, source: 'user-connection', billing: 'consumer-plan', accountId: 'conn:2', pricing: undefined })
    expect(evaluate([unknown], base)[0]).toMatchObject({ eligible: false, reason: expect.stringMatching(/Manual/) })
    expect(evaluate([plan], base)[0]).toMatchObject({ eligible: false, reason: expect.stringMatching(/Manual mode only/) })
    expect(evaluate([unknown], { ...base, mode: 'manual', manual: { model: 'cheap' } })[0].eligible).toBe(true)
    expect(() => route([plan], base)).toThrow(/Manual mode only/)
    expect(route([plan], { ...base, mode: 'manual' }).candidate.chatgptPlan).toBe(true)
  })
})

describe('user mode: the person’s own connection is always usable', () => {
  const own = (over: Partial<Candidate> = {}) => dev('mystery', { source: 'user-connection', billing: 'byok', accountId: 'conn:9', known: false, pricing: undefined, ...over })
  it('passes the automatic-mode exclusions (unknown model, ChatGPT plan) only when the flag is set', () => {
    const plan = own({ chatgptPlan: true, billing: 'consumer-plan' })
    for (const mode of ['economy', 'balanced', 'quality'] as const) {
      expect(route([plan], { ...base, mode, ownConnectionAlwaysUsable: true }).candidate.accountId).toBe('conn:9')
      expect(() => route([plan], { ...base, mode })).toThrow(RoutingError)
    }
    expect(route([own()], { ...base, ownConnectionAlwaysUsable: true }).rankCost).toBeNull()
  })
  it('does not override a provider switched off', () => {
    expect(() => route([own()], { ...base, ownConnectionAlwaysUsable: true, disallowedProviders: new Set(['acme']) })).toThrow(RoutingError)
  })
})

describe('unavailable models are disabled with a reason (brief criterion 7)', () => {
  it('lists a model missing from the account as disabled and never selects it', () => {
    const gone = dev('top', { tier: 3, unavailableReason: 'This model is not available on this account.' })
    const e = evaluate([gone, dev('mid', { tier: 2 })], base)
    expect(e.find((x) => x.candidate.model === 'top')).toMatchObject({ eligible: false, reason: 'This model is not available on this account.' })
    expect(route([gone, dev('mid', { tier: 2 })], { ...base, mode: 'quality' }).candidate.model).toBe('mid')
  })
})

describe('manual selection (brief criteria 5 and 14, partial)', () => {
  it('uses exactly the chosen provider and model', () => {
    const d = route(FLEET, { ...base, mode: 'manual', manual: { provider: 'acme', model: 'cheap' } })
    expect(d.candidate.model).toBe('cheap')
    expect(d.reason).toBe('Manual selection.')
  })

  it('never substitutes another model: an unavailable or out-of-policy choice is refused', () => {
    const gone = [dev('top', { tier: 3, unavailableReason: 'This model is not available on this account.' }), dev('mid', { tier: 2 })]
    expect(() => route(gone, { ...base, mode: 'manual', manual: { model: 'top' } })).toThrow(/not available on this account.*does not substitute/)
    expect(() => route(FLEET, { ...base, mode: 'manual', manual: { provider: 'acme', model: 'top' }, disallowedProviders: new Set(['acme']) })).toThrow(/switched off.*does not substitute/)
    expect(() => route(FLEET, { ...base, mode: 'manual', manual: { model: 'does-not-exist' } })).toThrow(RoutingError)
    expect(() => route([...FLEET, dev('shaky', { tier: 2 })], { ...base, mode: 'manual', manual: { model: 'shaky' }, allowUnverifiedPricing: false })).toThrow(/unverified/)
  })

  it('without a choice, Manual uses the person’s own connection or asks for a selection', () => {
    const own = dev('cheap', { source: 'user-connection', billing: 'byok', accountId: 'conn:3' })
    expect(route([...FLEET, own], { ...base, mode: 'manual' }).candidate.accountId).toBe('conn:3')
    expect(() => route(FLEET, { ...base, mode: 'manual' })).toThrow(/needs a provider and model/)
  })
})

describe('stickiness', () => {
  it('keeps the model used earlier while it stays eligible and the mode is unchanged', () => {
    const first = route(FLEET, { ...base, mode: 'balanced' })
    expect(first.candidate.model).toBe('mid')
    // A cheaper tier-2 model appears; the conversation stays on the model it started with.
    const fleet = [...FLEET, dev('mid2', { tier: 2, pricing: priced('acme', { mid2: { input: '0.1', output: '0.1' } }) })]
    expect(route(fleet, { ...base }).candidate.model).toBe('mid2')
    const sticky = route(fleet, { ...base, sticky: { accountId: 'dev:acme', model: 'mid', mode: 'balanced' } })
    expect(sticky).toMatchObject({ sticky: true })
    expect(sticky.candidate.model).toBe('mid')
    // A different mode, or an ineligible model, re-routes.
    expect(route(fleet, { ...base, mode: 'quality', sticky: { accountId: 'dev:acme', model: 'mid', mode: 'balanced' } }).candidate.model).toBe('top')
    expect(route(fleet, { ...base, disallowedProviders: new Set(), sticky: { accountId: 'dev:acme', model: 'gone', mode: 'balanced' } }).sticky).toBe(false)
  })
})
