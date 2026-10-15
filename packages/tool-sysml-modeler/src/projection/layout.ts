import type { Graph, GraphNode } from './graph'

/**
 * Automatic layout with elkjs (Eclipse Layout Kernel, EPL-2.0, used unmodified): layered algorithm
 * with ports and hierarchy. Loaded on demand. Positions are presentation data (private view state),
 * never model elements.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface LaidOutNode extends Box {
  node: GraphNode
  ports: (Box & { id: string; side: 'WEST' | 'EAST' | 'NORTH' | 'SOUTH' })[]
  children: LaidOutNode[]
}

export interface LaidOutEdge {
  id: string
  points: { x: number; y: number }[]
  labelBox?: Box
}

export interface Layout {
  width: number
  height: number
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
}

export const CHAR_W = 7.2
export const LINE_H = 18
export const HEADER_H = 44
const PAD = 12
const PORT = 12

export function nodeSize(n: GraphNode): { width: number; height: number } {
  const lines = n.compartments.flatMap((c) => [c.title, ...c.items.map((i) => i.text)])
  const widest = Math.max(n.name.length * 8, n.keyword.length * CHAR_W + 16, ...lines.map((l) => Math.min(l.length, 60) * CHAR_W))
  const width = Math.min(Math.max(widest + PAD * 2, 140), 520)
  const textLines = n.compartments.reduce((sum, c) => sum + 1 + c.items.reduce((k, i) => k + Math.max(1, Math.ceil((i.text.length * CHAR_W) / (width - PAD * 2))), 0), 0)
  const height = HEADER_H + (n.compartments.length ? textLines * LINE_H + 8 : 0) + (n.ports.length ? 8 : 0)
  return { width, height: Math.max(height, 56) }
}

type ElkNode = { id: string; width?: number; height?: number; x?: number; y?: number; children?: ElkNode[]; ports?: { id: string; width: number; height: number; x?: number; y?: number; layoutOptions?: Record<string, string> }[]; layoutOptions?: Record<string, string>; edges?: ElkEdge[]; labels?: { text: string; width: number; height: number }[] }
type ElkEdge = { id: string; sources: string[]; targets: string[]; sections?: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] }[]; labels?: { text: string; width: number; height: number; x?: number; y?: number }[]; container?: string }

/**
 * ELK runs in a Web Worker (elk-worker.min.js, loaded as a separate asset by URL): layout stays off
 * the main thread and the 1.4 MB engine is fetched only when a diagram is first shown.
 */
let engine: Promise<{ layout: (g: ElkNode) => Promise<ElkNode> }> | undefined

function elk() {
  engine ??= import('elkjs/lib/elk-worker.min.js?url').then(({ default: url }) => {
    const worker = new Worker(url)
    let next = 0
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
    worker.onmessage = (answer: MessageEvent<{ id: number; data?: unknown; error?: unknown }>) => {
      const p = pending.get(answer.data.id)
      if (!p) return
      pending.delete(answer.data.id)
      if (answer.data.error) p.reject(new Error(typeof answer.data.error === 'object' ? JSON.stringify(answer.data.error) : String(answer.data.error)))
      else p.resolve(answer.data.data)
    }
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(e.message || 'The layout worker failed.'))
      pending.clear()
    }
    const send = (msg: Record<string, unknown>) =>
      new Promise<unknown>((resolve, reject) => {
        const id = next++
        pending.set(id, { resolve, reject })
        worker.postMessage({ ...msg, id })
      })
    void send({ cmd: 'register', algorithms: ['layered'] })
    return { layout: (g: ElkNode) => send({ cmd: 'layout', graph: g, layoutOptions: {}, options: {} }) as Promise<ElkNode> }
  })
  return engine
}

function portSide(direction?: string): 'WEST' | 'EAST' {
  return direction === 'in' ? 'WEST' : 'EAST'
}

