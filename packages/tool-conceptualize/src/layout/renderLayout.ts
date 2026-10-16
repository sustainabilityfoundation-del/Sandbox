import { convert } from '@ews/platform-sdk'
import type { Coord, DefinedComponent, DefinedParameter, EngineeringDefinition } from '@ews/conceptualize-client'

/**
 * Deterministic structured 2D layout renderer (concept-visualization-contracts.md §1). Framework-free: it turns
 * the engineering definition of one Concept revision into a drawing model (and an SVG string), the same input
 * always giving the same output. No provider is needed.
 *
 * Rules:
 * - Every component element carries its stable component ID (`data-component-id`), so an annotation on the
 *   layout names the component exactly.
 * - Dimension labels come ONLY from parameters (`symbol = value unit`), never from geometry: a dimension drawn
 *   on an extent that is not bound to its parameter is marked "not to scale" and so is the drawing.
 * - Colours are CSS classes (`cv-…`), styled from design tokens by the tool; the SVG holds no colours.
 */

export interface RenderOptions {
  /** Drawing width in px (default 640). */
  width?: number
  /** Component IDs to highlight (differences between alternatives). */
  highlightComponents?: ReadonlySet<string>
  /** Parameter IDs to highlight (values that differ between alternatives). */
  highlightParameters?: ReadonlySet<string>
  /** Caption: Concept key, name and revision (shown in the title block). */
  caption?: { key: string; name: string; revision: number }
  /**
   * Common scale for comparison: the drawing is sized as if it spanned at least this much (in mm), so
   * alternatives drawn with the same value share one scale.
   */
  commonSpanMm?: { x: number; y: number }
}

export interface DrawnComponent {
  componentId: string
  name: string
  kind: DefinedComponent['kind']
  shape: 'rect' | 'circle'
  /** Drawing coordinates (px). */
  x: number
  y: number
  w: number
  h: number
  /** Normalized to the drawing (0–1), for annotations and hit tests. */
  box: { x: number; y: number; w: number; h: number }
  highlighted: boolean
  /** Extents bound to parameters (to scale), by axis. */
  bound: { x: boolean; y: boolean }
}

export interface DrawnDimension {
  id: string
  parameterId: string
  componentId: string
  axis: 'x' | 'y'
  /** Exactly the parameter: symbol = value unit. */
  label: string
  toScale: boolean
  x1: number
  y1: number
  x2: number
  y2: number
  /** Label anchor (y dimensions are drawn rotated by -90° around it). */
  lx: number
  ly: number
  /** Extension lines from the component edges to the dimension line. */
  extensions: [number, number, number, number][]
  highlighted: boolean
}

export interface DrawnInterface {
  id: string
  name: string
  kind: string
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface LayoutDrawing {
  width: number
  height: number
  view: string
  unit: string
  notToScale: boolean
  /** Layout units per px. */
  scale: number
  components: DrawnComponent[]
  dimensions: DrawnDimension[]
  interfaces: DrawnInterface[]
  /** Components defined but not placed (shown as a list, never invented positions). */
  unplaced: { componentId: string; name: string }[]
  caption: string
  problems: string[]
}

export const formatValue = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))))
/** The only source of a dimension label. */
export const parameterLabel = (p: DefinedParameter) =>
  `${p.symbol} = ${p.value != null ? formatValue(p.value) : `${p.min != null ? formatValue(p.min) : '…'}–${p.max != null ? formatValue(p.max) : '…'}`} ${p.unit}`

const MARGIN = 24
const TITLE = 30
/** Spacing of stacked dimension lines (outside the drawing, so labels never cross components). */
const DIM_STEP = 24

