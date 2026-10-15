/**
 * @ews/engineering-calc: deterministic calculation engine of the design reasoning layer
 * (docs/modules/design-reasoning/mathematics.md, ADR-0044). Framework-free; units come from the
 * platform unit algebra (@ews/platform-sdk quantities), expressions are parsed with mathjs and
 * evaluated by this package's own interpreter. Hard isolation (worker thread): '@ews/engineering-calc/node'.
 */
export { GRAMMAR, FUNCTIONS, LIMITS, parseRelation, symbolsOf, formatExpr, type Expr, type ParsedRelation, type ComparisonOp, type BinaryOp, type FunctionName } from './ast'
export { BASES, BASIS_RANK, minBasis, calculationBasis, type Basis } from './basis'
export { canonicalJson, canonicalNumber, digestOf, sha256Hex } from './digest'
export { dimensionsOf } from './dimensions'
export { CalcError, ERROR_TAXONOMY, asCalcError, type CalcErrorCode, type CalcErrorDetails, type ErrorClass } from './errors'
export { evalInterval, differentiate, monotonicity, NotDifferentiable, type Interval, type Monotonicity } from './interval'
export { compileModel, validateModel, type CalculationModelDefinition, type CalculationParameter, type CalculationRelation, type CompiledModel, type ModelProblem } from './model'
export {
  DEFAULT_MAX_OPERATIONS,
  DEFAULT_TIMEOUT_MS,
  DIGEST_SPEC,
  ENGINE_NAME,
  ENGINE_VERSION,
  MANIFEST_VERSION,
  MAX_INTERVAL_INPUTS,
  SUPPORTED_MANIFEST_VERSIONS,
  VERIFY_RELATIVE_TOLERANCE,
  describeRange,
  evaluateModel,
  verifyManifest,
  type BoundsRange,
  type ManifestLimits,
  type ManifestUncertaintyMode,
  type PointResult,
  type ResultRange,
  type SampledRange,
  type StatusBasis,
  type ValidityResult,
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
export { qualifyManifest, type CalculationQualifications } from './qualify'
export { ENGINEERING_LIBRARY, libraryModel, type LibraryEntry, type LibrarySource, type ReferenceCase } from './library'
export { describeDims, siUnitOf } from './units'
