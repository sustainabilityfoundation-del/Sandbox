export { CAD_SETTINGS, CAD_SETTING_DEFINITIONS, CAD_SETTING_IDS } from '@ews/cad-client'

export type MeasurementUnits = 'mm' | 'cm' | 'm' | 'in'

const LENGTH: Record<MeasurementUnits, { factor: number; unit: string; mass: { factor: number; unit: string } }> = {
  mm: { factor: 1, unit: 'mm', mass: { factor: 1, unit: 'kg' } },
  cm: { factor: 0.1, unit: 'cm', mass: { factor: 1000, unit: 'g' } },
  m: { factor: 0.001, unit: 'm', mass: { factor: 1, unit: 'kg' } },
  in: { factor: 1 / 25.4, unit: 'in', mass: { factor: 1 / 0.45359237, unit: 'lb' } },
}

/** Converts measured values (given in mm and kg) to the chosen display units. */
export function measure(units: MeasurementUnits | undefined) {
  const u = LENGTH[units ?? 'mm'] ?? LENGTH.mm
  return {
    length: (mm: number) => ({ value: mm * u.factor, unit: u.unit }),
    area: (mm2: number) => ({ value: mm2 * u.factor ** 2, unit: `${u.unit}²` }),
    volume: (mm3: number) => ({ value: mm3 * u.factor ** 3, unit: `${u.unit}³` }),
    mass: (kg: number) => ({ value: kg * u.mass.factor, unit: u.mass.unit }),
  }
}
