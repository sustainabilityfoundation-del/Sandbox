import { attributesOf, referencesOfCached } from '../metamodel/metaclasses'
import type { Model } from '../model/model'
import { structuralKeys } from '../commands/reconcile'

/**
 * An ID-independent canonical form of a model layer: every element is named by its structural key
 * (path of owning relationships from the root) and references are replaced by the target's key
 * (or its qualified-name-based ID for library elements). Two models are semantically equal for the
 * purposes of the round-trip tests when their canonical forms are equal.
 */
export function canonicalForm(model: Model): Record<string, Record<string, unknown>> {
  const keys = structuralKeys(model, model.rootId)
  const keyOf = new Map<string, string>()
  for (const [k, id] of keys) if (!keyOf.has(id)) keyOf.set(id, k)
  keyOf.set(model.rootId, '<root>')
  const name = (id: string) => keyOf.get(id) ?? (model.isLibrary(id) ? `lib:${id}` : `?${id}`)
  const out: Record<string, Record<string, unknown>> = {}
  for (const el of model.elements()) {
    const refs = referencesOfCached(el['@type'])
    const attrs = attributesOf(el['@type'])
    const entry: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(el)) {
      if (k === '@id') continue
      // Absent ≡ empty list ≡ the attribute's default value.
      if (Array.isArray(v) && !v.length) continue
      if (attrs[k] && attrs[k].default !== undefined && attrs[k].default === v) continue
      if (refs[k]) entry[k] = Array.isArray(v) ? v.map((x) => name(String(x))) : name(String(v))
      else entry[k] = v
    }
    out[name(el['@id'])] = entry
  }
  return out
}
