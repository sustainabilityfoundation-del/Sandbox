/**
 * Context engineering contract (SDK 1.15, ECII plan Amendment 2, ADR-0085 and ADR-0086). Types only: no runtime behaviour.
 *
 * A context package is an immutable execution snapshot: references to authoritative artifacts with exact revisions plus bounded
 * projections. It is never a second source of truth. Selectors (one per module, declared on `ServerModuleDescriptor.selectContext`)
 * return snapshot items; the assistant service assembles the package on the server, persists it and turns it into neutral
 * `ContextBlock`s for the gateway. Evaluation findings (ADR-0086) are keyed by context and proposal.
 */
import type { ArtifactRef, PlatformArtifactModule } from './concepts'

// ---------------------------------------------------------------------------------------------------------------------
// References and snapshot items
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Reference held by a context item: the SDK `ArtifactRef` widened to every platform module plus `reasoning`, with the
 * Conceptualize record `type` (Design Reasoning core `DesignRef.type`). Design Reasoning core's `AnyRef` is assignable to it.
 */
export interface ContextRef {
  module: PlatformArtifactModule | 'reasoning'
  /** Canonical ID in the owning module. */
  id: string
  /** Exact revision the item was read at; absent only for references that deliberately follow the latest. */
  revision?: number
  /** Artifact kind, as in `ArtifactRef.kind`. */
  kind?: string
  /** Conceptualize design record type (`decision`, `constraint`, `assumption`, ...). */
  type?: string
}

/** How a selector reached the item. The first six values are Design Reasoning core's; `selector` is a module context selector. */
export type ContextItemVia = 'seed' | 'graph' | 'filter' | 'search' | 'requirements-api' | 'client-attested' | 'selector'

/** Section of the package (and of the inspector) an item belongs to. */
export type ContextSection =
  | 'objective'
  | 'systems'
  | 'interfaces'
  | 'requirements'
  | 'constraints'
  | 'decisions'
  | 'evidence'
  | 'assumptions'
  | 'unknowns'
  | 'readiness'
  | 'background'

/** A number with unit and optional tolerance and datum. Numbers are never compressed or summarised. */
export interface ContextQuantity {
  name: string
  value: number
  unit: string
  /** Symmetric or asymmetric tolerance in the same unit. */
  tolerance?: { minus: number; plus: number }
  /** Datum or reference frame the value is measured from (a stable ID or a short label). */
  datum?: string
}

/** Bounded projection of an artifact: quantities and a summary of at most 2,000 characters. Never document bytes. */
export interface ContextProjection {
  /** Display label (names are for display only; identity is the ref). */
  label?: string
  /** At most 2,000 characters (enforced by the assembler). */
  summary?: string
  quantities?: ContextQuantity[]
  /** Fact status or basis as the owning module reports it (`verified`, `documented`, `estimated`, `assumed`, `unknown`, ...). */
  status?: string
}

/**
 * One item of a context snapshot: the Design Reasoning `ContextManifestItem` shape promoted to the SDK (Amendment 2), with
 * optional context-engineering fields. Generic in the reference so Design Reasoning core can alias it with its narrower
 * `AnyRef`: `type ContextManifestItem = ContextSnapshotItem<AnyRef>`.
 */
export interface ContextSnapshotItem<R extends ContextRef = ContextRef> {
  ref: R
  /** Revision read; `null` when the source has no revision. */
  revision: number | null
  via: ContextItemVia
  /** Set when the source was a labelled adapter or fixture rather than the real module. */
  adapter?: 'test-adapter' | 'test-fixture'
  /** Fields of the artifact the item carries. */
  fields: string[]
  // ---- SDK 1.15 additions (all optional) ----
  section?: ContextSection
  /** Mandatory items (safety-relevant constraints, critical interfaces, material unknowns) are never dropped or summarised. */
  mandatory?: boolean
  /** Selector rank within its module (higher first); packing is mandatory-first, then by rank. */
  rank?: number
  projection?: ContextProjection
  /** Estimated token cost of the item's projection. */
  estimatedTokens?: number
  /** Set when a newer revision of the artifact exists than the one recorded; stale items are flagged, never rewritten. */
  stale?: boolean
  /** Module whose selector produced the item. */
  selectedBy?: string
}

/**
 * What was left out. For `budget` and `not-found`, the count and references are kept so a follow-up `context.retrieve` can
 * fetch them. A `not-authorized` omission has neither a count nor references, so the type itself cannot reveal how many hidden
 * items exist (brief §13). The assembler emits it only for a requested target the person cannot read (ADR-0085).
 */
export type ContextOmission =
  | { reason: 'budget' | 'not-found'; count: number; refs?: ContextRef[] }
  | { reason: 'not-authorized'; count?: never; refs?: never }

// ---------------------------------------------------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Context budget. The assembler uses the smaller of setting `ai.context.maxTokens` (default 12,000) and a quarter of the
 * model's context limit; at most 400 items and 256 KB per snapshot (ADR-0085).
 */
