import { isKindOf, refId, semanticsOf, serializeExpression, type Element, type Model, type Semantics } from '@ews/sysml-core'
import { connectorEnds, keywordOf, type Graph, type GraphEdge, type GraphNode, type GraphPort } from './graph'

/**
 * Behaviour views (SysML v2 Action Flow View and State Transition View presentations) as
 * projections of the semantic model (ADR-0035). Descriptive only: nothing here executes.
 */

const label = (s: Semantics, id: string | undefined) => (id ? (s.name(id) ?? s.shortName(id) ?? `(${s.get(id)?.['@type'] ?? '?'})`) : '?')

/** Nearest action (not state) definition or usage around an element, for the Action Flow View. */
export function actionFlowContext(model: Model, id: string | null | undefined): string | undefined {
  const s = semanticsOf(model)
  let cur = id ? s.get(id) : undefined
  for (let k = 0; cur && k < 40; k++) {
    const t = cur['@type']
    if ((isKindOf(t, 'ActionDefinition') || isKindOf(t, 'ActionUsage')) && !isKindOf(t, 'StateDefinition') && !isKindOf(t, 'StateUsage') && !isKindOf(t, 'ConnectorAsUsage') && !isKindOf(t, 'TransitionUsage') && !model.isLibrary(cur['@id']) && s.ownedMembers(cur['@id']).some((m) => isActionNode(m))) return cur['@id']
    if (isKindOf(t, 'Package')) return undefined
    cur = s.owner(cur['@id'])
  }
  return undefined
}

/** Nearest state definition or usage with states, for the State Transition View. */
export function stateTransitionContext(model: Model, id: string | null | undefined): string | undefined {
  const s = semanticsOf(model)
  let cur = id ? s.get(id) : undefined
  for (let k = 0; cur && k < 40; k++) {
    const t = cur['@type']
    if ((isKindOf(t, 'StateDefinition') || isKindOf(t, 'StateUsage')) && !model.isLibrary(cur['@id']) && s.ownedMembers(cur['@id']).some((m) => isKindOf(m['@type'], 'StateUsage'))) return cur['@id']
    if (isKindOf(t, 'Package')) return undefined
    cur = s.owner(cur['@id'])
  }
  return undefined
}

function isActionNode(m: Element): boolean {
  const t = m['@type']
  return isKindOf(t, 'ActionUsage') && !isKindOf(t, 'ConnectorAsUsage') && !isKindOf(t, 'TransitionUsage') && !isKindOf(t, 'StateUsage')
}

function parameters(s: Semantics, ownerNodeId: string, actionId: string): GraphPort[] {
  const out: GraphPort[] = []
  const seen = new Set<string>()
  for (const src of [actionId, ...s.featureTypes(actionId)]) {
    for (const p of s.ownedMembers(src)) {
      if (seen.has(p['@id']) || typeof p.direction !== 'string' || !isKindOf(p['@type'], 'Feature')) continue
      seen.add(p['@id'])
      const types = s.featureTypes(p['@id']).map((t) => label(s, t)).join(', ')
      out.push({ id: `${ownerNodeId}/${p['@id']}`, elementId: p['@id'], name: `${p.direction} ${label(s, p['@id'])}`, direction: p.direction, conjugated: false, typeName: types })
    }
  }
  return out
}

