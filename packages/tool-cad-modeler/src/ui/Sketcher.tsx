import type { SketchFeature, SketchResult } from '@ews/cad-core'
import { cx } from '@ews/design-system'
import { useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { gridStep, snap, type DrawTool, type SnapTarget } from './sketchDraw'

/** Drawing state of the click-to-draw tools (the sketch stage owns it). */
export interface DrawProps {
  tool: DrawTool
  /** The first point of the gesture in progress (null: nothing placed yet). */
  pending: SnapTarget | null
  /** Polygon sides, for the preview. */
  sides: number
  /** Where the pointer or the keyboard cursor would place the next point. */
  cursor: SnapTarget | null
  onCursor: (t: SnapTarget | null) => void
  /** Called with the snapped point and the grid step in force. */
  onPlace: (t: SnapTarget, step: number) => void
  /** Escape: drop the gesture in progress (or leave the tool when none is). */
  onCancel: () => void
}

interface Props {
  sketch: SketchFeature
  result?: SketchResult
  selected: string[]
  onToggle: (entityId: string) => void
  draw?: DrawProps | null
}

type P = [number, number]

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2))

/**
 * 2D sketch view: solved geometry (drawn positions when not regenerated yet), the sketch origin and
 * axes, dimension values and degrees of freedom (under-defined points are highlighted). Entities are
 * focusable and selectable with Enter or Space; nothing depends on dragging.
 *
 * With a drawing tool the view shows a grid and snaps to existing points and grid nodes. A click, a tap
 * or Enter at the keyboard cursor places a point; two placed points make the shape. No gesture needs
 * hovering or dragging: a tap places a point at once, and the keyboard cursor moves with the arrow keys.
 */
