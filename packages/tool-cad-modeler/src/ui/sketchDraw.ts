import type { CommandCall } from '@ews/cad-core'

/**
 * Click-to-draw sketching (CAD sprint C1, item 1). Pure logic with no DOM: snapping, the hint for the
 * next click and the mapping from clicks to the existing typed sketch commands (`add_line`,
 * `add_rectangle`, `add_circle`, `add_regular_polygon`, `apply_constraint`). The forms in the Edit tab
 * run the same commands, so clicks add no model behaviour of their own.
 */

export type DrawTool = 'line' | 'rectangle' | 'circle' | 'polygon'

export const DRAW_TOOLS: { value: DrawTool; label: string; clicks: number }[] = [
  { value: 'line', label: 'Line', clicks: 2 },
  { value: 'rectangle', label: 'Rectangle', clicks: 2 },
  { value: 'circle', label: 'Circle', clicks: 2 },
  { value: 'polygon', label: 'Polygon', clicks: 2 },
]

export type Pt = [number, number]

/** A placed or hovered point: where it is and what it snapped to. */
export interface SnapTarget {
  point: Pt
  /** `point`: an existing sketch point (id given); `origin`: the sketch origin; `grid`: the nearest grid node. */
  kind: 'point' | 'origin' | 'grid'
  id?: string
}

export interface DrawOptions {
  /** Add driving dimensions to rectangles (width, height) and circles (diameter). */
  dimensions: boolean
  /** Make nearly horizontal or vertical lines exactly horizontal or vertical. */
  infer: boolean
  /** Sides of a polygon. */
  sides: number
}

export const DEFAULT_DRAW_OPTIONS: DrawOptions = { dimensions: true, infer: true, sides: 6 }

const EPS = 1e-9
const round = (v: number, digits = 6) => Math.round(v * 10 ** digits) / 10 ** digits

/** A "nice" grid step (1, 2, 5 × 10^k mm) giving about `cells` cells across `span`. */
export function gridStep(span: number, cells = 30): number {
  const raw = Math.max(span, 1e-6) / cells
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * pow
}

/**
 * The snap target for a raw position: an existing point (or the origin) within `tolerance` first, else
 * the nearest grid node. Points win over the grid so that clicking on a corner always connects to it.
 */
export function snap(p: Pt, points: { id: string; p: Pt }[], step: number, tolerance: number): SnapTarget {
  let best: { id: string; p: Pt; d: number } | null = null
  for (const q of points) {
    const d = Math.hypot(q.p[0] - p[0], q.p[1] - p[1])
    if (d <= tolerance && (!best || d < best.d)) best = { ...q, d }
  }
  if (best) return best.id === 'origin' ? { point: [0, 0], kind: 'origin', id: 'origin' } : { point: best.p, kind: 'point', id: best.id }
  return { point: [round(Math.round(p[0] / step) * step), round(Math.round(p[1] / step) * step)], kind: 'grid' }
}

/** What the next click does, for the status line and assistive technology. */
export function hint(tool: DrawTool, placed: number, chaining = false): string {
  switch (tool) {
    case 'line':
      return placed === 0 ? 'Click or tap the start of the line.' : chaining ? 'Click or tap the next point. Click the first point to close the shape; Escape ends the chain.' : 'Click or tap the end of the line.'
    case 'rectangle':
      return placed === 0 ? 'Click or tap the first corner.' : 'Click or tap the opposite corner.'
    case 'circle':
      return placed === 0 ? 'Click or tap the centre.' : 'Click or tap a point on the circle.'
    case 'polygon':
      return placed === 0 ? 'Click or tap the centre.' : 'Click or tap a corner of the polygon.'
  }
}

export interface DrawResult {
  commands: CommandCall[]
  /** Short text for the undo history and the toast on failure. */
  label: string
}

const input = (t: SnapTarget): string | Pt => (t.kind === 'grid' || t.kind === 'origin' ? t.point : (t.id as string))

/**
 * The commands for a finished gesture, or an `error` when the clicks make no valid shape (the same
 * checks the commands make, reported before anything is sent).
 */
