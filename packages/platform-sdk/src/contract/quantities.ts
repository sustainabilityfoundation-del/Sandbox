/**
 * Platform unit algebra (SDK 1.6, design reasoning CR-S2): unit parsing with dimension vectors,
 * conversion and quantity checks, promoted unchanged from Conceptualize so modules share one unit system.
 * Framework-free; no dependencies.
 */
/**
 * Unit-aware quantities (brief §11, contracts §7). Numerical properties are `{ value, unit }` (plus
 * optional `min`/`max` for uncertainty ranges). Units are parsed into a factor to SI base units and a
 * dimension vector, so the service can refuse dimensionally inconsistent data (a force entered in mm)
 * and convert compatible values (kN → N) before comparing them. Framework-free.
 *
 * Supported: SI base and common derived units with prefixes, products and quotients
 * (`N*m`, `N·m`, `m/s^2`, `kg/m³`, `W/(m*K)`), percent, rpm, °C/°F (absolute values only), and
 * currencies (each currency is its own dimension; no exchange rates).
 */

/** Exponents of L, M, T, I, Θ, N, J. Currencies are kept separately by code. */
export type Dims = [number, number, number, number, number, number, number]
export interface ParsedUnit {
  /** Multiply a value in this unit by `factor` (then add `offset`) to get SI base units. */
  factor: number
  offset: number
  dims: Dims
  currency?: string
}

const D = (l = 0, m = 0, t = 0, i = 0, th = 0, n = 0, j = 0): Dims => [l, m, t, i, th, n, j]
const ZERO = D()

interface BaseUnit {
  factor: number
  dims: Dims
  offset?: number
  /** Accepts SI prefixes. */
  prefix?: boolean
}

const BASE: Record<string, BaseUnit> = {
  m: { factor: 1, dims: D(1), prefix: true },
  g: { factor: 1e-3, dims: D(0, 1), prefix: true },
  t: { factor: 1e3, dims: D(0, 1) },
  s: { factor: 1, dims: D(0, 0, 1), prefix: true },
  min: { factor: 60, dims: D(0, 0, 1) },
  h: { factor: 3600, dims: D(0, 0, 1) },
  d: { factor: 86400, dims: D(0, 0, 1) },
  A: { factor: 1, dims: D(0, 0, 0, 1), prefix: true },
  K: { factor: 1, dims: D(0, 0, 0, 0, 1), prefix: true },
  '°C': { factor: 1, offset: 273.15, dims: D(0, 0, 0, 0, 1) },
  degC: { factor: 1, offset: 273.15, dims: D(0, 0, 0, 0, 1) },
  '°F': { factor: 5 / 9, offset: 273.15 - (32 * 5) / 9, dims: D(0, 0, 0, 0, 1) },
  mol: { factor: 1, dims: D(0, 0, 0, 0, 0, 1), prefix: true },
  cd: { factor: 1, dims: D(0, 0, 0, 0, 0, 0, 1) },
  N: { factor: 1, dims: D(1, 1, -2), prefix: true },
  J: { factor: 1, dims: D(2, 1, -2), prefix: true },
  Nm: { factor: 1, dims: D(2, 1, -2), prefix: true },
  Wh: { factor: 3600, dims: D(2, 1, -2), prefix: true },
  W: { factor: 1, dims: D(2, 1, -3), prefix: true },
  Pa: { factor: 1, dims: D(-1, 1, -2), prefix: true },
  bar: { factor: 1e5, dims: D(-1, 1, -2), prefix: true },
  psi: { factor: 6894.757293168, dims: D(-1, 1, -2) },
  Hz: { factor: 1, dims: D(0, 0, -1), prefix: true },
  rpm: { factor: 1 / 60, dims: D(0, 0, -1) },
  V: { factor: 1, dims: D(2, 1, -3, -1), prefix: true },
  Ω: { factor: 1, dims: D(2, 1, -3, -2), prefix: true },
  ohm: { factor: 1, dims: D(2, 1, -3, -2), prefix: true },
  C: { factor: 1, dims: D(0, 0, 1, 1), prefix: true },
  Ah: { factor: 3600, dims: D(0, 0, 1, 1), prefix: true },
  T: { factor: 1, dims: D(0, 1, -2, -1), prefix: true },
  L: { factor: 1e-3, dims: D(3), prefix: true },
  l: { factor: 1e-3, dims: D(3), prefix: true },
  in: { factor: 0.0254, dims: D(1) },
  ft: { factor: 0.3048, dims: D(1) },
  lb: { factor: 0.45359237, dims: D(0, 1) },
  lbf: { factor: 4.4482216152605, dims: D(1, 1, -2) },
  rad: { factor: 1, dims: ZERO },
  deg: { factor: Math.PI / 180, dims: ZERO },
  '°': { factor: Math.PI / 180, dims: ZERO },
  '%': { factor: 0.01, dims: ZERO },
  ppm: { factor: 1e-6, dims: ZERO },
  cycles: { factor: 1, dims: ZERO },
}

const PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, h: 1e2, c: 1e-2, m: 1e-3, µ: 1e-6, u: 1e-6, n: 1e-9 }
const CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'SEK', 'NOK', 'DKK'])
const SUPERSCRIPT: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }

export class UnitError extends Error {}

function lookup(symbol: string): ParsedUnit {
  if (CURRENCIES.has(symbol)) return { factor: 1, offset: 0, dims: ZERO, currency: symbol }
  const direct = BASE[symbol]
  if (direct) return { factor: direct.factor, offset: direct.offset ?? 0, dims: direct.dims }
  for (const [p, f] of Object.entries(PREFIX)) {
    if (!symbol.startsWith(p)) continue
    const base = BASE[symbol.slice(p.length)]
    if (base?.prefix && !base.offset) return { factor: base.factor * f, offset: 0, dims: base.dims }
  }
  throw new UnitError(`Unknown unit “${symbol}”.`)
}

const mul = (a: ParsedUnit, b: ParsedUnit, sign: 1 | -1): ParsedUnit => {
  if (a.currency && b.currency && a.currency !== b.currency) throw new UnitError('A unit cannot combine two currencies.')
  if ((a.offset && !isUnitOnly(b)) || (b.offset && !isUnitOnly(a))) throw new UnitError('Temperatures with an offset (°C, °F) cannot be combined with other units; use K.')
  return {
    factor: a.factor * b.factor ** sign,
    offset: 0,
    dims: a.dims.map((d, i) => d + sign * b.dims[i]) as Dims,
    currency: a.currency ?? (sign === 1 ? b.currency : b.currency ? `1/${b.currency}` : undefined),
  }
}
const isUnitOnly = (u: ParsedUnit) => u.factor === 1 && u.offset === 0 && u.dims.every((d) => d === 0) && !u.currency
const pow = (u: ParsedUnit, n: number): ParsedUnit => {
  if (u.offset && n !== 1) throw new UnitError('Temperatures with an offset (°C, °F) cannot be raised to a power; use K.')
  if (u.currency && n !== 1) throw new UnitError('A currency cannot be raised to a power.')
  return { factor: u.factor ** n, offset: n === 1 ? u.offset : 0, dims: u.dims.map((d) => d * n) as Dims, currency: u.currency }
}
const ONE: ParsedUnit = { factor: 1, offset: 0, dims: ZERO }

const cache = new Map<string, ParsedUnit>()

/** Parses a unit expression. Empty, "-" and "1" are dimensionless. Throws UnitError. */
export function parseUnit(unit: string): ParsedUnit {
  const cached = cache.get(unit)
  if (cached) return cached
  const source = unit.trim().replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => '^' + [...m].map((c) => SUPERSCRIPT[c]).join(''))
  if (source === '' || source === '-' || source === '1') return ONE
  if (source.length > 60) throw new UnitError('The unit is too long.')
  let i = 0
  const peek = () => source[i]
  const skipSpace = () => {
    while (source[i] === ' ') i++
  }
  const parseFactor = (): ParsedUnit => {
    skipSpace()
    let u: ParsedUnit
    if (peek() === '(') {
      i++
      u = parseProduct()
      skipSpace()
      if (peek() !== ')') throw new UnitError(`Missing “)” in “${unit}”.`)
      i++
    } else if (peek() === '1') {
      i++
      u = ONE
    } else {
      const m = /^(°[CF]?|[A-Za-zµΩ%]+)/.exec(source.slice(i))
      if (!m) throw new UnitError(`Cannot read the unit “${unit}”.`)
      i += m[0].length
      u = lookup(m[0])
    }
    skipSpace()
    if (peek() === '^') {
      i++
      const m = /^-?\d+/.exec(source.slice(i))
      if (!m) throw new UnitError(`Missing exponent in “${unit}”.`)
      i += m[0].length
      u = pow(u, Number(m[0]))
    }
    return u
  }
  const parseProduct = (): ParsedUnit => {
    let u = parseFactor()
    for (;;) {
      skipSpace()
      const c = peek()
      if (c === '*' || c === '·' || c === '.' || c === '⋅') {
        i++
        u = mul(u, parseFactor(), 1)
      } else if (c === '/') {
        i++
        u = mul(u, parseFactor(), -1)
      } else if (c && c !== ')' && /[A-Za-zµΩ°(]/.test(c)) {
        u = mul(u, parseFactor(), 1)
      } else return u
    }
  }
  const result = parseProduct()
  skipSpace()
  if (i < source.length) throw new UnitError(`Unexpected “${source.slice(i)}” in the unit “${unit}”.`)
  cache.set(unit, result)
  return result
}

