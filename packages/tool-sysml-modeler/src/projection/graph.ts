import { definitionKeyword, featureValue, formatValue, isKindOf, refId, semanticsOf, usageKeyword, type Element, type Model, type Semantics } from '@ews/sysml-core'

/**
 * View projections (ADR-0035): pure functions from the semantic model to a graph. Diagrams are
 * computed from the model at every change; nothing in a graph is engineering data.
 */

export interface CompartmentItem {
  id: string
  text: string
}

export interface GraphPort {
  /** Unique within the graph: `${ownerNodeId}/${portElementId}`. */
  id: string
  elementId: string
  name: string
  direction?: string
  conjugated: boolean
  typeName?: string
}

export interface GraphNode {
  id: string
  elementId: string
  metaclass: string
  /** Keyword line, e.g. «part def», «requirement». */
  keyword: string
  name: string
  shortName?: string
  compartments: { title: string; items: CompartmentItem[] }[]
  ports: GraphPort[]
  children: GraphNode[]
  /** The view's own context (interconnection root). */
  isContext?: boolean
  /** Shown because a member refers to it; owned by another namespace. */
  isExternal?: boolean
  /** Pseudo-node shape (behaviour views): the initial node or initial-state marker. */
  shape?: 'initial' | 'final'
}

export type EdgeKind = 'specialization' | 'composition' | 'typing' | 'satisfy' | 'allocate' | 'connection' | 'interface' | 'flow' | 'binding' | 'succession' | 'transition'

export interface GraphEdge {
  id: string
  /** Element the edge stands for (relationship or connector usage); absent for derived edges. */
  elementId?: string
  kind: EdgeKind
  source: string
  target: string
  label?: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Elements not shown because of the size limit. */
  omitted: number
  notes: string[]
}

export const MAX_NODES = 120

const label = (s: Semantics, id: string | undefined) => (id ? (s.name(id) ?? s.shortName(id) ?? `(${s.get(id)?.['@type'] ?? '?'})`) : '?')

function typeNames(s: Semantics, featureId: string): string {
  const t = s.featureTypes(featureId)
  return t.map((x) => {
    const el = s.get(x)
    if (el?.['@type'] === 'ConjugatedPortDefinition') return `~${label(s, s.owner(x)?.['@id'])}`
    return label(s, x)
  }).join(', ')
}

function multiplicity(s: Semantics, featureId: string): string {
  const range = s.ownedMembers(featureId).find((m) => m['@type'] === 'MultiplicityRange')
  if (!range) return ''
  const b = s.ownedMembers(range['@id']).map((x) => (x['@type'] === 'LiteralInfinity' ? '*' : String(x.value)))
  return `[${b.join('..')}]`
}

export function featureText(model: Model, s: Semantics, f: Element): string {
  const name = label(s, f['@id'])
  const types = typeNames(s, f['@id'])
  const mult = multiplicity(s, f['@id'])
  const hasValue = s.ownedRelationships(f['@id']).some((r) => r['@type'] === 'FeatureValue')
  const v = hasValue ? featureValue(model, f['@id']) : undefined
  const dir = typeof f.direction === 'string' ? `${f.direction} ` : ''
  return `${dir}${name}${types ? ` : ${types}` : ''}${mult}${v && v.kind !== 'unknown' ? ` = ${formatValue(v)}` : ''}`
}

export function keywordOf(el: Element): string {
  const t = el['@type']
  const d = definitionKeyword(t)
  if (d) return `${el.isAbstract ? 'abstract ' : ''}${d} def`
  const u = usageKeyword(t)
  if (u) return u
  if (t === 'Package' || t === 'LibraryPackage') return t === 'LibraryPackage' ? 'library package' : 'package'
  if (t === 'SatisfyRequirementUsage') return 'satisfy'
  return t
}

const COMPARTMENT_KINDS: { title: string; test: (t: string) => boolean }[] = [
  { title: 'attributes', test: (t) => isKindOf(t, 'AttributeUsage') },
  { title: 'ports', test: (t) => t === 'PortUsage' },
  { title: 'parts', test: (t) => t === 'PartUsage' },
  { title: 'items', test: (t) => t === 'ItemUsage' },
  { title: 'actions', test: (t) => t === 'ActionUsage' || t === 'CalculationUsage' },
  { title: 'states', test: (t) => t === 'StateUsage' },
  { title: 'parameters', test: (t) => t === 'ReferenceUsage' },
  { title: 'constraints', test: (t) => t === 'ConstraintUsage' },
  { title: 'requirements', test: (t) => t === 'RequirementUsage' },
]

