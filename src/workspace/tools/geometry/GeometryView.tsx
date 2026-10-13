import './geometry.css'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Button,
  Icons,
  Notice,
  formatValue,
  useModel,
  useSelection,
  useToolApi,
  useToolViewState,
  type EngineeringObject,
} from '../../sdk'
import { FIT_CAMERA, type Camera, type GeometryViewState } from './index'

const WORLD_W = 1000
const WORLD_H = 340
const ASSEMBLY_ID = 'ACT-100'

/** Simplified side elevation of the ACT-100 actuator, in world units. */
function HousingShape() {
  return (
    <>
      <rect x="85" y="160" width="42" height="40" rx="4" />
      <rect x="125" y="140" width="440" height="80" rx="6" />
      <rect x="565" y="148" width="25" height="64" rx="3" />
      <rect x="125" y="60" width="45" height="160" rx="4" />
      <circle cx="100" cy="180" r="7" className="geo-hole" />
    </>
  )
}

function MotorShape() {
  return (
    <>
      <rect x="170" y="68" width="240" height="60" rx="8" />
      <rect x="410" y="74" width="14" height="48" rx="3" />
      <rect x="290" y="54" width="40" height="14" rx="2" />
      {Array.from({ length: 10 }, (_, i) => (
        <line key={i} x1={200 + i * 20} y1="74" x2={200 + i * 20} y2="122" className="geo-detail" />
      ))}
    </>
  )
}

function RodShape() {
  return (
    <>
      <rect x="590" y="166" width="262" height="28" rx="3" />
      <rect x="850" y="162" width="28" height="36" rx="3" />
      <circle cx="895" cy="180" r="20" />
      <circle cx="895" cy="180" r="8" className="geo-hole" />
    </>
  )
}

const PARTS: { id: string; Shape: () => React.JSX.Element; label: { x: number; y: number; ax: number; ay: number } }[] = [
  { id: 'HSG-110', Shape: HousingShape, label: { x: 345, y: 262, ax: 345, ay: 220 } },
  { id: 'MTR-130', Shape: MotorShape, label: { x: 230, y: 34, ax: 230, ay: 68 } },
  { id: 'ROD-120', Shape: RodShape, label: { x: 720, y: 240, ax: 720, ay: 194 } },
]

function viewBoxOf(camera: Camera): string {
  const w = WORLD_W / camera.zoom
  const h = WORLD_H / camera.zoom
  return `${camera.cx - w / 2} ${camera.cy - h / 2} ${w} ${h}`
}

/** Components the selection points at indirectly (e.g. a requirement's allocated parts). */
function relatedComponentIds(selection: EngineeringObject[], model: ReturnType<typeof useModel>): Set<string> {
  const related = new Set<string>()
  for (const object of selection) {
    if (object.type === 'requirement') model.linked(object.id, 'allocated-to', 'out').forEach((id) => related.add(id))
    if (object.type === 'procedure') model.linked(object.id, 'tests', 'out').forEach((id) => related.add(id))
  }
  return related
}

