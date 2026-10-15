import { isKindOf } from '../metamodel/metaclasses'
import { refIds, type Element, type Model } from '../model/model'
import { remapElement } from '../model/remap'
import { Semantics } from '../semantics/semantics'

/**
 * Identity preservation for text editing (ai-commands.md §4). Elements are matched by a structural
 * key: the path of owning relationships from the edited namespace, using member names where they
 * exist and ordinals among unnamed siblings otherwise, plus the metaclass. A new element whose key
 * matches an old one takes over the old element's ID.
 */
export function structuralKeys(model: Model, rootId: string, relationshipFilter?: (rel: Element) => boolean): Map<string, string> {
  const s = new Semantics(model)
  const keys = new Map<string, string>()
  const visit = (id: string, key: string, depth: number) => {
    if (depth > 200) return
    const counters = new Map<string, number>()
    for (const rel of s.ownedRelationships(id)) {
      if (depth === 0 && relationshipFilter && !relationshipFilter(rel)) continue
      const children = refIds(rel, 'ownedRelatedElement').map((c) => model.get(c)).filter((x): x is Element => !!x)
      const first = children[0]
      const name = isKindOf(rel['@type'], 'Membership') ? s.memberName(rel) : undefined
      let relKey: string
      if (name !== undefined) relKey = `${key}/${rel['@type']}[${first?.['@type'] ?? ''}]:${name}`
      else {
        const c = `${rel['@type']}[${first?.['@type'] ?? ''}]`
        const n = counters.get(c) ?? 0
        counters.set(c, n + 1)
        relKey = `${key}/${c}#${n}`
      }
      if (!keys.has(relKey)) keys.set(relKey, rel['@id'])
      children.forEach((child, k) => {
        const childKey = `${relKey}>${k}:${child['@type']}`
        if (!keys.has(childKey)) keys.set(childKey, child['@id'])
        visit(child['@id'], childKey, depth + 1)
      })
    }
  }
  visit(rootId, '', 0)
  return keys
}

/**
 * Gives elements created in `working` the IDs of matching elements of `before` (same structural
 * key under `namespaceId`). Returns the ID mapping applied (new → old).
 */
export function preserveIdentity(before: Model, working: Model, namespaceId: string, createdIds: Set<string>, relationshipFilter?: (rel: Element) => boolean): Map<string, string> {
  const oldKeys = structuralKeys(before, namespaceId, relationshipFilter)
  const newKeys = structuralKeys(working, namespaceId, relationshipFilter)
  const map = new Map<string, string>()
  const taken = new Set<string>()
  for (const [key, newId] of newKeys) {
    const oldId = oldKeys.get(key)
    if (!oldId || !createdIds.has(newId) || taken.has(oldId)) continue
    // Never reuse an old ID that still exists in the working copy under a different element.
    if (working.own(oldId)) continue
    const oldEl = before.own(oldId)
    const newEl = working.own(newId)
    if (!oldEl || !newEl || oldEl['@type'] !== newEl['@type']) continue
    map.set(newId, oldId)
    taken.add(oldId)
  }
  if (!map.size) return map
  // Rewrite the created elements and every element of the working copy that refers to them.
  const touched = new Set<string>(createdIds)
  for (const id of createdIds) for (const r of working.referencesTo(id)) touched.add(r)
  touched.add(namespaceId)
  const rewritten: Element[] = []
  for (const id of touched) {
    const el = working.own(id)
    if (el) rewritten.push(remapElement(el, map))
  }
  for (const id of touched) if (map.has(id)) working.remove(id)
  for (const el of rewritten) working.put(el)
  return map
}