function toElk(n: GraphNode, nested: boolean): ElkNode {
  const size = nested && n.children.length ? undefined : nodeSize(n)
  return {
    id: n.id,
    ...(size ?? {}),
    layoutOptions: {
      'elk.portConstraints': 'FIXED_SIDE',
      ...(n.children.length ? { 'elk.padding': `[top=${HEADER_H + 16},left=40,bottom=32,right=40]`, 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.layered.spacing.nodeNodeBetweenLayers': '90', 'elk.spacing.nodeNode': '50', 'elk.edgeRouting': 'ORTHOGONAL' } : {}),
    },
    ports: n.ports.map((p, k) => ({ id: p.id, width: PORT, height: PORT, layoutOptions: { 'elk.port.side': n.isContext ? (k % 2 ? 'EAST' : 'WEST') : portSide(p.direction), 'elk.port.index': String(k) } })),
    children: n.children.map((c) => toElk(c, true)),
  }
}

export async function layoutGraph(graph: Graph, mode: 'general' | 'interconnection'): Promise<Layout> {
  const engine = await elk()
  const labelOf = (text?: string) => (text ? [{ text, width: Math.min(text.length, 40) * CHAR_W + 8, height: 16 }] : undefined)
  const root: ElkNode = {
    id: '__root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      // Hierarchy only for interconnection (nested parts); the General View packs disconnected groups.
      ...(mode === 'interconnection' ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : { 'elk.separateConnectedComponents': 'true', 'elk.aspectRatio': '1.4', 'elk.spacing.componentComponent': '40' }),
      'elk.layered.spacing.nodeNodeBetweenLayers': mode === 'general' ? '110' : '90',
      'elk.spacing.nodeNode': '40',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.edgeLabel': '4',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: graph.nodes.map((n) => toElk(n, false)),
    edges: graph.edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target], labels: labelOf(e.label) })),
  }
  const result = await engine.layout(root)
  const byId = new Map<string, GraphNode>()
  const index = (n: GraphNode) => {
    byId.set(n.id, n)
    n.children.forEach(index)
  }
  graph.nodes.forEach(index)
  const convert = (e: ElkNode, ox: number, oy: number): LaidOutNode => {
    const x = ox + (e.x ?? 0)
    const y = oy + (e.y ?? 0)
    const node = byId.get(e.id)!
    return {
      node,
      x,
      y,
      width: e.width ?? 100,
      height: e.height ?? 60,
      ports: (e.ports ?? []).map((p) => {
        const px = x + (p.x ?? 0)
        const side: 'WEST' | 'EAST' = (p.x ?? 0) < (e.width ?? 0) / 2 ? 'WEST' : 'EAST'
        return { id: p.id, x: px, y: y + (p.y ?? 0), width: p.width, height: p.height, side }
      }),
      children: (e.children ?? []).map((c) => convert(c, x, y)),
    }
  }
  const nodes = (result.children ?? []).map((c) => convert(c, 0, 0))
  // Edge coordinates are relative to their container (ELK `container`); with INCLUDE_CHILDREN and edges declared on the root they are absolute.
  const containerOffset = new Map<string, { x: number; y: number }>()
  const walk = (n: LaidOutNode) => {
    containerOffset.set(n.node.id, { x: n.x, y: n.y })
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  const edges: LaidOutEdge[] = (result.edges ?? []).map((e: ElkEdge) => {
    const off = e.container && e.container !== '__root' ? (containerOffset.get(e.container) ?? { x: 0, y: 0 }) : { x: 0, y: 0 }
    const sec = e.sections?.[0]
    const points = sec ? [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({ x: p.x + off.x, y: p.y + off.y })) : []
    const l = e.labels?.[0]
    return { id: e.id, points, ...(l && l.x !== undefined ? { labelBox: { x: (l.x ?? 0) + off.x, y: (l.y ?? 0) + off.y, width: l.width, height: l.height } } : {}) }
  })
  return { width: (result.width ?? 400) + 2, height: (result.height ?? 300) + 2, nodes, edges }
}