/** SysML v2 Action Flow View of an action definition or usage. */
export function actionFlowView(model: Model, contextId: string): Graph {
  const s = semanticsOf(model)
  const ctx = s.get(contextId)
  if (!ctx) return { nodes: [], edges: [], omitted: 0, notes: ['The element no longer exists.'] }
  const actions = s.ownedMembers(contextId).filter(isActionNode)
  const children: GraphNode[] = actions.map((a) => ({
    id: a['@id'],
    elementId: a['@id'],
    metaclass: a['@type'],
    keyword: keywordOf(a),
    name: `${label(s, a['@id'])}${s.featureTypes(a['@id']).length ? ` : ${s.featureTypes(a['@id']).map((t) => label(s, t)).join(', ')}` : ''}`,
    compartments: [],
    ports: parameters(s, a['@id'], a['@id']),
    children: [],
  }))
  const root: GraphNode = { id: `ctx:${contextId}`, elementId: contextId, metaclass: ctx['@type'], keyword: keywordOf(ctx), name: label(s, contextId), compartments: [], ports: parameters(s, `ctx:${contextId}`, contextId), children, isContext: true }
  const edges: GraphEdge[] = []
  const notes: string[] = []
  const nodeOf = (id: string | undefined) => (id && children.some((c) => c.id === id) ? id : undefined)
  // The standard library's start and done (Actions::Action), reached through the implied specialization.
  const libraryAction = (id: string | undefined, name: 'start' | 'done') => !!id && model.isLibrary(id) && s.name(id) === name
  const pseudo = (shape: 'initial' | 'final') => {
    const pid = `${shape}:${contextId}`
    if (!children.some((c) => c.id === pid)) children[shape === 'initial' ? 'unshift' : 'push']({ id: pid, elementId: contextId, metaclass: shape === 'initial' ? 'Initial' : 'Final', keyword: shape === 'initial' ? 'start' : 'done', name: '', compartments: [], ports: [], children: [], shape })
    return pid
  }
  // Initial node: `first x;` (a nameless membership) or an unnamed entry followed by `then x`.
  for (const m of s.memberships(contextId)) {
    if (m['@type'] !== 'Membership' || typeof m.memberName === 'string') continue
    const target = nodeOf(refId(m, 'memberElement'))
    if (libraryAction(refId(m, 'memberElement'), 'start')) continue
    if (target) {
      pseudo('initial')
      edges.push({ id: `initial-edge:${m['@id']}`, kind: 'succession', source: `initial:${contextId}`, target })
    } else notes.push(`The initial node refers to ${label(s, refId(m, 'memberElement'))}, which is not shown in this view.`)
  }
  for (const u of s.ownedMembers(contextId)) {
    if (u['@type'] === 'SuccessionAsUsage') {
      const [a, b] = connectorEnds(s, u['@id'])
      const aEnd = a?.[a.length - 1]
      const bEnd = b?.[b.length - 1]
      const src = nodeOf(aEnd) ?? (libraryAction(aEnd, 'start') ? pseudo('initial') : undefined)
      const tgt = nodeOf(bEnd) ?? (libraryAction(bEnd, 'done') ? pseudo('final') : undefined)
      if (src && tgt) edges.push({ id: u['@id'], elementId: u['@id'], kind: 'succession', source: src, target: tgt, label: s.name(u['@id']) })
      else notes.push(`A succession to or from ${[a, b].map((c) => (c?.length ? label(s, c[c.length - 1]) : '?')).join(' / ')} is not shown (not an action of this view).`)
    } else if (u['@type'] === 'FlowUsage') {
      const [a, b] = connectorEnds(s, u['@id'])
      const end = (c: string[] | undefined) => {
        if (!c?.length) return undefined
        if (c.length >= 2 && nodeOf(c[0])) return children.find((n) => n.id === c[0])!.ports.find((p) => p.elementId === c[1])?.id ?? c[0]
        return root.ports.find((p) => p.elementId === c[0])?.id ?? nodeOf(c[0])
      }
      const src = end(a)
      const tgt = end(b)
      const payload = s.ownedMembers(u['@id']).find((m) => m['@type'] === 'PayloadFeature')
      const item = payload ? s.featureTypes(payload['@id']).map((t) => label(s, t)).join(', ') : ''
      if (src && tgt) edges.push({ id: u['@id'], elementId: u['@id'], kind: 'flow', source: src, target: tgt, label: item ? `«flow» ${item}` : '«flow»' })
    }
  }
  if (!actions.length) notes.push(`${label(s, contextId)} has no actions. Add action usages (e.g. “action a; then action b;”).`)
  return { nodes: [root], edges, omitted: 0, notes }
}

function subactions(s: Semantics, stateId: string): { id: string; text: string }[] {
  return s
    .memberships(stateId)
    .filter((m) => m['@type'] === 'StateSubactionMembership')
    .map((m) => {
      const a = s.memberElement(m)!
      return { id: a['@id'], text: `${m.kind} ${a.declaredName ? `action ${label(s, a['@id'])}` : '(action)'}` }
    })
}

