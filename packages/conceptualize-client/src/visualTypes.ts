/**
 * Visual concept exploration types (concept-visualization-contracts.md): the engineering definition of a
 * Concept revision, visuals with revisions, annotations, generation records, staleness and the CAD handoff.
 * Mirrors services/conceptualize (schemas.ts "engineering definition", visualSchemas.ts).
 */
import type { ArchitectureBlock, ArchitectureInput } from './architectureTypes'


export type Stage = 'exploration' | 'layout' | 'engineering'
export type ParameterBasis = 'user-assertion' | 'ai-hypothesis' | 'assumption' | 'estimate'
export type ComponentKind = 'part' | 'assembly' | 'purchased' | 'envelope' | 'feature'
export type ComponentRelation = 'contains' | 'attached-to' | 'supports' | 'guides' | 'drives' | 'connected-to' | 'clears'
export type InterfaceKind = 'mechanical' | 'electrical' | 'fluid' | 'thermal' | 'data' | 'other'
export type LayoutView = 'top' | 'front' | 'side' | 'section'
/** Layout units, or the nominal value of a length parameter (then the extent is to scale). */
export type Coord = number | { parameter: string }

export interface DefinedComponent {
  id: string
  name: string
  kind: ComponentKind
  description: string
  basis: ParameterBasis
}
export interface ComponentRelationship {
  id: string
  type: ComponentRelation
  from: string
  to: string
  note: string
}
export interface ComponentInterface {
  id: string
  name: string
  kind: InterfaceKind
  between: string[]
  description: string
  parameterIds: string[]
}
export interface DefinedParameter {
  id: string
  symbol: string
  name: string
  value: number | null
  min: number | null
  max: number | null
  unit: string
  basis: ParameterBasis
  componentId: string | null
  constraintId: string | null
  note: string
}
export interface LayoutItem {
  componentId: string
  x: Coord
  y: Coord
  width: Coord
  height: Coord
  shape: 'rect' | 'circle'
}
export interface LayoutDimension {
  id: string
  parameterId: string
  componentId: string
  axis: 'x' | 'y'
}
export interface LayoutSpec {
  view: LayoutView
  unit: string
  items: LayoutItem[]
  dimensions: LayoutDimension[]
}
export interface EngineeringDefinition {
  intent: string
  components: DefinedComponent[]
  relationships: ComponentRelationship[]
  interfaces: ComponentInterface[]
  parameters: DefinedParameter[]
  layout: LayoutSpec | null
  /** ECII increment 2: architecture or variant block; null when none is recorded. */
  architecture?: ArchitectureBlock | null
  idSeq: number
}

type Opt<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>
/** Replaces the definition. Items sent with their id keep their identity; items without get a new, never reused ID. */
export interface DefinitionInput {
  intent?: string
  components?: Opt<DefinedComponent, 'id' | 'kind' | 'description' | 'basis'>[]
  relationships?: Opt<ComponentRelationship, 'id' | 'note'>[]
  interfaces?: Opt<ComponentInterface, 'id' | 'kind' | 'description' | 'parameterIds'>[]
  parameters?: Opt<DefinedParameter, 'id' | 'name' | 'value' | 'min' | 'max' | 'basis' | 'componentId' | 'constraintId' | 'note'>[]
  layout?: { view?: LayoutView; unit?: string; items: Opt<LayoutItem, 'shape'>[]; dimensions?: Opt<LayoutDimension, 'id'>[] } | null
  /** Omitted keeps the stored block; null removes it. */
  architecture?: ArchitectureInput | null
}

export const EMPTY_DEFINITION: EngineeringDefinition = { intent: '', components: [], relationships: [], interfaces: [], parameters: [], layout: null, architecture: null, idSeq: 0 }

/** A stored definition as input (drops idSeq; IDs are kept). */
export const definitionInput = (d: EngineeringDefinition): DefinitionInput => ({ intent: d.intent, components: d.components, relationships: d.relationships, interfaces: d.interfaces, parameters: d.parameters, layout: d.layout })

export type VisualKind = 'illustration' | 'layout' | 'mechanism' | 'architecture' | 'envelope-3d' | 'motion'
export type GenerationState = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'refused'

