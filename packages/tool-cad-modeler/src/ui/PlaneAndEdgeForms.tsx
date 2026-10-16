import type { CadEngine, DryRunResult, EngineState, Feature, PlaneRef } from '@ews/cad-core'
import { Badge, Button, Checkbox, EmptyState, Notice, Select, TextField } from '@ews/design-system'
import { useEffect, useMemo, useState } from 'react'
import type { CadModelerViewState } from '../viewState'
import { exprValue, fmtNum, makeRun, useMeasure } from './common'

type Update = (u: Partial<CadModelerViewState>) => void

/** Plane choices at the end of the history: standard planes, datum planes, stable planar faces. */
export function planeOptions(state: EngineState, before?: string) {
  const part = state.doc.parts[0]
  const limit = before ? part.features.findIndex((f) => f.id === before) : part.features.length
  const earlier = part.features.slice(0, limit < 0 ? part.features.length : limit)
  const results = state.regen?.parts[0]?.features ?? []
  const datums = earlier.filter((f) => f.type === 'datum-plane').map((f) => ({ id: `datum:${f.id}`, label: `${f.name} (${f.id})${results.find((r) => r.featureId === f.id)?.status === 'ok' ? '' : ' – not regenerated'}` }))
  const faces = (state.regen?.parts[0]?.bodies ?? []).flatMap((b) => b.analysis.faces.filter((f) => f.surfaceType === 'PLANE' && f.stable && earlier.some((x) => x.id === f.name.split('/')[0])).map((f) => ({ id: `face:${f.name}`, label: `Face ${f.name}` })))
  return [
    { id: 'plane:XY', label: 'XY plane (top, normal +Z)' },
    { id: 'plane:XZ', label: 'XZ plane (front, normal −Y)' },
    { id: 'plane:YZ', label: 'YZ plane (right, normal +X)' },
    ...datums,
    ...faces,
  ]
}

/** Command input for a plane choice ("plane:XY", "datum:dp-3", "face:ext-5/cap-end"). */
export function planeInput(choice: string, offset: string): Record<string, unknown> {
  const [kind, ...rest] = choice.split(':')
  const value = rest.join(':')
  return { [kind]: value, ...(offset.trim() && offset.trim() !== '0' ? { offset: exprValue(offset) } : {}) }
}

export function describePlane(p: PlaneRef): string {
  const base = p.kind === 'standard' ? `plane ${p.plane}` : p.kind === 'datum' ? `datum plane ${p.datum}` : `face ${p.face}`
  return `${base}${p.offset ? `, offset ${p.offset}` : ''}`
}