export function isValidUnit(unit: string): boolean {
  try {
    parseUnit(unit)
    return true
  } catch {
    return false
  }
}

export function sameDimension(a: string, b: string): boolean {
  const x = parseUnit(a)
  const y = parseUnit(b)
  return x.dims.every((d, i) => d === y.dims[i]) && (x.currency ?? '') === (y.currency ?? '')
}

/** Converts a value between dimensionally compatible units. Throws UnitError otherwise. */
export function convert(value: number, from: string, to: string): number {
  if (from === to) return value
  if (!sameDimension(from, to)) throw new UnitError(`${from} cannot be converted to ${to}: the dimensions differ (${dimensionName(from)} vs ${dimensionName(to)}).`)
  const a = parseUnit(from)
  const b = parseUnit(to)
  const si = value * a.factor + a.offset
  return (si - b.offset) / b.factor
}

const NAMES: [Dims, string][] = [
  [D(1), 'length'],
  [D(0, 1), 'mass'],
  [D(0, 0, 1), 'time'],
  [D(0, 0, 0, 1), 'electric current'],
  [D(0, 0, 0, 0, 1), 'temperature'],
  [D(1, 1, -2), 'force'],
  [D(2, 1, -2), 'energy or torque'],
  [D(2, 1, -3), 'power'],
  [D(-1, 1, -2), 'pressure or stress'],
  [D(1, 0, -1), 'velocity'],
  [D(1, 0, -2), 'acceleration'],
  [D(0, 0, -1), 'frequency or rotational speed'],
  [D(2), 'area'],
  [D(3), 'volume'],
  [D(-3, 1), 'density'],
  [D(2, 1, -3, -1), 'voltage'],
  [D(0, 0, 1, 1), 'electric charge'],
  [D(0, 1, -2), 'stiffness (force per length)'],
]

/** A readable name for a unit's dimension ("force", "length", "dimensionless", "currency EUR"). */
export function dimensionName(unit: string): string {
  let u: ParsedUnit
  try {
    u = parseUnit(unit)
  } catch {
    return 'unknown'
  }
  if (u.currency) return `currency ${u.currency}`
  if (u.dims.every((d) => d === 0)) return 'dimensionless'
  const hit = NAMES.find(([dims]) => dims.every((d, i) => d === u.dims[i]))
  if (hit) return hit[1]
  const sym = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']
  return u.dims.map((d, i) => (d ? `${sym[i]}${d === 1 ? '' : `^${d}`}` : '')).filter(Boolean).join('·')
}

export interface QuantityInput {
  value?: number | null
  unit: string
  min?: number | null
  max?: number | null
}

/**
 * Validates a quantity: a known unit, finite numbers, min ≤ value ≤ max, at least a value or a range,
 * and, when `expected` is given, the same dimension as it. Returns a problem or null.
 */
export function quantityProblem(q: QuantityInput, expected?: string): string | null {
  if (typeof q.unit !== 'string') return 'needs a unit (use "-" for dimensionless values)'
  try {
    parseUnit(q.unit)
  } catch (e) {
    return (e as Error).message
  }
  const nums = [q.value, q.min, q.max].filter((v) => v !== undefined && v !== null) as number[]
  if (!nums.length) return 'needs a value or a range (min/max)'
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n))) return 'values must be finite numbers'
  if (q.min != null && q.max != null && q.min > q.max) return 'min must not exceed max'
  if (q.value != null && q.min != null && q.value < q.min) return 'value is below min'
  if (q.value != null && q.max != null && q.value > q.max) return 'value is above max'
  if (expected !== undefined && !sameDimension(q.unit, expected)) return `${q.unit} is ${dimensionName(q.unit)}, expected ${dimensionName(expected)} (${expected})`
  return null
}

/** Units offered in pickers (all parse). */
export const COMMON_UNITS = ['-', '%', 'N', 'kN', 'N*m', 'mm', 'm', 'mm^2', 'mm^3', 'kg', 'g', 's', 'ms', 'Hz', 'rpm', 'm/s', 'mm/s', 'm/s^2', 'W', 'kW', 'J', 'Wh', 'Pa', 'kPa', 'MPa', 'bar', 'V', 'A', '°C', 'K', 'EUR', 'USD']