export function Sketcher({ sketch, result, selected, onToggle, draw }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [keyCursor, setKeyCursor] = useState<P | null>(null)
  const sol = result?.solution
  const pts = new Map<string, P>()
  for (const e of sketch.entities) if (e.type === 'point') pts.set(e.id, (sol?.points[e.id] as P | undefined) ?? [e.x, e.y])
  pts.set('origin', [0, 0])
  const radius = (id: string) => sol?.radii[id] ?? (sketch.entities.find((e) => e.id === id && e.type === 'circle') as { radius?: number } | undefined)?.radius ?? 1
  const free = new Set([...(sol?.freePoints ?? []), ...(sol?.freeCircles ?? [])])
  const bad = new Set([...(sol?.conflicting ?? []), ...(sol?.redundant ?? [])])

  // Bounds in sketch coordinates. While drawing, a working area of at least 60 x 40 mm from the origin is shown.
  const xs: number[] = [0]
  const ys: number[] = [0]
  if (draw || sketch.entities.length === 0) xs.push(60), ys.push(40)
  for (const e of sketch.entities) {
    if (e.type === 'point') {
      const p = pts.get(e.id)!
      xs.push(p[0])
      ys.push(p[1])
    } else if (e.type === 'circle') {
      const c = pts.get(e.center) ?? [0, 0]
      const r = radius(e.id)
      xs.push(c[0] - r, c[0] + r)
      ys.push(c[1] - r, c[1] + r)
    }
  }
  if (draw?.pending) xs.push(draw.pending.point[0]), ys.push(draw.pending.point[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const size = Math.max(maxX - minX, maxY - minY, 20)
  const pad = size * 0.18
  const vb = { x: minX - pad, y: -(maxY + pad), w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
  const S = (p: P): P => [p[0], -p[1]]
  const unit = size / 100 // label and marker scale
  const step = gridStep(size)
  const snapPoints = [...pts].map(([id, p]) => ({ id, p }))

  /** Pointer position in sketch coordinates, and the screen scale (pixels per mm) for the snap tolerance. */
  const toSketch = (e: { clientX: number; clientY: number }): { p: P; tolerance: number } | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const point = svg.createSVGPoint()
    point.x = e.clientX
    point.y = e.clientY
    const q = point.matrixTransform(ctm.inverse())
    return { p: [q.x, -q.y], tolerance: 12 / (ctm.a || 1) }
  }
  const snapAt = (e: { clientX: number; clientY: number }) => {
    const at = toSketch(e)
    return at ? snap(at.p, snapPoints, step, at.tolerance) : null
  }

  const keyToggle = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle(id)
    }
  }
  const cls = (id: string, base: string) => cx(base, selected.includes(id) && 'is-selected', free.has(id) && 'is-free')

  const labels: { id: string; at: P; text: string; bad: boolean }[] = []
  for (const c of sketch.constraints) {
    const value = result?.values[c.id] ?? sol?.driven[c.id]
    const ref = (i: number) => sketch.entities.find((e) => e.id === c.entities[i])
    let at: P | undefined
    const e0 = ref(0)
    if (c.type === 'length' && e0?.type === 'line') {
      const a = pts.get(e0.start)!
      const b = pts.get(e0.end)!
      at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    } else if ((c.type === 'radius' || c.type === 'diameter') && (e0?.type === 'circle' || e0?.type === 'arc')) {
      const ctr = pts.get(e0.center)!
      const r = radius(e0.id)
      at = [ctr[0] + r * 0.7, ctr[1] + r * 0.7]
    } else if (c.type.startsWith('distance') || c.type === 'angle') {
      const ps = c.entities.map((id) => pts.get(id)).filter(Boolean) as P[]
      if (ps.length) at = [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length]
    }
    if (!at || value === undefined) continue
    const prefix = c.type === 'diameter' ? '⌀' : c.type === 'radius' ? 'R' : c.type === 'angle' ? '∠' : c.type === 'distance-x' ? 'Δx ' : c.type === 'distance-y' ? 'Δy ' : ''
    labels.push({ id: c.id, at, text: `${c.driving === false ? '(' : ''}${prefix}${fmt(value)}${c.type === 'angle' ? '°' : ''}${c.driving === false ? ')' : ''}`, bad: bad.has(c.id) })
  }

  // ---- drawing -------------------------------------------------------------------------------
  const onSurfaceMove = (e: PointerEvent) => {
    if (!draw || e.pointerType === 'touch') return
    const t = snapAt(e)
    if (t) draw.onCursor(t)
  }
  const onSurfaceClick = (e: MouseEvent) => {
    if (!draw) return
    const t = snapAt(e)
    if (t) draw.onPlace(t, step)
  }
  const onSurfaceKey = (e: KeyboardEvent) => {
    if (!draw || e.target !== svgRef.current) return
    const at = keyCursor ?? draw.pending?.point ?? [0, 0]
    const move = (dx: number, dy: number) => {
      e.preventDefault()
      const k = e.shiftKey ? 5 : 1
      const next: P = [Math.round((at[0] + dx * k * step) / step) * step, Math.round((at[1] + dy * k * step) / step) * step].map((v) => Math.round(v * 1e6) / 1e6) as P
      setKeyCursor(next)
      draw.onCursor(snap(next, snapPoints, step, 1e-6))
    }
    if (e.key === 'ArrowLeft') move(-1, 0)
    else if (e.key === 'ArrowRight') move(1, 0)
    else if (e.key === 'ArrowUp') move(0, 1)
    else if (e.key === 'ArrowDown') move(0, -1)
    else if (e.key === 'Home') {
      e.preventDefault()
      setKeyCursor([0, 0])
      draw.onCursor(snap([0, 0], snapPoints, step, 1e-6))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const t = snap(at, snapPoints, step, 1e-6)
      setKeyCursor(t.point)
      draw.onPlace(t, step)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      draw.onCancel()
    }
  }

  // Grid lines (one path) and the preview of the shape in progress.
  const grid: string[] = []
  if (draw) {
    const x0 = Math.ceil(vb.x / step) * step
    const y0 = Math.ceil(-(vb.y + vb.h) / step) * step
    for (let x = x0, n = 0; x <= vb.x + vb.w && n < 200; x += step, n++) grid.push(`M ${x} ${vb.y} V ${vb.y + vb.h}`)
    for (let y = y0, n = 0; y <= -vb.y && n < 200; y += step, n++) grid.push(`M ${vb.x} ${-y} H ${vb.x + vb.w}`)
  }
  const cursor = draw?.cursor ?? null
  const preview = (() => {
    if (!draw?.pending || !cursor) return null
    const a = draw.pending.point
    const b = cursor.point
    if (draw.tool === 'line') {
      const s = S(a)
      const t = S(b)
      return <line className="cadm-sk-preview" x1={s[0]} y1={s[1]} x2={t[0]} y2={t[1]} />
    }
    if (draw.tool === 'rectangle') return <rect className="cadm-sk-preview" x={Math.min(a[0], b[0])} y={-Math.max(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} />
    const r = cursor.kind === 'grid' ? Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step) * step : Math.hypot(b[0] - a[0], b[1] - a[1])
    const c = S(a)
    if (draw.tool === 'circle') return <circle className="cadm-sk-preview" cx={c[0]} cy={c[1]} r={r} />
    let rot = Math.atan2(b[1] - a[1], b[0] - a[0])
    if (cursor.kind === 'grid') rot = (Math.round(((rot * 180) / Math.PI) / 15) * 15 * Math.PI) / 180
    const n = Math.min(64, Math.max(3, Math.round(draw.sides)))
    const verts = Array.from({ length: n }, (_, k) => {
      const ang = rot + (2 * Math.PI * k) / n
      return `${a[0] + r * Math.cos(ang)},${-(a[1] + r * Math.sin(ang))}`
    })
    return <polygon className="cadm-sk-preview" points={verts.join(' ')} />
  })()

  const status = sol ? `${sol.status}, ${sol.dof} degrees of freedom` : 'not solved yet'
  return (
    <svg
      ref={svgRef}
      className={cx('cadm-sketch', draw && 'is-drawing')}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      role="group"
      aria-label={`Sketch ${sketch.name}: ${status}${draw ? `. Drawing ${draw.tool}: click or tap to place points; with the keyboard use the arrow keys to move the cursor, Enter to place a point, Escape to cancel.` : ''}`}
      data-help-id="cad-modeler.sketch.canvas"
      data-draw-tool={draw?.tool}
      data-grid-step={draw ? step : undefined}
      tabIndex={draw ? 0 : undefined}
      onPointerMove={draw ? onSurfaceMove : undefined}
      onPointerLeave={draw ? () => draw.onCursor(null) : undefined}
      onClick={draw ? onSurfaceClick : undefined}
      onKeyDown={draw ? onSurfaceKey : undefined}
    >
      {draw && <path className="cadm-sk-grid" d={grid.join(' ')} />}
      <line className="cadm-sk-axis" x1={vb.x} y1={0} x2={vb.x + vb.w} y2={0} />
      <line className="cadm-sk-axis" x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h} />
      <circle className="cadm-sk-origin" cx={0} cy={0} r={unit * 1.2} />
      {sketch.entities.map((e) => {
        const label = `${e.type} ${e.id}${e.construction ? ' (construction)' : ''}${free.has(e.id) ? ', not fully defined' : ''}`
        const common = draw
          ? { tabIndex: -1, role: 'img', 'aria-label': label }
          : { tabIndex: 0, role: 'button', 'aria-pressed': selected.includes(e.id), 'aria-label': label, onClick: () => onToggle(e.id), onKeyDown: keyToggle(e.id) }
        if (e.type === 'line') {
          const a = S(pts.get(e.start)!)
          const b = S(pts.get(e.end)!)
          return (
            <g key={e.id} {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
              <line className="cadm-sk-hit" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
              <line className="cadm-sk-curve" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            </g>
          )
        }
        if (e.type === 'circle') {
          const c = S(pts.get(e.center)!)
          return (
            <g key={e.id} {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
              <circle className="cadm-sk-hit" cx={c[0]} cy={c[1]} r={radius(e.id)} />
              <circle className="cadm-sk-curve" cx={c[0]} cy={c[1]} r={radius(e.id)} />
            </g>
          )
        }
        if (e.type === 'arc') {
          const c = pts.get(e.center)!
          const s = pts.get(e.start)!
          const t = pts.get(e.end)!
          const r = radius(e.id)
          const a0 = Math.atan2(s[1] - c[1], s[0] - c[0])
          let a1 = Math.atan2(t[1] - c[1], t[0] - c[0])
          if (a1 <= a0) a1 += 2 * Math.PI
          const large = a1 - a0 > Math.PI ? 1 : 0
          const p0 = S(s)
          const p1 = S(t)
          const d = `M ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${large} 0 ${p1[0]} ${p1[1]}`
          return (
            <g key={e.id} {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
              <path className="cadm-sk-hit" d={d} />
              <path className="cadm-sk-curve" d={d} />
            </g>
          )
        }
        const p = S(pts.get(e.id)!)
        return (
          <g key={e.id} {...common} className={cls(e.id, 'cadm-sk-point')} data-point-id={e.id}>
            <circle cx={p[0]} cy={p[1]} r={unit * 1.6} />
          </g>
        )
      })}
      {labels.map((l) => {
        const p = S(l.at)
        return (
          <text key={l.id} className={cx('cadm-sk-dim', l.bad && 'is-bad')} x={p[0]} y={p[1] - unit} fontSize={unit * 4} textAnchor="middle">
            {l.text}
          </text>
        )
      })}
      {draw && preview}
      {draw?.pending && (() => {
        const p = S(draw.pending.point)
        return <circle className="cadm-sk-pending" cx={p[0]} cy={p[1]} r={unit * 2} />
      })()}
      {draw && cursor && (() => {
        const p = S(cursor.point)
        return (
          <g className={cx('cadm-sk-cursor', `is-${cursor.kind}`)} data-snap={cursor.kind} pointerEvents="none">
            <circle cx={p[0]} cy={p[1]} r={unit * 2.6} />
            <path d={`M ${p[0] - unit * 4} ${p[1]} H ${p[0] + unit * 4} M ${p[0]} ${p[1] - unit * 4} V ${p[1] + unit * 4}`} />
          </g>
        )
      })()}
    </svg>
  )
}