export function renderLayout(def: EngineeringDefinition, options: RenderOptions = {}): LayoutDrawing | null {
  const layout = def.layout
  if (!layout || !layout.items.length) return null
  const problems: string[] = []
  const params = new Map(def.parameters.map((p) => [p.id, p]))
  const comps = new Map(def.components.map((c) => [c.id, c]))
  const value = (c: Coord): number => {
    if (typeof c === 'number') return c
    const p = params.get(c.parameter)
    if (!p || p.value == null) {
      problems.push(`Parameter ${c.parameter} has no value to draw.`)
      return 0
    }
    try {
      return convert(p.value, p.unit, layout.unit)
    } catch {
      problems.push(`Parameter ${p.symbol} (${p.unit}) is not a length in ${layout.unit}.`)
      return 0
    }
  }
  const raw = layout.items
    .filter((it) => comps.has(it.componentId))
    .map((it) => ({ it, x: value(it.x), y: value(it.y), w: Math.max(value(it.width), 0), h: Math.max(value(it.height), 0) }))
  const minX = Math.min(...raw.map((r) => r.x))
  const minY = Math.min(...raw.map((r) => r.y))
  const maxX = Math.max(...raw.map((r) => r.x + r.w))
  const maxY = Math.max(...raw.map((r) => r.y + r.h))
  const width = options.width ?? 640
  const toLayout = (mm: number) => {
    try {
      return convert(mm, 'mm', layout.unit)
    } catch {
      return mm
    }
  }
  const spanX = Math.max(maxX - minX, options.commonSpanMm ? toLayout(options.commonSpanMm.x) : 0, 1e-9)
  const spanY = Math.max(maxY - minY, options.commonSpanMm ? toLayout(options.commonSpanMm.y) : 0, 1e-9)
  // Dimensions are stacked above (x) and to the left (y) of the whole drawing.
  const nx = layout.dimensions.filter((d) => d.axis === 'x').length
  const ny = layout.dimensions.filter((d) => d.axis === 'y').length
  const left = MARGIN + ny * DIM_STEP
  const top = MARGIN + nx * DIM_STEP
  const pxPerUnit = Math.min(Math.max(width - left - MARGIN, 40) / spanX, (options.width ? Math.max(options.width * 0.6, 200) : 360) / spanY)
  const height = Math.round((maxY - minY) * pxPerUnit + top + MARGIN + TITLE)
  const tx = (x: number) => left + (x - minX) * pxPerUnit
  const ty = (y: number) => top + (y - minY) * pxPerUnit
  const norm = (x: number, y: number, w: number, h: number) => ({ x: x / width, y: y / height, w: w / width, h: h / height })
  const hlC = options.highlightComponents ?? new Set<string>()
  const hlP = options.highlightParameters ?? new Set<string>()

  const components: DrawnComponent[] = raw.map(({ it, x, y, w, h }) => {
    const c = comps.get(it.componentId)!
    const px = tx(x)
    const py = ty(y)
    const pw = w * pxPerUnit
    const ph = h * pxPerUnit
    return {
      componentId: c.id,
      name: c.name,
      kind: c.kind,
      shape: it.shape,
      x: round(px),
      y: round(py),
      w: round(pw),
      h: round(ph),
      box: norm(px, py, pw, ph),
      highlighted: hlC.has(c.id),
      bound: { x: typeof it.width === 'object', y: typeof it.height === 'object' },
    }
  })
  const byId = new Map(components.map((c) => [c.componentId, c]))
  const placedItems = new Map(layout.items.map((i) => [i.componentId, i]))
  let rowX = 0
  let rowY = 0
  const dimensions: DrawnDimension[] = []
  for (const d of layout.dimensions) {
    const c = byId.get(d.componentId)
    const p = params.get(d.parameterId)
    if (!c || !p) {
      problems.push(`Dimension ${d.id} refers to a missing component or parameter.`)
      continue
    }
    const item = placedItems.get(d.componentId)!
    const extent = d.axis === 'x' ? item.width : item.height
    const toScale = typeof extent === 'object' && extent.parameter === d.parameterId
    if (d.axis === 'x') {
      const y = round(top - DIM_STEP * ++rowX + 8)
      const extensions: [number, number, number, number][] = [[c.x, round(c.y - 2), c.x, round(y - 4)], [round(c.x + c.w), round(c.y - 2), round(c.x + c.w), round(y - 4)]]
      dimensions.push({ id: d.id, parameterId: p.id, componentId: c.componentId, axis: 'x', label: parameterLabel(p), toScale, x1: c.x, y1: y, x2: round(c.x + c.w), y2: y, lx: round(c.x + c.w / 2), ly: round(y - 4), extensions, highlighted: hlP.has(p.id) })
    } else {
      const x = round(left - DIM_STEP * ++rowY + 8)
      const extensions: [number, number, number, number][] = [[round(c.x - 2), c.y, round(x - 4), c.y], [round(c.x - 2), round(c.y + c.h), round(x - 4), round(c.y + c.h)]]
      dimensions.push({ id: d.id, parameterId: p.id, componentId: c.componentId, axis: 'y', label: parameterLabel(p), toScale, x1: x, y1: c.y, x2: x, y2: round(c.y + c.h), lx: round(x - 4), ly: round(c.y + c.h / 2), extensions, highlighted: hlP.has(p.id) })
    }
  }
  const centre = (c: DrawnComponent) => ({ x: round(c.x + c.w / 2), y: round(c.y + c.h / 2) })
  const interfaces: DrawnInterface[] = def.interfaces
    .filter((f) => byId.has(f.between[0]) && byId.has(f.between[1]))
    .map((f) => {
      const a = centre(byId.get(f.between[0])!)
      const b = centre(byId.get(f.between[1])!)
      return { id: f.id, name: f.name, kind: f.kind, from: f.between[0], to: f.between[1], x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    })
  const notToScale = dimensions.some((d) => !d.toScale)
  const unplaced = def.components.filter((c) => !byId.has(c.id)).map((c) => ({ componentId: c.id, name: c.name }))
  const cap = options.caption
  return {
    width,
    height,
    view: layout.view,
    unit: layout.unit,
    notToScale,
    scale: 1 / pxPerUnit,
    components,
    dimensions,
    interfaces,
    unplaced,
    caption: `${cap ? `${cap.key} rev ${cap.revision}: ${cap.name} · ` : ''}${layout.view} view · ${layout.unit} · dimensions from parameters${notToScale ? ' · NOT TO SCALE' : ''}${options.commonSpanMm ? ' · common scale' : ''}`,
    problems,
  }
}

/** Extent of a layout in mm (for a common comparison scale); null without a layout. */
export function layoutSpanMm(def: EngineeringDefinition): { x: number; y: number } | null {
  const d = renderLayout(def, { width: 1000 })
  if (!d) return null
  const unit = def.layout!.unit
  const xs = d.components.flatMap((c) => [c.x, c.x + c.w])
  const ys = d.components.flatMap((c) => [c.y, c.y + c.h])
  const toMm = (px: number) => {
    try {
      return convert(px * d.scale, unit, 'mm')
    } catch {
      return px * d.scale
    }
  }
  return { x: toMm(Math.max(...xs) - Math.min(...xs)), y: toMm(Math.max(...ys) - Math.min(...ys)) }
}

function round(n: number) {
  return Math.round(n * 100) / 100
}

/** The component under a normalized point (topmost, smallest first), for structured annotations. */
export function componentAt(drawing: LayoutDrawing, x: number, y: number): DrawnComponent | null {
  const hits = drawing.components.filter((c) => x >= c.box.x && x <= c.box.x + c.box.w && y >= c.box.y && y <= c.box.y + c.box.h)
  hits.sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)
  return hits[0] ?? null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** SVG string of a drawing (export, tests). The tool renders the same drawing model as React elements. */
export function toSvg(d: LayoutDrawing, title = 'Concept layout'): string {
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.width} ${d.height}" width="${d.width}" height="${d.height}" role="img" aria-label="${esc(title)}" class="cv-layout">`)
  parts.push(`<title>${esc(title)}</title>`)
  for (const c of d.components) {
    const cls = `cv-component cv-kind-${c.kind}${c.highlighted ? ' cv-highlight' : ''}`
    parts.push(`<g class="${cls}" data-component-id="${esc(c.componentId)}">`)
    if (c.shape === 'circle') parts.push(`<ellipse cx="${round(c.x + c.w / 2)}" cy="${round(c.y + c.h / 2)}" rx="${round(c.w / 2)}" ry="${round(c.h / 2)}"/>`)
    else parts.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}"/>`)
    parts.push(`<text class="cv-component-label" x="${round(c.x + c.w / 2)}" y="${round(c.y + c.h / 2)}" text-anchor="middle" dominant-baseline="middle">${esc(c.componentId)} ${esc(c.name)}</text></g>`)
  }
  for (const f of d.interfaces) parts.push(`<g class="cv-interface cv-interface-${esc(f.kind)}" data-interface-id="${esc(f.id)}"><line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}"/><text x="${round((f.x1 + f.x2) / 2)}" y="${round((f.y1 + f.y2) / 2 - 4)}" text-anchor="middle">${esc(f.name)}</text></g>`)
  for (const m of d.dimensions) {
    const cls = `cv-dimension${m.toScale ? '' : ' cv-not-to-scale'}${m.highlighted ? ' cv-highlight' : ''}`
    const ext = m.extensions.map(([a, b, c, e]) => `<line class="cv-extension" x1="${a}" y1="${b}" x2="${c}" y2="${e}"/>`).join('')
    const rotate = m.axis === 'y' ? ` transform="rotate(-90 ${m.lx} ${m.ly})"` : ''
    parts.push(`<g class="${cls}" data-parameter-id="${esc(m.parameterId)}" data-dimension-id="${esc(m.id)}"><line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}"/>${ext}<text x="${m.lx}" y="${m.ly}" text-anchor="middle"${rotate}>${esc(m.label)}${m.toScale ? '' : ' (n.t.s.)'}</text></g>`)
  }
  parts.push(`<text class="cv-caption" x="${MARGIN}" y="${d.height - 10}">${esc(d.caption)}</text>`)
  parts.push('</svg>')
  return parts.join('')
}

