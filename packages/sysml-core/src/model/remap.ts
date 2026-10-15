import { referencesOfCached } from '../metamodel/metaclasses'
import type { Element } from './model'

/** Rewrites element IDs and every reference to them (in memory form). */
export function remapElement(el: Element, map: Map<string, string>): Element {
  const out: Element = { ...el, '@id': map.get(el['@id']) ?? el['@id'] }
  for (const prop of Object.keys(referencesOfCached(el['@type']))) {
    const v = el[prop]
    if (typeof v === 'string') out[prop] = map.get(v) ?? v
    else if (Array.isArray(v)) out[prop] = v.map((x) => (typeof x === 'string' ? (map.get(x) ?? x) : x))
  }
  return out
}
