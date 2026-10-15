/**
 * @ews/engineering-calc: deterministic calculation engine of the design reasoning layer
 * (docs/modules/design-reasoning/mathematics.md, ADR-0044). Framework-free; units come from the
 * platform unit algebra (@ews/platform-sdk quantities), expressions are parsed with mathjs and
 * evaluated by this package's own interpreter.
 */
export { GRAMMAR, FUNCTIONS, LIMITS, parseRelation, symbolsOf, formatExpr, type Expr, type ParsedRelation, type ComparisonOp, type BinaryOp, type FunctionName } from './ast'
export { BASES, BASIS_RANK, minBasis, calculationBasis, type Basis } from './basis'
export { canonicalJson, digestOf, sha256Hex } from './digest'
export { dimensionsOf } from './dimensions'
export { CalcError, type CalcErrorCode } from './errors'
export { compileModel, validateModel, type CalculationModelDefinition, type CalculationParameter, type CalculationRelation, type CompiledModel, type ModelProblem } from './model'
export {
  ENGINE_NAME,
  ENGINE_VERSION,
  MAX_INTERVAL_INPUTS,
  evaluateModel,
  verifyManifest,
  type CalculationManifest,
  type CalculationResult,
  type CheckResult,
  type EvaluateOptions,
  type InputSource,
  type InputValue,
  type QuantityOut,
  type UncertaintyMode,
  type VerificationResult,
} from './evaluate'
export { describeDims, siUnitOf } from './units'