// ---- differences between alternatives -----------------------------------------------------------------------------

const keyOf = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Differences between the definitions of alternatives, by meaning (IDs are per Concept): components whose
 * name/kind is not in every alternative, and parameters (by symbol) whose value or unit differs or that only
 * some alternatives define. Used to highlight what distinguishes each alternative.
 */
export function definitionDifferences(defs: EngineeringDefinition[]): { components: Set<string>[]; parameters: Set<string>[] } {
  const compKeys = defs.map((d) => new Set(d.components.map((c) => `${keyOf(c.name)}|${c.kind}`)))
  const paramVal = defs.map((d) => new Map(d.parameters.map((p) => [p.symbol, `${p.value ?? ''}|${p.min ?? ''}|${p.max ?? ''}|${p.unit}`])))
  // A component is a difference when no other alternative has it (by name and kind).
  return {
    components: defs.map((d, i) => new Set(d.components.filter((c) => defs.length > 1 && !compKeys.some((s, j) => j !== i && s.has(`${keyOf(c.name)}|${c.kind}`))).map((c) => c.id))),
    parameters: defs.map((d) => new Set(d.parameters.filter((p) => !paramVal.every((m) => m.get(p.symbol) === paramVal[defs.indexOf(d)].get(p.symbol))).map((p) => p.id))),
  }
}
