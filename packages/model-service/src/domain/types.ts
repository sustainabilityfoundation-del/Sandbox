/**
 * The shared digital-twin model. Everything is connected by stable IDs; display
 * names are only ever used for presentation.
 */

export type ObjectId = string

/**
 * Distinct entity kinds in the shared twin. Physical components are the identity
 * that SysML elements and CAD representations point at (relationship 'represents');
 * a representation never becomes a second, unrelated component.
 *
 * 'procedure' objects came from the retired Verification tool. They are kept as
 * saved data and shown read-only.
 */
export type ObjectType =
  | 'assembly' // physical component
  | 'part' // physical component
  | 'requirement'
  | 'sysml-element'
  | 'cad-representation'
  | 'procedure'

export const PHYSICAL_COMPONENT_TYPES: readonly ObjectType[] = ['assembly', 'part']

export interface Quantity {
  value: number
  unit: string
}

export type PropertyValue = string | number | boolean | Quantity | string[]

export interface EngineeringObject {
  id: ObjectId
  type: ObjectType
  name: string
  parentId?: ObjectId
  properties: Record<string, PropertyValue>
  /** Model revision at which this object last changed. */
  revision: number
}

/** A load case. Scenarios are versioned like objects so results can depend on them. */
export interface Scenario {
  id: string
  name: string
  description: string
  properties: Record<string, PropertyValue>
  revision: number
}

export type RelationshipType =
  | 'allocated-to' // requirement → component
  | 'represents' // sysml-element or cad-representation → component
  | 'references' // sysml-element (requirement usage) → requirement
  | 'connects' // sysml-element (part) → sysml-element (part)
  | 'satisfies' // sysml-element (part) → sysml-element (requirement usage)
  | 'verifies' // procedure → requirement (retired Verification data)
  | 'tests' // procedure → component (retired Verification data)
  | 'evidence-for' // output → procedure (retired Verification data)

export interface Relationship {
  id: string
  type: RelationshipType
  from: string
  to: string
  revision: number
}

export interface Configuration {
  id: string
  name: string
  description: string
}

export interface Project {
  id: string
  name: string
}

export interface ModelSnapshot {
  project: Project
  configurations: Configuration[]
  scenarios: Scenario[]
  objects: EngineeringObject[]
  relationships: Relationship[]
  /** Increments with every accepted model change. */
  modelRevision: number
}

export type ReviewStatus = 'draft' | 'in-review' | 'approved' | 'rejected'

/** The revision of one model input as it was when an output was produced. */
export interface InputRef {
  id: string
  revision: number
}

export interface ResultEntry {
  key: string
  label: string
  value: number | string | boolean
  unit?: string
}

/**
 * A saved artifact: an immutable snapshot of a tool's result, with provenance.
 * (Named OutputRecord for compatibility with data saved by earlier versions.)
 */
export interface OutputRecord {
  id: string
  /** Producing tool. May name a retired tool; the record is kept and shown read-only. */
  toolId: string
  kind: string
  /**
   * Version of the artifact's result schema for its kind. Records saved before
   * versioning was introduced are read as version 1.
   */
  schemaVersion: number
  title: string
  projectId: string
  configurationId: string
  scenarioId: string | null
  objectIds: ObjectId[]
  /** Model revision the inputs were read at. */
  inputRevision: number
  /** The specific inputs the result depends on, used to detect staleness. */
  inputs: InputRef[]
  createdAt: string
  completion: 'complete' | 'failed'
  result: ResultEntry[]
  summary: string
  reviewStatus: ReviewStatus
  /**
   * Revision-qualified references, e.g. the requirement revision a verification
   * record verifies, the baseline of the configured article, or evidence.
   */
  references?: ArtifactReference[]
}

/**
 * A reference to an artifact (object, saved artifact or baseline). With a
 * revision it is exact and never follows later edits; without one it is a
 * deliberate latest-working reference.
 */
export interface ArtifactReference {
  id: string
  revision?: number
  /** Meaning of the reference, e.g. 'verifies', 'evidence', 'baseline'. */
  role: string
}

export type OutputDraft = Omit<OutputRecord, 'id' | 'createdAt' | 'reviewStatus' | 'schemaVersion'> & { schemaVersion?: number }

export type ModelChange =
  | {
      kind: 'update-properties'
      targetId: string
      /** The revision the edit was based on; stale edits are rejected. */
      baseRevision: number
      name?: string
      properties: Record<string, PropertyValue>
    }
  | {
      kind: 'add-object'
      idPrefix: string
      object: Omit<EngineeringObject, 'id' | 'revision'>
      /**
       * Placeholder (e.g. "$new1") that later relationships in the same batch may
       * use as from/to; the repository replaces it with the assigned ID.
       */
      ref?: string
    }
  | { kind: 'add-relationship'; relationship: Omit<Relationship, 'id' | 'revision'> }
  | { kind: 'remove-relationship'; relationshipId: string }

export interface ChangeMeta {
  /** The module (tool ID) making the change, or 'assistant' / 'platform'. */
  toolId: string
  /**
   * For changes made by the assistant: the modules whose rules allowed them.
   * Write ownership is checked against these, never widened by the assistant.
   */
  onBehalfOf?: string[]
  configurationId: string
  summary: string
  /** Where the change came from, e.g. a conversation message; shown in Activity. */
  source?: ActivitySource
}

/** Links an activity entry back to its origin, such as an assistant conversation. */
export interface ActivitySource {
  kind: 'conversation'
  conversationId: string
  messageId: string
  label: string
}

export interface ChangeResult {
  snapshot: ModelSnapshot
  modelRevision: number
  changedIds: string[]
  createdIds: string[]
}

export type ActivityKind = 'change' | 'save' | 'run' | 'review' | 'baseline' | 'info' | 'error'

export interface ActivityEntry {
  id: string
  at: string
  kind: ActivityKind
  toolId?: string
  message: string
  objectIds: string[]
  configurationId?: string
  scenarioId?: string | null
  source?: ActivitySource
}

export type ActivityDraft = Omit<ActivityEntry, 'id' | 'at'>

/**
 * One immutable revision of an object or scenario: its full state at that
 * revision, who changed it and why. Revision identity is (id, revision).
 */
export interface ObjectRevision {
  id: string
  kind: 'object' | 'scenario'
  revision: number
  snapshot: EngineeringObject | Scenario
  changedAt: string
  /** Module that made the change ('import' for state recorded when history began). */
  changedBy: string
  summary: string
}

/**
 * A baseline: the exact engineering definition of a configuration at one
 * moment. It pins every object and scenario revision and copies the
 * relationships, so it can be compared with the working model and the pinned
 * revisions can always be retrieved.
 */
export interface Baseline {
  id: string
  name: string
  description: string
  projectId: string
  configurationId: string
  modelRevision: number
  createdAt: string
  createdBy: string
  objects: { id: string; revision: number }[]
  scenarios: { id: string; revision: number }[]
  relationships: Relationship[]
}

export interface BaselineDraft {
  name: string
  description?: string
  configurationId: string
  /**
   * Objects owned by another service (registered with the repository) to pin at their current
   * revision, the twin objects they replace (legacy IDs), and the relationships as the host composes
   * them. Lets one baseline pin the whole definition while requirements live in their own service.
   */
  external?: { objects: { id: string; revision: number }[]; replaces: string[]; relationships: Relationship[] }
}