function compartments(model: Model, s: Semantics, id: string): GraphNode['compartments'] {
  const members = s.ownedMembers(id)
  const out: GraphNode['compartments'] = []
  const doc = members.find((m) => m['@type'] === 'Documentation')
  const el = s.get(id)!
  if (isKindOf(el['@type'], 'RequirementDefinition') || isKindOf(el['@type'], 'RequirementUsage')) {
    if (doc) out.push({ title: 'doc', items: [{ id: doc['@id'], text: String(doc.body ?? '') }] })
  }
  for (const c of COMPARTMENT_KINDS) {
    const items = members.filter((m) => c.test(m['@type'])).map((m) => ({ id: m['@id'], text: `${s.owningMembership(m['@id'])?.['@type'] === 'SubjectMembership' ? 'subject ' : ''}${featureText(model, s, m)}` }))
    if (items.length) out.push({ title: c.title, items })
  }
  return out
}

function node(model: Model, s: Semantics, el: Element): GraphNode {
  return { id: el['@id'], elementId: el['@id'], metaclass: el['@type'], keyword: keywordOf(el), name: label(s, el['@id']), shortName: s.shortName(el['@id']), compartments: compartments(model, s, el['@id']), ports: [], children: [] }
}

const EDGE_USAGES = new Set(['ConnectionUsage', 'InterfaceUsage', 'FlowUsage', 'BindingConnectorAsUsage', 'SuccessionAsUsage', 'AllocationUsage', 'SatisfyRequirementUsage', 'TransitionUsage'])