export default function GeometryView() {
  const api = useToolApi<GeometryViewState>()
  const model = useModel()
  const { selectedIds, selectedObjects, select } = useSelection()
  const [viewState, setViewState] = useToolViewState<GeometryViewState>()
  const { camera, mode, section, showLabels } = viewState
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const related = useMemo(() => relatedComponentIds(selectedObjects, model), [selectedObjects, model])
  const assemblySelected = selectedIds.includes(ASSEMBLY_ID)
  const rod = model.get('ROD-120')
  const assembly = model.get(ASSEMBLY_ID)

  /** World units per screen pixel for the current viewBox and element size. */
  const worldPerPixel = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 1
    const scale = Math.min(rect.width / (WORLD_W / camera.zoom), rect.height / (WORLD_H / camera.zoom))
    return 1 / scale
  }

  // Wheel zoom around the pointer (needs a non-passive listener to stop page scroll).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const point = svg.createSVGPoint()
      point.x = e.clientX
      point.y = e.clientY
      const world = point.matrixTransform(svg.getScreenCTM()?.inverse())
      setViewState((vs) => {
        const zoom = Math.min(8, Math.max(0.5, vs.camera.zoom * Math.pow(1.0015, -e.deltaY)))
        const k = vs.camera.zoom / zoom
        return {
          ...vs,
          camera: {
            zoom,
            cx: world.x + (vs.camera.cx - world.x) * k,
            cy: world.y + (vs.camera.cy - world.y) * k,
          },
        }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [setViewState])

  /*
   * Pointer navigation for mouse, pen and touch:
   *   - tap / click selects (handled by the parts' onClick)
   *   - drag with one pointer pans (capture starts only once a drag begins, so taps still reach parts)
   *   - two touch points pinch-zoom and pan
   * Only the canvas uses touch-action: none, so the page scrolls normally elsewhere.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const suppressClick = useRef(false)
  const gesture = useRef<
    | { kind: 'drag'; x: number; y: number; camera: Camera; moved: boolean }
    | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; camera: Camera }
    | null
  >(null)

  // Capture is best-effort: it keeps a drag going outside the canvas but is not required.
  const capture = (el: Element, id: number) => {
    try {
      el.setPointerCapture(id)
    } catch {
      // pointer no longer active
    }
  }

  const pinchState = () => {
    const [p1, p2] = [...pointers.current.values()]
    return { distance: Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } }
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    suppressClick.current = false
    if (pointers.current.size === 1) {
      gesture.current = { kind: 'drag', x: e.clientX, y: e.clientY, camera, moved: e.button === 1 }
      if (e.button === 1) capture(e.currentTarget, e.pointerId)
    } else if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) capture(e.currentTarget, id)
      gesture.current = { kind: 'pinch', ...pinchState(), camera }
    }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    const k = worldPerPixel()
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const { distance, mid } = pinchState()
      const zoom = Math.min(8, Math.max(0.5, g.camera.zoom * (distance / g.distance)))
      const scale = k * (camera.zoom / zoom)
      setViewState({
        camera: {
          zoom,
          cx: g.camera.cx - (mid.x - g.mid.x) * scale,
          cy: g.camera.cy - (mid.y - g.mid.y) * scale,
        },
      })
      suppressClick.current = true
      return
    }
    if (g.kind === 'drag') {
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      if (!g.moved && Math.hypot(dx, dy) > 6) {
        g.moved = true
        capture(e.currentTarget, e.pointerId)
      }
      if (!g.moved) return
      suppressClick.current = true
      setViewState({ camera: { ...g.camera, cx: g.camera.cx - dx * k, cy: g.camera.cy - dy * k } })
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current = null
    else if (pointers.current.size === 1) {
      // Lifting one finger of a pinch continues as a pan from where it is.
      const [[, p]] = [...pointers.current.entries()]
      gesture.current = { kind: 'drag', x: p.x, y: p.y, camera: api.getViewState().camera, moved: true }
    }
  }

  const choose = (id: string | null, additive: boolean) => {
    if (mode === 'pan' || suppressClick.current) return
    if (id === null) return select([])
    if (additive) {
      select(selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id])
    } else {
      select([id])
    }
  }

  const stateClass = (id: string) =>
    [
      'geo-part',
      selectedIds.includes(id) || assemblySelected ? 'is-selected' : '',
      related.has(id) ? 'is-related' : '',
      hovered === id ? 'is-hovered' : '',
    ].join(' ')

  return (
    <div className={`geo-root geo-mode-${mode}`}>
      {(section || mode === 'measure') && (
        <div className="geo-notices">
          {section && (
            <Notice tone="info" title="Section view is illustrative">
              The cut plane A–A is drawn for demonstration only; no section geometry is computed.
            </Notice>
          )}
          {mode === 'measure' && (
            <Notice tone="info" title="Measure is illustrative">
              Dimensions shown are read from model properties, not measured from geometry.
            </Notice>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        className="geo-canvas"
        viewBox={viewBoxOf(camera)}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Actuator assembly side elevation"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).classList.contains('geo-bg')) choose(null, false)
        }}
      >
        <defs>
          <pattern id="geo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" className="geo-gridline" />
          </pattern>
          <pattern id="geo-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" className="geo-hatchline" />
          </pattern>
        </defs>
        <rect className="geo-bg" x={-2000} y={-2000} width={5000} height={5000} fill="url(#geo-grid)" />

        {assemblySelected && <rect className="geo-assembly-frame" x="75" y="44" width="850" height="166" rx="8" />}

        {PARTS.map(({ id, Shape }) => (
          <g
            key={id}
            className={stateClass(id)}
            data-object-id={id}
            onClick={(e) => {
              e.stopPropagation()
              choose(id, e.shiftKey || e.ctrlKey || e.metaKey)
            }}
            onPointerEnter={() => setHovered(id)}
            onPointerLeave={() => setHovered((h) => (h === id ? null : h))}
          >
            <title>{`${id} ${model.nameOf(id)}`}</title>
            <Shape />
          </g>
        ))}

        {section && (
          <g className="geo-section">
            <rect x="450" y="140" width="115" height="80" fill="url(#geo-hatch)" />
            <line x1="450" y1="30" x2="450" y2="300" />
            <text x="450" y="24" textAnchor="middle">A</text>
            <text x="450" y="316" textAnchor="middle">A</text>
          </g>
        )}

        {mode === 'measure' && rod && assembly && (
          <g className="geo-dimension">
            <line x1="590" y1="290" x2="915" y2="290" markerStart="none" />
            <line x1="590" y1="282" x2="590" y2="298" />
            <line x1="915" y1="282" x2="915" y2="298" />
            <text x="752" y="284" textAnchor="middle">
              Rod effective length {formatValue(rod.properties.effectiveLength)}
            </text>
            <line x1="85" y1="300" x2="590" y2="300" />
            <line x1="85" y1="292" x2="85" y2="308" />
            <text x="337" y="294" textAnchor="middle">
              Stroke {formatValue(assembly.properties.stroke)}
            </text>
          </g>
        )}

        {showLabels &&
          PARTS.map(({ id, label }) => (
            <g key={`label-${id}`} className={`geo-label${selectedIds.includes(id) ? ' is-selected' : ''}`}>
              <line x1={label.ax} y1={label.ay} x2={label.x} y2={label.y + (label.y > label.ay ? -12 : 4)} />
              <text x={label.x} y={label.y} textAnchor="middle">
                <tspan className="geo-label-id">{id}</tspan> {model.nameOf(id)}
              </text>
            </g>
          ))}
      </svg>

      <div className="geo-status">
        <span>
          {mode === 'pan'
            ? 'Pan: drag to move'
            : mode === 'measure'
              ? 'Measure (illustrative)'
              : 'Tap or click to select (Shift-click adds) · drag to pan · pinch, scroll or Zoom buttons to zoom'}
        </span>
        <span>Zoom {Math.round(camera.zoom * 100)}%</span>
        {related.size > 0 && <span>Dashed outline: components linked to the selected {selectedObjects[0]?.type}</span>}
        <Button size="sm" variant="ghost" icon={Icons.fit} onClick={() => api.updateViewState({ camera: FIT_CAMERA })}>
          Fit
        </Button>
      </div>
    </div>
  )
}
