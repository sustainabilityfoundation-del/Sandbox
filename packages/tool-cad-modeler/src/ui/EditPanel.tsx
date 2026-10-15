import {
  constraintSignatures,
  isDimensional,
  type CadEngine,
  type ConstraintType,
  type DryRunResult,
  type EngineState,
  type ExtrudeFeature,
  type Part,
  type RevolveFeature,
  type SketchFeature,
} from '@ews/cad-core'
import { Badge, Button, Checkbox, EmptyState, IconButton, Notice, SegmentedControl, Select, TextField } from '@ews/design-system'
import { useEffect, useMemo, useState } from 'react'
import type { CadModelerViewState, Editing } from '../viewState'
import { CommitField, SKETCH_STATUS, exprValue, fmtNum, makeRun, regenOf } from './common'

interface Props {
  engine: CadEngine
  state: EngineState
  vs: CadModelerViewState
  update: (u: Partial<CadModelerViewState>) => void
}

/** Context editing panel: sketch creation and editing, extrude and revolve dialogs. */
export function EditPanel({ engine, state, vs, update }: Props) {
  const editing = vs.editing
  if (!editing)
    return (
      <div className="cadm-panel-body">
        <EmptyState icon="edit" title="Nothing being edited">
          Choose <strong>Sketch</strong>, <strong>Extrude</strong> or <strong>Revolve</strong> in the toolbar, or <strong>Edit</strong> on a feature in the Model tab.
        </EmptyState>
      </div>
    )
  const part = state.doc.parts[0]
  if (!part) return <div className="cadm-panel-body"><Notice tone="warning">The document has no part. Add one in the Model tab.</Notice></div>
  if (editing.kind === 'new-sketch') return <NewSketch engine={engine} parts={state.doc.parts} update={update} />
  if (editing.kind === 'sketch') return <SketchTools key={editing.sketchId} engine={engine} state={state} sketchId={editing.sketchId} vs={vs} update={update} />
  return <SolidFeatureForm key={`${editing.kind}:${editing.featureId ?? 'new'}`} engine={engine} state={state} editing={editing} update={update} />
}

