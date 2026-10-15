import type { SketchFeature, SketchResult } from '@ews/cad-core'
import { cx } from '@ews/design-system'
import type { KeyboardEvent } from 'react'

interface Props {
  sketch: SketchFeature
  result?: SketchResult
  selected: string[]
  onToggle: (entityId: string) => void
}

type P = [number, number]

const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(2))

/**
 * 2D sketch view: solved geometry (drawn positions when not regenerated yet), the sketch origin and
 * axes, dimension values and degrees of freedom (under-defined points are highlighted). Entities are
 * focusable and selectable with Enter or Space; nothing depends on dragging.
 */
export function Sketcher({ sketch, result, selected, onToggle }: Props) {
  const sol = result?.solution
  const pts = new Map<string, P>()
  for (const e of sketch.entities) if (e.type === 'point') pts.set(e.id, (sol?.points[e.id] as P | undefined) ?? [e.x, e.y])
  pts.set('origin', [0, 0])
  const radius = (id: string) => sol?.radii[id] ?? (sketch.entities.find((e) => e.id === id && e.type === 'circle') as { radius?: number } | undefined)?.radius ?? 1
  const free = new Set([...(sol?.freePoints ?? []), ...(sol?.freeCircles ?? [])])
  const bad = new Set([...(sol?.conflicting ?? []), ...(sol?.redundant ?? [])])

  // Bounds in sketch coordinates.
  const xs: number[] = [0]
  const ys: number[] = [0]
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
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const size = Math.max(maxX - minX, maxY - minY, 20)
  const pad = size * 0.18
  const vb = { x: minX - pad, y: -(maxY + pad), w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
  const S = (p: P): P => [p[0], -p[1]]
  const unit = size / 100 // label and marker scale

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

  return (
    <svg className="cadm-sketch" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="group" aria-label={`Sketch ${sketch.name}: ${sol ? `${sol.status}, ${sol.dof} degrees of freedom` : 'not solved yet'}`} data-help-id="cad-modeler.sketch.canvas">
      <line className="cadm-sk-axis" x1={vb.x} y1={0} x2={vb.x + vb.w} y2={0} />
      <line className="cadm-sk-axis" x1={0} y1={vb.y} x2={0} y2={vb.y + vb.h} />
      <circle className="cadm-sk-origin" cx={0} cy={0} r={unit * 1.2} />
      {sketch.entities.map((e) => {
        const label = `${e.type} ${e.id}${e.construction ? ' (construction)' : ''}${free.has(e.id) ? ', not fully defined' : ''}`
        const common = { key: e.id, tabIndex: 0, role: 'button', 'aria-pressed': selected.includes(e.id), 'aria-label': label, onClick: () => onToggle(e.id), onKeyDown: keyToggle(e.id) }
        if (e.type === 'line') {
          const a = S(pts.get(e.start)!)
          const b = S(pts.get(e.end)!)
          return (
            <g {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
              <line className="cadm-sk-hit" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
              <line className="cadm-sk-curve" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
            </g>
          )
        }
        if (e.type === 'circle') {
          const c = S(pts.get(e.center)!)
          return (
            <g {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
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
            <g {...common} className={cls(e.id, cx('cadm-sk-entity', e.construction && 'is-construction'))}>
              <path className="cadm-sk-hit" d={d} />
              <path className="cadm-sk-curve" d={d} />
            </g>
          )
        }
        const p = S(pts.get(e.id)!)
        return (
          <g {...common} className={cls(e.id, 'cadm-sk-point')}>
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
    </svg>
  )
}
