import './cad.css'
import { Button, Checkbox, EmptyState, IconButton, Notice, StatusBadge, TextField } from '@ews/design-system'
import { formatValue } from '@ews/platform-sdk'
import {
  FreshnessBadge,
  MockTag,
  ObjectRef,
  formatTime,
  useArtifacts,
  useModel,
  useResolvedSelection,
  useSelection,
  useToolApi,
  useToolViewState,
  useUnsavedChanges,
} from '@ews/platform-sdk/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  DIMENSIONS,
  dimensionChanges,
  layoutOf,
  mappedProperty,
  partForComponent,
  partsOf,
  selectedComponentId,
  validateDimension,
  type CadViewState,
  type Camera,
  type Layout,
  type Part,
} from './domain'

const ARTIFACT_KIND = 'cad-representation'
const ARTIFACT_SCHEMA_VERSION = 1

// ---- mock shapes (mm, actuator axis at y = 0) -------------------------------------------------

function HousingShape({ l }: { l: Layout }) {
  const { length, od } = l.housing
  return (
    <>
      <rect x={-48} y={-od / 3} width={50} height={(od * 2) / 3} rx={4} />
      <rect x={0} y={-od / 2} width={length} height={od} rx={6} />
      <rect x={length} y={-od * 0.4} width={22} height={od * 0.8} rx={3} />
      <rect x={0} y={l.motor.y - l.motor.d / 2 + 6} width={46} height={od / 2 - (l.motor.y - l.motor.d / 2) - 6} rx={4} />
      <circle cx={-26} cy={0} r={7} className="cad-hole" />
    </>
  )
}

function RodShape({ l }: { l: Layout }) {
  const { d, length, x0 } = l.rod
  const eye = Math.max(d * 0.8, 16)
  return (
    <>
      <rect x={x0} y={-d / 2} width={length} height={d} rx={3} />
      <circle cx={x0 + length + eye * 0.6} cy={0} r={eye} />
      <circle cx={x0 + length + eye * 0.6} cy={0} r={eye * 0.4} className="cad-hole" />
    </>
  )
}

function MotorShape({ l }: { l: Layout }) {
  const { length, d, y } = l.motor
  const x0 = 46
  return (
    <>
      <rect x={x0} y={y - d / 2} width={length} height={d} rx={8} />
      <rect x={x0 + length} y={y - d * 0.35} width={14} height={d * 0.7} rx={3} />
      {Array.from({ length: Math.max(3, Math.floor(length / 20)) }, (_, i) => (
        <line key={i} x1={x0 + 14 + i * 18} y1={y - d / 2 + 6} x2={x0 + 14 + i * 18} y2={y + d / 2 - 6} className="cad-detail" />
      ))}
    </>
  )
}

const SHAPES: Record<string, (props: { l: Layout }) => React.JSX.Element> = {
  housing: HousingShape,
  rod: RodShape,
  motor: MotorShape,
}

/** Dimension annotations for the editable values. */
function DimensionOverlay({ l }: { l: Layout }) {
  const y1 = l.housing.od / 2 + 30
  const rodEnd = l.rod.x0 + l.rod.length
  return (
    <g className="cad-dimension" aria-hidden="true">
      <line x1={0} y1={y1} x2={l.housing.length} y2={y1} />
      <line x1={0} y1={y1 - 8} x2={0} y2={y1 + 8} />
      <line x1={l.housing.length} y1={y1 - 8} x2={l.housing.length} y2={y1 + 8} />
      <text x={l.housing.length / 2} y={y1 - 6} textAnchor="middle">
        housing L {l.housing.length} mm
      </text>
      <line x1={l.rod.x0} y1={y1 + 28} x2={rodEnd} y2={y1 + 28} />
      <line x1={l.rod.x0} y1={y1 + 20} x2={l.rod.x0} y2={y1 + 36} />
      <line x1={rodEnd} y1={y1 + 20} x2={rodEnd} y2={y1 + 36} />
      <text x={(l.rod.x0 + rodEnd) / 2} y={y1 + 22} textAnchor="middle">
        rod L {l.rod.length} mm · Ø{l.rod.d} mm
      </text>
    </g>
  )
}

// ---- panels -------------------------------------------------------------------------------

