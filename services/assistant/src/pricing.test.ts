import { describe, expect, it } from 'vitest'
import { calculateCost, costFromSnapshot, isPriced, listPricingProviders, loadPricing, resolvePricing, snapshotOf, ticksToUsd, validatePricingFile, withSharedRates, type PricingFile, type PricingRecord } from './pricing'

/**
 * Mock tier (no network, no database). Brief section 17 criteria 9, 10 and 19 for pricing.
 *
 * ALL RATES IN THIS FILE ARE TEST FIXTURES. They are round numbers chosen so the arithmetic is checkable by hand;
 * they are not any provider's price. The shipped config/pricing records are unverified placeholders.
 */

const rec = (over: Partial<PricingRecord>): PricingRecord => ({
  pricingVersion: 'TEST-FIXTURE-v1',
  model: 'test-model',
  effectiveFrom: '2026-01-01',
  currency: 'USD',
  verified: false,
  sourceUrl: null,
  retrievedAt: null,
  rates: {},
  ...over,
})

// TEST FIXTURE: token billing with a cache discount and a premium cache write.
const TOKENS = rec({
  rates: {
    input: { price: '2.00', per: 1_000_000 },
    output: { price: '10.00', per: 1_000_000 },
    cachedInput: { price: '0.50', per: 1_000_000 },
    cacheWrite: { price: '2.50', per: 1_000_000 },
    reasoning: { price: '12.00', per: 1_000_000 },
  },
})

describe('pricing registry files', () => {
  it('validates the shipped files; the researched seed is unverified and sourced', () => {
    expect(listPricingProviders()).toEqual(expect.arrayContaining(['openai', 'anthropic', 'google', 'xai', 'fake']))
    for (const p of listPricingProviders()) {
      const f = loadPricing(p)
      expect(f.records.length).toBeGreaterThan(0)
      for (const r of f.records) {
        expect(r.verified).toBe(false) // a person flips this, with a new pricingVersion, after checking the source
        if (p !== 'fake') expect(r).toMatchObject({ sourceUrl: expect.stringMatching(/^https:/), retrievedAt: '2026-10-16' })
      }
    }
  })

  it('prices the registry default model from the seed, unverified, by service tier and context band', () => {
    const records = loadPricing('openai').records
    const std = resolvePricing(records, 'gpt-6.1-sol', '2026-11-01')
    expect(isPriced(std)).toBe(true)
    expect(std?.verified).toBe(false)
    expect(std?.rates.input.unit).toBe('USD per 1M tokens')
    const batch = resolvePricing(records, 'gpt-6.1-sol', '2026-11-01', { serviceTier: 'batch' })
    expect(batch?.serviceTier).toBe('batch')
    const short = resolvePricing(records, 'gpt-6.1-sol', '2026-11-01', { inputTokens: 10_000 })
    const long = resolvePricing(records, 'gpt-6.1-sol', '2026-11-01', { inputTokens: 300_000 })
    expect(short?.contextBand?.maxInputTokens).toBe(272_000)
    expect(long?.contextBand?.minInputTokens).toBe(272_001)
    expect(resolvePricing(records, 'gpt-6.1-sol', '2026-10-01')).toBeUndefined() // before the seed's retrieval date
  })

  it('applies a scheduled price change from its date (a later-dated record), keeping today\'s price before it', () => {
    const g = loadPricing('google').records.filter((r) => r.model.includes('gemini-4-argon') || r.model.includes('Gemini 4 Argon'))
    const before = resolvePricing(g, g[0].model, '2026-11-30')
    const after = resolvePricing(g, g[0].model, '2026-12-01')
    expect(before?.rates.input.price).toBe('2')
    expect(after?.rates.input.price).toBe('4')
    expect(after?.pricingVersion).toContain('scheduled-2026-12-01')
  })

  it('refuses numeric prices, verified records without a source, and bad tiers', () => {
    const file = (r: unknown) => ({ schemaVersion: 1, provider: 'x', records: [r] })
    expect(() => validatePricingFile(file({ ...TOKENS, rates: { input: { price: 2, per: 1000 } } }))).toThrow(/decimal string/)
    expect(() => validatePricingFile(file({ ...TOKENS, verified: true }))).toThrow(/needs a sourceUrl/)
    expect(() => validatePricingFile(file({ ...TOKENS, rates: { input: { per: 1, tiers: [{ upTo: 5, price: '1' }] } } }))).toThrow(/upTo must be null/)
    expect(() => validatePricingFile(file(TOKENS))).not.toThrow()
  })
})

