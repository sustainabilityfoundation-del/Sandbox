import type { RelationshipType } from '@ews/requirements-client'

/**
 * Allocation targets (D1, requirements.allocate). The Requirements service validates them: twin
 * components and product elements through the host's TwinDirectory, SysML Modeler elements through the
 * host's SysML directory. The UI and the assistant build the same request with these helpers, so both
 * paths are refused by the same server rules (validation parity, C9).
 */
export type AllocationTargetKind = 'component' | 'product-element' | 'sysml-model-element'

export interface AllocationTarget {
  kind: AllocationTargetKind
  /** Twin component ID (ROD-120), product element UUID or alias, or `<sysmlProjectId>/<elementId>`. */
  id: string
}

export const ALLOCATION_TARGET_KINDS: { id: AllocationTargetKind; label: string }[] = [
  { id: 'component', label: 'Component (shared twin)' },
  { id: 'product-element', label: 'Product element' },
  { id: 'sysml-model-element', label: 'SysML element' },
]

export interface AllocationRequest {
  type: RelationshipType
  fromId: string
  toTwinId?: string
  toSysmlElement?: string
  /** The requirement revision the person (or the preview) saw; the server refuses with a conflict otherwise. */
  expectedFromRevision: number
  rationale?: string
  reason?: string
}

export function allocationRequest(requirement: { id: string; revision: number }, target: AllocationTarget, extra: { rationale?: string; reason?: string } = {}): AllocationRequest {
  const id = target.id.trim()
  return {
    type: 'allocated-to',
    fromId: requirement.id,
    ...(target.kind === 'sysml-model-element' ? { toSysmlElement: id } : { toTwinId: id }),
    expectedFromRevision: requirement.revision,
    ...(extra.rationale ? { rationale: extra.rationale } : {}),
    ...(extra.reason ? { reason: extra.reason } : {}),
  }
}

/** Display text for an allocation's target. */
export function allocationTargetLabel(rel: { toTwinId: string | null; targetKind?: string; toTargetRevision?: number | null }): string {
  if (!rel.toTwinId) return ''
  if (rel.targetKind === 'sysml-model-element') return `SysML ${rel.toTwinId}${rel.toTargetRevision != null ? ` (commit #${rel.toTargetRevision})` : ''}`
  return rel.toTwinId
}
