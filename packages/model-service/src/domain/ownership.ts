import type { ModelIndex } from './modelIndex'
import type { ModelChange, ObjectType, RelationshipType } from './types'

/**
 * Artifact ownership and relationship semantics.
 *
 * Each artifact type is owned by one module; only that module changes it
 * through its commands. Other modules integrate through relationships and the
 * documented delegations below (explicit parameter ownership and permitted
 * update direction). The repository enforces these rules for every writer:
 * tools, the platform and the assistant (which acts only on behalf of the
 * modules whose rules allowed a change).
 */

export type ModuleId = string

/** 'product' = product structure and load cases, owned by the platform's product registry. */
export const ARTIFACT_OWNER: Record<ObjectType | 'scenario', ModuleId> = {
  assembly: 'product',
  part: 'product',
  scenario: 'product',
  requirement: 'requirements',
  'sysml-element': 'sysml',
  'cad-representation': 'cad',
  procedure: 'verification',
}

/** Modules that may write what 'product' owns. */
const PRODUCT_WRITERS: ModuleId[] = ['platform']

/** Modules from earlier versions; what they own is kept but read-only. */
export const RETIRED_MODULES: ModuleId[] = ['analysis', 'verification', 'geometry', 'model-viewer']

export interface Delegation {
  module: ModuleId
  targets: ObjectType[]
  properties: string[]
  /** Documented update direction (shown in docs and errors). */
  direction: string
}

/**
 * Explicit delegations. CAD may update the geometry parameters of the
 * component a CAD representation represents (one direction only: CAD →
 * component). Nothing synchronises in the other direction.
 */
export const DELEGATIONS: Delegation[] = [
  {
    module: 'cad',
    targets: ['part', 'assembly'],
    properties: ['diameter', 'outerDiameter', 'length', 'effectiveLength'],
    direction: 'CAD representation dimension → component geometry property',
  },
]

/** Relationship semantics: allowed endpoint types and meaning. Owned by the module owning the `from` end. */
export const RELATIONSHIP_RULES: Record<RelationshipType, { from: (ObjectType | 'artifact')[]; to: (ObjectType | 'artifact')[]; meaning: string }> = {
  'allocated-to': { from: ['requirement'], to: ['assembly', 'part'], meaning: 'the requirement is allocated to (to be met by) the component' },
  represents: { from: ['sysml-element', 'cad-representation'], to: ['assembly', 'part'], meaning: 'the model element is a representation of the physical component' },
  references: { from: ['sysml-element'], to: ['requirement'], meaning: 'the SysML requirement usage stands for the shared requirement' },
  connects: { from: ['sysml-element'], to: ['sysml-element'], meaning: 'the parts are connected' },
  satisfies: { from: ['sysml-element'], to: ['sysml-element'], meaning: 'the part satisfies the requirement usage' },
  verifies: { from: ['procedure'], to: ['requirement'], meaning: 'retired Verification data' },
  tests: { from: ['procedure'], to: ['assembly', 'part'], meaning: 'retired Verification data' },
  'evidence-for': { from: ['artifact'], to: ['procedure'], meaning: 'retired Verification data' },
}

/** The modules a writer acts as. The assistant acts only for the modules named in the change. */
export function actingModules(meta: { toolId: string; onBehalfOf?: string[] }): ModuleId[] {
  return meta.toolId === 'assistant' ? (meta.onBehalfOf ?? []) : [meta.toolId]
}

export type WriteCheck = { ok: true } | { ok: false; message: string }

const ownerLabel = (owner: ModuleId) => (RETIRED_MODULES.includes(owner) ? `the retired ${owner} module (read-only)` : `the ${owner} module`)

/** Whether modules may change a property set of an object or scenario of the given type. */
export function canWriteProperties(modules: ModuleId[], type: ObjectType | 'scenario', id: string, properties: string[], renames: boolean): WriteCheck {
  const owner = ARTIFACT_OWNER[type]
  if (modules.includes(owner) && !RETIRED_MODULES.includes(owner)) return { ok: true }
  if (owner === 'product' && modules.some((m) => PRODUCT_WRITERS.includes(m))) return { ok: true }
  const delegated =
    !renames &&
    type !== 'scenario' &&
    properties.length > 0 &&
    properties.every((p) => DELEGATIONS.some((d) => modules.includes(d.module) && d.targets.includes(type) && d.properties.includes(p)))
  if (delegated) return { ok: true }
  return {
    ok: false,
    message: `${id} is a ${type} owned by ${ownerLabel(owner)}; ${modules.join(', ') || 'this writer'} may not change ${properties.length ? properties.join(', ') : 'it'}.`,
  }
}

export function canCreate(modules: ModuleId[], type: ObjectType): WriteCheck {
  const owner = ARTIFACT_OWNER[type]
  if ((modules.includes(owner) && !RETIRED_MODULES.includes(owner)) || (owner === 'product' && modules.some((m) => PRODUCT_WRITERS.includes(m)))) {
    return { ok: true }
  }
  return { ok: false, message: `Only ${ownerLabel(owner)} creates ${type} objects.` }
}

/** Endpoint types allowed for a relationship type. */
export function validateRelationship(type: RelationshipType, fromType: ObjectType | 'artifact', toType: ObjectType | 'artifact'): WriteCheck {
  const rule = RELATIONSHIP_RULES[type]
  if (!rule) return { ok: false, message: `Unknown relationship type “${type}”.` }
  if (!rule.from.includes(fromType) || !rule.to.includes(toType)) {
    return { ok: false, message: `A “${type}” relationship goes from ${rule.from.join('/')} to ${rule.to.join('/')}, not from ${fromType} to ${toType}.` }
  }
  return { ok: true }
}

/** The module that owns a relationship: the owner of its `from` end. */
export function relationshipOwner(fromType: ObjectType | 'artifact', artifactProducer?: string): ModuleId {
  return fromType === 'artifact' ? (artifactProducer ?? 'platform') : ARTIFACT_OWNER[fromType]
}

/** Summary of which modules a batch of changes needs (used to explain refused changes). */
export function ownersTouched(model: ModelIndex, changes: ModelChange[]): ModuleId[] {
  const owners = new Set<ModuleId>()
  for (const c of changes) {
    if (c.kind === 'add-object') owners.add(ARTIFACT_OWNER[c.object.type])
    if (c.kind === 'update-properties') {
      const o = model.get(c.targetId)
      owners.add(o ? ARTIFACT_OWNER[o.type] : 'product')
    }
  }
  return [...owners]
}
