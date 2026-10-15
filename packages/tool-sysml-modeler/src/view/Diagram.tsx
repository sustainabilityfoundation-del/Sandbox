import { Badge, IconButton, LoadingState, Notice, cx } from '@ews/design-system'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Graph, GraphEdge } from '../projection/graph'
import { CHAR_W, HEADER_H, LINE_H, layoutGraph, type LaidOutNode, type Layout } from '../projection/layout'
import { useViewState } from './hooks'

/**
 * Diagram canvas: an SVG rendering of a projected graph with automatic layout. Selecting a node or
 * a compartment entry selects the element; every action is also available without the diagram.
 */

const EDGE_LABEL: Record<GraphEdge['kind'], string> = {
  specialization: 'specializes',
  composition: 'composite part',
  typing: 'defined by',
  satisfy: 'satisfies',
  allocate: 'allocated to',
  connection: 'connection',
  interface: 'interface',
  flow: 'flow',
  binding: 'binding',
  succession: 'succession',
}

function wrap(text: string, width: number): string[] {
  const max = Math.max(8, Math.floor(width / CHAR_W))
  if (text.length <= max) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max)
    if (cut < max / 2) cut = max
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).trimStart()
  }
  if (rest) out.push(rest)
  return out
}

export function Diagram({ graph, mode, revision, title, onOpen, onUp }: { graph: Graph; mode: 'general' | 'interconnection'; revision: number; title: string; onOpen?: (elementId: string) => void; onUp?: () => void }) {
  const [vs, update] = useViewState()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setError(null)
    layoutGraph(graph, mode).then(
      (l) => alive && setLayout(l),
      (e) => alive && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [graph, mode, revision])

  const scroller = useRef<HTMLDivElement>(null)
  const fittedFor = useRef<string | null>(null)
  const fit = (l: Layout) => {
    const w = scroller.current?.clientWidth ?? 0
    return w > 0 ? Math.max(0.6, Math.min(1, Math.floor(((w - 24) / (l.width + 40)) * 20) / 20)) : 1
  }
  // Fit wide diagrams to the available width when a different diagram is shown.
  useEffect(() => {
    const key = `${mode}:${title}`
    if (layout && fittedFor.current !== key) {
      fittedFor.current = key
      update({ zoom: fit(layout) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, mode, title])
  const select = (id: string) => update({ selectedId: id })
  const key = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(id)
    }
  }
  const zoom = vs.zoom

  const renderNode = (n: LaidOutNode) => {
    const node = n.node
    const selected = vs.selectedId === node.elementId
    let y = n.y + HEADER_H
    const lines: React.ReactNode[] = []
    if (!node.isContext) {
      for (const c of node.compartments) {
        lines.push(<line key={`sep-${c.title}`} className="smod-node-sep" x1={n.x} x2={n.x + n.width} y1={y} y2={y} />)
        y += LINE_H - 2
        lines.push(<text key={`t-${c.title}`} className="smod-node-compartment" x={n.x + n.width / 2} y={y} textAnchor="middle">{c.title}</text>)
        for (const item of c.items) {
          for (const [k, l] of wrap(item.text, n.width - 24).entries()) {
            y += LINE_H
            lines.push(
              <text key={`${item.id}-${k}`} className={cx('smod-node-item', vs.selectedId === item.id && 'is-selected')} x={n.x + 12} y={y} onClick={(e) => (e.stopPropagation(), select(item.id))}>
                {l}
              </text>,
            )
          }
        }
        y += 6
      }
    }
    return (
      <g key={node.id}>
        <g
          className={cx('smod-node', node.isContext && 'is-context', selected && 'is-selected', node.metaclass.includes('Requirement') && 'is-requirement', node.keyword.endsWith('def') && 'is-definition', node.isExternal && 'is-external', node.keyword.endsWith('package') && 'is-package')}
          role="button"
          tabIndex={0}
          aria-label={`${node.keyword} ${node.name}`}
          aria-pressed={selected}
          onClick={() => select(node.elementId)}
          onDoubleClick={() => !node.isContext && onOpen?.(node.elementId)}
          onKeyDown={key(node.elementId)}
        >
          <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={node.isContext ? 10 : 6} />
          <text className="smod-node-keyword" x={n.x + n.width / 2} y={n.y + 17} textAnchor="middle">
            «{node.keyword}»{node.shortName ? ` <${node.shortName}>` : ''}
          </text>
          <text className="smod-node-name" x={n.x + (node.isContext ? 16 : n.width / 2)} y={n.y + 35} textAnchor={node.isContext ? 'start' : 'middle'}>
            {node.name}
          </text>
          {lines}
        </g>
        {n.ports.map((p) => {
          const port = node.ports.find((x) => x.id === p.id)!
          const sel = vs.selectedId === port.elementId
          const labelX = p.side === 'WEST' ? p.x + p.width + 4 : p.x - 4
          return (
            <g key={p.id} className={cx('smod-port', port.conjugated && 'is-conjugated', sel && 'is-selected')} role="button" tabIndex={0} aria-label={`port ${port.name} : ${port.typeName ?? ''}`} onClick={(e) => (e.stopPropagation(), select(port.elementId))} onKeyDown={key(port.elementId)}>
              <rect x={p.x} y={p.y} width={p.width} height={p.height} />
              <text className="smod-port-label" x={node.isContext ? (p.side === 'WEST' ? p.x + p.width + 4 : p.x - 4) : labelX} y={p.y - 3} textAnchor={p.side === 'WEST' ? 'start' : 'end'}>
                {port.name}
              </text>
            </g>
          )
        })}
        {n.children.map(renderNode)}
      </g>
    )
  }

  return (
    <div className="smod-diagram" data-help-id={`sysml-modeler.views.${mode}`}>
      <div className="smod-diagram-bar">
        <strong className="smod-diagram-title">{mode === 'general' ? 'General View' : 'Interconnection View'}: {title}</strong>
        <Badge tone="info">SysML v2 view (projection)</Badge>
        {onUp && <IconButton label="Up to the owning namespace" icon="arrow-right" size="sm" className="smod-up" onPress={onUp} />}
        <span className="smod-spacer" />
        <IconButton label="Zoom out" icon="zoom-out" size="sm" onPress={() => update({ zoom: Math.max(0.3, Math.round((zoom - 0.1) * 10) / 10) })} />
        <span className="smod-muted">{Math.round(zoom * 100)}%</span>
        <IconButton label="Zoom in" icon="zoom-in" size="sm" onPress={() => update({ zoom: Math.min(2.5, Math.round((zoom + 0.1) * 10) / 10) })} />
        <IconButton label="Fit to width" icon="fit" size="sm" onPress={() => layout && update({ zoom: fit(layout) })} />
      </div>
      {graph.notes.map((n) => (
        <Notice key={n} tone="neutral" className="smod-diagram-note">{n}</Notice>
      ))}
      {error && <Notice tone="danger" title="Layout failed">{error}</Notice>}
      {!layout && !error && <LoadingState label="Laying out the diagram" />}
      {layout && (
        <div className="smod-canvas-scroll" ref={scroller}>
          <svg className="smod-canvas" width={Math.ceil(layout.width * zoom) + 40} height={Math.ceil(layout.height * zoom) + 40} viewBox={`-20 -20 ${layout.width + 40} ${layout.height + 40}`} role="group" aria-label={`${mode === 'general' ? 'General' : 'Interconnection'} View diagram with ${graph.nodes.length} nodes and ${graph.edges.length} edges`}>
            <defs>
              <marker id="smod-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
                <path d="M1,1 L11,6 L1,11 Z" className="smod-marker-hollow" />
              </marker>
              <marker id="smod-diamond" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto-start-reverse">
                <path d="M1,5 L8,1 L15,5 L8,9 Z" className="smod-marker-filled" />
              </marker>
              <marker id="smod-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse">
                <path d="M1,1 L9,5 L1,9" className="smod-marker-open" />
              </marker>
            </defs>
            {layout.nodes.map(renderNode)}
            {layout.edges.map((e) => {
              const edge = graph.edges.find((x) => x.id === e.id)
              if (!edge || e.points.length < 2) return null
              const d = e.points.map((p, k) => `${k ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
              const marker = edge.kind === 'specialization' ? { end: 'url(#smod-tri)' } : edge.kind === 'composition' ? { start: 'url(#smod-diamond)' } : edge.kind === 'binding' || edge.kind === 'connection' || edge.kind === 'interface' ? {} : { end: 'url(#smod-arrow)' }
              const sel = edge.elementId && vs.selectedId === edge.elementId
              return (
                <g key={e.id} className={cx('smod-edge', `is-${edge.kind}`, sel && 'is-selected')} role={edge.elementId ? 'button' : undefined} tabIndex={edge.elementId ? 0 : undefined} aria-label={`${EDGE_LABEL[edge.kind]}${edge.label ? ` ${edge.label}` : ''}`} onClick={() => edge.elementId && select(edge.elementId)} onKeyDown={edge.elementId ? key(edge.elementId) : undefined}>
                  <path d={d} className="smod-edge-hit" />
                  <path d={d} markerStart={marker.start} markerEnd={marker.end} />
                  {edge.label && e.labelBox && (
                    <text className="smod-edge-label" x={e.labelBox.x + 4} y={e.labelBox.y + 12}>
                      {edge.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      )}
    </div>
  )
}
