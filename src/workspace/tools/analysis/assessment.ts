import { isQuantity, type EngineeringObject, type Quantity, type Scenario } from '../../sdk'

/**
 * DEMO CALCULATION — illustrative only, not for engineering use.
 *
 * Euler buckling of the actuator rod as a slender column:
 *   I     = π d⁴ / 64
 *   P_cr  = π² E I / (K L)²
 *   P_all = P_cr / n              (n = design factor)
 *   MS    = P_all / P_op − 1      (margin of safety)
 */

export interface AssessmentInputs {
  operatingLoadKN: number
  diameterMm: number
  effectiveLengthMm: number
  elasticModulusGPa: number
  endFixityFactor: number
  designFactor: number
}

export interface AssessmentResult {
  operatingLoadKN: number
  criticalLoadKN: number
  allowableLoadKN: number
  margin: number
  utilisationPct: number
}

/** Where each input comes from in the shared model. */
export const INPUT_SOURCES: { key: keyof AssessmentInputs; label: string; unit: string; source: 'scenario' | 'object'; property: string }[] = [
  { key: 'operatingLoadKN', label: 'Operating load', unit: 'kN', source: 'scenario', property: 'operatingLoad' },
  { key: 'diameterMm', label: 'Rod diameter', unit: 'mm', source: 'object', property: 'diameter' },
  { key: 'effectiveLengthMm', label: 'Effective length', unit: 'mm', source: 'object', property: 'effectiveLength' },
  { key: 'elasticModulusGPa', label: 'Elastic modulus', unit: 'GPa', source: 'object', property: 'elasticModulus' },
  { key: 'endFixityFactor', label: 'End-fixity factor K', unit: '-', source: 'object', property: 'endFixityFactor' },
  { key: 'designFactor', label: 'Design factor', unit: '-', source: 'object', property: 'designFactor' },
]

function quantity(value: unknown, unit: string): number | null {
  if (!isQuantity(value)) return null
  const q = value as Quantity
  return q.unit === unit ? q.value : null
}

/** Reads inputs from the model, or reports which ones are missing or in unexpected units. */
export function readInputs(
  object: EngineeringObject,
  scenario: Scenario,
): { inputs: AssessmentInputs; missing: [] } | { inputs: null; missing: string[] } {
  const values: Partial<AssessmentInputs> = {}
  const missing: string[] = []
  for (const input of INPUT_SOURCES) {
    const holder = input.source === 'scenario' ? scenario.properties : object.properties
    const value = quantity(holder[input.property], input.unit)
    if (value === null) missing.push(`${input.label} (${input.unit})`)
    else values[input.key] = value
  }
  return missing.length ? { inputs: null, missing } : { inputs: values as AssessmentInputs, missing: [] }
}

export function assess(inputs: AssessmentInputs): AssessmentResult {
  const d = inputs.diameterMm
  const I = (Math.PI * d ** 4) / 64 // mm⁴
  const E = inputs.elasticModulusGPa * 1000 // N/mm²
  const KL = inputs.endFixityFactor * inputs.effectiveLengthMm // mm
  const criticalLoadKN = (Math.PI ** 2 * E * I) / KL ** 2 / 1000
  const allowableLoadKN = criticalLoadKN / inputs.designFactor
  return {
    operatingLoadKN: inputs.operatingLoadKN,
    criticalLoadKN,
    allowableLoadKN,
    margin: allowableLoadKN / inputs.operatingLoadKN - 1,
    utilisationPct: (inputs.operatingLoadKN / allowableLoadKN) * 100,
  }
}

const round = (value: number, digits: number) => Number(value.toFixed(digits))

export function resultEntries(result: AssessmentResult) {
  return [
    { key: 'operatingLoad', label: 'Operating load', value: round(result.operatingLoadKN, 2), unit: 'kN' },
    { key: 'criticalLoad', label: 'Critical buckling load', value: round(result.criticalLoadKN, 2), unit: 'kN' },
    { key: 'allowableLoad', label: 'Allowable load', value: round(result.allowableLoadKN, 2), unit: 'kN' },
    { key: 'margin', label: 'Margin of safety', value: round(result.margin, 3), unit: '-' },
    { key: 'utilisation', label: 'Utilisation', value: round(result.utilisationPct, 1), unit: '%' },
  ]
}

export function isAssessable(object: EngineeringObject | undefined): boolean {
  return object?.type === 'part' && isQuantity(object.properties.diameter) && isQuantity(object.properties.effectiveLength)
}
