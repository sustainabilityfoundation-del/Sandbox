import { isKindOf } from '../metamodel/metaclasses'
import { refId, refIds, type Element, type Model } from '../model/model'
import { KEYWORDS } from '../syntax/lexer'

/**
 * Derived semantics over a model (KerML §8 subset): ownership, names, qualified names,
 * specialization (generals), feature types, inherited and imported memberships, and name
 * resolution. Nothing here is stored; everything is computed from the stored relationships.
 *
 * During parsing, references may still be pending: the optional `hook` resolves them on demand
 * (lazily, so that e.g. inherited members are available when a later name needs them).
 */

export interface RefHook {
  /** Resolves (and stores) a pending reference of `el.prop`, or returns undefined. */
  resolve(el: Element, prop: string): string | undefined
}

export interface Resolved {
  membership: Element
  element: Element
}

const SPECIALIZATION_GENERAL: Record<string, string> = {
  Subclassification: 'superclassifier',
  FeatureTyping: 'type',
  ConjugatedPortTyping: 'conjugatedPortDefinition',
  Subsetting: 'subsettedFeature',
  Redefinition: 'redefinedFeature',
  ReferenceSubsetting: 'referencedFeature',
  Specialization: 'general',
}

export function generalProperty(metaclass: string): string | undefined {
  if (SPECIALIZATION_GENERAL[metaclass]) return SPECIALIZATION_GENERAL[metaclass]
  if (isKindOf(metaclass, 'Redefinition')) return 'redefinedFeature'
  if (isKindOf(metaclass, 'ReferenceSubsetting')) return 'referencedFeature'
  if (isKindOf(metaclass, 'Subsetting')) return 'subsettedFeature'
  if (isKindOf(metaclass, 'ConjugatedPortTyping')) return 'conjugatedPortDefinition'
  if (isKindOf(metaclass, 'FeatureTyping')) return 'type'
  if (isKindOf(metaclass, 'Subclassification')) return 'superclassifier'
  if (isKindOf(metaclass, 'Specialization')) return 'general'
  return undefined
}

/**
 * Implicit specializations (SysML 2.0 §8.3 semantic constraints `checkPartDefinitionSpecialization`,
 * `checkPartUsageSpecialization` …, subset): a definition with no explicit general specializes the
 * library base type of its kind, and a usage with no explicit general subsets the library base
 * feature. They are derived here (never stored, `isImplied` relationships are not created), and are
 * used for name resolution and conformance checks only. Most specific kind first.
 */
export const IMPLIED_GENERALS: { kind: string; general: [string, string] }[] = [
  { kind: 'InterfaceDefinition', general: ['Interfaces', 'Interface'] },
  { kind: 'AllocationDefinition', general: ['Allocations', 'Allocation'] },
  { kind: 'FlowDefinition', general: ['Connections', 'Flow'] },
  { kind: 'ConnectionDefinition', general: ['Connections', 'Connection'] },
  { kind: 'PortDefinition', general: ['Ports', 'Port'] },
  { kind: 'StateDefinition', general: ['States', 'StateAction'] },
  { kind: 'RequirementDefinition', general: ['Requirements', 'RequirementCheck'] },
  { kind: 'ConstraintDefinition', general: ['Constraints', 'ConstraintCheck'] },
  { kind: 'CalculationDefinition', general: ['Calculations', 'Calculation'] },
  { kind: 'ActionDefinition', general: ['Actions', 'Action'] },
  { kind: 'PartDefinition', general: ['Parts', 'Part'] },
  { kind: 'ItemDefinition', general: ['Items', 'Item'] },
  { kind: 'AttributeDefinition', general: ['Base', 'DataValue'] },
  { kind: 'InterfaceUsage', general: ['Interfaces', 'interfaces'] },
  { kind: 'AllocationUsage', general: ['Allocations', 'allocations'] },
  { kind: 'FlowUsage', general: ['Connections', 'flows'] },
  { kind: 'ConnectionUsage', general: ['Connections', 'connections'] },
  { kind: 'PortUsage', general: ['Ports', 'ports'] },
  { kind: 'StateUsage', general: ['States', 'stateActions'] },
  { kind: 'RequirementUsage', general: ['Requirements', 'requirementChecks'] },
  { kind: 'ConstraintUsage', general: ['Constraints', 'constraintChecks'] },
  { kind: 'CalculationUsage', general: ['Calculations', 'calculations'] },
  { kind: 'ActionUsage', general: ['Actions', 'actions'] },
  { kind: 'PartUsage', general: ['Parts', 'parts'] },
  { kind: 'ItemUsage', general: ['Items', 'items'] },
]
/** Kinds that never get an implied general here (connector-shaped behaviour, metadata). */
const NO_IMPLIED = ['TransitionUsage', 'SuccessionAsUsage', 'BindingConnectorAsUsage', 'MetadataDefinition', 'MetadataUsage']