function DimensionsPanel({ part, onClose }: { part: Part | undefined; onClose: () => void }) {
  const api = useToolApi()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<'apply' | 'artifact' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const artifacts = useArtifacts({ objectId: part?.component?.id ?? part?.rep.id ?? '__none__', toolId: 'cad' })

  // Reset the form when the part or its stored values change (e.g. an edit from another window).
  const key = part ? `${part.rep.id}@${part.rep.revision}` : ''
  useEffect(() => {
    setValues(part ? Object.fromEntries(Object.entries(part.rep.parameters).map(([k, q]) => [k, String(q.value)])) : {})
    setError(null)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const edits = part
    ? Object.entries(values).flatMap(([parameter, raw]) => {
        const current = part.rep.parameters[parameter]?.value
        const v = validateDimension(parameter, raw)
        return v.ok && v.value !== current ? [{ parameter, value: v.value }] : []
      })
    : []
  const invalid = part ? Object.entries(values).filter(([p, raw]) => !validateDimension(p, raw).ok) : []
  const dirty = part ? Object.entries(values).some(([p, raw]) => String(part.rep.parameters[p]?.value) !== raw.trim()) : false
  useUnsavedChanges(dirty && saving === null)

  const apply = async () => {
    if (!part || !edits.length || invalid.length) return
    setSaving('apply')
    setError(null)
    try {
      const summary = edits.map((e) => `${e.parameter} ${part.rep.parameters[e.parameter].value} → ${e.value} mm`).join(', ')
      const mapped = part.component ? edits.filter((e) => mappedProperty(part.component, e.parameter)) : []
      await api.submitChanges(
        dimensionChanges(part, edits),
        `CAD dimension edit on ${part.rep.id}: ${summary}${mapped.length ? ` (also ${part.component!.id})` : ''}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  const saveArtifact = async () => {
    if (!part) return
    setSaving('artifact')
    setError(null)
    try {
      const params = Object.entries(part.rep.parameters)
      await api.saveArtifact({
        kind: ARTIFACT_KIND,
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        title: `${part.component?.name ?? part.rep.name} representation snapshot`,
        objectIds: part.component ? [part.component.id, part.rep.id] : [part.rep.id],
        inputs: [
          { id: part.rep.id, revision: part.rep.revision },
          ...(part.component ? [{ id: part.component.id, revision: part.component.revision }] : []),
        ],
        scenarioId: null,
        completion: 'complete',
        result: params.map(([k, q]) => ({ key: k, label: DIMENSIONS[k]?.label ?? k, value: q.value, unit: q.unit })),
        summary: `Mock geometry: ${params.map(([k, q]) => `${DIMENSIONS[k]?.label ?? k} ${q.value} ${q.unit}`).join(', ')}`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(null)
    }
  }

  return (
    <aside className="cad-panel" aria-label="Dimensions">
      <header className="cad-panel-header">
        <h3>Dimensions</h3>
        <IconButton label="Close dimensions" icon="close" size="sm" onPress={onClose} />
      </header>
      {!part ? (
        <EmptyState icon="dimensions" title="Select a part">
          Select the housing, rod or motor to edit its demonstration dimensions.
        </EmptyState>
      ) : (
        <div className="cad-panel-body">
          <div className="flex flex-wrap items-center gap-1.5 text-ui-sm">
            <span className="font-mono">{part.rep.id}</span>
            <span className="text-fg-3">represents</span>
            {part.component ? <ObjectRef object={part.component} /> : <span className="text-fg-3">no component</span>}
          </div>
          <form
            className="cad-form"
            onSubmit={(e) => {
              e.preventDefault()
              void apply()
            }}
          >
            {Object.keys(part.rep.parameters).map((parameter) => {
              const v = validateDimension(parameter, values[parameter] ?? '')
              const property = mappedProperty(part.component, parameter)
              return (
                <TextField
                  key={parameter}
                  label={DIMENSIONS[parameter]?.label ?? parameter}
                  unit="mm"
                  inputMode="decimal"
                  value={values[parameter] ?? ''}
                  onChange={(value) => setValues((s) => ({ ...s, [parameter]: value }))}
                  errorMessage={v.ok ? undefined : v.message}
                  description={
                    property
                      ? `Also updates ${part.component!.id} ${property} (current ${formatValue(part.component!.properties[property])}).`
                      : 'Representation only; no component property is mapped.'
                  }
                />
              )
            })}
            {error && (
              <Notice tone="danger" title="Not saved" actions={<Button size="sm" variant="outlined" icon="reset" onPress={() => void apply()}>Try again</Button>}>
                {error} Your values are kept.
              </Notice>
            )}
            <div className="cad-form-actions">
              {saving === 'apply' ? <StatusBadge status="saving" /> : dirty ? <StatusBadge status="unsaved" /> : <span className="text-ui-xs text-fg-3">rev {part.rep.revision}</span>}
              <span className="flex-1" />
              <Button type="submit" variant="filled" icon="check" isDisabled={!edits.length || invalid.length > 0} isPending={saving === 'apply'}>
                Apply
              </Button>
            </div>
          </form>
          <div className="cad-artifacts">
            <div className="flex items-center justify-between gap-2">
              <h4>Representation artifacts</h4>
              <Button size="sm" variant="outlined" icon="save" onPress={() => void saveArtifact()} isPending={saving === 'artifact'} isDisabled={dirty}>
                Save snapshot
              </Button>
            </div>
            {dirty && <p className="ws-hint m-0">Apply or reset your edits before saving a snapshot.</p>}
            {artifacts.length === 0 ? (
              <p className="m-0 text-fg-3">No snapshot saved for this part in this configuration.</p>
            ) : (
              <ul className="ws-output-list">
                {artifacts.map((a) => (
                  <li key={a.id} className={a.freshness.stale ? 'is-stale' : ''} data-output-id={a.id}>
                    <div className="ws-output-head">
                      <span className="font-mono">{a.id}</span>
                      <span>{a.summary}</span>
                    </div>
                    <div className="ws-output-meta">
                      <FreshnessBadge freshness={a.freshness} />
                      <span>schema v{a.schemaVersion}</span>
                      <span>input rev {a.inputRevision}</span>
                      <span>{formatTime(a.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

function VisibilityPanel({ parts, hidden, setHidden, onClose }: { parts: Part[]; hidden: string[]; setHidden: (ids: string[]) => void; onClose: () => void }) {
  return (
    <aside className="cad-panel" aria-label="Visibility">
      <header className="cad-panel-header">
        <h3>Visibility</h3>
        <IconButton label="Close visibility" icon="close" size="sm" onPress={onClose} />
      </header>
      <div className="cad-panel-body">
        <p className="ws-hint m-0">Hidden parts stay in the model; this only affects this view.</p>
        {parts.map((p) => (
          <Checkbox
            key={p.rep.id}
            isSelected={!hidden.includes(p.rep.id)}
            onChange={(visible) => setHidden(visible ? hidden.filter((h) => h !== p.rep.id) : [...hidden, p.rep.id])}
          >
            <span className="font-mono">{p.component?.id ?? p.rep.id}</span> {p.component?.name ?? p.rep.name}
          </Checkbox>
        ))}
        <Button size="sm" variant="text" icon="visibility" isDisabled={!hidden.length} onPress={() => setHidden([])}>
          Show all
        </Button>
      </div>
    </aside>
  )
}

// ---- view ---------------------------------------------------------------------------------

function viewBoxOf(l: Layout, camera: Camera) {
  const w = l.bounds.w / camera.zoom
  const h = l.bounds.h / camera.zoom
  const cx = l.bounds.x + l.bounds.w / 2 + camera.panX
  const cy = l.bounds.y + l.bounds.h / 2 + camera.panY
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

export default function CadView() {
  const api = useToolApi<CadViewState>()
  const model = useModel()
  const { selectedIds, select } = useSelection()
  const { resolution } = useResolvedSelection('cad')
  const [viewState, setViewState] = useToolViewState<CadViewState>()
  const { camera, mode, panel, hidden } = viewState
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const parts = useMemo(() => partsOf(model), [model])
  const layout = useMemo(() => layoutOf(parts), [parts])
  const vb = viewBoxOf(layout, camera)
  const highlighted = new Set(resolution?.status === 'resolved' ? resolution.ids : [])
  const assemblySelected = selectedIds.some((id) => model.get(id)?.type === 'assembly')
  const selectedPart = partForComponent(parts, selectedComponentId(model, selectedIds))
  const drawable = parts.filter((p) => SHAPES[p.rep.shape])

  const worldPerPixel = () => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return 1
    return 1 / Math.min(rect.width / vb.w, rect.height / vb.h)
  }

  // Wheel zoom (non-passive listener so the page doesn't scroll).
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setViewState((vs) => ({ ...vs, camera: { ...vs.camera, zoom: Math.min(8, Math.max(0.5, vs.camera.zoom * Math.pow(1.0015, -e.deltaY))) } }))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [setViewState])

  // Pointer navigation: drag pans (taps still select), two touch points pinch-zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const suppressClick = useRef(false)
  const gesture = useRef<
    { kind: 'drag'; x: number; y: number; camera: Camera; moved: boolean } | { kind: 'pinch'; distance: number; camera: Camera } | null
  >(null)
  const capture = (el: Element, id: number) => {
    try {
      el.setPointerCapture(id)
    } catch {
      // pointer no longer active
    }
  }
  const distance = () => {
    const [p1, p2] = [...pointers.current.values()]
    return Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1
  }
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    suppressClick.current = false
    if (pointers.current.size === 1) gesture.current = { kind: 'drag', x: e.clientX, y: e.clientY, camera, moved: mode === 'pan' }
    else if (pointers.current.size === 2) gesture.current = { kind: 'pinch', distance: distance(), camera }
    if (mode === 'pan') capture(e.currentTarget, e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      setViewState({ camera: { ...g.camera, zoom: Math.min(8, Math.max(0.5, g.camera.zoom * (distance() / g.distance))) } })
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
      if (!g.moved || (dx === 0 && dy === 0)) return
      suppressClick.current = true
      const k = worldPerPixel()
      setViewState({ camera: { ...g.camera, panX: g.camera.panX - dx * k, panY: g.camera.panY - dy * k } })
    }
  }
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current = null
  }

  const choose = (componentId: string | undefined, additive: boolean) => {
    if (mode === 'pan' || suppressClick.current || !componentId) return
    select(additive ? (selectedIds.includes(componentId) ? selectedIds.filter((s) => s !== componentId) : [...selectedIds, componentId]) : [componentId])
  }
  const onPartKey = (e: KeyboardEvent, componentId: string | undefined) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(componentId, e.shiftKey)
    }
  }

  return (
    <div className={`cad-root${panel ? ' has-panel' : ''}`}>
      <div className="cad-stage">
        <div className="cad-notices">
          <MockTag>Mock geometry · not a production CAD kernel</MockTag>
          {resolution?.status === 'none' && (
            <Notice tone="info" title="Nothing to show for this selection">
              {resolution.reason} The selection is kept.
            </Notice>
          )}
        </div>
        <svg
          ref={svgRef}
          className={`cad-canvas cad-mode-${mode}`}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Actuator assembly, mock side elevation. Parts can be selected with Tab and Enter."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <pattern id="grid-cad" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" className="cad-gridline" />
            </pattern>
          </defs>
          <rect
            className="cad-bg"
            x={vb.x - vb.w}
            y={vb.y - vb.h}
            width={vb.w * 3}
            height={vb.h * 3}
            fill="url(#grid-cad)"
            onClick={() => !suppressClick.current && mode === 'select' && select([])}
          />
          {assemblySelected && (
            <rect className="cad-assembly-frame" x={layout.bounds.x + 30} y={layout.bounds.y + 30} width={layout.bounds.w - 60} height={layout.bounds.h - 70} rx={8} />
          )}
          {/* Rod first: it slides inside the housing. */}
          {[...drawable].sort((a, b) => (a.rep.shape === 'rod' ? 0 : 1) - (b.rep.shape === 'rod' ? 0 : 1)).map((p) => {
            if (hidden.includes(p.rep.id)) return null
            const Shape = SHAPES[p.rep.shape]
            const id = p.component?.id
            const selected = highlighted.has(p.rep.id) || assemblySelected
            return (
              <g
                key={p.rep.id}
                className={['cad-part', `cad-shape-${p.rep.shape}`, selected ? 'is-selected' : '', hovered === p.rep.id ? 'is-hovered' : ''].join(' ')}
                data-object-id={id}
                data-rep-id={p.rep.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${id ?? p.rep.id} ${p.component?.name ?? p.rep.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  choose(id, e.shiftKey || e.ctrlKey || e.metaKey)
                }}
                onKeyDown={(e) => onPartKey(e, id)}
                onPointerEnter={() => setHovered(p.rep.id)}
                onPointerLeave={() => setHovered((h) => (h === p.rep.id ? null : h))}
              >
                <title>{`${id ?? ''} ${p.component?.name ?? ''} (${p.rep.id}, mock geometry)`}</title>
                <Shape l={layout} />
              </g>
            )
          })}
          {panel === 'dimensions' && <DimensionOverlay l={layout} />}
        </svg>
        <div className="cad-status">
          <span>{mode === 'pan' ? 'Pan: drag to move' : 'Tap, click or Tab + Enter to select (Shift adds) · drag to pan · scroll or pinch to zoom'}</span>
          <span>Zoom {Math.round(camera.zoom * 100)}%</span>
          {hidden.length > 0 && <span>{hidden.length} hidden</span>}
          <Button size="sm" variant="text" icon="fit" onPress={() => api.updateViewState({ camera: { panX: 0, panY: 0, zoom: 1 } })}>
            Fit
          </Button>
        </div>
      </div>
      {panel === 'dimensions' && <DimensionsPanel part={selectedPart} onClose={() => setViewState({ panel: null })} />}
      {panel === 'visibility' && (
        <VisibilityPanel parts={parts} hidden={hidden} setHidden={(h) => setViewState({ hidden: h })} onClose={() => setViewState({ panel: null })} />
      )}
    </div>
  )
}