function NewSketch({ engine, parts, update }: { engine: CadEngine; parts: Part[]; update: Props['update'] }) {
  const [partId, setPartId] = useState(parts[0].id)
  const [plane, setPlane] = useState('XY')
  const [offset, setOffset] = useState('0')
  const [name, setName] = useState('')
  const run = makeRun(engine)
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.sketch.create">
      <h3 className="cadm-section-title">New sketch</h3>
      {parts.length > 1 && <Select label="Part" value={partId} onChange={setPartId} options={parts.map((p) => ({ id: p.id, label: p.name }))} />}
      <Select label="Plane" value={plane} onChange={setPlane} options={[{ id: 'XY', label: 'XY (top, normal +Z)' }, { id: 'XZ', label: 'XZ (front, normal −Y)' }, { id: 'YZ', label: 'YZ (right, normal +X)' }]} />
      <TextField label="Offset along the normal" unit="mm" value={offset} onChange={setOffset} description="A number or an expression over parameters." />
      <TextField label="Name (optional)" value={name} onChange={setName} />
      <div className="cadm-actions">
        <Button
          variant="filled"
          icon="check"
          onPress={async () => {
            const r = await run([{ command: 'create_sketch', input: { partId, plane, ...(offset.trim() && offset.trim() !== '0' ? { offset: exprValue(offset) } : {}), ...(name.trim() ? { name: name.trim() } : {}) } }], 'Create sketch')
            if (r?.ok) update({ editing: { kind: 'sketch', sketchId: r.results[0].result.sketchId as string }, selection: [] })
          }}
        >
          Create sketch
        </Button>
        <Button variant="quiet" onPress={() => update({ editing: null })}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

type GeometryKind = 'rectangle' | 'circle' | 'line' | 'arc' | 'point'

const CONSTRAINT_LABEL: Record<ConstraintType, string> = {
  coincident: 'Coincident',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  parallel: 'Parallel',
  perpendicular: 'Perpendicular',
  equal: 'Equal',
  fixed: 'Fixed',
  'point-on-line': 'Point on line',
  'point-on-circle': 'Point on circle',
  midpoint: 'Midpoint',
  tangent: 'Tangent',
  concentric: 'Concentric',
  distance: 'Distance',
  'distance-x': 'Horizontal distance',
  'distance-y': 'Vertical distance',
  length: 'Length',
  radius: 'Radius',
  diameter: 'Diameter',
  angle: 'Angle',
}

function SketchTools({ engine, state, sketchId, vs, update }: { engine: CadEngine; state: EngineState; sketchId: string; vs: CadModelerViewState; update: Props['update'] }) {
  const run = makeRun(engine)
  const part = state.doc.parts.find((p) => p.features.some((f) => f.id === sketchId))
  const sketch = part?.features.find((f) => f.id === sketchId) as SketchFeature | undefined
  const result = part ? regenOf(state, part.id)?.features.find((f) => f.featureId === sketchId) : undefined
  const sol = result?.sketch?.solution
  const selected = vs.selection.filter((s) => s.kind === 'sketch-entity' && s.sketchId === sketchId).map((s) => s.id)
  const [kind, setKind] = useState<GeometryKind>('rectangle')
  if (!sketch || !part) return <div className="cadm-panel-body"><Notice tone="warning">Sketch {sketchId} no longer exists.</Notice></div>
  const status = SKETCH_STATUS[sol?.status ?? 'not-regenerated']
  const toggle = (id: string) => {
    const others = vs.selection.filter((s) => !(s.kind === 'sketch-entity' && s.id === id))
    update({ selection: selected.includes(id) ? others : [...others, { kind: 'sketch-entity', id, sketchId }] })
  }
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.sketch.edit">
      <div className="cadm-row">
        <h3 className="cadm-section-title">{sketch.name}</h3>
        <Badge tone={status.tone} icon={sol?.status === 'fully-constrained' ? 'locked' : 'unlocked'}>
          {status.label}
          {sol ? `, ${sol.dof} DOF` : ''}
        </Badge>
      </div>
      <p className="cadm-muted">
        Plane {sketch.plane.plane}
        {sketch.plane.offset ? ` offset ${sketch.plane.offset}` : ''}. Highlighted points still have degrees of freedom; add constraints until the sketch is fully constrained.
      </p>
      {result?.error && <Notice tone="danger" title="Sketch does not solve">{result.error.message}</Notice>}
      {!!result?.sketch?.profile.issues.length && (
        <Notice tone="warning" title="Profile">
          {result.sketch.profile.issues.map((i) => i.message).join(' ')}
        </Notice>
      )}
      {result?.sketch && !result.sketch.profile.issues.length && (
        <p className="cadm-muted">
          Closed profile: {result.sketch.profile.regions.length} region(s), area {fmtNum(result.sketch.profile.regions.reduce((s, r) => s + r.area, 0), 2)} mm².
        </p>
      )}

      <section className="cadm-section" data-help-id="cad-modeler.sketch.geometry" aria-label="Add geometry">
        <h4 className="cadm-subtitle">Add geometry</h4>
        <SegmentedControl
          label="Geometry"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'circle', label: 'Circle' },
            { value: 'line', label: 'Line' },
            { value: 'arc', label: 'Arc' },
            { value: 'point', label: 'Point' },
          ]}
        />
        <GeometryForm kind={kind} sketchId={sketchId} run={run} />
      </section>

      <section className="cadm-section" data-help-id="cad-modeler.sketch.constrain" aria-label="Constrain">
        <h4 className="cadm-subtitle">Constrain the selection</h4>
        <ConstraintForm sketch={sketch} selected={selected} run={run} onDone={() => update({ selection: vs.selection.filter((s) => s.kind !== 'sketch-entity') })} />
      </section>

      <section className="cadm-section" data-help-id="cad-modeler.sketch.dimensions" aria-label="Constraints and dimensions">
        <h4 className="cadm-subtitle">Constraints and dimensions ({sketch.constraints.length})</h4>
        <ul className="cadm-list">
          {sketch.constraints.map((c) => {
            const flags = [sol?.conflicting.includes(c.id) && 'conflicting', sol?.redundant.includes(c.id) && 'redundant'].filter(Boolean)
            return (
              <li key={c.id} className="cadm-constraint">
                <span className="cadm-constraint-type">{CONSTRAINT_LABEL[c.type]}</span>
                <span className="cadm-muted cadm-mono">{c.entities.join(', ')}</span>
                {isDimensional(c.type) &&
                  (c.driving === false ? (
                    <span className="cadm-param-value">driven: {fmtNum(sol?.driven[c.id])}</span>
                  ) : (
                    <CommitField ariaLabel={`${CONSTRAINT_LABEL[c.type]} ${c.id}`} value={String(c.value ?? '')} className="cadm-constraint-value" onCommit={(v) => run([{ command: 'set_dimension', input: { sketchId, constraintId: c.id, value: exprValue(v) } }], `Set ${CONSTRAINT_LABEL[c.type].toLowerCase()}`)} />
                  ))}
                {!!flags.length && <Badge tone="danger">{flags.join(', ')}</Badge>}
                {isDimensional(c.type) && (
                  <IconButton
                    label={c.driving === false ? `Make ${c.id} driving` : `Make ${c.id} driven (reference)`}
                    icon={c.driving === false ? 'unlocked' : 'locked'}
                    size="sm"
                    onPress={() => run([{ command: 'set_dimension_driving', input: { sketchId, constraintId: c.id, driving: c.driving === false } }], 'Change dimension type')}
                  />
                )}
                <IconButton label={`Delete constraint ${c.id}`} icon="close" size="sm" onPress={() => run([{ command: 'delete_constraint', input: { sketchId, constraintId: c.id } }], 'Delete constraint')} />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="cadm-section" aria-label="Entities">
        <h4 className="cadm-subtitle">Entities ({sketch.entities.length})</h4>
        <div className="cadm-entity-list">
          {['origin', 'x-axis', 'y-axis', ...sketch.entities.map((e) => e.id)].map((id) => {
            const e = sketch.entities.find((x) => x.id === id)
            const free = sol?.freePoints.includes(id) || sol?.freeCircles.includes(id)
            return (
              <Checkbox key={id} isSelected={selected.includes(id)} onChange={() => toggle(id)}>
                <span className="cadm-mono">{id}</span> <span className="cadm-muted">{e ? `${e.type}${e.construction ? ', construction' : ''}${free ? ', free' : ''}` : 'reference'}</span>
              </Checkbox>
            )
          })}
        </div>
        <div className="cadm-actions">
          <Button size="sm" variant="outlined" isDisabled={!selected.some((id) => sketch.entities.some((e) => e.id === id && e.type !== 'point'))} onPress={() => {
            const curves = selected.filter((id) => sketch.entities.some((e) => e.id === id && e.type !== 'point'))
            const anyNormal = curves.some((id) => !sketch.entities.find((e) => e.id === id)?.construction)
            run([{ command: 'set_construction', input: { sketchId, ids: curves, construction: anyNormal } }], 'Toggle construction')
          }}>
            Toggle construction
          </Button>
          <Button size="sm" variant="danger" isDisabled={!selected.some((id) => sketch.entities.some((e) => e.id === id))} onPress={async () => {
            const r = await run([{ command: 'delete_sketch_entities', input: { sketchId, ids: selected.filter((id) => sketch.entities.some((e) => e.id === id)) } }], 'Delete sketch entities')
            if (r?.ok) update({ selection: [] })
          }}>
            Delete selected
          </Button>
        </div>
      </section>

      <div className="cadm-actions">
        <Button variant="filled" icon="check" onPress={() => update({ editing: null, selection: [], viewRequest: { kind: 'fit', seq: Date.now() } })}>
          Finish sketch
        </Button>
        <Button variant="outlined" icon="arrow-right" onPress={() => update({ editing: { kind: 'extrude' } })} isDisabled={!result?.sketch?.profile.regions.length}>
          Extrude this sketch
        </Button>
      </div>
    </div>
  )
}

function num(t: string) {
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

function GeometryForm({ kind, sketchId, run }: { kind: GeometryKind; sketchId: string; run: ReturnType<typeof makeRun> }) {
  const [f, setF] = useState<Record<string, string>>({ x: '0', y: '0', x2: '40', y2: '0', w: '40', h: '20', d: '10', cx: '0', cy: '0', sx: '10', sy: '0', ex: '0', ey: '10', dims: 'yes' })
  const field = (key: string, label: string, unit = 'mm') => <TextField key={key} label={label} unit={unit} value={f[key]} onChange={(v) => setF((s) => ({ ...s, [key]: v }))} />
  const add = () => {
    const commands = {
      rectangle: [{ command: 'add_rectangle', input: { sketchId, corner: [num(f.x), num(f.y)], width: exprValue(f.w), height: exprValue(f.h), dimensions: f.dims === 'yes' } }],
      circle: [
        { command: 'add_circle', input: { sketchId, center: [num(f.cx), num(f.cy)], radius: Math.max(0.001, Number(exprValue(f.d)) / 2 || 5), ref: '$c' } },
        ...(f.dims === 'yes' ? [{ command: 'apply_constraint', input: { sketchId, type: 'diameter', entities: ['$c'], value: exprValue(f.d) } }] : []),
      ],
      line: [{ command: 'add_line', input: { sketchId, start: [num(f.x), num(f.y)], end: [num(f.x2), num(f.y2)] } }],
      arc: [{ command: 'add_arc', input: { sketchId, center: [num(f.cx), num(f.cy)], start: [num(f.sx), num(f.sy)], end: [num(f.ex), num(f.ey)] } }],
      point: [{ command: 'add_point', input: { sketchId, x: num(f.x), y: num(f.y) } }],
    }[kind]
    run(commands, `Add ${kind}`)
  }
  return (
    <div className="cadm-form-grid">
      {kind === 'rectangle' && [field('x', 'Corner x'), field('y', 'Corner y'), field('w', 'Width'), field('h', 'Height')]}
      {kind === 'circle' && [field('cx', 'Centre x'), field('cy', 'Centre y'), field('d', 'Diameter')]}
      {kind === 'line' && [field('x', 'Start x'), field('y', 'Start y'), field('x2', 'End x'), field('y2', 'End y')]}
      {kind === 'arc' && [field('cx', 'Centre x'), field('cy', 'Centre y'), field('sx', 'Start x'), field('sy', 'Start y'), field('ex', 'End x'), field('ey', 'End y')]}
      {kind === 'point' && [field('x', 'x'), field('y', 'y')]}
      {(kind === 'rectangle' || kind === 'circle') && (
        <Checkbox isSelected={f.dims === 'yes'} onChange={(v) => setF((s) => ({ ...s, dims: v ? 'yes' : 'no' }))}>
          Add {kind === 'rectangle' ? 'width and height' : 'diameter'} dimensions
        </Checkbox>
      )}
      <Button size="sm" icon="add" variant="tonal" onPress={add}>
        Add {kind}
      </Button>
      <p className="cadm-hint">A rectangle at corner 0, 0 is fixed to the sketch origin. Arcs run counter-clockwise from start to end.</p>
    </div>
  )
}

function ConstraintForm({ sketch, selected, run, onDone }: { sketch: SketchFeature; selected: string[]; run: ReturnType<typeof makeRun>; onDone: () => void }) {
  const kindOf = (id: string) => (id === 'origin' ? 'point' : id === 'x-axis' || id === 'y-axis' ? 'line' : (() => {
    const e = sketch.entities.find((x) => x.id === id)
    return e ? (e.type === 'point' ? 'point' : e.type === 'line' ? 'line' : 'curve') : undefined
  })())
  const kinds = selected.map(kindOf)
  const applicable = useMemo(
    () => (Object.keys(CONSTRAINT_LABEL) as ConstraintType[]).filter((t) => constraintSignatures(t).some((sig) => sig.length === kinds.length && sig.every((k, i) => k === kinds[i]))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kinds.join(',')],
  )
  const [type, setType] = useState<string>('')
  const [value, setValue] = useState('')
  const [driving, setDriving] = useState(true)
  useEffect(() => {
    if (!applicable.includes(type as ConstraintType)) setType(applicable[0] ?? '')
  }, [applicable, type])
  if (!selected.length) return <p className="cadm-muted">Select one or two entities in the sketch or in the entity list below (points, lines, circles, arcs, the origin or the axes).</p>
  if (!applicable.length) return <p className="cadm-muted">No constraint applies to {selected.join(' + ')} ({kinds.join(' + ')}). Change the selection; the order matters (for example point, then line).</p>
  const dimensional = type && isDimensional(type as ConstraintType)
  return (
    <div className="cadm-form-grid">
      <p className="cadm-muted">Selected: <span className="cadm-mono">{selected.join(' → ')}</span></p>
      <Select label="Constraint" value={type} onChange={setType} options={applicable.map((t) => ({ id: t, label: CONSTRAINT_LABEL[t] }))} />
      {dimensional && <TextField label="Value" unit={type === 'angle' ? 'deg' : 'mm'} value={value} onChange={setValue} description="A number or an expression over parameters." isDisabled={!driving} />}
      {dimensional && (
        <Checkbox isSelected={!driving} onChange={(v) => setDriving(!v)}>
          Driven (reference) dimension
        </Checkbox>
      )}
      <Button
        size="sm"
        variant="tonal"
        icon="check"
        isDisabled={!type || (!!dimensional && driving && !value.trim())}
        onPress={async () => {
          const r = await run([{ command: 'apply_constraint', input: { sketchId: sketch.id, type, entities: selected, ...(dimensional && driving ? { value: exprValue(value) } : {}), ...(dimensional && !driving ? { driving: false } : {}) } }], `Apply ${CONSTRAINT_LABEL[type as ConstraintType].toLowerCase()}`)
          if (r?.ok) {
            setValue('')
            onDone()
          }
        }}
      >
        Apply constraint
      </Button>
    </div>
  )
}

function SolidFeatureForm({ engine, state, editing, update }: { engine: CadEngine; state: EngineState; editing: Extract<Editing, { kind: 'extrude' | 'revolve' }>; update: Props['update'] }) {
  const run = makeRun(engine)
  const all = state.doc.parts.flatMap((p) => p.features.map((f) => ({ part: p, f })))
  const existing = editing.featureId ? (all.find((x) => x.f.id === editing.featureId)?.f as ExtrudeFeature | RevolveFeature | undefined) : undefined
  const sketches = all.filter((x) => x.f.type === 'sketch')
  const regen = state.regen?.parts.flatMap((p) => p.features)
  const goodSketch = (id: string) => !!regen?.find((r) => r.featureId === id)?.sketch?.profile.regions.length
  const lastSketch = [...sketches].reverse().find((s) => goodSketch(s.f.id))?.f.id ?? sketches.at(-1)?.f.id ?? ''
  const [sketchId, setSketchId] = useState(existing?.sketch ?? lastSketch)
  const [distance, setDistance] = useState(existing?.type === 'extrude' ? String(existing.extent.distance) : '10')
  const [direction, setDirection] = useState(existing?.type === 'extrude' ? existing.extent.direction : 'normal')
  const [angle, setAngle] = useState(existing?.type === 'revolve' ? String(existing.angle) : '360')
  const [axis, setAxis] = useState(existing?.type === 'revolve' ? existing.axis : 'y-axis')
  const hasBody = !!state.regen?.parts.some((p) => p.bodies.length)
  const [operation, setOperation] = useState<string>(existing?.operation ?? (hasBody ? 'join' : 'new'))
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const kind = editing.kind
  const sketch = sketches.find((s) => s.f.id === sketchId)?.f as SketchFeature | undefined
  const axisOptions = [{ id: 'x-axis', label: 'Sketch x-axis' }, { id: 'y-axis', label: 'Sketch y-axis' }, ...(sketch?.entities.filter((e) => e.type === 'line').map((e) => ({ id: e.id, label: `Line ${e.id}${e.construction ? ' (construction)' : ''}` })) ?? [])]

  const commands = () => {
    if (existing) {
      const changes = kind === 'extrude' ? { distance: exprValue(distance), direction, operation } : { angle: exprValue(angle), axis, operation }
      return [{ command: 'edit_feature', input: { featureId: existing.id, ...changes } }]
    }
    return kind === 'extrude'
      ? [{ command: 'extrude_profile', input: { sketchId, distance: exprValue(distance), direction, operation } }]
      : [{ command: 'revolve_profile', input: { sketchId, axis, angle: exprValue(angle), operation } }]
  }
  useEffect(() => setPreview(null), [sketchId, distance, direction, angle, axis, operation])

  return (
    <div className="cadm-panel-body" data-help-id={`cad-modeler.feature.${kind}`}>
      <h3 className="cadm-section-title">{existing ? `Edit ${existing.name}` : kind === 'extrude' ? 'Extrude' : 'Revolve'}</h3>
      {!sketches.length && <Notice tone="info">Create a sketch with a closed profile first (toolbar: Sketch).</Notice>}
      <Select label="Sketch (profile)" value={sketchId || null} onChange={setSketchId} isDisabled={!!existing} options={sketches.map((s) => ({ id: s.f.id, label: `${s.f.name} (${s.f.id})${goodSketch(s.f.id) ? '' : ' – no closed profile'}` }))} />
      {kind === 'extrude' ? (
        <>
          <TextField label="Distance" unit="mm" value={distance} onChange={setDistance} description="A number or an expression, e.g. thickness." />
          <Select label="Direction" value={direction} onChange={(v) => setDirection(v as typeof direction)} options={[{ id: 'normal', label: 'Along the plane normal' }, { id: 'reverse', label: 'Reverse' }, { id: 'symmetric', label: 'Symmetric (both sides)' }]} />
        </>
      ) : (
        <>
          <Select label="Axis" value={axis} onChange={setAxis} options={axisOptions} />
          <TextField label="Angle" unit="deg" value={angle} onChange={setAngle} description="Up to 360 degrees." />
        </>
      )}
      <Select label="Operation" value={operation} onChange={setOperation} options={[{ id: 'new', label: 'New body' }, { id: 'join', label: 'Join (add material)' }, { id: 'cut', label: 'Cut (remove material)' }]} />
      {preview && (
        <Notice tone={preview.ok && preview.after?.ok ? 'info' : 'warning'} title="Preview (not applied)">
          {preview.ok ? (
            <>
              {(preview.after?.bodies ?? []).map((b) => (
                <span key={b.bodyId} className="cadm-block">
                  {b.bodyId}: {fmtNum(b.volume, 1)} mm³ ({preview.before.bodies.find((x) => x.bodyId === b.bodyId) ? `was ${fmtNum(preview.before.bodies.find((x) => x.bodyId === b.bodyId)!.volume, 1)}` : 'new'}), {b.faces} faces{b.valid ? '' : ', invalid solid'}
                </span>
              ))}
              {(preview.after?.failures ?? []).map((f) => (
                <span key={f.featureId} className="cadm-block cadm-error">
                  {f.name}: {f.error?.message ?? f.warnings.map((w) => w.message).join(' ')}
                </span>
              ))}
            </>
          ) : (
            preview.error?.message
          )}
        </Notice>
      )}
      <div className="cadm-actions">
        <Button variant="outlined" icon="visibility" isDisabled={!sketchId} onPress={async () => setPreview(await engine.dryRun({ commands: commands() }))}>
          Preview
        </Button>
        <Button
          variant="filled"
          icon="check"
          isDisabled={!sketchId}
          onPress={async () => {
            const r = await run(commands(), existing ? `Edit ${existing.name}` : kind === 'extrude' ? 'Extrude' : 'Revolve')
            if (r?.ok) update({ editing: null, viewRequest: { kind: 'fit', seq: Date.now() } })
          }}
        >
          {existing ? 'Apply' : 'Create'}
        </Button>
        <Button variant="quiet" onPress={() => update({ editing: null })}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