const cache = new WeakMap<Model, { version: number; s: Semantics }>()

/** Cached semantics of a fully resolved model (recomputed when the model changes). */
export function semanticsOf(model: Model): Semantics {
  const hit = cache.get(model)
  if (hit && hit.version === model.version) return hit.s
  const s = new Semantics(model)
  cache.set(model, { version: model.version, s })
  return s
}

export class Semantics {
  private qnames = new Map<string, string | null>()
  private impliedCache = new Map<string, string | null>()
  private nameIndex = new Map<string, Map<string, Element[]>>()
  constructor(
    readonly model: Model,
    private readonly hook?: RefHook,
  ) {}

  // ---- references --------------------------------------------------------------------------
  ref(el: Element, prop: string): string | undefined {
    return refId(el, prop) ?? this.hook?.resolve(el, prop)
  }
  get(id: string | undefined): Element | undefined {
    return this.model.get(id)
  }

  // ---- ownership --------------------------------------------------------------------------
  /** The element that owns `id` (through its owning relationship). */
  owner(id: string): Element | undefined {
    const el = this.get(id)
    if (!el) return undefined
    const rel = this.get(refId(el, 'owningRelationship'))
    if (rel) return this.get(refId(rel, 'owningRelatedElement'))
    // A relationship owned directly by an element.
    return this.get(refId(el, 'owningRelatedElement'))
  }

  owningMembership(id: string): Element | undefined {
    const el = this.get(id)
    const rel = el && this.get(refId(el, 'owningRelationship'))
    return rel && isKindOf(rel['@type'], 'Membership') ? rel : undefined
  }

  /** The namespace in which the element is a member (KerML owningNamespace). */
  owningNamespace(id: string): Element | undefined {
    const m = this.owningMembership(id)
    return m ? this.get(refId(m, 'owningRelatedElement')) : undefined
  }

  /** Nearest enclosing namespace for name resolution (also for elements not owned by a membership). */
  enclosingNamespace(id: string): Element | undefined {
    let cur = this.owner(id)
    while (cur && !isKindOf(cur['@type'], 'Namespace')) cur = this.owner(cur['@id'])
    return cur
  }

  ownedRelationships(id: string): Element[] {
    const el = this.get(id)
    return el ? refIds(el, 'ownedRelationship').map((r) => this.get(r)).filter((x): x is Element => !!x) : []
  }

  /** Owned memberships of a namespace, in order. */
  memberships(id: string): Element[] {
    return this.ownedRelationships(id).filter((r) => isKindOf(r['@type'], 'Membership'))
  }

  /** Elements owned through memberships (owned members), in order. */
  ownedMembers(id: string): Element[] {
    return this.memberships(id)
      .filter((m) => isKindOf(m['@type'], 'OwningMembership'))
      .map((m) => this.get(refId(m, 'ownedRelatedElement')))
      .filter((x): x is Element => !!x)
  }

  /** All elements owned (directly) by an element, through any relationship. */
  ownedElements(id: string): Element[] {
    return this.ownedRelationships(id).flatMap((r) => refIds(r, 'ownedRelatedElement').map((x) => this.get(x)).filter((x): x is Element => !!x))
  }

  memberElement(membership: Element): Element | undefined {
    if (isKindOf(membership['@type'], 'OwningMembership')) return this.get(refId(membership, 'ownedRelatedElement'))
    return this.get(this.ref(membership, 'memberElement'))
  }

