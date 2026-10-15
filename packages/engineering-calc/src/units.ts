import { parseUnit, UnitError, type Dims, type ParsedUnit } from '@ews/platform-sdk'
import { CalcError } from './errors'

/**
 * Bridge to the platform unit algebra (SDK 1.6 contract/quantities.ts). The engine never uses mathjs
 * units: every value is converted to SI base magnitude with the platform parser, evaluated as a plain
 * number, and converted back to the declared unit.
 */
export const DIMENSIONLESS: Dims = [0, 0, 0, 0, 0, 0, 0]

/** Parses a parameter unit, refusing what calculation models cannot use. */
export function calcUnit(unit: string, what: string): ParsedUnit {
  let parsed: ParsedUnit
  try {
    parsed = parseUnit(unit)
  } catch (e) {
    throw new CalcError('unit-error', `${what}: ${e instanceof UnitError ? e.message : String(e)}`)
  }
  if (parsed.currency) throw new CalcError('unit-error', `${what}: currencies (${parsed.currency}) are not supported in calculation models.`)
  if (parsed.offset !== 0) throw new CalcError('unit-error', `${what}: temperatures with an offset (°C, °F) cannot be used in calculations; use K.`)
  return parsed
}

export const toSI = (value: number, u: ParsedUnit) => value * u.factor
export const fromSI = (value: number, u: ParsedUnit) => value / u.factor

export const sameDims = (a: Dims, b: Dims) => a.every((d, i) => d === b[i])
export const addDims = (a: Dims, b: Dims, sign: 1 | -1): Dims => a.map((d, i) => d + sign * b[i]) as Dims
export const scaleDims = (a: Dims, k: number): Dims => a.map((d) => d * k) as Dims

const SYMBOLS = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']
const NAMES: [Dims, string][] = [
  [[1, 0, 0, 0, 0, 0, 0], 'length'],
  [[0, 1, 0, 0, 0, 0, 0], 'mass'],
  [[0, 0, 1, 0, 0, 0, 0], 'time'],
  [[1, 1, -2, 0, 0, 0, 0], 'force'],
  [[2, 1, -2, 0, 0, 0, 0], 'energy or torque'],
  [[2, 1, -3, 0, 0, 0, 0], 'power'],
  [[-1, 1, -2, 0, 0, 0, 0], 'pressure or stress'],
  [[2, 0, 0, 0, 0, 0, 0], 'area'],
  [[3, 0, 0, 0, 0, 0, 0], 'volume'],
  [[4, 0, 0, 0, 0, 0, 0], 'second moment of area'],
  [[0, 1, -2, 0, 0, 0, 0], 'stiffness (force per length)'],
]

/** SI base unit text for dimensions, parseable by the platform parser ("kg*m*s^-2"; "-" if none). */
export function siUnitOf(dims: Dims): string {
  const parts = dims.map((d, i) => (d === 0 ? '' : d === 1 ? SYMBOLS[i] : `${SYMBOLS[i]}^${d}`)).filter(Boolean)
  return parts.length ? parts.join('*') : '-'
}

/** Readable dimension name for messages ("force", "length", "kg·m^-1", "dimensionless"). */
export function describeDims(dims: Dims): string {
  if (sameDims(dims, DIMENSIONLESS)) return 'dimensionless'
  return NAMES.find(([d]) => sameDims(d, dims))?.[1] ?? siUnitOf(dims).replace(/\*/g, '·')
}
