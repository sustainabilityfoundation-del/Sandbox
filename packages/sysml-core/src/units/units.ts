/**
 * Units and quantity dimensions (ISQ base dimensions L, M, T, I, Θ, N, J). Used to check that a
 * quantity value assigned to an attribute has the attribute's dimension, and to convert values.
 * Covers the units of the platform library subset (SI package); conversion factors are to SI base.
 */

export type Dimension = readonly [number, number, number, number, number, number, number]

export const DIMENSIONLESS: Dimension = [0, 0, 0, 0, 0, 0, 0]
const D = (L = 0, M = 0, T = 0, I = 0, Th = 0, N = 0, J = 0): Dimension => [L, M, T, I, Th, N, J]

export const DIMENSIONS = {
  length: D(1),
  mass: D(0, 1),
  time: D(0, 0, 1),
  current: D(0, 0, 0, 1),
  temperature: D(0, 0, 0, 0, 1),
  amount: D(0, 0, 0, 0, 0, 1),
  luminous: D(0, 0, 0, 0, 0, 0, 1),
  area: D(2),
  volume: D(3),
  speed: D(1, 0, -1),
  acceleration: D(1, 0, -2),
  force: D(1, 1, -2),
  torque: D(2, 1, -2),
  energy: D(2, 1, -2),
  power: D(2, 1, -3),
  pressure: D(-1, 1, -2),
  frequency: D(0, 0, -1),
  voltage: D(2, 1, -3, -1),
  resistance: D(2, 1, -3, -2),
  charge: D(0, 0, 1, 1),
  angle: DIMENSIONLESS,
  angularVelocity: D(0, 0, -1),
  one: DIMENSIONLESS,
} as const

export interface UnitInfo {
  dimension: Dimension
  /** value_SI = value * factor + offset */
  factor: number
  offset?: number
}

/** Units of the SI package by qualified name (SI::<name>). */
export const UNITS: Record<string, UnitInfo> = {
  'SI::one': { dimension: DIMENSIONS.one, factor: 1 },
  'SI::metre': { dimension: DIMENSIONS.length, factor: 1 },
  'SI::millimetre': { dimension: DIMENSIONS.length, factor: 1e-3 },
  'SI::centimetre': { dimension: DIMENSIONS.length, factor: 1e-2 },
  'SI::kilometre': { dimension: DIMENSIONS.length, factor: 1e3 },
  'SI::kilogram': { dimension: DIMENSIONS.mass, factor: 1 },
  'SI::gram': { dimension: DIMENSIONS.mass, factor: 1e-3 },
  'SI::second': { dimension: DIMENSIONS.time, factor: 1 },
  'SI::millisecond': { dimension: DIMENSIONS.time, factor: 1e-3 },
  'SI::minute': { dimension: DIMENSIONS.time, factor: 60 },
  'SI::hour': { dimension: DIMENSIONS.time, factor: 3600 },
  'SI::ampere': { dimension: DIMENSIONS.current, factor: 1 },
  'SI::milliampere': { dimension: DIMENSIONS.current, factor: 1e-3 },
  'SI::kelvin': { dimension: DIMENSIONS.temperature, factor: 1 },
  "SI::'degree Celsius'": { dimension: DIMENSIONS.temperature, factor: 1, offset: 273.15 },
  'SI::newton': { dimension: DIMENSIONS.force, factor: 1 },
  'SI::kilonewton': { dimension: DIMENSIONS.force, factor: 1e3 },
  'SI::joule': { dimension: DIMENSIONS.energy, factor: 1 },
  'SI::watt': { dimension: DIMENSIONS.power, factor: 1 },
  'SI::kilowatt': { dimension: DIMENSIONS.power, factor: 1e3 },
  'SI::pascal': { dimension: DIMENSIONS.pressure, factor: 1 },
  "SI::'bar'": { dimension: DIMENSIONS.pressure, factor: 1e5 },
  'SI::hertz': { dimension: DIMENSIONS.frequency, factor: 1 },
  'SI::volt': { dimension: DIMENSIONS.voltage, factor: 1 },
  'SI::ohm': { dimension: DIMENSIONS.resistance, factor: 1 },
  'SI::coulomb': { dimension: DIMENSIONS.charge, factor: 1 },
  'SI::radian': { dimension: DIMENSIONS.angle, factor: 1 },
  'SI::degree': { dimension: DIMENSIONS.angle, factor: Math.PI / 180 },
  "SI::'revolution per minute'": { dimension: DIMENSIONS.angularVelocity, factor: (2 * Math.PI) / 60 },
  "SI::'newton metre'": { dimension: DIMENSIONS.torque, factor: 1 },
  'SI::litre': { dimension: DIMENSIONS.volume, factor: 1e-3 },
}

/** Dimension of ISQ quantity value types (qualified names in the platform library). */
export const QUANTITY_DIMENSIONS: Record<string, Dimension> = {
  'ISQ::DimensionOneValue': DIMENSIONS.one,
  'ISQ::LengthValue': DIMENSIONS.length,
  'ISQ::MassValue': DIMENSIONS.mass,
  'ISQ::DurationValue': DIMENSIONS.time,
  'ISQ::ElectricCurrentValue': DIMENSIONS.current,
  'ISQ::ThermodynamicTemperatureValue': DIMENSIONS.temperature,
  'ISQ::AmountOfSubstanceValue': DIMENSIONS.amount,
  'ISQ::LuminousIntensityValue': DIMENSIONS.luminous,
  'ISQ::AreaValue': DIMENSIONS.area,
  'ISQ::VolumeValue': DIMENSIONS.volume,
  'ISQ::SpeedValue': DIMENSIONS.speed,
  'ISQ::AccelerationValue': DIMENSIONS.acceleration,
  'ISQ::ForceValue': DIMENSIONS.force,
  'ISQ::TorqueValue': DIMENSIONS.torque,
  'ISQ::EnergyValue': DIMENSIONS.energy,
  'ISQ::PowerValue': DIMENSIONS.power,
  'ISQ::PressureValue': DIMENSIONS.pressure,
  'ISQ::FrequencyValue': DIMENSIONS.frequency,
  'ISQ::ElectricPotentialDifferenceValue': DIMENSIONS.voltage,
  'ISQ::ResistanceValue': DIMENSIONS.resistance,
  'ISQ::ElectricChargeValue': DIMENSIONS.charge,
  'ISQ::AngularMeasureValue': DIMENSIONS.angle,
  'ISQ::AngularVelocityValue': DIMENSIONS.angularVelocity,
}

export function sameDimension(a: Dimension, b: Dimension): boolean {
  return a.every((x, k) => x === b[k])
}

export function multiply(a: Dimension, b: Dimension, sign = 1): Dimension {
  return a.map((x, k) => x + sign * b[k]) as unknown as Dimension
}

export function power(a: Dimension, n: number): Dimension {
  return a.map((x) => x * n) as unknown as Dimension
}

const NAMES = ['m', 'kg', 's', 'A', 'K', 'mol', 'cd']

/** Human-readable dimension in SI base units, e.g. "kg·m·s^-2". */
export function formatDimension(d: Dimension): string {
  const parts = d.map((x, k) => (x === 0 ? '' : x === 1 ? NAMES[k] : `${NAMES[k]}^${x}`)).filter(Boolean)
  return parts.length ? parts.join('·') : 'dimensionless'
}

export function dimensionName(d: Dimension): string {
  const hit = Object.entries(DIMENSIONS).find(([, v]) => sameDimension(v, d))
  return hit && hit[0] !== 'angle' && hit[0] !== 'one' ? hit[0] : formatDimension(d)
}
