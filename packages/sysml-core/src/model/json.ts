import { attributesOf, isKnownMetaclass, referencesOfCached, sourcePropertyOf, targetPropertyOf } from '../metamodel/metaclasses'
import { semanticsOf } from '../semantics/semantics'
import { refId, refIds, type Element, type Model } from './model'

/**
 * Systems Modeling API JSON form (KerML §10.4): `@id`, `@type`, references as `{ "@id": … }`.
 * Stored attributes always; derived ones (`name`, `qualifiedName`, `owner`, `source`, `target`, …)
 * only with `derived: true` ("full" level). Unknown metaclasses are preserved: every property whose
 * value looks like a reference is kept as one, and `@opaqueRefs` remembers which they were.
 */

export type JsonElement = { '@id': string; '@type': string; [key: string]: unknown }

const isRef = (v: unknown): v is { '@id': string } => !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { '@id'?: unknown })['@id'] === 'string' && Object.keys(v as object).length === 1

function refProps(el: Element): string[] {
  const known = Object.keys(referencesOfCached(el['@type']))
  const opaque = Array.isArray(el['@opaqueRefs']) ? (el['@opaqueRefs'] as string[]) : []
  return [...new Set([...known, ...opaque])]
}

export function toJson(model: Model, el: Element, options: { derived?: boolean } = {}): JsonElement {
  const out: JsonElement = { '@id': el['@id'], '@type': el['@type'], elementId: el['@id'] }
  const refs = new Set(refProps(el))
  for (const [k, v] of Object.entries(el)) {
    if (k === '@id' || k === '@type' || k === '@opaqueRefs' || k === 'elementId') continue
    if (refs.has(k)) out[k] = Array.isArray(v) ? v.map((x) => ({ '@id': x })) : v == null ? null : { '@id': v }
    else out[k] = v
  }
  for (const k of refs) if (!(k in out) && referencesOfCached(el['@type'])[k]) out[k] = referencesOfCached(el['@type'])[k].many ? [] : null
  if (options.derived) {
    const s = semanticsOf(model)
    const id = el['@id']
    const owner = s.owner(id)
    const ns = s.owningNamespace(id)
    Object.assign(out, {
      name: s.name(id) ?? null,
      shortName: s.shortName(id) ?? null,
      qualifiedName: s.qualifiedName(id),
      owner: owner ? { '@id': owner['@id'] } : null,
      owningNamespace: ns ? { '@id': ns['@id'] } : null,
      ownedElement: s.ownedElements(id).map((e) => ({ '@id': e['@id'] })),
    })
    const src = sourcePropertyOf(el['@type'])
    const tgt = targetPropertyOf(el['@type'])
    if (tgt) {
      out.source = src ? refIds(el, src).map((x) => ({ '@id': x })) : owner ? [{ '@id': owner['@id'] }] : []
      out.target = refIds(el, tgt).map((x) => ({ '@id': x }))
    }
  }
  return out
}

/** Parses an API JSON element into the in-memory form. */
export function fromJson(json: JsonElement): Element {
  if (typeof json['@id'] !== 'string' || typeof json['@type'] !== 'string') throw new Error('An element needs "@id" and "@type".')
  const known = isKnownMetaclass(json['@type'])
  const knownRefs = known ? referencesOfCached(json['@type']) : {}
  const knownAttrs = known ? attributesOf(json['@type']) : {}
  const out: Element = { '@id': json['@id'], '@type': json['@type'] }
  const opaque: string[] = []
  for (const [k, v] of Object.entries(json)) {
    if (k === '@id' || k === '@type' || k === 'elementId') continue
    if (knownRefs[k]) {
      if (Array.isArray(v)) {
        const ids = v.filter(isRef).map((x) => x['@id'])
        if (ids.length || k === 'ownedRelationship') out[k] = ids
      }
      else if (isRef(v)) out[k] = v['@id']
      continue
    }
    if (known && !knownAttrs[k]) continue // derived or unsupported properties of a known metaclass are not stored
    if (isRef(v)) {
      out[k] = v['@id']
      opaque.push(k)
    } else if (Array.isArray(v) && v.length && v.every(isRef)) {
      out[k] = v.map((x) => x['@id'])
      opaque.push(k)
    } else if (v !== null && v !== undefined) out[k] = v
  }
  if (!known) out['@opaqueRefs'] = opaque
  if (!Array.isArray(out.ownedRelationship)) out.ownedRelationship = []
  return out
}

/** Whole model (this layer) as API JSON, in a stable order (containment pre-order). */
export function modelToJson(model: Model, options: { derived?: boolean } = {}): JsonElement[] {
  const out: JsonElement[] = []
  const seen = new Set<string>()
  const visit = (id: string) => {
    if (seen.has(id)) return
    const el = model.own(id)
    if (!el) return
    seen.add(id)
    out.push(toJson(model, el, options))
    for (const r of refIds(el, 'ownedRelationship')) {
      visit(r)
      const rel = model.own(r)
      if (rel) for (const c of refIds(rel, 'ownedRelatedElement')) visit(c)
    }
  }
  visit(model.rootId)
  for (const el of model.elements()) if (!seen.has(el['@id'])) out.push(toJson(model, el, options))
  return out
}

export { refId }
