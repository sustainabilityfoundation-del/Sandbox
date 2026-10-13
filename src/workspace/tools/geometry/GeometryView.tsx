import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Notice,
  formatValue,
  useModel,
  useSelection,
  useToolApi,
  useToolViewState,
  type EngineeringObject,
} from '../../sdk'
import type { Camera, GeometryViewState } from './index'

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
  const drag = useRef<{ x: number; y: number; camera: Camera; moved: boolean } | null>(null)
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

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== 'pan' && e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, camera, moved: false }
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const start = drag.current
    if (!start) return
    const k = worldPerPixel()
    start.moved = true
    setViewState({
      camera: {
        ...start.camera,
        cx: start.camera.cx - (e.clientX - start.x) * k,
        cy: start.camera.cy - (e.clientY - start.y) * k,
      },
    })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const choose = (id: string | null, additive: boolean) => {
    if (mode === 'pan') return
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
          {mode === 'pan' ? 'Pan: drag to move' : mode === 'measure' ? 'Measure (illustrative)' : 'Select: click a component, Shift-click to add'}
        </span>
        <span>Zoom {Math.round(camera.zoom * 100)}%</span>
        {related.size > 0 && <span>Dashed outline: components linked to the selected {selectedObjects[0]?.type}</span>}
        <button type="button" className="ws-link" onClick={() => api.updateViewState({ camera: { cx: 500, cy: 170, zoom: 1 } })}>
          Fit
        </button>
      </div>
    </div>
  )
}