export interface ContextBudget {
  maxTokens: number
  maxItems: number
  maxBytes: number
}

/** What a package actually used against its budget. */
export interface ContextBudgetUsage {
  estimatedTokens: number
  items: number
  bytes: number
}

// ---------------------------------------------------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------------------------------------------------

export type ContextReadinessState = 'exploratory' | 'established' | 'verified'

/** The task the package was assembled for. The browser sends only the operation and target references. */
export interface ContextTask {
  /** Platform operation name (`conceptualize.generate_concepts`, ...). */
  operation: string
  targets: ArtifactRef[]
  /** Objective interpreted from the active intent, if any. */
  objective?: string
  requestedOutputType?: string
}

/** Assembly mode (setting `ai.context.mode`, default `off` until CE-1 passes D1). */
export type ContextMode = 'off' | 'digest' | 'full'

/** An immutable, provider-independent execution snapshot (`assistant.context_snapshots`). */
export interface ContextPackage {
  /** Stable ID (`CTX-...`). */
  contextId: string
  schemaVersion: 1
  projectId: string
  configurationId?: string
  mode: Exclude<ContextMode, 'off'>
  task: ContextTask
  items: ContextSnapshotItem[]
  omitted: ContextOmission[]
  readiness?: { state: ContextReadinessState; blockingIssues: string[] }
  budget: ContextBudget
  used: ContextBudgetUsage
  /** True when the mandatory items alone exceed the budget (they are kept regardless). */
  overBudget: boolean
  /** Selectors that contributed, with their versions (provenance). */
  selectors: { module: string; version: string }[]
  /** Person the package was assembled for (module permissions and project scope applied as that person). */
  assembledFor: string
  assembledAt: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Path to the model
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A neutral context block for `RespondInput.context`; adapters translate it per provider. Blocks are DATA, never instructions;
 * `external-data` is untrusted. Same shape as the gateway's `ContextBlock` (services/assistant/src/providers/types.ts).
 */
export interface ContextBlock {
  id: string
  text: string
  trust: 'platform-data' | 'external-data'
  /** Stable across turns, so a provider with prompt caching may cache it. */
  cacheable: boolean
}

export interface ContextBundle {
  blocks: ContextBlock[]
  /** Snapshot the blocks were rendered from. */
  contextId?: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Module selectors
// ---------------------------------------------------------------------------------------------------------------------

/** Body of a module's `selectContext` read operation. Called in-process by the assistant as the signed-in person. */
export interface SelectContextRequest {
  projectId: string
  configurationId?: string
  /** Platform operation the context is for; selection is per operation. */
  operation: string
  targets: ArtifactRef[]
  /** This module's share of the package budget. */
  budget: ContextBudget
  /** Sections wanted; all the module supports when omitted. */
  sections?: ContextSection[]
}

export interface SelectContextResponse {
  module: string
  selectorVersion: string
  items: ContextSnapshotItem[]
  omitted: ContextOmission[]
  /** The module's view of readiness, when it owns one (Conceptualize: the active intent). */
  readiness?: { state: ContextReadinessState; blockingIssues: string[] }
}

/** A server module's context selector (`ServerModuleDescriptor.selectContext`, SDK 1.15). */
export interface ServerModuleContextSelector {
  /** Path under the module's `basePath` served with POST, taking `SelectContextRequest` and returning `SelectContextResponse`. */
  path: string
  /** Platform operations the selector serves (exact names or `<toolId>.` prefixes). */
  operations: string[]
  version: string
}

// ---------------------------------------------------------------------------------------------------------------------
// Evaluation (ADR-0086)
// ---------------------------------------------------------------------------------------------------------------------

/** What a refinement controller may do about a finding (brief §7). */
export type EvaluationAction =
  | 'regenerate'
  | 'retrieve-context'
  | 'investigate-interface'
  | 'clarify'
  | 'correct-artifact'
  | 'record-limitation'

/**
 * One evaluation finding (`assistant.evaluation_findings`). `deterministic` findings come from module checks; `advisory`
 * findings come from a model and are never called validation. Module evidence arises only through applied proposals.
 */
export interface EvaluationFinding {
  id: string
  contextId: string
  proposalId?: string
  /** Task run (ledger `workflow_id`). */
  workflowId?: string
  /** Stable check ID (`refs.resolve`, `units.consistent`, `numeric.sourced`, `advisory.objective`, ...). */
  check: string
  kind: 'deterministic' | 'advisory'
  /** Module and operation for deterministic checks; model ID for advisory ones. */
  source: { module?: string; operation?: string; model?: string }
  outcome: 'pass' | 'fail' | 'warning' | 'not-run'
  severity: 'info' | 'minor' | 'major' | 'blocking'
  message: string
  refs: ContextRef[]
  suggestedAction?: EvaluationAction
  /** Refinement iteration the finding belongs to (0 for the first generation). */
  iteration?: number
  createdAt: string
}