/** End targets of a connector usage: for each end, the chain of features it references. */
export function connectorEnds(s: Semantics, connectorId: string): string[][] {
  const ends = s.memberships(connectorId).filter((m) => m['@type'] === 'EndFeatureMembership').map((m) => s.memberElement(m)!)
  return ends.map((end) => {
    const rs = s.ownedRelationships(end['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
    const target = rs ? refId(rs, 'referencedFeature') : undefined
    if (!target) return []
    const chain = s.ownedRelationships(target).filter((r) => r['@type'] === 'FeatureChaining')
    return chain.length ? chain.map((c) => refId(c, 'chainingFeature')!).filter(Boolean) : [target]
  })
}

/**
 * SysML v2 General View of a namespace: its direct members (nested packages as package nodes that
 * list their contents), with specialization, composition, typing, satisfy and allocate edges.
 * Definitions referenced from other namespaces appear as compact external nodes (qualified name).
 */
export function generalView(model: Model, rootId: string): Graph {
  const s = semanticsOf(model)
  const members: Element[] = []
  const relationshipUsages: Element[] = []
  const root = s.get(rootId)
  if (root && isKindOf(root['@type'], 'Definition')) {
    members.push(root)
    for (const m of s.ownedMembers(rootId)) if (EDGE_USAGES.has(m['@type'])) relationshipUsages.push(m)
  } else {
    for (const m of s.ownedMembers(rootId)) {
      const t = m['@type']
      if (EDGE_USAGES.has(t)) relationshipUsages.push(m)
      else if (t === 'Package' || t === 'LibraryPackage' || (isKindOf(t, 'Definition') && t !== 'ConjugatedPortDefinition') || (isKindOf(t, 'Usage') && t !== 'MetadataUsage')) members.push(m)
    }
  }
  const shown = members.slice(0, MAX_NODES)
  const nodes: GraphNode[] = shown.map((el) => (el['@type'] === 'Package' || el['@type'] === 'LibraryPackage' ? packageNode(s, el) : node(model, s, el)))
  const ids = new Set(nodes.map((n) => n.id))
  let externals = 0
  // External names are shown relative to the namespace that contains the view's root.
  const rootOwner = s.owningNamespace(rootId)
  const ownerQ = rootOwner && rootOwner['@id'] !== model.rootId ? s.qualifiedName(rootOwner['@id']) : null
  const prefix = ownerQ ? `${ownerQ}::` : ''
  /** Shows a referenced element from another namespace as an external node (not library elements). */
  const ensure = (id: string | undefined): boolean => {
    if (!id) return false
    if (ids.has(id)) return true
    const el = s.get(id)
    if (!el || model.isLibrary(id) || externals >= 40) return false
    if (!isKindOf(el['@type'], 'Definition') && !isKindOf(el['@type'], 'Usage')) return false
    externals++
    ids.add(id)
    const q = s.qualifiedName(id) ?? label(s, id)
    nodes.push({ id, elementId: id, metaclass: el['@type'], keyword: keywordOf(el), name: prefix && q.startsWith(prefix) ? q.slice(prefix.length) : q, shortName: s.shortName(id), compartments: [], ports: [], children: [], isExternal: true })
    return true
  }
  const edges: GraphEdge[] = []
  for (const el of shown) {
    if (el['@type'] === 'Package' || el['@type'] === 'LibraryPackage') continue
    for (const r of s.ownedRelationships(el['@id'])) {
      if (r['@type'] === 'Subclassification') {
        const g = refId(r, 'superclassifier')
        if (ensure(g)) edges.push({ id: r['@id'], elementId: r['@id'], kind: 'specialization', source: el['@id'], target: g! })
      }
      if (isKindOf(el['@type'], 'Usage') && isKindOf(r['@type'], 'FeatureTyping')) {
        const t = refId(r, r['@type'] === 'ConjugatedPortTyping' ? 'conjugatedPortDefinition' : 'type')
        if (ensure(t)) edges.push({ id: r['@id'], elementId: r['@id'], kind: 'typing', source: el['@id'], target: t! })
      }
    }
    if (isKindOf(el['@type'], 'Definition')) {
      for (const f of s.ownedMembers(el['@id'])) {
        if (f['@type'] !== 'PartUsage' && f['@type'] !== 'ItemUsage') continue
        for (const t of s.featureTypes(f['@id'])) if (t !== el['@id'] && ensure(t)) edges.push({ id: `comp:${f['@id']}:${t}`, elementId: f['@id'], kind: 'composition', source: el['@id'], target: t, label: `${label(s, f['@id'])}${multiplicity(s, f['@id'])}` })
      }
    }
  }
  for (const u of relationshipUsages) {
    if (u['@type'] === 'SatisfyRequirementUsage') {
      const rs = s.ownedRelationships(u['@id']).find((r) => r['@type'] === 'ReferenceSubsetting')
      const req = rs ? refId(rs, 'referencedFeature') : undefined
      const subj = s.memberships(u['@id']).find((m) => m['@type'] === 'SubjectMembership')
      const subject = subj && s.memberElement(subj)
      const fv = subject && s.ownedRelationships(subject['@id']).find((r) => r['@type'] === 'FeatureValue')
      const expr = fv && s.get(refId(fv, 'ownedRelatedElement'))
      const mem = expr && s.memberships(expr['@id'])[0]
      const by = mem && s.memberElement(mem)?.['@id']
      if (req && by && ensure(by) && ensure(req)) edges.push({ id: u['@id'], elementId: u['@id'], kind: 'satisfy', source: by, target: req, label: '«satisfy»' })
    } else if (u['@type'] === 'AllocationUsage') {
      const [a, b] = connectorEnds(s, u['@id'])
      const src = a?.[0]
      const tgt = b?.[0]
      if (src && tgt && ensure(src) && ensure(tgt)) edges.push({ id: u['@id'], elementId: u['@id'], kind: 'allocate', source: src, target: tgt, label: `«allocate»${b.length > 1 ? ` ${b.slice(1).map((x) => label(s, x)).join('.')}` : ''}` })
    }
  }
  const notes: string[] = []
  if (members.length > MAX_NODES) notes.push(`Showing ${MAX_NODES} of ${members.length} members; open a nested package to see the rest.`)
  if (externals) notes.push(`${externals} element${externals === 1 ? '' : 's'} from other packages shown with their qualified names (dashed).`)
  return { nodes, edges, omitted: Math.max(0, members.length - MAX_NODES), notes }
}

function packageNode(s: Semantics, el: Element): GraphNode {
  const owned = s.ownedMembers(el['@id']).filter((m) => m['@type'] !== 'Documentation' && m['@type'] !== 'Comment' && !EDGE_USAGES.has(m['@type']))
  const items = owned.slice(0, 12).map((m) => ({ id: m['@id'], text: `${keywordOf(m)} ${label(s, m['@id'])}` }))
  if (owned.length > 12) items.push({ id: `${el['@id']}:more`, text: `… and ${owned.length - 12} more` })
  return { id: el['@id'], elementId: el['@id'], metaclass: el['@type'], keyword: keywordOf(el), name: label(s, el['@id']), compartments: items.length ? [{ title: 'members', items }] : [], ports: [], children: [] }
}

/** Definition whose internal structure an Interconnection View shows for a context element. */
export function interconnectionContext(model: Model, id: string): string | undefined {
  const s = semanticsOf(model)
  const el = s.get(id)
  if (!el) return undefined
  if (isKindOf(el['@type'], 'PartDefinition') || isKindOf(el['@type'], 'ItemDefinition')) return id
  if (isKindOf(el['@type'], 'PartUsage') || isKindOf(el['@type'], 'ItemUsage')) return s.featureTypes(id).find((t) => isKindOf(s.get(t)?.['@type'] ?? '', 'PartDefinition')) ?? id
  return undefined
}

function portsOf(s: Semantics, ownerNodeId: string, featureOrDef: string): GraphPort[] {
  const sources = [featureOrDef, ...s.featureTypes(featureOrDef)]
  const seen = new Set<string>()
  const out: GraphPort[] = []
  for (const src of sources) {
    for (const m of s.ownedMembers(src)) {
      if (m['@type'] !== 'PortUsage' || seen.has(m['@id'])) continue
      seen.add(m['@id'])
      const t = s.featureTypes(m['@id'])
      const conjugated = t.some((x) => s.get(x)?.['@type'] === 'ConjugatedPortDefinition')
      out.push({ id: `${ownerNodeId}/${m['@id']}`, elementId: m['@id'], name: label(s, m['@id']), direction: typeof m.direction === 'string' ? m.direction : undefined, conjugated, typeName: typeNames(s, m['@id']) })
    }
  }
  return out
}

/** SysML v2 Interconnection View of a part definition (or usage): parts, ports and connections. */
export function interconnectionView(model: Model, contextId: string): Graph {
  const s = semanticsOf(model)
  const ctx = s.get(contextId)
  if (!ctx) return { nodes: [], edges: [], omitted: 0, notes: ['The element no longer exists.'] }
  const parts = s.ownedMembers(contextId).filter((m) => m['@type'] === 'PartUsage' || m['@type'] === 'ItemUsage')
  const children: GraphNode[] = parts.slice(0, MAX_NODES).map((p) => ({
    id: p['@id'],
    elementId: p['@id'],
    metaclass: p['@type'],
    keyword: keywordOf(p),
    name: `${label(s, p['@id'])}${typeNames(s, p['@id']) ? ` : ${typeNames(s, p['@id'])}` : ''}${multiplicity(s, p['@id'])}`,
    compartments: [],
    ports: portsOf(s, p['@id'], p['@id']),
    children: [],
  }))
  const root: GraphNode = { id: `ctx:${contextId}`, elementId: contextId, metaclass: ctx['@type'], keyword: keywordOf(ctx), name: label(s, contextId), compartments: [], ports: portsOf(s, `ctx:${contextId}`, contextId), children, isContext: true }
  const endpoint = (chain: string[]): string | undefined => {
    if (!chain.length) return undefined
    if (chain.length === 1) {
      const only = chain[0]
      if (children.some((c) => c.id === only)) return only
      const rp = root.ports.find((p) => p.elementId === only)
      return rp?.id
    }
    const part = children.find((c) => c.id === chain[0])
    if (!part) return undefined
    return part.ports.find((p) => p.elementId === chain[1])?.id ?? part.id
  }
  const edges: GraphEdge[] = []
  const notes: string[] = []
  for (const u of s.ownedMembers(contextId)) {
    const kind = ({ ConnectionUsage: 'connection', InterfaceUsage: 'interface', FlowUsage: 'flow', BindingConnectorAsUsage: 'binding', SuccessionAsUsage: 'succession', AllocationUsage: 'allocate' } as Record<string, EdgeKind>)[u['@type']]
    if (!kind) continue
    const [a, b] = connectorEnds(s, u['@id'])
    const src = endpoint(a ?? [])
    const tgt = endpoint(b ?? [])
    if (!src || !tgt) {
      notes.push(`${s.label(u['@id'])} connects features outside this view.`)
      continue
    }
    let text = s.name(u['@id']) ?? ''
    const types = typeNames(s, u['@id'])
    if (types) text = `${text}${text ? ' : ' : ''}${types}`
    if (kind === 'flow') {
      const payload = s.ownedMembers(u['@id']).find((m) => m['@type'] === 'PayloadFeature')
      const pt = payload ? typeNames(s, payload['@id']) : ''
      text = `${pt ? `«flow» ${pt}` : '«flow»'}${s.name(u['@id']) ? ` ${s.name(u['@id'])}` : ''}`
    } else if (kind === 'interface') text = `«interface» ${text}`.trim()
    else if (kind === 'binding') text = '='
    edges.push({ id: u['@id'], elementId: u['@id'], kind, source: src, target: tgt, label: text || undefined })
  }
  if (!children.length) notes.push(`${label(s, contextId)} has no parts to interconnect. Add part usages to it.`)
  return { nodes: [root], edges, omitted: Math.max(0, parts.length - MAX_NODES), notes }
}

/** Port and part chains that can be connected inside a context (for the Connect dialog): `part.port`. */
export function connectableEnds(model: Model, contextId: string): { chain: string; label: string }[] {
  const s = semanticsOf(model)
  const out: { chain: string; label: string }[] = []
  for (const p of s.ownedMembers(contextId)) {
    if (p['@type'] !== 'PartUsage' && p['@type'] !== 'ItemUsage') continue
    const pn = s.name(p['@id'])
    if (!pn) continue
    out.push({ chain: pn, label: `${pn} (part)` })
    for (const port of portsOf(s, p['@id'], p['@id'])) out.push({ chain: `${pn}.${port.name}`, label: `${pn}.${port.name} : ${port.typeName ?? ''}` })
  }
  for (const port of portsOf(s, contextId, contextId)) out.push({ chain: port.name, label: `${port.name} (boundary port)` })
  return out
}
