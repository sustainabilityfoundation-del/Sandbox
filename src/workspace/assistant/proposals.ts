import type { ModelIndex } from '../domain/modelIndex'
import type { ModelChange, OutputRecord, PropertyValue } from '../domain/types'
import { formatValue, isQuantity } from '../domain/units'
import { EDITABLE_RELATIONSHIPS, MAX_CHANGES_PER_PROPOSAL, findFieldRule, normalizeValue } from './editableFields'
import type { ChangeInput, ChangeProposal, PreviewChange } from './types'

export type PreviewResult =
  | { ok: true; changes: PreviewChange[] }
  | { ok: false; code: 'not-found' | 'not-allowed' | 'unit' | 'range' | 'type' | 'no-op' | 'too-many'; message: string }

function sameValue(a: PropertyValue | undefined, b: PropertyValue): boolean {
  if (isQuantity(a) && isQuantity(b)) return a.unit === b.unit && Math.abs(a.value - b.value) < 1e-9
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Validates requested changes against the allowlist and the current model, and
 * builds a preview with current values and the revisions it is based on.
 */
export function buildPreview(inputs: ChangeInput[], model: ModelIndex): PreviewResult {
  if (inputs.length === 0) return { ok: false, code: 'type', message: 'No changes were requested.' }
  if (inputs.length > MAX_CHANGES_PER_PROPOSAL) {
    return { ok: false, code: 'too-many', message: `At most ${MAX_CHANGES_PER_PROPOSAL} changes can be proposed together.` }
  }

  const changes: PreviewChange[] = []
  for (const input of inputs) {
    if (input.kind === 'set-property') {
      const object = model.get(input.targetId)
      const scenario = model.scenario(input.targetId)
      const target = object ?? scenario
      if (!target) return { ok: false, code: 'not-found', message: `${input.targetId} does not exist.` }
      const targetKind = object ? object.type : 'scenario'
      const rule = findFieldRule(targetKind, input.property)
      if (!rule || (object && object.type === 'part' && !(input.property in object.properties))) {
        return {
          ok: false,
          code: 'not-allowed',
          message: `Changing “${input.property}” on ${input.targetId} is not allowed from the conversation.`,
        }
      }
      const normalized = normalizeValue(rule, input.value, input.unit)
      if (!normalized.ok) return { ok: false, code: normalized.code, message: normalized.message }
      const current = target.properties[input.property]
      if (current !== undefined && sameValue(current, normalized.value)) {
        return {
          ok: false,
          code: 'no-op',
          message: `${target.name} (${target.id}) ${rule.label.toLowerCase()} is already ${formatValue(current)}.`,
        }
      }
      changes.push({
        kind: 'set-property',
        targetId: target.id,
        targetName: target.name,
        targetKind,
        property: input.property,
        label: rule.label,
        current,
        proposed: normalized.value,
        expectedRevision: target.revision,
        note: normalized.note,
      })
    } else {
      const rule = EDITABLE_RELATIONSHIPS.find((r) => r.type === input.type)
      const from = model.get(input.from)
      const to = model.get(input.to)
      if (!rule) return { ok: false, code: 'not-allowed', message: `Relationship type “${input.type}” cannot be changed from the conversation.` }
      if (!from || !to) return { ok: false, code: 'not-found', message: `${!from ? input.from : input.to} does not exist.` }
      if (!rule.from.includes(from.type) || !rule.to.includes(to.type)) {
        return { ok: false, code: 'not-allowed', message: `A ${from.type} cannot be linked to a ${to.type} with “${input.type}”.` }
      }
      const existing = model.findRelationship(rule.type, from.id, to.id)
      if (input.kind === 'add-relationship' && existing) {
        return { ok: false, code: 'no-op', message: `${from.id} is already linked to ${to.id} (${input.type}).` }
      }
      if (input.kind === 'remove-relationship' && !existing) {
        return { ok: false, code: 'no-op', message: `${from.id} is not linked to ${to.id} (${input.type}).` }
      }
      changes.push({
        kind: input.kind,
        type: rule.type,
        from: from.id,
        to: to.id,
        fromName: from.name,
        toName: to.name,
        relationshipId: existing?.id,
      })
    }
  }
  return { ok: true, changes }
}

/** Saved outputs that used any of the changed inputs (any configuration). */
export function affectedOutputs(changes: PreviewChange[], outputs: OutputRecord[]): string[] {
  const targets = new Set(changes.flatMap((c) => (c.kind === 'set-property' ? [c.targetId] : [])))
  return outputs.filter((o) => o.inputs.some((i) => targets.has(i.id))).map((o) => o.id)
}

/** Differences between the preview and the current model; empty when it is safe to apply. */
export function findConflicts(proposal: ChangeProposal, model: ModelIndex): string[] {
  const conflicts: string[] = []
  for (const change of proposal.changes) {
    if (change.kind === 'set-property') {
      const current = model.revisionOf(change.targetId)
      if (current === undefined) conflicts.push(`${change.targetId} no longer exists.`)
      else if (current !== change.expectedRevision) {
        const target = model.get(change.targetId) ?? model.scenario(change.targetId)
        conflicts.push(
          `${change.targetName} (${change.targetId}) changed from rev ${change.expectedRevision} to rev ${current}; ` +
            `${change.label.toLowerCase()} is now ${formatValue(target?.properties[change.property])}.`,
        )
      }
    } else {
      const exists = model.findRelationship(change.type, change.from, change.to)
      if (change.kind === 'add-relationship' && exists) conflicts.push(`${change.from} → ${change.to} (${change.type}) was added meanwhile.`)
      if (change.kind === 'remove-relationship' && !exists) conflicts.push(`${change.from} → ${change.to} (${change.type}) was removed meanwhile.`)
    }
  }
  return conflicts
}

/** Rebuilds the preview against the current model, keeping the proposed values. */
export function refreshChanges(changes: PreviewChange[], model: ModelIndex): PreviewChange[] {
  return changes.map((change) => {
    if (change.kind !== 'set-property') {
      const existing = model.findRelationship(change.type, change.from, change.to)
      return { ...change, relationshipId: existing?.id }
    }
    const target = model.get(change.targetId) ?? model.scenario(change.targetId)
    return target
      ? { ...change, current: target.properties[change.property], expectedRevision: target.revision }
      : change
  })
}

/** Repository changes for a proposal; property edits carry their expected revision. */
export function toModelChanges(changes: PreviewChange[]): ModelChange[] {
  const byTarget = new Map<string, { baseRevision: number; properties: Record<string, PropertyValue> }>()
  const result: ModelChange[] = []
  for (const change of changes) {
    if (change.kind === 'set-property') {
      const entry = byTarget.get(change.targetId) ?? { baseRevision: change.expectedRevision, properties: {} }
      entry.properties[change.property] = change.proposed
      byTarget.set(change.targetId, entry)
    } else if (change.kind === 'add-relationship') {
      result.push({
        kind: 'add-relationship',
        relationship: { type: change.type, from: change.from, to: change.to },
      })
    } else if (change.relationshipId) {
      result.push({ kind: 'remove-relationship', relationshipId: change.relationshipId })
    }
  }
  for (const [targetId, { baseRevision, properties }] of byTarget) {
    result.unshift({ kind: 'update-properties', targetId, baseRevision, properties })
  }
  return result
}

/**
 * Compensating changes for an applied proposal. Fails if a target was changed
 * again after the proposal was committed, rather than overwriting newer data.
 */
export function buildUndo(applied: ChangeProposal, model: ModelIndex): PreviewResult {
  if (applied.status !== 'applied' || applied.committedRevision === undefined) {
    return { ok: false, code: 'not-allowed', message: `${applied.id} has not been applied.` }
  }
  if (applied.undoneBy) return { ok: false, code: 'no-op', message: `${applied.id} was already undone by ${applied.undoneBy}.` }

  const changes: PreviewChange[] = []
  for (const change of applied.changes) {
    if (change.kind === 'set-property') {
      const target = model.get(change.targetId) ?? model.scenario(change.targetId)
      if (!target) return { ok: false, code: 'not-found', message: `${change.targetId} no longer exists.` }
      if (target.revision !== applied.committedRevision) {
        return {
          ok: false,
          code: 'not-allowed',
          message:
            `${target.name} (${target.id}) was changed again after ${applied.id} (now rev ${target.revision}, ` +
            `${change.label.toLowerCase()} ${formatValue(target.properties[change.property])}). Undo would overwrite that newer change.`,
        }
      }
      if (change.current === undefined) {
        return { ok: false, code: 'not-allowed', message: `${change.label} had no previous value to restore.` }
      }
      changes.push({
        ...change,
        current: target.properties[change.property],
        proposed: change.current,
        expectedRevision: target.revision,
        note: undefined,
      })
    } else {
      const existing = model.findRelationship(change.type, change.from, change.to)
      if (change.kind === 'add-relationship') {
        if (!existing) return { ok: false, code: 'no-op', message: `${change.from} → ${change.to} no longer exists.` }
        changes.push({ ...change, kind: 'remove-relationship', relationshipId: existing.id })
      } else {
        if (existing) return { ok: false, code: 'no-op', message: `${change.from} → ${change.to} already exists again.` }
        changes.push({ ...change, kind: 'add-relationship', relationshipId: undefined })
      }
    }
  }
  return { ok: true, changes }
}

export function describeChange(change: PreviewChange): string {
  if (change.kind === 'set-property') {
    return `${change.targetId} ${change.label.toLowerCase()} ${formatValue(change.current)} → ${formatValue(change.proposed)}`
  }
  return `${change.kind === 'add-relationship' ? 'Link' : 'Unlink'} ${change.from} → ${change.to} (${change.type})`
}