  // ---- names ------------------------------------------------------------------------------
  /** Declared name, or the effective name inherited from the first redefined feature. */
  name(id: string, depth = 0): string | undefined {
    const el = this.get(id)
    if (!el) return undefined
    if (typeof el.declaredName === 'string') return el.declaredName
    if (depth > 20 || !isKindOf(el['@type'], 'Feature')) return undefined
    for (const r of this.ownedRelationships(id)) {
      if (isKindOf(r['@type'], 'Redefinition')) {
        const target = this.ref(r, 'redefinedFeature')
        if (target) return this.name(target, depth + 1)
      }
    }
    return undefined
  }

  shortName(id: string): string | undefined {
    const el = this.get(id)
    return typeof el?.declaredShortName === 'string' ? el.declaredShortName : undefined
  }

  memberName(membership: Element): string | undefined {
    if (typeof membership.memberName === 'string') return membership.memberName
    const el = this.memberElement(membership)
    return el && isKindOf(membership['@type'], 'OwningMembership') ? this.name(el['@id']) : undefined
  }

  memberShortName(membership: Element): string | undefined {
    if (typeof membership.memberShortName === 'string') return membership.memberShortName
    const el = this.memberElement(membership)
    return el && isKindOf(membership['@type'], 'OwningMembership') ? this.shortName(el['@id']) : undefined
  }

  /** Qualified name (`A::B::c`), or null when an owner on the path is unnamed. */
  qualifiedName(id: string): string | null {
    const hit = this.qnames.get(id)
    if (hit !== undefined) return hit
    let result: string | null
    const el = this.get(id)
    const name = el ? this.name(id) : undefined
    if (!el || name === undefined) result = null
    else {
      const ns = this.owningNamespace(id)
      if (!ns || ns['@id'] === this.model.rootId || ns['@id'] === this.model.library?.rootId) result = quote(name)
      else {
        const parent = this.qualifiedName(ns['@id'])
        result = parent === null ? null : `${parent}::${quote(name)}`
      }
    }
    this.qnames.set(id, result)
    return result
  }

  /** A readable label even for unnamed elements (e.g. connections): metaclass and owner. */
  label(id: string): string {
    return this.qualifiedName(id) ?? (this.name(id) ? this.name(id)! : `(${this.get(id)?.['@type'] ?? 'missing'})`)
  }

  // ---- specialization ---------------------------------------------------------------------
  /** Direct generals including the implied one (see IMPLIED_GENERALS). */
  generals(id: string): string[] {
    const explicit = this.explicitGenerals(id)
    if (explicit.length) return explicit
    const implied = this.impliedGeneral(id)
    return implied ? [implied] : []
  }

  /** The library base type or feature an element implicitly specializes, if it has no explicit general. */
  impliedGeneral(id: string): string | undefined {
    const hit = this.impliedCache.get(id)
    if (hit !== undefined) return hit ?? undefined
    let out: string | null = null
    const t = this.get(id)?.['@type']
    if (t && !NO_IMPLIED.some((k) => isKindOf(t, k))) {
      const entry = IMPLIED_GENERALS.find((e) => isKindOf(t, e.kind))
      if (entry) {
        const libRoot = this.model.library?.rootId ?? this.model.rootId
        const pkg = this.membersNamed(libRoot, entry.general[0])[0]
        const pkgEl = pkg ? this.memberElement(pkg) : undefined
        const m = pkgEl ? this.memberships(pkgEl['@id']).find((x) => this.memberName(x) === entry.general[1]) : undefined
        const g = m ? this.memberElement(m)?.['@id'] : undefined
        if (g && g !== id) out = g
        // While the library itself is being built, its package may not exist yet: do not cache a miss.
        if (!pkgEl) return undefined
      }
    }
    this.impliedCache.set(id, out)
    return out ?? undefined
  }

  /** Direct explicit generals: superclassifiers, types, subsetted/redefined/referenced features, conjugation originals. */
  explicitGenerals(id: string): string[] {
    const out: string[] = []
    for (const r of this.ownedRelationships(id)) {
      const prop = generalProperty(r['@type'])
      if (prop) {
        const g = this.ref(r, prop)
        if (g) out.push(g)
      } else if (isKindOf(r['@type'], 'Conjugation')) {
        const g = this.ref(r, 'originalPortDefinition') ?? this.ref(r, 'originalType')
        if (g) out.push(g)
      }
    }
    return out
  }

