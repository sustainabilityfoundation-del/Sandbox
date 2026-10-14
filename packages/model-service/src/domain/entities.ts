import type { ModelIndex } from './modelIndex'
import type { EngineeringObject, ObjectType, PropertyValue, Quantity } from './types'
import { isQuantity } from './units'

/**
 * Typed views of the stored entities. Storage stays generic (objects with
 * properties) so saved data from any version can be read; these readers give
 * tools typed fields with defaults for values older data doesn't have.
 */

export type RequirementStatus = 'draft' | 'in-review' | 'approved' | 'obsolete'

export const REQUIREMENT_STATUSES: { id: RequirementStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' },
  { id: 'in-review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'obsolete', label: 'Obsolete' },
]

export interface Requirement {
  id: string
  title: string
  statement: string
  rationale: string
  status: RequirementStatus
  /** False when the stored object has no status yet (data from an earlier version). */
  statusSet: boolean
  verificationMethods: string[]
  revision: number
}

export interface PhysicalComponent {
  id: string
  name: string
  kind: 'assembly' | 'part'
  parentId?: string
  revision: number
}

/** Supported SysML constructs in this prototype. Anything else is not modelled. */
export type SysmlElementKind = 'part' | 'requirement'

export interface SysmlElement {
  id: string
  name: string
  kind: SysmlElementKind
  /** Part definition the usage is nested in (another SysML element). */
  ownerId?: string
  /** Optional type name shown as `name : Type` (illustrative notation). */
  typeName?: string
  revision: number
}

export interface CadRepresentation {
  id: string
  name: string
  /** Which mock shape draws it ('housing', 'rod', 'motor'); unknown shapes are listed but not drawn. */
  shape: string
  /** Demonstration dimensions, e.g. diameter and length (mm). */
  parameters: Record<string, Quantity>
  revision: number
}

const text = (v: PropertyValue | undefined): string => (typeof v === 'string' ? v : '')

export function isComponent(object: EngineeringObject | undefined): boolean {
  return object?.type === 'assembly' || object?.type === 'part'
}

export function isOfType(object: EngineeringObject | undefined, type: ObjectType): object is EngineeringObject {
  return object?.type === type
}

/**
 * The identifier to show people. Objects owned by another service carry a human-readable key
 * (a requirement's "REQ-001") separate from their canonical ID (a UUID); never show the UUID.
 */
export function displayId(o: EngineeringObject): string {
  return typeof o.properties.key === 'string' && o.properties.key ? o.properties.key : o.id
}

export function readRequirement(o: EngineeringObject): Requirement {
  const status = o.properties.status
  const statusSet = typeof status === 'string' && REQUIREMENT_STATUSES.some((s) => s.id === status)
  const methods = o.properties.verificationMethods
  return {
    id: o.id,
    title: o.name,
    statement: text(o.properties.statement),
    rationale: text(o.properties.rationale),
    status: statusSet ? (status as RequirementStatus) : 'draft',
    statusSet,
    verificationMethods: Array.isArray(methods) ? methods : [],
    revision: o.revision,
  }
}

export function readComponent(o: EngineeringObject): PhysicalComponent {
  return { id: o.id, name: o.name, kind: o.type === 'assembly' ? 'assembly' : 'part', parentId: o.parentId, revision: o.revision }
}

export function readSysmlElement(o: EngineeringObject): SysmlElement {
  const kind = o.properties.kind === 'requirement' ? 'requirement' : 'part'
  return {
    id: o.id,
    name: o.name,
    kind,
    ownerId: o.parentId,
    typeName: text(o.properties.typeName) || undefined,
    revision: o.revision,
  }
}

export function readCadRepresentation(o: EngineeringObject): CadRepresentation {
  const parameters: Record<string, Quantity> = {}
  for (const [key, value] of Object.entries(o.properties)) if (isQuantity(value)) parameters[key] = value
  return { id: o.id, name: o.name, shape: text(o.properties.shape), parameters, revision: o.revision }
}

// ---- representations --------------------------------------------------------------------

export type RepresentationKind = 'sysml' | 'cad'

const REPRESENTATION_TYPE: Record<RepresentationKind, ObjectType> = {
  sysml: 'sysml-element',
  cad: 'cad-representation',
}

/** The physical component an object stands for: itself, or what it 'represents'. */
export function componentOf(model: ModelIndex, id: string): EngineeringObject | undefined {
  const object = model.get(id)
  if (!object) return undefined
  if (isComponent(object)) return object
  if (object.type === 'sysml-element' || object.type === 'cad-representation') {
    return model.linkedObjects(id, 'represents', 'out').find(isComponent)
  }
  return undefined
}

/** Representations of a component of one kind (explicit 'represents' relationships only). */
export function representationsOf(model: ModelIndex, componentId: string, kind: RepresentationKind): EngineeringObject[] {
  return model.linkedObjects(componentId, 'represents', 'in').filter((o) => o.type === REPRESENTATION_TYPE[kind])
}

export type Resolution =
  | { status: 'resolved'; ids: string[]; via: string }
  | { status: 'none'; reason: string }

/**
 * Resolves a selected object to the objects a tool of the given kind shows.
 * Only explicit relationships are followed; there is no implicit matching by
 * name or geometry. When nothing is linked the selection is kept and the
 * reason explains why the view is empty.
 */
export function resolveRepresentation(model: ModelIndex, id: string, kind: RepresentationKind): Resolution {
  const object = model.get(id)
  if (!object) return { status: 'none', reason: `${id} does not exist.` }
  const type = REPRESENTATION_TYPE[kind]
  const label = kind === 'sysml' ? 'SysML' : 'CAD'
  if (object.type === type) return { status: 'resolved', ids: [object.id], via: 'selected directly' }

  const component = componentOf(model, id)
  if (component) {
    const reps = representationsOf(model, component.id, kind)
    if (reps.length) {
      return { status: 'resolved', ids: reps.map((r) => r.id), via: component.id === id ? `represents ${id}` : `${id} → ${component.id}` }
    }
    return { status: 'none', reason: `${component.id} ${component.name} has no ${label} representation yet.` }
  }

  if (object.type === 'requirement') {
    if (kind === 'sysml') {
      const refs = model.linkedObjects(id, 'references', 'in').filter((o) => o.type === type)
      if (refs.length) return { status: 'resolved', ids: refs.map((r) => r.id), via: `references ${id}` }
      return { status: 'none', reason: `${id} is not referenced in the SysML model.` }
    }
    const reps = model
      .linkedObjects(id, 'allocated-to', 'out')
      .flatMap((c) => representationsOf(model, c.id, kind))
    if (reps.length) return { status: 'resolved', ids: reps.map((r) => r.id), via: `${id} is allocated to these components` }
    return { status: 'none', reason: `${id} is not allocated to a component with a ${label} representation.` }
  }

  return { status: 'none', reason: `${id} is a ${object.type}, which has no ${label} representation.` }
}

/** Requirements allocated to a component, directly or to one of its parent assemblies. */
export function requirementsFor(model: ModelIndex, componentId: string): { requirement: EngineeringObject; via: string }[] {
  const seen = new Set<string>()
  const result: { requirement: EngineeringObject; via: string }[] = []
  for (let id: string | undefined = componentId; id; id = model.get(id)?.parentId) {
    for (const r of model.linkedObjects(id, 'allocated-to', 'in')) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      result.push({ requirement: r, via: id === componentId ? 'direct' : id })
    }
  }
  return result
}
