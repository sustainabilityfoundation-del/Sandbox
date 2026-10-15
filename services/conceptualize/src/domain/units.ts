// The unit algebra now lives in the SDK (contract/quantities.ts, SDK 1.6); re-exported for existing imports.
export type { Dims, ParsedUnit, QuantityInput } from '@ews/platform-sdk'
export { UnitError, parseUnit, isValidUnit, sameDimension, convert, dimensionName, quantityProblem, COMMON_UNITS } from '@ews/platform-sdk'
