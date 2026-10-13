import type { ModelIndex, ObjectType, OutputRecord, RelationshipType } from '@ews/model-service'

/**
 * Assistant contributions. A tool describes the operations ChatGPT may request
 * for it; the platform owns execution. Before anything runs the platform
 * checks the tool's entitlement, validates the arguments it is given, and
 * validates every proposed change against the field, relationship and object
 * rules of entitled tools. Changes are only applied after the user reviews a
 * preview, with the repository's revision checks.
 */

/** JSON-schema style description, suitable for a model provider's tool-calling API. */
export interface ActionParameters {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

/** Context captured when the user sent the message; later UI changes cannot redirect the action. */
export interface CapturedActionContext {
  projectId: string
  configurationId: string
  scenarioId: string
  modelRevision: number
  /** Attached selection (empty unless the user attached it). */
  selectionIds: string[]
}

export interface AssistantActionContext {
  /** The current model (validation against captured revisions happens when the preview is applied). */
  model: ModelIndex
  /** Artifacts in the captured configuration. */
  artifacts: OutputRecord[]
  captured: CapturedActionContext
}

/** A change an action proposes. The platform validates it and builds the preview. */
export type ChangeInput =
  | { kind: 'set-property'; targetId: string; property: string; value: unknown; unit?: string }
  | { kind: 'add-relationship' | 'remove-relationship'; type: string; from: string; to: string }
  | {
      kind: 'create-object'
      /** Placeholder other changes in the same proposal may use as from/to, e.g. "$new1". */
      ref: string
      type: ObjectType
      name: string
      parentId?: string
      properties: Record<string, unknown>
    }

export interface InspectedItem {
  id: string
  detail: string
}

export type AssistantActionResult =
  | { kind: 'data'; data: unknown; summary: string; inspected?: InspectedItem[] }
  | { kind: 'proposal'; title: string; explanation: string; changes: ChangeInput[]; inspected?: InspectedItem[] }

export interface AssistantActionDefinition {
  /** Globally unique, prefixed with the tool ID: 'requirements.read_for_component'. */
  name: string
  /** Short label for execution status, e.g. "Read requirements". */
  label: string
  description: string
  parameters: ActionParameters
  /** Reads the model or prepares a proposal. Must not write: the platform applies proposals. */
  run: (args: Record<string, unknown>, ctx: AssistantActionContext) => AssistantActionResult | Promise<AssistantActionResult>
}

/** Thrown by an action for a well-understood failure; the code is returned to the assistant. */
export class ActionError extends Error {
  readonly code: string
  constructor(code: 'invalid-arguments' | 'not-found' | 'not-allowed' | 'no-op' | (string & {}), message: string) {
    super(message)
    this.name = 'ActionError'
    this.code = code
  }
}

interface BaseFieldRule {
  target: ObjectType | 'scenario'
  property: string
  label: string
}

/** A property the assistant may propose to change, with its validation. */
export type FieldRule =
  | (BaseFieldRule & { type: 'quantity'; unit: string; min: number; max: number })
  | (BaseFieldRule & { type: 'text'; maxLength: number })
  | (BaseFieldRule & { type: 'enum'; options: string[] })
  | (BaseFieldRule & { type: 'enum-list'; options: string[] })

/** A relationship type the assistant may add or remove between these object types. */
export interface RelationshipRule {
  type: RelationshipType
  from: ObjectType[]
  to: ObjectType[]
}

/** An object type the assistant may create, and the properties it may set on creation. */
export interface CreatableObjectRule {
  type: ObjectType
  idPrefix: string
  /** Allowed values per property; any other property is rejected. */
  properties: Record<string, { options?: string[]; maxLength?: number }>
  /** Allowed parent types, if the object may be nested. */
  parentTypes?: ObjectType[]
}

export interface AssistantContribution {
  actions: AssistantActionDefinition[]
  editableFields?: FieldRule[]
  editableRelationships?: RelationshipRule[]
  creatableObjects?: CreatableObjectRule[]
}

// ---- small argument helpers for action implementations ---------------------------------

export function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new ActionError('invalid-arguments', `“${key}” must be a non-empty string.`)
  return value.trim()
}

export function argOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  return args[key] === undefined || args[key] === null ? undefined : argString(args, key)
}
