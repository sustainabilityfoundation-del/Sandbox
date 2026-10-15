/**
 * @ews/design-reasoning-core: framework-free core of the Design Reasoning Engine
 * (docs/modules/design-reasoning/, ADR-0039…0046). Validation prototype (roadmap R1).
 */
export * from './refs'
export * from './linkTypes'
export * from './contract/conceptualize'
export { createConceptualizeHttpAdapter, createRequirementsHttpReader, createRequirementsHttpWriter, CONCEPTUALIZE_API_CAPABILITIES, type HttpTransport, type HttpResponse } from './adapters/conceptualizeHttpAdapter'
export { createConceptualizeTestAdapter, evaluateTradeStudy, toDefinition, type ConceptualizeTestAdapterOptions } from './adapters/conceptualizeContractAdapter'
export { BASES, BASIS_RANK, minBasis, calculationBasis, type Basis } from '@ews/engineering-calc'
export * from './sources'
export * from './runs'
export * from './proposals'
export { resolveInputs, BindingError, type ResolvedInputs } from './bindings'
export { paretoAnalysis, type ParetoResult } from './compare'
export { assessChangeImpact, type ImpactChange, type ImpactItem, type ImpactReport } from './impact'
export { explainSelection, type RationaleAnswer } from './rationale'
export { TOOLS, DEFS, toolDefinition, validateAgainst, type JsonSchema, type ToolDefinition } from './tools'
export { createReasoningEngine, ToolCallError, type EngineDeps, type ReasoningEngine, type ToolEnvelope } from './engine'
export { runActuatorScenario, requirementsFixture, type ScenarioOptions, type ScenarioStep, type ScenarioTranscript } from './prototype/actuatorScenario'
export { runNewProjectScenario, type NewProjectOptions, type NewProjectTranscript } from './prototype/newProjectScenario'
