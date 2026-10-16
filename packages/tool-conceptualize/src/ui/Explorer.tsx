import { Badge, Button, EmptyState, IconButton, LoadingState, SearchField, SegmentedControl, Select } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { ConceptListItem, Graph, Relationship } from '@ews/conceptualize-client'
import { useMemo, useState, type KeyboardEvent } from 'react'
import { MATURITIES, MATURITY, RECORDS, RELATION_LABEL, type ConceptualizeViewState, type RecordsFilter } from '../domain'
import { NewCalculationForm } from './Calculations'
import { NewFunctionForm, RecordList } from './Knowledge'
import { MaturityBadge } from './common'

interface TreeNode {
  key: string
  kind: 'concept' | 'decomposition' | 'set'
  concept?: ConceptListItem
  label: string
  status?: string
  shared?: boolean
  children: TreeNode[]
}

/** Builds the Concept hierarchy: contains links (grouped by decomposition when there are several) and alternative sets. */
export function buildTree(graph: Graph): TreeNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const contains = graph.edges.filter((e) => e.type === 'contains')
  const parentsOf = new Map<string, number>()
  for (const e of contains) parentsOf.set(e.toId, (parentsOf.get(e.toId) ?? 0) + 1)
  const members = new Set(graph.alternativeSets.flatMap((s) => s.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)))
  const build = (id: string, path: Set<string>, keyPrefix: string, status?: string): TreeNode | null => {
    const c = byId.get(id)
    if (!c || path.has(id)) return null
    const next = new Set(path).add(id)
    const key = `${keyPrefix}/${id}`
    const out = contains.filter((e) => e.fromId === id)
    const decs = graph.decompositions.filter((d) => d.parentId === id && out.some((e) => e.decompositionId === d.id))
    const children: TreeNode[] = []
    const childNode = (e: Relationship, prefix: string) => {
      const n = build(e.toId, next, prefix)
      if (n) children.push({ ...n, shared: (parentsOf.get(e.toId) ?? 0) > 1 })
    }
    if (decs.length > 1) {
      for (const d of decs) {
        const group: TreeNode = { key: `${key}/d:${d.id}`, kind: 'decomposition', label: d.name, status: d.status, children: [] }
        for (const e of out.filter((x) => x.decompositionId === d.id)) {
          const n = build(e.toId, next, group.key)
          if (n) group.children.push({ ...n, shared: (parentsOf.get(e.toId) ?? 0) > 1 })
        }
        children.push(group)
      }
      for (const e of out.filter((x) => !decs.some((d) => d.id === x.decompositionId))) childNode(e, key)
    } else for (const e of out) childNode(e, key)
    for (const s of graph.alternativeSets.filter((x) => x.parentId === id)) {
      const group: TreeNode = { key: `${key}/s:${s.id}`, kind: 'set', label: `${s.key} ${s.name}`, children: [] }
      for (const m of s.members.filter((x) => x.status !== 'withdrawn')) {
        const n = build(m.conceptId, next, group.key, m.status)
        if (n) group.children.push(n)
      }
      children.push(group)
    }
    return { key, kind: 'concept', concept: c, label: `${c.key} ${c.name}`, status, children }
  }
  return graph.nodes.filter((n) => !parentsOf.get(n.id) && !members.has(n.id)).map((n) => build(n.id, new Set(), '')).filter((n): n is TreeNode => !!n)
}