describe('criterion 9: cost respects provider-specific pricing', () => {
  it('prices uncached input, cached input, cache writes, plain output and reasoning separately', () => {
    // 1,000,000 input of which 400,000 cached and 100,000 cache-write; 200,000 output of which 50,000 reasoning.
    const c = calculateCost({ inputTokens: 1_000_000, cachedInputTokens: 400_000, cacheWriteTokens: 100_000, outputTokens: 200_000, reasoningTokens: 50_000 }, TOKENS)
    // 0.5M*2.00 + 0.4M*0.50 + 0.1M*2.50 + 0.15M*10.00 + 0.05M*12.00 = 1.00 + 0.20 + 0.25 + 1.50 + 0.60
    expect(c.total).toBe('3.5500000000')
    expect(c.lines.map((l) => l.dimension)).toEqual(['input', 'cachedInput', 'cacheWrite', 'output', 'reasoning'])
    expect(c.missing).toEqual([])
  })

  it('bills cached, cache-write and reasoning tokens at the input / output rate when the provider has no special rate', () => {
    const plain = rec({ rates: { input: { price: '2.00', per: 1_000_000 }, output: { price: '10.00', per: 1_000_000 } } })
    const c = calculateCost({ inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000, reasoningTokens: 40_000 }, plain)
    expect(c.total).toBe('3.0000000000')
    expect(c.lines.find((l) => l.dimension === 'cachedInput')?.billedAs).toBe('input')
    expect(c.lines.find((l) => l.dimension === 'reasoning')?.billedAs).toBe('output')
  })

  it('is exact where binary floating point is not', () => {
    const r = rec({ rates: { input: { price: '0.10', per: 1 }, output: { price: '0.20', per: 1 } } })
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(calculateCost({ inputTokens: 1, outputTokens: 1 }, r).total).toBe('0.3000000000')
  })

  it('reports an unpriced dimension instead of a misleading total', () => {
    const noOutput = rec({ rates: { input: { price: '2.00', per: 1_000_000 } } })
    const c = calculateCost({ inputTokens: 1000, outputTokens: 10 }, noOutput)
    expect(c.total).toBeNull()
    expect(c.missing).toEqual(['output'])
    expect(c.pricedTotal).toBe('0.0020000000')
    expect(calculateCost({ inputTokens: 10 }, rec({})).total).toBeNull() // a placeholder prices nothing
  })
})

describe('criterion 10: several billing structures', () => {
  it('prices per-unit dimensions: images, seconds and requests', () => {
    const r = rec({ rates: { image: { price: '0.04', per: 1 }, second: { price: '0.006', per: 60 }, request: { price: '0.001', per: 1 } } })
    const c = calculateCost({ units: [{ dimension: 'image', quantity: 3 }, { dimension: 'second', quantity: 90 }, { dimension: 'request', quantity: 1 }] }, r)
    // 3*0.04 + 90/60*0.006 + 0.001 = 0.12 + 0.009 + 0.001
    expect(c.total).toBe('0.1300000000')
  })

  it('prices graduated (volume) tiers', () => {
    const r = rec({ rates: { input: { per: 1_000_000, tiers: [{ upTo: 1_000_000, price: '3.00' }, { upTo: 2_000_000, price: '2.00' }, { upTo: null, price: '1.00' }] } } })
    expect(calculateCost({ inputTokens: 500_000 }, r).total).toBe('1.5000000000')
    // 1M*3 + 1M*2 + 0.5M*1
    expect(calculateCost({ inputTokens: 2_500_000 }, r).total).toBe('5.5000000000')
  })

  it('applies a discount (batch) and mixes tokens with units', () => {
    const r = rec({ rates: { input: { price: '2.00', per: 1_000_000 }, image: { price: '0.04', per: 1 } }, discounts: [{ name: 'batch', factor: '0.5' }] })
    expect(calculateCost({ inputTokens: 1_000_000, units: [{ dimension: 'image', quantity: 1 }] }, r).total).toBe('1.0200000000')
  })

  it('represents a zero-marginal-cost structure (self-hosted, prepaid or negotiated flat rate) with a per-request rate', () => {
    const self = rec({ rates: { input: { price: '0', per: 1_000_000 }, output: { price: '0', per: 1_000_000 } } })
    expect(calculateCost({ inputTokens: 5000, outputTokens: 500 }, self).total).toBe('0.0000000000')
    expect(isPriced(self)).toBe(true)
  })
})