export interface DefinitionChange {
  area: 'intent' | 'component' | 'relationship' | 'interface' | 'parameter' | 'layout' | 'architecture'
  id: string
  change: 'added' | 'removed' | 'changed'
  label: string
}
export interface Staleness {
  outdated: boolean
  currentConceptRevision: number
  changes: DefinitionChange[]
}
export interface VisualAnnotation {
  id: string
  visualId: string
  revision: number
  number: number
  shape: 'pin' | 'rect'
  x: number
  y: number
  width: number | null
  height: number | null
  instruction: string
  componentId: string | null
  componentBasis: 'structured' | 'inferred' | 'user' | null
  createdAt: string
  createdBy: string
  provenance: { sourceKind: string; conversationId: string | null; proposalId: string | null; messageId: string | null }
}
export interface AnnotationCreate {
  shape: 'pin' | 'rect'
  x: number
  y: number
  width?: number
  height?: number
  instruction: string
  componentId?: string
  componentBasis?: 'structured' | 'inferred' | 'user'
}
export interface VisualGeneration {
  jobId: string | null
  state: GenerationState
  adapter: string
  provider: string
  model: string
  attempt: number
  assetId: string | null
  assetSha256: string | null
  mediaType: string | null
  testAsset: boolean
  error: { code: string; message: string; retryable?: boolean } | null
  requestedAt: string
  requestedBy: string
  updatedAt: string
}
export type GenerationRecord = Partial<Omit<VisualGeneration, 'state' | 'requestedAt' | 'requestedBy' | 'updatedAt'>> & { state: GenerationState }
export interface Visual {
  id: string
  key: string
  projectId: string
  conceptId: string
  kind: VisualKind
  status: 'active' | 'archived'
  revision: number
  currentRevision: number
  conceptRevision: number
  title: string
  view: string
  notToScale: boolean
  instruction: string
  referenceAssets: { assetId: string; sha256?: string }[]
  refinedFrom: string[]
  changeReason: string
  generation: VisualGeneration | null
  annotations: VisualAnnotation[]
  staleness: Staleness
  provenance: { sourceKind: string; conversationId: string | null; proposalId: string | null; messageId: string | null }
  revisionCreatedAt: string
  revisionCreatedBy: string
  createdAt: string
  createdBy: string
}
export interface VisualCreate {
  conceptId: string
  kind: VisualKind
  title?: string
  view?: string
  instruction?: string
  conceptRevision?: number
  referenceAssets?: { assetId: string; sha256?: string }[]
  reason?: string
}
export interface VisualRevise {
  conceptRevision?: number
  title?: string
  view?: string
  instruction?: string
  referenceAssets?: { assetId: string; sha256?: string }[]
  refinedFrom?: string[]
  reason?: string
}
export interface ConceptDependent {
  type: 'visual' | 'handoff' | 'implementation-artifact'
  id: string
  key: string
  label: string
  revision: number | null
  conceptRevision: number
  staleness: Staleness
}
export interface ConceptDependents {
  conceptId: string
  currentRevision: number
  dependents: ConceptDependent[]
}

export type Coverage = 'intended' | 'preliminary-check' | 'verified'
export interface CardConstraint {
  id: string
  key: string
  revision: number
  statement: string
  bound: { operator: string; quantity: { value?: number | null; min?: number | null; max?: number | null; unit: string } } | null
  strength: string
  status: string
  requirement: { module: string; id: string; revision?: number; label?: string } | null
  coverage: Coverage
  checkStatus: string | null
  checkedBy: string | null
}
export interface ConceptCard {
  concept: { id: string; key: string; name: string; summary: string; revision: number; stage: Stage; maturity: string; verificationStatus: string }
  intent: string
  principle: string[]
  components: DefinedComponent[]
  interfaces: (ComponentInterface & { betweenNames: string[] })[]
  parameters: DefinedParameter[]
  benefits: string[]
  tradeOffs: string[]
  constraints: CardConstraint[]
  requirements: { relation: string; artifact: { module: string; id: string; revision?: number; label?: string }; coverage: 'intended' }[]
  assumptions: { id: string; key: string; statement: string; validationStatus: string }[]
  questions: { kind: string; text: string; state: string | null }[]
  validation: { verificationStatus: string; openQuestions: number; unconfirmedHypotheses: number; constraintsVerified: number; constraintsChecked: number; constraintsTotal: number }
  visuals: Visual[]
  primaryVisualId: string | null
  decisions: { id: string; key: string; title: string; status: string; outcome: string; rationale: string }[]
  membership: { setId: string; setKey: string; setName: string; status: string }[]
}
export interface SetCards {
  setId: string
  key: string
  name: string
  question: string
  parentId: string
  cards: ConceptCard[]
}
export interface HandoffItem {
  kind: 'open-question' | 'uncertainty' | 'missing-definition' | 'parameter-range' | 'unplaced-component' | 'interface-without-parameters' | 'unchecked-constraint' | 'not-selected' | 'unvalidated-assumption'
  text: string
  ref: string | null
}
export interface HandoffExtent {
  value: number | null
  unit: string
  parameterId: string | null
  symbol?: string
  basis: string
}
/** conceptualize.cad-handoff/1 */
export interface HandoffPackage {
  schema: 'conceptualize.cad-handoff/1'
  concept: { id: string; key: string; name: string; revision: number; stage: Stage; maturity: string }
  intent: string
  components: DefinedComponent[]
  relationships: ComponentRelationship[]
  interfaces: ComponentInterface[]
  parameters: DefinedParameter[]
  envelopes: { componentId: string; view: LayoutView; shape: 'rect' | 'circle'; width: HandoffExtent; height: HandoffExtent; position: { x: HandoffExtent; y: HandoffExtent } }[]
  constraints: CardConstraint[]
  requirements: { relation: string; artifact: unknown; coverage: Coverage; constraintId?: string }[]
  decisions: ConceptCard['decisions']
  assumptions: ConceptCard['assumptions']
  visuals: { id: string; key: string; kind: VisualKind; revision: number; notToScale: boolean; illustrative: boolean; testAsset: boolean; assetId: string | null }[]
  note: string
  unresolved: HandoffItem[]
}
export interface CadHandoff {
  id: string
  key: string
  projectId: string
  conceptId: string
  conceptRevision: number
  target: 'cad'
  package: HandoffPackage
  staleness: Staleness
  createdAt: string
  createdBy: string
  provenance: { sourceKind: string; conversationId: string | null; proposalId: string | null; messageId: string | null }
}