export function commandsFor(tool: DrawTool, sketchId: string, a: SnapTarget, b: SnapTarget, options: DrawOptions, step: number): DrawResult | { error: string } {
  const dx = b.point[0] - a.point[0]
  const dy = b.point[1] - a.point[1]
  if (tool === 'line') {
    if ((a.id && a.id === b.id) || (Math.abs(dx) < EPS && Math.abs(dy) < EPS)) return { error: 'The line needs two different points.' }
    const start = a.kind === 'origin' ? 'origin' : input(a)
    const end = b.kind === 'origin' ? 'origin' : input(b)
    const commands: CommandCall[] = [{ command: 'add_line', input: { sketchId, start, end, ref: '$l' } }]
    // Nearly horizontal or vertical lines drawn from the grid are made exact. A line between two existing points keeps its shape.
    const existing = (t: SnapTarget) => t.kind !== 'grid'
    if (options.infer && !(existing(a) && existing(b))) {
      if (Math.abs(dy) < EPS) commands.push({ command: 'apply_constraint', input: { sketchId, type: 'horizontal', entities: ['$l'] } })
      else if (Math.abs(dx) < EPS) commands.push({ command: 'apply_constraint', input: { sketchId, type: 'vertical', entities: ['$l'] } })
    }
    return { commands, label: 'Draw line' }
  }
  if (tool === 'rectangle') {
    const w = round(Math.abs(dx))
    const h = round(Math.abs(dy))
    if (!(w > 0 && h > 0)) return { error: 'The rectangle needs two corners that differ in both directions.' }
    const x0 = Math.min(a.point[0], b.point[0])
    const y0 = Math.min(a.point[1], b.point[1])
    const commands: CommandCall[] = [{ command: 'add_rectangle', input: { sketchId, corner: [x0, y0], width: w, height: h, dimensions: options.dimensions, ref: '$r' } }]
    // The first corner joins the point it was clicked on (an existing point, or the origin unless the corner is already fixed there).
    if (a.kind !== 'grid' && !(a.kind === 'origin' && x0 === 0 && y0 === 0 && a.point[0] === 0 && a.point[1] === 0)) {
      const corners: Pt[] = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]
      const k = corners.findIndex((c) => Math.abs(c[0] - a.point[0]) < 1e-6 && Math.abs(c[1] - a.point[1]) < 1e-6)
      if (k >= 0) commands.push({ command: 'apply_constraint', input: { sketchId, type: 'coincident', entities: [`$r.points.${k}`, a.kind === 'origin' ? 'origin' : (a.id as string)] } })
    }
    return { commands, label: 'Draw rectangle' }
  }
  if (tool === 'circle') {
    // From the grid the radius is a multiple of the grid step; on an existing point it is exact.
    const r = round(b.kind === 'grid' ? Math.round(Math.hypot(dx, dy) / step) * step : Math.hypot(dx, dy))
    if (!(r > 0)) return { error: 'The circle needs a radius greater than zero: click a second point away from the centre.' }
    const commands: CommandCall[] = [{ command: 'add_circle', input: { sketchId, center: a.kind === 'point' ? (a.id as string) : a.point, radius: r, ref: '$c' } }]
    if (a.kind === 'origin') commands.push({ command: 'apply_constraint', input: { sketchId, type: 'coincident', entities: ['$c.center', 'origin'] } })
    if (options.dimensions) commands.push({ command: 'apply_constraint', input: { sketchId, type: 'diameter', entities: ['$c'], value: round(2 * r) } })
    return { commands, label: 'Draw circle' }
  }
  const r = round(b.kind === 'grid' ? Math.round(Math.hypot(dx, dy) / step) * step : Math.hypot(dx, dy))
  if (!(r > 0)) return { error: 'The polygon needs a size greater than zero: click a corner away from the centre.' }
  const sides = Math.round(options.sides)
  if (!(sides >= 3 && sides <= 64)) return { error: 'A polygon has 3 to 64 sides.' }
  // The clicked corner sets the rotation, in steps of 15 degrees when it comes from the grid.
  let rotation = (Math.atan2(dy, dx) * 180) / Math.PI
  if (b.kind === 'grid') rotation = Math.round(rotation / 15) * 15
  rotation = round(((rotation % 360) + 360) % 360, 4)
  return { commands: [{ command: 'add_regular_polygon', input: { sketchId, center: a.point, sides, size: { circumradius: r }, rotation } }], label: `Draw ${sides}-sided polygon` }
}