describe('criterion 19: historical pricing is reproducible', () => {
  const v1 = rec({ pricingVersion: 'TEST-FIXTURE-v1', effectiveFrom: '2026-01-01', rates: { input: { price: '2.00', per: 1_000_000 }, output: { price: '10.00', per: 1_000_000 } } })
  const v2 = rec({ pricingVersion: 'TEST-FIXTURE-v2', effectiveFrom: '2026-06-01', rates: { input: { price: '1.00', per: 1_000_000 }, output: { price: '5.00', per: 1_000_000 } } })
  const usage = { inputTokens: 123_456, outputTokens: 7_890 }

  it('resolves the record in force by date, exact model before pattern', () => {
    const pattern = rec({ pricingVersion: 'TEST-FIXTURE-p', model: 'test-*', effectiveFrom: '2026-07-01' })
    expect(resolvePricing([v1, v2], 'test-model', '2026-03-01')?.pricingVersion).toBe('TEST-FIXTURE-v1')
    expect(resolvePricing([v1, v2], 'test-model', '2026-06-01T10:00:00Z')?.pricingVersion).toBe('TEST-FIXTURE-v2')
    expect(resolvePricing([v1, v2], 'test-model', '2025-12-31')).toBeUndefined()
    expect(resolvePricing([v1, v2, pattern], 'test-model', '2026-08-01')?.pricingVersion).toBe('TEST-FIXTURE-v2')
    expect(resolvePricing([v1, v2, pattern], 'test-other', '2026-08-01')?.pricingVersion).toBe('TEST-FIXTURE-p')
  })

  it('recomputes an old cost from the stored snapshot after the registry changed, byte for byte', () => {
    const stored = JSON.parse(JSON.stringify(snapshotOf(v1))) // what a ledger row keeps (JSON round trip)
    const original = costFromSnapshot(usage, stored).total
    expect(original).toBe('0.3258120000')
    // The registry moves on: the same usage priced today gives a different number, the old row does not change.
    expect(calculateCost(usage, v2).total).not.toBe(original)
    expect(costFromSnapshot(usage, stored).total).toBe(original)
    expect(costFromSnapshot(usage, JSON.parse(JSON.stringify(stored))).total).toBe(original)
  })

  it('keeps a selected modifier in the snapshot so a batch or priority cost reproduces', () => {
    const snap = snapshotOf(v1, [{ name: 'batch', factor: '0.5' }])
    expect(snap.discounts).toEqual([{ name: 'batch', factor: '0.5' }])
    expect(costFromSnapshot(usage, snap).total).toBe('0.1629060000')
  })
})

describe('research-driven billing details (TEST FIXTURE rates)', () => {
  it('splits cache writes by lifetime (Anthropic 5 minute and 1 hour rates)', () => {
    const r = rec({ rates: { input: { price: '4', per: 1_000_000 }, cacheWrite5m: { price: '5', per: 1_000_000 }, cacheWrite1h: { price: '8', per: 1_000_000 }, cachedInput: { price: '0.4', per: 1_000_000 }, output: { price: '20', per: 1_000_000 } } })
    // input total 1.3M = 1M uncached + 0.1M read + 0.2M written (0.05M of it 1 hour); output 0.1M.
    const c = calculateCost({ inputTokens: 1_300_000, cachedInputTokens: 100_000, cacheWriteTokens: 200_000, cacheWrite1hTokens: 50_000, outputTokens: 100_000 }, r)
    // 1.0*4 + 0.1*0.4 + 0.15*5 + 0.05*8 + 0.1*20
    expect(c.total).toBe('7.1900000000')
    expect(c.lines.find((l) => l.dimension === 'cacheWrite')?.billedAs).toBe('cacheWrite5m')
  })

  it('bills thinking as output when there is no reasoning rate, and reads the provider-reported cost in ticks', () => {
    const r = rec({ rates: { input: { price: '1', per: 1_000_000 }, output: { price: '2', per: 1_000_000 } } })
    expect(calculateCost({ inputTokens: 0, outputTokens: 1_000_000, reasoningTokens: 400_000 }, r).total).toBe('2.0000000000')
    expect(ticksToUsd(12_345_678_900)).toEqual({ amount: '1.2345678900', currency: 'USD' })
    expect(ticksToUsd('5')).toEqual({ amount: '0.0000000005', currency: 'USD' })
  })

  it('merges model-independent tool fees under a record\'s own rates', () => {
    const file: PricingFile = { schemaVersion: 1, provider: 'x', sharedRates: { webSearchCalls: { price: '10', per: 1000 } }, records: [rec({ rates: { input: { price: '1', per: 1_000_000 } } })] }
    const merged = withSharedRates(file, file.records[0])
    expect(calculateCost({ inputTokens: 1_000_000, units: [{ dimension: 'webSearchCalls', quantity: 3 }] }, merged).total).toBe('1.0300000000')
  })
})
