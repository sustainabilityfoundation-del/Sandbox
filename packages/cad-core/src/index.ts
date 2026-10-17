/**
 * @ews/cad-core: the CAD's framework- and kernel-free core (ADR-0020).
 * Native open model (ADR-0022), typed commands and transactions (ADR-0023), sketch solver (ADR-0025),
 * regeneration with topological naming (ADR-0024) and observability queries.
 */
export * from './model/types'
export * from './model/document'
export { entityUuid, uuidV5 } from './model/uuid'
export { validateSchema, type JsonSchema } from './model/jsonSchema'
export * from './errors'
export { evaluate, parseExpression, referencedNames, UNIT_FACTORS, PARAMETER_NAME, RESERVED_NAMES } from './expr/expression'
export { evaluateParameters, evaluateIn, namesIn, type EvaluatedParameter, type ParameterScope } from './expr/parameters'
export { builtInSketchSolver, type SketchSolver } from './sketch/solverPort'
export { solveSketch, checkConstraintReferences, constraintSignatures, type SketchSolution, type SketchStatus, type Vec2, type SolveIssue } from './sketch/solver'
export { extractProfile, polygon, signedArea, type Profile, type ProfileRegion, type ProfileLoop, type ProfileSegment, type ProfileIssue } from './sketch/profile'
export * from './kernel'
export { STANDARD_PLANES, planeOf, extrudeProbes, revolveProbes } from './regen/geometry'
export { regenerate, solveSketchFeature, faceFrame, RegenerationCache, type RegenerateOptions, type RegenerationResult, type PartResult, type FeatureResult, type BodyResult, type SketchResult, type FeatureStatus, type FailureCause } from './regen/engine'
export * from './commands/types'
export { COMMANDS, COMMAND_INDEX } from './commands/registry'
export { applyTransaction, type TransactionOutcome, type CommandResult } from './commands/executor'
export { DocumentHistory, describe as describeCommands, type OperationLogEntry, type ExecuteResult } from './commands/history'
export { commandCatalog, QUERIES, type QuerySpec } from './commands/catalog'
export * from './query/queries'
export { localRegenerator, type Regenerator } from './regen/regenerator'
export { CadEngine, type EngineState, type EngineOptions, type DryRunResult } from './engine'
export { stableStringify, hashOf } from './util'
export { readBackStep, summarise as summariseGeometry, READBACK_TOLERANCE, type StepReadBack, type GeometrySummary } from './regen/readback'