function TreeView({ nodes, openId, onOpen }: { nodes: TreeNode[]; openId: string | null; onOpen: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (key: string) => setCollapsed((c) => (c.has(key) ? new Set([...c].filter((k) => k !== key)) : new Set(c).add(key)))
  const render = (n: TreeNode, depth: number) => {
    const open = !collapsed.has(n.key)
    return (
      <li key={n.key} role="treeitem" aria-expanded={n.children.length ? open : undefined} aria-selected={n.concept?.id === openId}>
        <div className={`con-tree-row depth-${Math.min(depth, 6)}${n.concept?.id === openId ? ' is-open' : ''}`} data-kind={n.kind}>
          {n.children.length ? <IconButton size="sm" label={open ? `Collapse ${n.label}` : `Expand ${n.label}`} icon={open ? 'chevron-down' : 'chevron-right'} onPress={() => toggle(n.key)} /> : <span className="con-tree-spacer" />}
          {n.kind === 'concept' && n.concept ? (
            <Button size="sm" variant="quiet" className="con-tree-label" onPress={() => onOpen(n.concept!.id)}>
              <span className="con-key">{n.concept.key}</span> {n.concept.name}
            </Button>
          ) : (
            <span className="con-tree-group">{n.kind === 'set' ? 'Alternatives: ' : 'Decomposition: '}{n.label}</span>
          )}
          <span className="con-tree-badges">
          {n.concept && <MaturityBadge maturity={n.concept.maturity} />}
          {n.status && n.kind === 'concept' && n.status !== 'candidate' && <Badge tone={n.status === 'selected' ? 'success' : n.status === 'rejected' ? 'danger' : 'neutral'}>{n.status}</Badge>}
          {n.shared && <Badge tone="neutral" title="This Concept is part of more than one parent">shared</Badge>}
          {n.concept?.sourceKind === 'assistant' && <Badge tone="warning" icon="assistant" title="Created from an assistant proposal; contents are AI hypotheses until confirmed">AI</Badge>}
          </span>
        </div>
        {n.children.length > 0 && open && <ul role="group">{n.children.map((c) => render(c, depth + 1))}</ul>}
      </li>
    )
  }
  return (
    <ul className="con-tree" role="tree" aria-label="Concept hierarchy" data-help-id="conceptualize.explorer.tree">
      {nodes.map((n) => render(n, 0))}
    </ul>
  )
}

/** Neighbourhood graph of the open Concept (or the whole project when nothing is open), as plain SVG. */
export function GraphView({ graph, openId, onOpen }: { graph: Graph; openId: string | null; onOpen: (id: string) => void }) {
  const layout = useMemo(() => {
    const ids = new Set<string>()
    if (openId) {
      ids.add(openId)
      for (const e of graph.edges) if (e.fromId === openId || e.toId === openId) (ids.add(e.fromId), ids.add(e.toId))
      for (const s of graph.alternativeSets) if (s.parentId === openId || s.members.some((m) => m.conceptId === openId)) [s.parentId, ...s.members.filter((m) => m.status !== 'withdrawn').map((m) => m.conceptId)].forEach((i) => ids.add(i))
    } else graph.nodes.slice(0, 40).forEach((n) => ids.add(n.id))
    const nodes = graph.nodes.filter((n) => ids.has(n.id))
    const edges: { from: string; to: string; label: string; kind: string }[] = graph.edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId)).map((e) => ({ from: e.fromId, to: e.toId, label: RELATION_LABEL[e.type].out.toLowerCase(), kind: e.type }))
    for (const s of graph.alternativeSets) for (const m of s.members) if (ids.has(s.parentId) && ids.has(m.conceptId) && m.status !== 'withdrawn') edges.push({ from: s.parentId, to: m.conceptId, label: `alternative (${m.status})`, kind: 'alternative' })
    // Layered layout along hierarchical edges (contains, alternatives); other edges are drawn across.
    const level = new Map<string, number>()
    const hier = edges.filter((e) => e.kind === 'contains' || e.kind === 'alternative')
    const roots = nodes.filter((n) => !hier.some((e) => e.to === n.id)).map((n) => n.id)
    const queue: [string, number][] = roots.map((r) => [r, 0])
    for (const r of roots) level.set(r, 0)
    while (queue.length) {
      const [id, l] = queue.shift()!
      for (const e of hier.filter((x) => x.from === id)) if (!level.has(e.to) || level.get(e.to)! < l + 1) {
        if (l + 1 > nodes.length) continue
        level.set(e.to, l + 1)
        queue.push([e.to, l + 1])
      }
    }
    for (const n of nodes) if (!level.has(n.id)) level.set(n.id, 0)
    const rows = new Map<number, string[]>()
    for (const n of nodes) rows.set(level.get(n.id)!, [...(rows.get(level.get(n.id)!) ?? []), n.id])
    const W = 170
    const H = 46
    const gapX = 30
    const gapY = 70
    const pos = new Map<string, { x: number; y: number }>()
    const maxCols = Math.max(1, ...[...rows.values()].map((r) => r.length))
    for (const [l, row] of rows) row.forEach((id, i) => pos.set(id, { x: 10 + i * (W + gapX) + ((maxCols - row.length) * (W + gapX)) / 2, y: 10 + l * (H + gapY) }))
    const width = 20 + maxCols * (W + gapX)
    const height = 20 + (Math.max(0, ...rows.keys()) + 1) * (H + gapY)
    return { nodes, edges, pos, W, H, width, height }
  }, [graph, openId])
  if (!layout.nodes.length) return <EmptyState title="Nothing to show">Create a Concept to see its relationships.</EmptyState>
  const { pos, W, H } = layout
  const key = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(id)
    }
  }
  return (
    <div className="con-graph-wrap" data-help-id="conceptualize.explorer.graph">
      <svg className="con-graph" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} height={layout.height} role="group" aria-label="Concept relationship graph">
        <defs>
          <marker id="con-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="con-graph-arrow" />
          </marker>
        </defs>
        {layout.edges.map((e, i) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          const x1 = a.x + W / 2
          const y1 = a.y + H
          const x2 = b.x + W / 2
          const y2 = b.y
          const sameRow = a.y === b.y
          const d = sameRow ? `M ${a.x + W} ${a.y + H / 2} C ${a.x + W + 40} ${a.y - 30}, ${b.x - 40} ${b.y - 30}, ${b.x} ${b.y + H / 2}` : `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
          return (
            <g key={i} className={`con-edge kind-${e.kind}`}>
              <path d={d} markerEnd="url(#con-arrow)" />
              <text x={(x1 + x2) / 2} y={sameRow ? a.y - 8 : (y1 + y2) / 2 - 4} textAnchor="middle">
                {e.label}
              </text>
            </g>
          )
        })}
        {layout.nodes.map((n) => {
          const p = pos.get(n.id)!
          return (
            <g key={n.id} className={`con-node${n.id === openId ? ' is-open' : ''}`} role="button" tabIndex={0} aria-label={`Open ${n.key} ${n.name}`} onClick={() => onOpen(n.id)} onKeyDown={(e) => key(e, n.id)} transform={`translate(${p.x}, ${p.y})`}>
              <rect width={W} height={H} rx={6} />
              <text x={8} y={18} className="con-node-key">
                {n.key} · {MATURITY[n.maturity].label}
              </text>
              <text x={8} y={35}>
                {n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function ExplorerPanel({ graph, loading }: { graph: Graph | undefined; loading: boolean }) {
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const open = (id: string) => setState({ conceptId: id, record: null })
  const filtered = useMemo(() => {
    if (!graph) return []
    const t = state.search.trim().toLowerCase()
    return graph.nodes.filter((n) => (state.maturity === 'all' || n.maturity === state.maturity) && (!t || `${n.key} ${n.name} ${n.summary} ${n.classifications.join(' ')}`.toLowerCase().includes(t)))
  }, [graph, state.search, state.maturity])
  const flat = !!state.search.trim() || state.maturity !== 'all'
  const records = state.records ?? 'concepts'
  const recordType = RECORDS.find((r) => r.value === records)?.type
  return (
    <div className="con-explorer" data-help-id="conceptualize.explorer">
      <div className="con-explorer-bar" data-help-id="conceptualize.explorer.records">
        <Select ariaLabel="Record type" size="sm" value={records} onChange={(v) => setState({ records: v as RecordsFilter })} options={RECORDS.map((r) => ({ id: r.value, label: r.label }))} />
        <SearchField label={recordType ? 'Search ' + RECORDS.find((r) => r.value === records)!.label : 'Search Concepts'} placeholder={recordType ? 'Search ' + RECORDS.find((r) => r.value === records)!.label.toLowerCase() : 'Search Concepts'} value={state.search} onChange={(search) => setState({ search })} className="con-search" />
        {!recordType && <Select ariaLabel="Maturity filter" size="sm" value={state.maturity} onChange={(m) => setState({ maturity: m as ConceptualizeViewState['maturity'] })} options={[{ id: 'all', label: 'All maturities' }, ...MATURITIES.map((m) => ({ id: m, label: MATURITY[m].label }))]} />}
        {!recordType && <SegmentedControl label="Explorer view" size="sm" value={state.explorerMode} onChange={(explorerMode) => setState({ explorerMode })} options={[{ value: 'tree', label: 'Tree', icon: 'tree' }, { value: 'graph', label: 'Graph', icon: 'relationship' }]} />}
      </div>
      {recordType && <RecordList type={recordType} />}
      {recordType === 'function' && <NewFunctionForm />}
      {recordType === 'calculation' && <NewCalculationForm />}
      {!recordType && loading && !graph && <LoadingState label="Loading Concepts" />}
      {!recordType && graph && state.explorerMode === 'graph' && <GraphView graph={graph} openId={state.conceptId} onOpen={open} />}
      {!recordType && graph && state.explorerMode === 'tree' && flat && (
        <ul className="con-results" aria-label="Matching Concepts">
          {filtered.map((n) => (
            <li key={n.id}>
              <Button size="sm" variant="quiet" className="con-tree-label" onPress={() => open(n.id)}>
                <span className="con-key">{n.key}</span> {n.name}
              </Button>
              <MaturityBadge maturity={n.maturity} />
            </li>
          ))}
          {!filtered.length && <li className="con-muted">No Concept matches.</li>}
        </ul>
      )}
      {!recordType && graph && state.explorerMode === 'tree' && !flat && (graph.nodes.length ? <TreeView nodes={buildTree(graph)} openId={state.conceptId} onOpen={open} /> : <EmptyState title="No Concepts yet">Choose New concept and describe an idea in your own words.</EmptyState>)}
    </div>
  )
}
