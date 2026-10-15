import { isKindOf } from '../metamodel/metaclasses'
import type { Element, Model } from '../model/model'
import { semanticsOf } from '../semantics/semantics'

/**
 * Element-level change sets: the unit of commits, undo (inverse), semantic diff and incremental
 * client updates. `before`/`after` are full element states (in-memory form).
 */
export interface ElementChange {
  id: string
  kind: 'created' | 'updated' | 'deleted'
  metaclass: string
  before?: Element
  after?: Element
}

function sameElement(a: Element, b: Element): boolean {
  if (a === b) return true
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    const x = a[k]
    const y = b[k]
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false
    } else if (x !== y) return false
  }
  return true
}

/** Differences between two versions of a model layer (by element ID). */
export function diffModels(before: Model, after: Model): ElementChange[] {
  const out: ElementChange[] = []
  for (const el of after.elements()) {
    const old = before.own(el['@id'])
    if (!old) out.push({ id: el['@id'], kind: 'created', metaclass: el['@type'], after: el })
    else if (old !== el && !sameElement(old, el)) out.push({ id: el['@id'], kind: 'updated', metaclass: el['@type'], before: old, after: el })
  }
  for (const el of before.elements()) if (!after.own(el['@id'])) out.push({ id: el['@id'], kind: 'deleted', metaclass: el['@type'], before: el })
  return out
}

/** Applies a change set to a model in place (no validation). */
export function applyChanges(model: Model, changes: ElementChange[]): void {
  for (const c of changes) {
    if (c.kind === 'deleted') model.remove(c.id)
    else model.put(c.after!)
  }
}

/** The change set that undoes `changes`. */
export function invertChanges(changes: ElementChange[]): ElementChange[] {
  return changes.map((c) =>
    c.kind === 'created'
      ? { id: c.id, kind: 'deleted' as const, metaclass: c.metaclass, before: c.after }
      : c.kind === 'deleted'
        ? { id: c.id, kind: 'created' as const, metaclass: c.metaclass, after: c.before }
        : { id: c.id, kind: 'updated' as const, metaclass: c.metaclass, before: c.after, after: c.before },
  )
}

export interface ChangeSummaryItem {
  id: string
  kind: ElementChange['kind']
  metaclass: string
  label: string
}

/**
 * The changes people care about: named elements (and unnamed non-relationship elements such as
 * connections) created, updated or deleted; relationship-only edits are attributed to their owner.
 */
export function summarizeChanges(before: Model, after: Model, changes: ElementChange[]): ChangeSummaryItem[] {
  const sb = semanticsOf(before)
  const sa = semanticsOf(after)
  const byId = new Map<string, ChangeSummaryItem>()
  const owningElement = (s: typeof sa, id: string): string | undefined => {
    let cur: string | undefined = id
    for (let k = 0; cur && k < 50; k++) {
      const el = s.get(cur)
      if (!el) return undefined
      if (!isKindOf(el['@type'], 'Relationship') && !isKindOf(el['@type'], 'Expression') && el['@type'] !== 'MultiplicityRange' && el['@type'] !== 'Feature' && !(el['@type'] === 'ReferenceUsage' && el.isEnd)) return cur
      cur = s.owner(cur)?.['@id']
    }
    return undefined
  }
  const createdIds = new Set(changes.filter((c) => c.kind === 'created').map((c) => c.id))
  const deletedIds = new Set(changes.filter((c) => c.kind === 'deleted').map((c) => c.id))
  for (const c of changes) {
    // An owner that only gained or lost owned relationships (members created/deleted elsewhere) is not itself a change.
    if (c.kind === 'updated' && onlyOwnedRelationshipsChanged(c, createdIds, deletedIds)) continue
    // A membership created or deleted together with its member is reported as the member.
    const related = (c.after ?? c.before)?.ownedRelatedElement
    if (c.kind !== 'updated' && Array.isArray(related) && related.length && related.every((x) => (c.kind === 'created' ? createdIds : deletedIds).has(String(x))) && (c.after ?? c.before)!['@type'].endsWith('Membership')) continue
    const s = c.kind === 'deleted' ? sb : sa
    const target = owningElement(s, c.id)
    if (!target) continue
    const kind: ElementChange['kind'] = target === c.id ? c.kind : 'updated'
    const existing = byId.get(target)
    if (existing && existing.kind !== 'updated') continue
    const el = s.get(target)!
    // An element whose owner was created is part of that creation.
    if (kind === 'updated' && changes.some((x) => x.id === target && x.kind === 'created')) continue
    byId.set(target, { id: target, kind: existing?.kind === 'created' || kind === 'created' ? (kind === 'created' ? 'created' : existing!.kind) : kind, metaclass: el['@type'], label: s.label(target) })
  }
  const created = new Set([...byId.values()].filter((x) => x.kind === 'created').map((x) => x.id))
  // Keep only the top-most created elements (their owned members are implied).
  return [...byId.values()].filter((x) => {
    if (x.kind !== 'created') return x.id !== after.rootId
    let cur = sa.owner(x.id)?.['@id']
    while (cur) {
      if (created.has(cur)) return false
      cur = sa.owner(cur)?.['@id']
    }
    return true
  })
}

function onlyOwnedRelationshipsChanged(c: ElementChange, created: Set<string>, deleted: Set<string>): boolean {
  const a = c.before!
  const b = c.after!
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'ownedRelationship') continue
    const x = a[k]
    const y = b[k]
    if (Array.isArray(x) && Array.isArray(y) ? x.length !== y.length || x.some((v, i) => v !== y[i]) : x !== y) return false
  }
  const before = new Set((a.ownedRelationship as string[]) ?? [])
  const after = new Set((b.ownedRelationship as string[]) ?? [])
  for (const r of after) if (!before.has(r) && !created.has(r)) return false
  for (const r of before) if (!after.has(r) && !deleted.has(r)) return false
  return true
}

export function describeSummary(items: ChangeSummaryItem[]): string {
  if (!items.length) return 'No changes'
  const verbs = { created: 'Created', updated: 'Updated', deleted: 'Deleted' }
  const parts: string[] = []
  for (const k of ['created', 'updated', 'deleted'] as const) {
    const list = items.filter((i) => i.kind === k)
    if (!list.length) continue
    const names = list.slice(0, 4).map((i) => i.label)
    parts.push(`${verbs[k]} ${names.join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}`)
  }
  return parts.join('; ')
}
