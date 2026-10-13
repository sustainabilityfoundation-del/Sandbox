import { formatValue, isQuantity, type ModelChange, type ModelIndex, type ObjectType, type OutputRecord, type PropertyValue } from '@ews/model-service'
import type { EntitlementId } from '@ews/platform-sdk'
import { MAX_CHANGES_PER_PROPOSAL, collectRules, normalizeValue, type AssistantRules } from './editableFields'
import type { ChangeInput, ChangeProposal, PreviewChange } from './types'

export type PreviewResult =
  | { ok: true; changes: PreviewChange[]; requiredEntitlements: EntitlementId[] }
  | { ok: false; code: 'not-found' | 'not-allowed' | 'unit' | 'range' | 'type' | 'no-op' | 'too-many'; message: string }

function sameValue(a: PropertyValue | undefined, b: PropertyValue): boolean {
  if (isQuantity(a) && isQuantity(b)) return a.unit === b.unit && Math.abs(a.value - b.value) < 1e-9
  return JSON.stringify(a) === JSON.stringify(b)
}

const isRef = (id: string) => id.startsWith('$')

/**
 * Validates requested changes against the rules of entitled tools and the
 * current model, and builds a preview with current values and the revisions it
 * is based on. Placeholders ("$new1") refer to objects created earlier in the
 * same proposal.
 */
export function buildPreview(inputs: ChangeInput[], model: ModelIndex, rules: AssistantRules = collectRules()): PreviewResult {
  if (inputs.length === 0) return { ok: false, code: 'type', message: 'No changes were requested.' }
  if (inputs.length > MAX_CHANGES_PER_PROPOSAL) {
    return { ok: false, code: 'too-many', message: `At most ${MAX_CHANGES_PER_PROPOSAL} changes can be proposed together.` }
  }

  const changes: PreviewChange[] = []
  const entitlements = new Set<EntitlementId>()
  const created = new Map<string, { type: ObjectType; name: string }>()
  const typeOf = (id: string): ObjectType | undefined => created.get(id)?.type ?? model.get(id)?.type
  const nameOf = (id: string): string => created.get(id)?.name ?? model.get(id)?.name ?? id

  for (const input of inputs) {
    if (input.kind === 'create-object') {
      const rule = rules.creatable.find((r) => r.type === input.type)
      if (!rule) return { ok: false, code: 'not-allowed', message: `Creating a ${input.type} is not available from the conversation in your subscription.` }
      if (!isRef(input.ref) || created.has(input.ref)) return { ok: false, code: 'type', message: 'Each new object needs a unique placeholder such as $new1.' }
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name || name.length > 80) return { ok: false, code: 'type', message: 'A new object needs a name of up to 80 characters.' }
      const properties: Record<string, PropertyValue> = {}
      for (const [key, value] of Object.entries(input.properties ?? {})) {
        const allowed = rule.properties[key]
        if (!allowed) return { ok: false, code: 'not-allowed', message: `Property “${key}” can't be set on a new ${input.type}.` }
        if (typeof value !== 'string') return { ok: false, code: 'type', message: `${key} must be text.` }
        if (allowed.options && !allowed.options.includes(value)) return { ok: false, code: 'type', message: `${key} must be one of ${allowed.options.join(', ')}.` }
        if (allowed.maxLength && value.length > allowed.maxLength) return { ok: false, code: 'range', message: `${key} is limited to ${allowed.maxLength} characters.` }
        properties[key] = value
      }
      if (input.parentId) {
        const parentType = typeOf(input.parentId)
        if (!parentType) return { ok: false, code: 'not-found', message: `${input.parentId} does not exist.` }
        if (!rule.parentTypes?.includes(parentType)) return { ok: false, code: 'not-allowed', message: `A ${input.type} can't be nested in a ${parentType}.` }
      }
      created.set(input.ref, { type: input.type, name })
      entitlements.add(rule.entitlement)
      changes.push({ kind: 'create-object', ref: input.ref, type: input.type, idPrefix: rule.idPrefix, name, parentId: input.parentId, properties })
    } else if (input.kind === 'set-property') {
      const object = model.get(input.targetId)
      const scenario = model.scenario(input.targetId)
      const target = object ?? scenario
      if (!target) return { ok: false, code: 'not-found', message: `${input.targetId} does not exist.` }
      const targetKind = object ? object.type : 'scenario'
      const rule = rules.fields.find((r) => r.target === targetKind && r.property === input.property && (!object || r.type !== 'quantity' || input.property in object.properties))
      if (!rule) {
        return { ok: false, code: 'not-allowed', message: `Changing “${input.property}” on ${input.targetId} is not available from the conversation in your subscription.` }
      }
      const normalized = normalizeValue(rule, input.value, input.unit)
      if (!normalized.ok) return { ok: false, code: normalized.code, message: normalized.message }
      const current = target.properties[input.property]
      if (current !== undefined && sameValue(current, normalized.value)) {
        return { ok: false, code: 'no-op', message: `${target.name} (${target.id}) ${rule.label.toLowerCase()} is already ${formatValue(current)}.` }
      }
      entitlements.add(rule.entitlement)
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
      const fromType = typeOf(input.from)
      const toType = typeOf(input.to)
      if (!fromType || !toType) return { ok: false, code: 'not-found', message: `${!fromType ? input.from : input.to} does not exist.` }
      const rule = rules.relationships.find((r) => r.type === input.type && r.from.includes(fromType) && r.to.includes(toType))
      if (!rule) {
        return { ok: false, code: 'not-allowed', message: `A ${fromType} can't be linked to a ${toType} with “${input.type}” from the conversation in your subscription.` }
      }
      const existing = isRef(input.from) || isRef(input.to) ? undefined : model.findRelationship(rule.type, input.from, input.to)
      if (input.kind === 'add-relationship' && existing) return { ok: false, code: 'no-op', message: `${input.from} is already linked to ${input.to} (${input.type}).` }
      if (input.kind === 'remove-relationship' && !existing) return { ok: false, code: 'no-op', message: `${input.from} is not linked to ${input.to} (${input.type}).` }
      entitlements.add(rule.entitlement)
      changes.push({ kind: input.kind, type: rule.type, from: input.from, to: input.to, fromName: nameOf(input.from), toName: nameOf(input.to), relationshipId: existing?.id })
    }
  }
  return { ok: true, changes, requiredEntitlements: [...entitlements] }
}