  /** All generals, transitively (cycle-safe), excluding the element itself. */
  allGenerals(id: string): string[] {
    const seen = new Set<string>([id])
    const out: string[] = []
    const stack = this.generals(id)
    while (stack.length) {
      const g = stack.pop()!
      if (seen.has(g)) continue
      seen.add(g)
      out.push(g)
      stack.push(...this.generals(g))
    }
    return out
  }

  /** True if `general` is reachable from `id` through specializations (or equals it). */
  conformsTo(id: string, general: string): boolean {
    return id === general || this.allGenerals(id).includes(general)
  }

  /** Types of a feature: its own typings, plus those of subsetted/redefined/referenced features. */
  featureTypes(id: string): string[] {
    const out = new Set<string>()
    const seen = new Set<string>()
    const visit = (f: string) => {
      if (seen.has(f)) return
      seen.add(f)
      for (const r of this.ownedRelationships(f)) {
        const t = r['@type']
        if (isKindOf(t, 'FeatureTyping')) {
          const ty = this.ref(r, isKindOf(t, 'ConjugatedPortTyping') ? 'conjugatedPortDefinition' : 'type')
          if (ty) out.add(ty)
        } else if (isKindOf(t, 'Subsetting')) {
          const g = this.ref(r, generalProperty(t)!)
          if (g) visit(g)
        }
      }
      // A chain feature's type is the type of its last chaining feature.
      const chain = this.ownedRelationships(f).filter((r) => r['@type'] === 'FeatureChaining')
      if (chain.length) {
        const last = this.ref(chain[chain.length - 1], 'chainingFeature')
        if (last) visit(last)
      }
    }
    visit(id)
    return [...out]
  }

  // ---- memberships visible in a namespace ------------------------------------------------
  /** Memberships inherited from generals (public and protected), minus those redefined here. */
  inheritedMemberships(id: string, visited = new Set<string>()): Element[] {
    if (visited.has(id)) return []
    visited.add(id)
    const redefined = new Set<string>()
    for (const m of this.ownedMembers(id)) {
      for (const r of this.ownedRelationships(m['@id'])) if (isKindOf(r['@type'], 'Redefinition')) {
        const t = this.ref(r, 'redefinedFeature')
        if (t) redefined.add(t)
      }
    }
    const out: Element[] = []
    for (const g of this.generals(id)) {
      const gEl = this.get(g)
      if (!gEl) continue
      for (const m of this.memberships(g)) {
        if (m.visibility === 'private' || isKindOf(m['@type'], 'Import')) continue
        const e = this.memberElement(m)
        if (e && !redefined.has(e['@id'])) out.push(m)
      }
      for (const m of this.inheritedMemberships(g, visited)) {
        const e = this.memberElement(m)
        if (e && !redefined.has(e['@id'])) out.push(m)
      }
    }
    return out
  }

  /** Memberships brought in by the namespace's imports. `publicOnly`: only imports that re-export. */
  importedMemberships(id: string, publicOnly: boolean, visited = new Set<string>()): Element[] {
    if (visited.has(id)) return []
    visited.add(id)
    const out: Element[] = []
    for (const imp of this.ownedRelationships(id)) {
      if (!isKindOf(imp['@type'], 'Import')) continue
      if (publicOnly && (imp.visibility ?? 'private') !== 'public') continue
      const recursive = imp.isRecursive === true
      if (imp['@type'] === 'NamespaceImport') {
        const ns = this.ref(imp, 'importedNamespace')
        if (!ns) continue
        const members = this.publicMemberships(ns, visited)
        out.push(...members)
        if (recursive) for (const m of members) this.recursiveMembers(m, out, new Set(visited))
      } else {
        const target = this.get(this.ref(imp, 'importedMembership'))
        if (!target) continue
        out.push(target)
        if (recursive) this.recursiveMembers(target, out, new Set(visited))
      }
    }
    return out
  }

  private recursiveMembers(m: Element, out: Element[], visited: Set<string>) {
    const el = this.memberElement(m)
    if (!el || !isKindOf(el['@type'], 'Namespace') || visited.has(el['@id'])) return
    visited.add(el['@id'])
    for (const sub of this.memberships(el['@id'])) {
      if (sub.visibility === 'private' || !isKindOf(sub['@type'], 'Membership')) continue
      out.push(sub)
      this.recursiveMembers(sub, out, visited)
    }
  }

