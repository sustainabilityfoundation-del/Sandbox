import { isKindOf } from '../metamodel/metaclasses'
import { refId, type Element, type Model } from '../model/model'
import { semanticsOf } from '../semantics/semantics'
import { featureValue, formatValue } from '../units/evaluate'

/**
 * Model queries (SYS-FR-VAL-04/05): find elements, element summaries with derived properties,
 * incoming references (impact analysis) and children for lazy browsing.
 */

export interface ElementQuery {
  /** Case-insensitive substring of the name, short name or qualified name. */
  text?: string
  /** Metaclass (kinds include specializations, e.g. "Usage" matches every usage). */
  metaclass?: string
  /** Only members (transitively, when `recursive`) of this namespace. */
  ownerId?: string
  recursive?: boolean
  /** Include relationship elements (default: no). */
  includeRelationships?: boolean
  limit?: number
}

export interface ElementSummary {
  id: string
  metaclass: string
  name?: string
  shortName?: string
  qualifiedName: string | null
  ownerId?: string
  /** Names of the types (usages) or general definitions. */
  types?: string[]
  generals?: string[]
  multiplicity?: string
  direction?: string
  value?: string
  documentation?: string
  isLibrary?: boolean
}

export function summarize(model: Model, id: string): ElementSummary | undefined {
  const s = semanticsOf(model)
  const el = s.get(id)
  if (!el) return undefined
  const owner = s.owner(id)
  const out: ElementSummary = { id, metaclass: el['@type'], name: s.name(id), shortName: s.shortName(id), qualifiedName: s.qualifiedName(id), ownerId: owner?.['@id'] }
  if (model.isLibrary(id)) out.isLibrary = true
  if (isKindOf(el['@type'], 'Feature')) {
    const types = s.featureTypes(id)
    if (types.length) out.types = types.map((t) => s.qualifiedName(t) ?? s.label(t))
    const range = s.ownedMembers(id).find((m) => m['@type'] === 'MultiplicityRange')
    if (range) {
      const b = s.ownedMembers(range['@id']).map((x) => (x['@type'] === 'LiteralInfinity' ? '*' : String(x.value)))
      out.multiplicity = `[${b.join('..')}]`
    }
    if (typeof el.direction === 'string') out.direction = el.direction
    const fv = s.ownedRelationships(id).find((r) => r['@type'] === 'FeatureValue')
    if (fv) {
      const v = featureValue(model, id)
      out.value = v.kind === 'unknown' ? undefined : formatValue(v)
    }
  } else if (isKindOf(el['@type'], 'Type')) {
    const g = s.explicitGenerals(id)
    if (g.length) out.generals = g.map((x) => s.qualifiedName(x) ?? s.label(x))
  }
  const doc = s.ownedMembers(id).find((m) => m['@type'] === 'Documentation')
  if (doc) out.documentation = String(doc.body ?? '')
  return out
}

export function findElements(model: Model, query: ElementQuery = {}): ElementSummary[] {
  const s = semanticsOf(model)
  const text = query.text?.toLowerCase().trim()
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 1000)
  let candidates: Element[]
  if (query.ownerId) {
    candidates = []
    const visit = (id: string, depth: number) => {
      for (const m of s.ownedMembers(id)) {
        candidates.push(m)
        if (query.recursive && depth < 100) visit(m['@id'], depth + 1)
      }
    }
    visit(query.ownerId, 0)
  } else candidates = [...model.elements()]
  const out: ElementSummary[] = []
  for (const el of candidates) {
    const t = el['@type']
    if (!query.includeRelationships && isKindOf(t, 'Relationship') && !isKindOf(t, 'Usage')) continue
    if (query.metaclass && !isKindOf(t, query.metaclass)) continue
    if (t === 'Namespace' || t === 'ConjugatedPortDefinition' || isKindOf(t, 'Expression') && !isKindOf(t, 'Usage')) continue
    if (t === 'MultiplicityRange' || t === 'Feature') continue
    if (text) {
      const hay = [s.name(el['@id']), s.shortName(el['@id']), s.qualifiedName(el['@id'])].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(text)) continue
    }
    const sum = summarize(model, el['@id'])
    if (sum) out.push(sum)
    if (out.length >= limit) break
  }
  return out
}

export interface IncomingReference {
  /** The relationship or element holding the reference. */
  viaId: string
  viaMetaclass: string
  /** The model element that owns the reference (e.g. the part typed by the definition). */
  fromId: string
  fromLabel: string
  property: string
}

/** Elements referring to `id` (directly), grouped at the owning model element. */
export function incomingReferences(model: Model, id: string): IncomingReference[] {
  const s = semanticsOf(model)
  const out: IncomingReference[] = []
  for (const r of model.referencesTo(id)) {
    const rel = model.own(r)
    if (!rel) continue
    const prop = Object.keys(rel).find((k) => rel[k] === id || (Array.isArray(rel[k]) && (rel[k] as unknown[]).includes(id))) ?? '?'
    let from = r
    for (let k = 0; k < 30; k++) {
      const el = s.get(from)!
      const t = el['@type']
      if (!isKindOf(t, 'Relationship') && !isKindOf(t, 'Expression') && t !== 'Feature' && t !== 'MultiplicityRange' && !(t === 'ReferenceUsage' && el.isEnd)) break
      const o = s.owner(from)
      if (!o) break
      from = o['@id']
    }
    if (from === id) continue
    out.push({ viaId: r, viaMetaclass: rel['@type'], fromId: from, fromLabel: s.label(from), property: prop })
  }
  return out
}

/** Transitive impact: everything that (directly or indirectly) refers to the element or its owned members. */
export function impact(model: Model, id: string, depth = 3): { id: string; label: string; metaclass: string; distance: number; via: string }[] {
  const s = semanticsOf(model)
  const seen = new Map<string, { distance: number; via: string }>()
  let frontier = [id]
  for (let d = 1; d <= depth && frontier.length; d++) {
    const next: string[] = []
    for (const f of frontier) {
      const targets = [f, ...s.ownedMembers(f).map((m) => m['@id'])]
      for (const t of targets) {
        for (const ref of incomingReferences(model, t)) {
          if (ref.fromId === id || seen.has(ref.fromId)) continue
          seen.set(ref.fromId, { distance: d, via: `${ref.viaMetaclass} → ${s.label(t)}` })
          next.push(ref.fromId)
        }
      }
    }
    frontier = next
  }
  return [...seen.entries()].map(([k, v]) => ({ id: k, label: s.label(k), metaclass: s.get(k)!['@type'], ...v })).sort((a, b) => a.distance - b.distance || a.label.localeCompare(b.label))
}

export interface ChildSummary extends ElementSummary {
  childCount: number
}

/** Members of a namespace for a lazy model browser (relationships and implied elements hidden). */
export function children(model: Model, ownerId: string = model.rootId): ChildSummary[] {
  const s = semanticsOf(model)
  const browsable = (m: Element) => !['ConjugatedPortDefinition', 'MultiplicityRange', 'Documentation', 'Feature', 'PayloadFeature'].includes(m['@type']) && !(isKindOf(m['@type'], 'Expression') && !isKindOf(m['@type'], 'Usage'))
  return s
    .ownedMembers(ownerId)
    .filter(browsable)
    .map((m) => ({ ...summarize(model, m['@id'])!, childCount: s.ownedMembers(m['@id']).filter(browsable).length }))
}

export { refId }
