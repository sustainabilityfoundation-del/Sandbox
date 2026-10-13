/**
 * The shared digital-twin model. Everything is connected by stable IDs; display
 * names are only ever used for presentation.
 */

export type ObjectId = string

export type ObjectType = 'assembly' | 'part' | 'requirement' | 'procedure'

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
  | 'verifies' // procedure → requirement
  | 'tests' // procedure → component
  | 'evidence-for' // output → procedure

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

/** A saved, immutable snapshot of a tool's result. */
export interface OutputRecord {
  id: string
  toolId: string
  kind: string
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
}

export type OutputDraft = Omit<OutputRecord, 'id' | 'createdAt' | 'reviewStatus'>

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
    }
  | { kind: 'add-relationship'; relationship: Omit<Relationship, 'id' | 'revision'> }
  | { kind: 'remove-relationship'; relationshipId: string }

export interface ChangeMeta {
  toolId: string
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

export type ActivityKind = 'change' | 'save' | 'run' | 'review' | 'info' | 'error'

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
