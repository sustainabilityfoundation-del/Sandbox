import { referencesOfCached } from '../metamodel/metaclasses'
import { newId } from './ids'

/**
 * An element as stored: an instance of a KerML/SysML metaclass with its stored attributes.
 * References hold element IDs (strings, or string arrays for multi-valued references) in memory;
 * the JSON wire format wraps them as `{ "@id": … }` (see json.ts).
 */
export interface Element {
  '@id': string
  '@type': string
  [property: string]: unknown
}

/** Ownership references: they form the containment tree and are not indexed as cross references. */
export const STRUCTURAL_REFS = new Set(['owningRelationship', 'ownedRelationship', 'ownedRelatedElement', 'owningRelatedElement'])

export function refIds(el: Element, prop: string): string[] {
  const v = el[prop]
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

export function refId(el: Element, prop: string): string | undefined {
  const v = el[prop]
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : undefined
}

/** Non-structural references of an element: [property, target ID]. */
export function crossReferences(el: Element): [string, string][] {
  const out: [string, string][] = []
  for (const prop of Object.keys(referencesOfCached(el['@type']))) {
    if (STRUCTURAL_REFS.has(prop)) continue
    for (const id of refIds(el, prop)) out.push([prop, id])
  }
  return out
}

/**
 * The element store. Holds the elements of one model layer (a project model at a commit, or the
 * model library) and, for project models, a read-only library layer underneath. Maintains a reverse
 * index of cross references for impact analysis and referential integrity. `clone()` is cheap
 * (copy-on-write sets) so transactions run on working copies.
 */
export class Model {
  readonly library?: Model
  /** The root Namespace of this layer (unnamed, unowned). */
  readonly rootId: string
  private els: Map<string, Element>
  private incoming: Map<string, Set<string>>
  private shared: WeakSet<Set<string>>
  /** Incremented on every change; derived caches key on it. */
  version = 0

  constructor(options: { library?: Model; rootId?: string; elements?: Iterable<Element> } = {}) {
    this.library = options.library
    this.els = new Map()
    this.incoming = new Map()
    this.shared = new WeakSet()
    const elements = options.elements ? [...options.elements] : []
    for (const e of elements) this.els.set(e['@id'], e)
    for (const e of elements) this.indexAdd(e)
    if (options.rootId) {
      this.rootId = options.rootId
      if (!this.els.has(this.rootId)) this.els.set(this.rootId, { '@id': this.rootId, '@type': 'Namespace', ownedRelationship: [] })
    } else {
      const root = elements.find((e) => e['@type'] === 'Namespace' && !e.owningRelationship)
      this.rootId = root?.['@id'] ?? newId()
      if (!root) this.els.set(this.rootId, { '@id': this.rootId, '@type': 'Namespace', ownedRelationship: [] })
    }
  }

  get size(): number {
    return this.els.size
  }

  /** An element of this layer or of the library. */
  get(id: string | undefined): Element | undefined {
    if (!id) return undefined
    return this.els.get(id) ?? this.library?.get(id)
  }

  /** An element of this layer only (not the library). */
  own(id: string): Element | undefined {
    return this.els.get(id)
  }

  has(id: string): boolean {
    return this.els.has(id) || !!this.library?.has(id)
  }

  isLibrary(id: string): boolean {
    return !this.els.has(id) && !!this.library?.has(id)
  }

  /** Elements of this layer. */
  elements(): IterableIterator<Element> {
    return this.els.values()
  }

  /** IDs of elements (in this layer) that reference `id` through a non-structural reference. */
  referencesTo(id: string): string[] {
    return [...(this.incoming.get(id) ?? [])]
  }

  put(el: Element): void {
    const old = this.els.get(el['@id'])
    if (old) this.indexRemove(old)
    this.els.set(el['@id'], el)
    this.indexAdd(el)
    this.version++
  }

  remove(id: string): Element | undefined {
    const old = this.els.get(id)
    if (!old) return undefined
    this.indexRemove(old)
    this.els.delete(id)
    this.version++
    return old
  }

  clone(): Model {
    const copy = Object.create(Model.prototype) as Model
    Object.assign(copy, { library: this.library, rootId: this.rootId, version: this.version })
    ;(copy as unknown as { els: Map<string, Element> }).els = new Map(this.els)
    const shared = new WeakSet<Set<string>>()
    // Both models now share the sets; whichever writes first copies (copy-on-write).
    for (const set of this.incoming.values()) {
      shared.add(set)
      this.shared.add(set)
    }
    ;(copy as unknown as { incoming: Map<string, Set<string>> }).incoming = new Map(this.incoming)
    ;(copy as unknown as { shared: WeakSet<Set<string>> }).shared = shared
    return copy
  }

  private writable(target: string): Set<string> {
    let set = this.incoming.get(target)
    if (!set) {
      set = new Set()
      this.incoming.set(target, set)
    } else if (this.shared.has(set)) {
      set = new Set(set)
      this.incoming.set(target, set)
    }
    return set
  }

  private indexAdd(el: Element) {
    for (const [, target] of crossReferences(el)) this.writable(target).add(el['@id'])
  }

  private indexRemove(el: Element) {
    for (const [, target] of crossReferences(el)) {
      if (!this.incoming.has(target)) continue
      const set = this.writable(target)
      set.delete(el['@id'])
      if (!set.size) this.incoming.delete(target)
    }
  }
}