/** New sketch on a standard plane, a datum plane or a planar face (prefilled from a selected face). */
export function NewSketchForm({ engine, state, vs, update }: { engine: CadEngine; state: EngineState; vs: CadModelerViewState; update: Update }) {
  const options = useMemo(() => planeOptions(state), [state])
  const selectedFace = vs.selection.find((s) => s.kind === 'face')
  const initial = selectedFace && options.some((o) => o.id === `face:${selectedFace.id}`) ? `face:${selectedFace.id}` : 'plane:XY'
  const [choice, setChoice] = useState(initial)
  const [offset, setOffset] = useState('0')
  const [name, setName] = useState('')
  const run = makeRun(engine)
  const part = state.doc.parts[0]
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.sketch.create">
      <h3 className="cadm-section-title">New sketch</h3>
      <Select label="Plane" value={choice} onChange={setChoice} options={options} />
      <p className="cadm-hint">Planar faces are listed by their stable names; select a face in the 3D view first to preselect it. A sketch on a face follows that face when upstream dimensions change.</p>
      <TextField label="Offset along the normal" unit="mm" value={offset} onChange={setOffset} description="A number or an expression over parameters." />
      <TextField label="Name (optional)" value={name} onChange={setName} />
      <div className="cadm-actions">
        <Button
          variant="filled"
          icon="check"
          onPress={async () => {
            const r = await run([{ command: 'create_sketch', input: { partId: part.id, ...planeInput(choice, offset), ...(name.trim() ? { name: name.trim() } : {}) } }], 'Create sketch')
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

/** Create or edit a datum plane. */
export function DatumPlaneForm({ engine, state, featureId, update }: { engine: CadEngine; state: EngineState; featureId?: string; update: Update }) {
  const existing = featureId ? (state.doc.parts[0].features.find((f) => f.id === featureId) as Extract<Feature, { type: 'datum-plane' }> | undefined) : undefined
  const options = useMemo(() => planeOptions(state, featureId), [state, featureId])
  const [choice, setChoice] = useState('plane:XY')
  const [offset, setOffset] = useState(existing ? String(existing.plane.offset ?? 0) : '20')
  const [name, setName] = useState('')
  const run = makeRun(engine)
  const result = featureId ? state.regen?.parts[0]?.features.find((f) => f.featureId === featureId) : undefined
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.feature.datum-plane">
      <h3 className="cadm-section-title">{existing ? `Edit ${existing.name}` : 'Datum plane'}</h3>
      {existing ? <p className="cadm-muted">Based on {describePlane({ ...existing.plane, offset: undefined })}.</p> : <Select label="Based on" value={choice} onChange={setChoice} options={options} />}
      <TextField label="Offset along the normal" unit="mm" value={offset} onChange={setOffset} description="A number or an expression over parameters (may be negative)." />
      {!existing && <TextField label="Name (optional)" value={name} onChange={setName} />}
      {result?.error && <Notice tone="danger">{result.error.message}</Notice>}
      {result?.plane && (
        <p className="cadm-muted">
          Origin ({result.plane.origin.map((v) => fmtNum(v, 3)).join(', ')}), normal ({result.plane.normal.map((v) => fmtNum(v, 3)).join(', ')})
        </p>
      )}
      <div className="cadm-actions">
        <Button
          variant="filled"
          icon="check"
          onPress={async () => {
            const r = existing
              ? await run([{ command: 'edit_feature', input: { featureId: existing.id, offset: exprValue(offset || '0') } }], `Edit ${existing.name}`)
              : await run([{ command: 'create_datum_plane', input: { partId: state.doc.parts[0].id, ...planeInput(choice, offset), ...(name.trim() ? { name: name.trim() } : {}) } }], 'Create datum plane')
            if (r?.ok) update({ editing: null })
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

/** Fillet or chamfer: edges chosen by stable name (list, selected face or picked edges), size, preview. */
export function EdgeFeatureForm({ engine, state, vs, kind, featureId, update }: { engine: CadEngine; state: EngineState; vs: CadModelerViewState; kind: 'fillet' | 'chamfer'; featureId?: string; update: Update }) {
  const M = useMeasure()
  const part = state.doc.parts[0]
  const existing = featureId ? (part.features.find((f) => f.id === featureId) as Extract<Feature, { type: 'fillet' | 'chamfer' }> | undefined) : undefined
  // Edges of the body as it was before this feature: the latest body state that does not include it.
  const pr = state.regen?.parts[0]
  const bodies = pr?.bodies ?? []
  const [bodyId, setBodyId] = useState<string | null>(existing?.target ?? bodies.at(-1)?.bodyId ?? null)
  const body = bodies.find((b) => b.bodyId === bodyId)
  const available = body?.analysis.edges ?? []
  const [edges, setEdges] = useState<string[]>(existing?.edges ?? vs.selection.filter((s) => s.kind === 'edge').map((s) => s.id))
  const [size, setSize] = useState(existing ? String(kind === 'fillet' ? (existing as { radius: unknown }).radius : (existing as { distance: unknown }).distance) : '2')
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [filter, setFilter] = useState('')
  const run = makeRun(engine)
  useEffect(() => setPreview(null), [edges, size, bodyId])
  // Picked edges in the 3D view are added to the list.
  const picked = vs.selection.filter((s) => s.kind === 'edge').map((s) => s.id)
  const face = vs.selection.find((s) => s.kind === 'face')?.id
  useEffect(() => update({ highlightEdges: edges }), [edges, update])
  useEffect(() => () => update({ highlightEdges: [] }), [update])
  const toggle = (name: string) => setEdges((e) => (e.includes(name) ? e.filter((x) => x !== name) : [...e, name]))
  const shown = available.filter((e) => !filter.trim() || e.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const label = kind === 'fillet' ? 'Fillet' : 'Chamfer'
  const commands = () => {
    const value = exprValue(size)
    if (existing) return [{ command: 'edit_feature', input: { featureId: existing.id, edges, ...(kind === 'fillet' ? { radius: value } : { distance: value }) } }]
    return [{ command: kind === 'fillet' ? 'fillet_edges' : 'chamfer_edges', input: { edges, ...(kind === 'fillet' ? { radius: value } : { distance: value }), ...(bodyId && bodies.length > 1 ? { target: bodyId } : {}) } }]
  }
  if (!bodies.length) return <div className="cadm-panel-body"><EmptyState icon="cad-representation" title={`No body to ${kind}`}>Create a solid first (Extrude or Revolve).</EmptyState></div>
  return (
    <div className="cadm-panel-body" data-help-id={`cad-modeler.feature.${kind}`}>
      <h3 className="cadm-section-title">{existing ? `Edit ${existing.name}` : label}</h3>
      {existing && <Notice tone="info">Edge names are shown for the current model, which already contains this {kind}; keep the names listed in the feature unless you change the selection.</Notice>}
      {bodies.length > 1 && !existing && <Select label="Body" value={bodyId} onChange={setBodyId} options={bodies.map((b) => ({ id: b.bodyId, label: `${b.name} (${b.bodyId})` }))} />}
      <TextField label={kind === 'fillet' ? 'Radius' : 'Distance'} unit="mm" value={size} onChange={setSize} description="A number or an expression over parameters." />
      <div className="cadm-actions">
        <Button size="sm" variant="tonal" icon="add" isDisabled={!face} onPress={() => setEdges((e) => [...new Set([...e, ...available.filter((x) => x.faces.includes(face!)).map((x) => x.name)])])}>
          Add edges of the selected face
        </Button>
        <Button size="sm" variant="tonal" icon="add" isDisabled={!picked.length} onPress={() => setEdges((e) => [...new Set([...e, ...picked])])}>
          Add picked edges ({picked.length})
        </Button>
        <Button size="sm" variant="quiet" isDisabled={!edges.length} onPress={() => setEdges([])}>
          Clear
        </Button>
      </div>
      <p className="cadm-hint">Click an edge or a face in the 3D view, then add it here, or tick edges in the list. Edges are named by the two faces they join.</p>
      <TextField label="Filter edges" value={filter} onChange={setFilter} placeholder="cap-end, side:ln-8 …" />
      <div className="cadm-edge-list" role="group" aria-label="Edges">
        {shown.map((e) => (
          <Checkbox key={e.name} isSelected={edges.includes(e.name)} onChange={() => toggle(e.name)}>
            <span className="cadm-mono">{e.name}</span> <span className="cadm-muted">{e.curveType.toLowerCase()}, {fmtNum(e.length, 1)} mm</span>
          </Checkbox>
        ))}
      </div>
      <p className="cadm-muted">
        <Badge tone={edges.length ? 'info' : 'neutral'}>{edges.length} edge(s) selected</Badge>
      </p>
      {preview && (
        <Notice tone={preview.ok && preview.after?.ok ? 'info' : 'warning'} title="Preview (not applied)">
          {preview.ok
            ? [
                ...(preview.after?.bodies ?? []).map((b) => (
                  <span key={b.bodyId} className="cadm-block">
                    {b.bodyId}: {M.volume(b.volume, 1)}, {b.faces} faces{b.valid ? '' : ', invalid solid'}
                  </span>
                )),
                ...(preview.after?.failures ?? []).map((f) => (
                  <span key={f.featureId} className="cadm-block cadm-error">
                    {f.name}: {f.error?.message ?? f.warnings.map((w) => w.message).join(' ')}
                  </span>
                )),
              ]
            : preview.error?.message}
        </Notice>
      )}
      <div className="cadm-actions">
        <Button variant="outlined" icon="visibility" isDisabled={!edges.length} onPress={async () => setPreview(await engine.dryRun({ commands: commands() }))}>
          Preview
        </Button>
        <Button
          variant="filled"
          icon="check"
          isDisabled={!edges.length}
          onPress={async () => {
            const r = await run(commands(), existing ? `Edit ${existing.name}` : label)
            if (r?.ok) update({ editing: null, selection: [] })
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