/** Saved artifacts that used any of the changed inputs (any configuration). */
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
    } else if (change.kind !== 'create-object' && !isRef(change.from) && !isRef(change.to)) {
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
    if (change.kind === 'create-object') return change
    if (change.kind !== 'set-property') {
      const existing = isRef(change.from) || isRef(change.to) ? undefined : model.findRelationship(change.type, change.from, change.to)
      return { ...change, relationshipId: existing?.id }
    }
    const target = model.get(change.targetId) ?? model.scenario(change.targetId)
    return target ? { ...change, current: target.properties[change.property], expectedRevision: target.revision } : change
  })
}

/** Repository changes for a proposal; property edits carry their expected revision. */
export function toModelChanges(changes: PreviewChange[]): ModelChange[] {
  const byTarget = new Map<string, { baseRevision: number; properties: Record<string, PropertyValue> }>()
  const creations: ModelChange[] = []
  const result: ModelChange[] = []
  for (const change of changes) {
    if (change.kind === 'create-object') {
      creations.push({
        kind: 'add-object',
        idPrefix: change.idPrefix,
        ref: change.ref,
        object: { type: change.type, name: change.name, ...(change.parentId ? { parentId: change.parentId } : {}), properties: change.properties },
      })
    } else if (change.kind === 'set-property') {
      const entry = byTarget.get(change.targetId) ?? { baseRevision: change.expectedRevision, properties: {} }
      entry.properties[change.property] = change.proposed
      byTarget.set(change.targetId, entry)
    } else if (change.kind === 'add-relationship') {
      result.push({ kind: 'add-relationship', relationship: { type: change.type, from: change.from, to: change.to } })
    } else if (change.relationshipId) {
      result.push({ kind: 'remove-relationship', relationshipId: change.relationshipId })
    }
  }
  const updates: ModelChange[] = [...byTarget].map(([targetId, { baseRevision, properties }]) => ({ kind: 'update-properties', targetId, baseRevision, properties }))
  // New objects first, so relationships can refer to their placeholders.
  return [...creations, ...updates, ...result]
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
  if (applied.changes.some((c) => c.kind === 'create-object')) {
    return {
      ok: false,
      code: 'not-allowed',
      message: `${applied.id} created ${applied.createdIds?.join(', ') ?? 'new objects'}. This prototype doesn't delete objects from the conversation; remove its links in the tool instead.`,
    }
  }

  const changes: PreviewChange[] = []
  for (const change of applied.changes) {
    if (change.kind === 'create-object') continue
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
      if (change.current === undefined) return { ok: false, code: 'not-allowed', message: `${change.label} had no previous value to restore.` }
      changes.push({ ...change, current: target.properties[change.property], proposed: change.current, expectedRevision: target.revision, note: undefined })
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
  return { ok: true, changes, requiredEntitlements: applied.requiredEntitlements }
}

export function describeChange(change: PreviewChange): string {
  if (change.kind === 'create-object') return `Create ${change.type} “${change.name}” (${change.ref})${change.parentId ? ` in ${change.parentId}` : ''}`
  if (change.kind === 'set-property') {
    return `${change.targetId} ${change.label.toLowerCase()} ${formatValue(change.current)} → ${formatValue(change.proposed)}`
  }
  return `${change.kind === 'add-relationship' ? 'Link' : 'Unlink'} ${change.from} → ${change.to} (${change.type})`
}