/** SysML v2 State Transition View of a state definition or usage. */
export function stateTransitionView(model: Model, contextId: string): Graph {
  const s = semanticsOf(model)
  const ctx = s.get(contextId)
  if (!ctx) return { nodes: [], edges: [], omitted: 0, notes: ['The element no longer exists.'] }
  const states = s.ownedMembers(contextId).filter((m) => isKindOf(m['@type'], 'StateUsage'))
  const children: GraphNode[] = states.map((st) => {
    const subs = subactions(s, st['@id'])
    const nested = s.ownedMembers(st['@id']).filter((m) => isKindOf(m['@type'], 'StateUsage'))
    const comps: GraphNode['compartments'] = []
    if (subs.length) comps.push({ title: 'actions', items: subs })
    if (nested.length) comps.push({ title: 'substates', items: nested.map((n) => ({ id: n['@id'], text: label(s, n['@id']) })) })
    return { id: st['@id'], elementId: st['@id'], metaclass: st['@type'], keyword: st.isParallel ? 'parallel state' : 'state', name: label(s, st['@id']), compartments: comps, ports: [], children: [] }
  })
  const root: GraphNode = { id: `ctx:${contextId}`, elementId: contextId, metaclass: ctx['@type'], keyword: keywordOf(ctx), name: label(s, contextId), compartments: [], ports: [], children, isContext: true }
  const edges: GraphEdge[] = []
  const notes: string[] = []
  const nodeOf = (id: string | undefined) => (id && children.some((c) => c.id === id) ? id : undefined)
  // Initial state: `entry; then x;` — a succession from the context's entry action.
  const entries = new Set(s.memberships(contextId).filter((m) => m['@type'] === 'StateSubactionMembership' && m.kind === 'entry').map((m) => s.memberElement(m)!['@id']))
  for (const u of s.ownedMembers(contextId)) {
    if (u['@type'] === 'SuccessionAsUsage') {
      const [a, b] = connectorEnds(s, u['@id'])
      const tgt = nodeOf(b?.[b.length - 1])
      if (a?.length && entries.has(a[a.length - 1]) && tgt) {
        if (!children.some((c) => c.id === `initial:${contextId}`)) children.unshift({ id: `initial:${contextId}`, elementId: contextId, metaclass: 'Initial', keyword: 'initial', name: '', compartments: [], ports: [], children: [], shape: 'initial' })
        edges.push({ id: u['@id'], elementId: u['@id'], kind: 'succession', source: `initial:${contextId}`, target: tgt })
      }
    } else if (u['@type'] === 'TransitionUsage') {
      const sourceMem = s.ownedRelationships(u['@id']).find((r) => r['@type'] === 'Membership')
      const src = nodeOf(sourceMem ? refId(sourceMem, 'memberElement') : undefined)
      const succ = s.ownedMembers(u['@id']).find((m) => m['@type'] === 'SuccessionAsUsage')
      const ends = succ ? connectorEnds(s, succ['@id']) : []
      const tgt = nodeOf(ends[1]?.[ends[1].length - 1])
      const parts: string[] = []
      for (const r of s.ownedRelationships(u['@id'])) {
        if (r['@type'] !== 'TransitionFeatureMembership') continue
        const x = s.get(refId(r, 'ownedRelatedElement'))!
        if (r.kind === 'trigger') {
          const payload = s.ownedMembers(x['@id'])[0]
          const types = payload ? s.featureTypes(payload['@id']).map((t) => label(s, t)).join(', ') : ''
          if (types) parts.push(types)
        } else if (r.kind === 'guard') parts.push(`[${serializeExpression(model, x['@id'], contextId)}]`)
      }
      const name = s.name(u['@id'])
      const text = [parts.join(' '), name ? `(${name})` : ''].filter(Boolean).join(' ')
      if (src && tgt) edges.push({ id: u['@id'], elementId: u['@id'], kind: 'transition', source: src, target: tgt, label: text || undefined })
      else notes.push(`Transition ${label(s, u['@id'])} connects states outside this view.`)
    }
  }
  if (!states.length) notes.push(`${label(s, contextId)} has no states.`)
  return { nodes: [root], edges, omitted: 0, notes }
}