  /** Memberships visible from outside a namespace: public owned, public inherited, public imports. */
  publicMemberships(id: string, visited = new Set<string>()): Element[] {
    const own = this.memberships(id).filter((m) => (m.visibility ?? 'public') === 'public')
    const el = this.get(id)
    const inherited = el && isKindOf(el['@type'], 'Type') ? this.inheritedMemberships(id).filter((m) => (m.visibility ?? 'public') === 'public') : []
    return [...own, ...inherited, ...this.importedMemberships(id, true, visited)]
  }

  private indexFor(id: string): Map<string, Element[]> {
    let idx = this.nameIndex.get(id)
    if (idx) return idx
    idx = new Map()
    const add = (m: Element) => {
      for (const n of [this.memberName(m), this.memberShortName(m)]) {
        if (n === undefined) continue
        const list = idx!.get(n) ?? []
        list.push(m)
        idx!.set(n, list)
      }
    }
    for (const m of this.memberships(id)) add(m)
    // Inherited after owned, imports last: the first hit wins.
    const el = this.get(id)
    if (el && isKindOf(el['@type'], 'Type')) for (const m of this.inheritedMemberships(id)) add(m)
    for (const m of this.importedMemberships(id, false)) add(m)
    this.nameIndex.set(id, idx)
    return idx
  }

  /** Members of `nsId` named `name` (owned, inherited, imported), visible from inside. */
  membersNamed(nsId: string, name: string, exclude?: string): Element[] {
    const list = this.indexFor(nsId).get(name) ?? []
    return exclude ? list.filter((m) => this.memberElement(m)?.['@id'] !== exclude) : list
  }

  /** Public member lookup used for qualified-name segments after the first. */
  publicMemberNamed(nsId: string, name: string): Element | undefined {
    return this.publicMemberships(nsId).find((m) => this.memberName(m) === name || this.memberShortName(m) === name)
  }

  /** Resolves a simple name from a scope: the scope, its enclosing namespaces, then the global namespace. */
  lookup(scopeId: string, name: string, exclude?: string): Resolved | undefined {
    let cur: Element | undefined = this.get(scopeId)
    while (cur) {
      if (isKindOf(cur['@type'], 'Namespace')) {
        const hit = this.membersNamed(cur['@id'], name, exclude)[0]
        if (hit) return this.resolved(hit)
      }
      cur = this.enclosingNamespace(cur['@id'])
    }
    for (const root of [this.model.rootId, this.model.library?.rootId]) {
      if (!root) continue
      const hit = this.membersNamed(root, name, exclude)[0]
      if (hit) return this.resolved(hit)
    }
    return undefined
  }

  private resolved(m: Element): Resolved | undefined {
    const element = this.memberElement(m)
    return element ? { membership: m, element } : undefined
  }

  /** Resolves `A::B::c` from a scope. */
  resolveQualified(scopeId: string, segments: string[], exclude?: string): Resolved | undefined {
    let hit = this.lookup(scopeId, segments[0], segments.length === 1 ? exclude : undefined)
    for (let k = 1; k < segments.length && hit; k++) {
      const m = this.publicMemberNamed(hit.element['@id'], segments[k])
      hit = m ? this.resolved(m) : undefined
    }
    return hit
  }

  /** Resolves a name as a feature of the given types (owned or inherited), for feature chains. */
  featureOf(ownerFeatureOrType: string, name: string): Resolved | undefined {
    const el = this.get(ownerFeatureOrType)
    if (!el) return undefined
    const types = this.featureTypes(ownerFeatureOrType)
    const implied = types.length ? undefined : this.impliedGeneral(ownerFeatureOrType)
    const candidates = [ownerFeatureOrType, ...types, ...(implied ? [implied, ...this.featureTypes(implied)] : [])]
    for (const c of candidates) {
      const m = this.membersNamed(c, name)[0]
      if (m) return this.resolved(m)
    }
    return undefined
  }
}

const BASIC_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export function quote(name: string): string {
  return BASIC_NAME.test(name) && !KEYWORDS.has(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}
