// Converts the commercial research seed (docs/modules/ai-interface/provider-pricing-seed.json, one record per
// provider, model, tier, context band and billing dimension) into config/pricing/<provider>.json, one record per
// (model, service tier, context band) with a rates map. Nothing is verified: every record keeps verified: false, its
// sourceUrl and retrievedAt. Providers state no effective date, so effectiveFrom is the retrieval date.
//   node services/assistant/scripts/import-pricing-seed.mjs <seed.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Decimal from 'decimal.js'

const seedPath = process.argv[2]
if (!seedPath) throw new Error('usage: import-pricing-seed.mjs <provider-pricing-seed.json>')
const seed = JSON.parse(readFileSync(seedPath, 'utf8'))
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'pricing')

const CORE = { input_tokens: 'input', output_tokens: 'output', cached_input_tokens: 'cachedInput', cache_read_tokens: 'cachedInput', cache_write_tokens: 'cacheWrite', cache_write_5m_tokens: 'cacheWrite5m', cache_write_1h_tokens: 'cacheWrite1h' }
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const dimensionOf = (d) => CORE[d] ?? camel(d)
const MODIFIER = /discount|multiplier|uplift/

function perOf(unit) {
  if (/per 1M (tokens|characters)/.test(unit)) return 1_000_000
  if (/per 1,000 /.test(unit)) return 1000
  return 1
}

/** 'short (<=272K input)', 'prompt >=200k', 'prompt <100,000 tokens' ... to inclusive input-token bounds. */
function bandOf(label) {
  if (!label) return undefined
  const m = /(<=|>=|<|>)\s*([\d,]+)\s*([kK])?/.exec(label)
  if (!m) return { label }
  const n = Number(m[2].replace(/,/g, '')) * (m[3] ? 1000 : 1)
  const band = { label }
  if (m[1] === '<=') band.maxInputTokens = n
  else if (m[1] === '<') band.maxInputTokens = n - 1
  else if (m[1] === '>') band.minInputTokens = n + 1
  else band.minInputTokens = n
  return band
}

const tierOf = (t) => (t.startsWith('fast') ? 'fast' : t)
const factorOf = (r) => (/discount/.test(r.dimension) ? new Decimal(1).minus(r.unitRate).toFixed() : /uplift/.test(r.dimension) ? new Decimal(1).plus(r.unitRate).toFixed() : r.unitRate)
const rateOf = (r) => ({ price: r.unitRate, per: perOf(r.unit), unit: r.unit })

const out = {}
const file = (p) => (out[p] ??= { schemaVersion: 1, provider: p, note: `Imported from ${'provider-pricing-seed.json'} (commercial research, retrieved ${seed._meta.retrievedAt}). Every record is unverified: a person must check it against its sourceUrl and a new pricingVersion is published when it is. effectiveFrom is the retrieval date because no provider page states when the price took effect. Anthropic, Google and xAI pages list display names for many models; those records use the model "display:<name>" until the adapter maps the real API ID.`, records: [], sharedRates: {}, modifiers: [] })
const groups = new Map()

for (const r of seed.records) {
  const f = file(r.provider)
  if (MODIFIER.test(r.dimension)) {
    f.modifiers.push({ name: dimensionOf(r.dimension), factor: factorOf(r), ...(dimensionOf(r.dimension) === 'batchDiscount' ? { serviceTier: 'batch' } : r.serviceTier !== 'standard' ? { serviceTier: tierOf(r.serviceTier) } : {}), ...(r.modelId ? { models: [r.modelId] } : {}), unit: r.unit, sourceUrl: r.sourceUrl, ...(r.notes ? { note: r.notes } : {}) })
    continue
  }
  const model = r.modelId ?? (r.displayName ? `display:${r.displayName}` : null)
  if (!model) {
    f.sharedRates[dimensionOf(r.dimension)] = rateOf(r)
    continue
  }
  const key = [r.provider, model, tierOf(r.serviceTier), r.contextBand ?? ''].join('|')
  if (!groups.has(key)) groups.set(key, { f, model, tier: tierOf(r.serviceTier), band: bandOf(r.contextBand), rows: [] })
  groups.get(key).rows.push(r)
}

for (const g of groups.values()) {
  const first = g.rows[0]
  const version = `${first.provider}-seed-${first.retrievedAt}`
  const base = {
    model: g.model,
    currency: first.currency,
    verified: false,
    ...(g.tier !== 'standard' ? { serviceTier: g.tier } : {}),
    ...(g.band ? { contextBand: g.band } : {}),
    sourceUrl: first.sourceUrl,
    retrievedAt: first.retrievedAt,
    sourceVersion: first.pricingVersion,
  }
  const rates = {}
  const notes = {}
  for (const r of g.rows) {
    rates[dimensionOf(r.dimension)] = rateOf(r)
    if (r.notes) notes[dimensionOf(r.dimension)] = r.notes
  }
  g.f.records.push({ pricingVersion: version, ...base, effectiveFrom: first.retrievedAt, rates, ...(Object.keys(notes).length ? { notes } : {}), ...(g.model.startsWith('display:') ? { note: 'The source page shows a display name, not the API model ID; this record matches no request until an adapter maps the ID.' } : {}) })
  // Scheduled price changes become a later-dated record with the changed dimensions overlaid.
  const dates = [...new Set(g.rows.filter((r) => r.scheduledChange).map((r) => r.scheduledChange.effectiveDate))].sort()
  for (const date of dates) {
    const later = structuredClone(rates)
    for (const r of g.rows) if (r.scheduledChange?.effectiveDate === date) later[dimensionOf(r.dimension)] = { ...rateOf(r), price: r.scheduledChange.unitRate }
    g.f.records.push({ pricingVersion: `${version}-scheduled-${date}`, ...base, effectiveFrom: date, rates: later, note: `Scheduled change shown on the source page, effective ${date}.` })
  }
}

for (const [p, f] of Object.entries(out)) {
  if (!Object.keys(f.sharedRates).length) delete f.sharedRates
  if (!f.modifiers.length) delete f.modifiers
  f.records.sort((a, b) => a.model.localeCompare(b.model) || (a.serviceTier ?? '').localeCompare(b.serviceTier ?? '') || (a.contextBand?.label ?? '').localeCompare(b.contextBand?.label ?? '') || a.effectiveFrom.localeCompare(b.effectiveFrom))
  writeFileSync(join(outDir, `${p}.json`), JSON.stringify(f, null, 1) + '\n')
  console.log(p, f.records.length, 'records', Object.keys(f.sharedRates ?? {}).length, 'shared rates', (f.modifiers ?? []).length, 'modifiers')
}
