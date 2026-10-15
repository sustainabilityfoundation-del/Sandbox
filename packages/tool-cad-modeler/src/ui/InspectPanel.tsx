import { massProperties, type CadEngine, type EngineState, type Feature, type PlaneRef, type ReferenceModule, type ReferenceRole } from '@ews/cad-core'
import { Button, EmptyState, IconButton, Notice, Select, TextField, useToasts } from '@ews/design-system'
import { isComponent } from '@ews/platform-sdk'
import { usePlatformServices, useModel, useSharedContext, useToolApi } from '@ews/platform-sdk/react'
import { checkProductReference } from '../productRefs'
import { Fragment, useState } from 'react'
import type { CadModelerViewState } from '../viewState'
import { CommitField, FeatureStatus, fmtNum, makeRun, regenOf, useMeasure } from './common'

interface Props {
  engine: CadEngine
  state: EngineState
  vs: CadModelerViewState
  update: (u: Partial<CadModelerViewState>) => void
}

const v3 = (v?: number[]) => (v ? `(${v.map((x) => fmtNum(x, 3)).join(', ')})` : '—')

/** Property inspection of the selection, the part's material, semantics and cross-module references. */
export function InspectPanel({ engine, state, vs, update }: Props) {
  const M = useMeasure()
  const run = makeRun(engine)
  const doc = state.doc
  const part = doc.parts[0]
  const pr = part ? regenOf(state, part.id) : undefined
  const sel = vs.selection[0]
  return (
    <div className="cadm-panel-body" data-help-id="cad-modeler.inspect">
      {!sel && <p className="cadm-muted">Select a face in the 3D view, or a feature or body in the Model tab. Faces are listed below for keyboard selection.</p>}
      {sel?.kind === 'face' &&
        (() => {
          const body = pr?.bodies.find((b) => b.bodyId === sel.bodyId)
          const face = body?.analysis.faces.find((f) => f.name === sel.id)
          if (!face) return <Notice tone="warning">The face {sel.id} no longer exists after regeneration.</Notice>
          return (
            <section className="cadm-section" aria-label="Face">
              <h3 className="cadm-section-title">Face <span className="cadm-mono">{face.name}</span></h3>
              <dl className="cadm-props">
                <dt>Stable name</dt>
                <dd>{face.stable ? 'Yes (from design intent)' : 'No (fallback; may change on regeneration)'}</dd>
                <dt>Surface</dt>
                <dd>{face.surfaceType}</dd>
                <dt>Area</dt>
                <dd>{M.area(face.area)}</dd>
                <dt>Centre</dt>
                <dd>{v3(face.center)} mm</dd>
                <dt>Normal</dt>
                <dd>{v3(face.normal)}</dd>
                {!!face.aliases.length && (
                  <>
                    <dt>Also named</dt>
                    <dd className="cadm-mono">{face.aliases.join(', ')}</dd>
                  </>
                )}
              </dl>
              <Button size="sm" variant="outlined" icon="link" onPress={() => run([{ command: 'add_semantic', input: { partId: part.id, kind: 'interface', name: `Interface ${face.name}`, targets: [face.name] } }], 'Mark interface')}>
                Mark as named interface
              </Button>
            </section>
          )
        })()}
      {sel?.kind === 'edge' &&
        (() => {
          const body = pr?.bodies.find((b) => b.bodyId === sel.bodyId)
          const edge = body?.analysis.edges.find((e) => e.name === sel.id)
          if (!edge) return <Notice tone="warning">The edge {sel.id} no longer exists after regeneration.</Notice>
          return (
            <section className="cadm-section" aria-label="Edge">
              <h3 className="cadm-section-title">Edge</h3>
              <dl className="cadm-props">
                <dt>Stable name</dt>
                <dd className="cadm-mono">{edge.name}</dd>
                <dt>Curve</dt>
                <dd>{edge.curveType}</dd>
                <dt>Length</dt>
                <dd>{fmtNum(edge.length, 3)} mm</dd>
                <dt>Between faces</dt>
                <dd className="cadm-mono">{edge.faces.join(', ')}</dd>
              </dl>
              <div className="cadm-actions">
                <Button size="sm" variant="outlined" icon="tune" onPress={() => update({ editing: { kind: 'fillet' }, tab: 'edit', selection: [sel] })}>
                  Fillet this edge
                </Button>
                <Button size="sm" variant="outlined" icon="dimensions" onPress={() => update({ editing: { kind: 'chamfer' }, tab: 'edit', selection: [sel] })}>
                  Chamfer this edge
                </Button>
              </div>
            </section>
          )
        })()}
      {sel?.kind === 'body' &&
        (() => {
          const mp = pr ? massProperties(doc, state.regen, part.id).find((m) => m.bodyId === sel.id) : undefined
          const body = pr?.bodies.find((b) => b.bodyId === sel.id)
          if (!mp || !body) return <Notice tone="warning">Body {sel.id} is not in the current model.</Notice>
          return (
            <section className="cadm-section" aria-label="Body">
              <h3 className="cadm-section-title">Body <span className="cadm-mono">{body.bodyId}</span></h3>
              <dl className="cadm-props">
                <dt>Valid solid</dt>
                <dd>{mp.valid ? 'Yes (B-rep check passed)' : 'No'}</dd>
                <dt>Volume</dt>
                <dd>{M.volume(mp.volume)}</dd>
                <dt>Surface area</dt>
                <dd>{M.area(mp.surfaceArea)}</dd>
                <dt>Mass</dt>
                <dd>{mp.mass === null ? 'Set a material' : `${M.mass(mp.mass)} (${mp.material!.name})`}</dd>
                <dt>Centre of mass</dt>
                <dd>{v3(mp.centerOfMass)} mm</dd>
                <dt>Bounding box</dt>
                <dd>{M.lengths(mp.boundingBox.size)}</dd>
                <dt>Topology</dt>
                <dd>{body.analysis.counts.solids} solid, {body.analysis.counts.faces} faces, {body.analysis.counts.edges} edges, {body.analysis.counts.vertices} vertices</dd>
              </dl>
            </section>
          )
        })()}
      {sel?.kind === 'feature' &&
        (() => {
          const f = part?.features.find((x) => x.id === sel.id)
          const r = pr?.features.find((x) => x.featureId === sel.id)
          if (!f) return <Notice tone="warning">Feature {sel.id} was deleted.</Notice>
          return (
            <section className="cadm-section" aria-label="Feature">
              <h3 className="cadm-section-title">{f.name} <FeatureStatus result={r} /></h3>
              <CommitField label="Name" value={f.name} onCommit={(name) => run([{ command: 'rename', input: { id: f.id, name } }], 'Rename feature')} />
              <dl className="cadm-props">
                <dt>ID</dt>
                <dd className="cadm-mono">{f.id}</dd>
                <dt>Type</dt>
                <dd>{f.type}</dd>
                {Object.entries(featureFacts(f)).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt>{k}</dt>
                    <dd className={/Sketch|Edges|Plane|Target/.test(k) ? 'cadm-mono' : undefined}>{v}</dd>
                  </Fragment>
                ))}
                <dt>Regenerated</dt>
                <dd>{r ? `${r.rebuilt ? 'rebuilt' : 'reused from cache'} in ${fmtNum(r.durationMs, 1)} ms` : '—'}</dd>
              </dl>
              {r?.error && <Notice tone="danger">{r.error.message}</Notice>}
              {r?.warnings.map((w, i) => <Notice key={i} tone="warning">{w.message}</Notice>)}
              <Button size="sm" variant="outlined" icon="edit" onPress={() => update({ editing: f.type === 'sketch' ? { kind: 'sketch', sketchId: f.id } : { kind: f.type, featureId: f.id }, tab: 'edit' })}>
                Edit
              </Button>
            </section>
          )
        })()}

      {pr && !!pr.bodies.length && (
        <section className="cadm-section" aria-label="Faces">
          <h4 className="cadm-subtitle">Faces</h4>
          <Select
            label="Select a face"
            value={sel?.kind === 'face' ? `${sel.bodyId}::${sel.id}` : null}
            placeholder="Choose a face"
            onChange={(v) => {
              const [bodyId, id] = v.split('::')
              update({ selection: [{ kind: 'face', bodyId, id }] })
            }}
            options={pr.bodies.flatMap((b) => b.analysis.faces.map((f) => ({ id: `${b.bodyId}::${f.name}`, label: `${f.name} (${f.surfaceType})` })))}
          />
        </section>
      )}

      {part && <PartProperties engine={engine} state={state} />}
    </div>
  )
}

function PartProperties({ engine, state }: { engine: CadEngine; state: EngineState }) {
  const run = makeRun(engine)
  const part = state.doc.parts[0]
  const model = useModel()
  const api = useToolApi()
  const services = usePlatformServices()
  const { projectId } = useSharedContext()
  const components = model.objects.filter(isComponent)
  // New projects reference Project Management product elements (ADR-0026, CR-PM-CAD-1); projects whose twin has components (PRJ-ACT100) keep twin references.
  const [module, setModule] = useState<ReferenceModule>(components.length ? 'twin' : 'product')
  const [role, setRole] = useState<ReferenceRole>('represents')
  const [target, setTarget] = useState('')
  const [component, setComponent] = useState<string | null>(null)
  const refs = state.doc.references
  return (
    <>
      <section className="cadm-section" aria-label="Material" data-help-id="cad-modeler.part.material">
        <h4 className="cadm-subtitle">Material of {part.name}</h4>
        <div className="cadm-form-grid">
          <CommitField label="Material" value={part.material?.name ?? ''} onCommit={(name) => run([{ command: 'set_material', input: { partId: part.id, name, density: part.material?.density ?? 7850 } }], 'Set material')} />
          <CommitField label="Density" unit="kg/m³" value={String(part.material?.density ?? '')} onCommit={(d) => run([{ command: 'set_material', input: { partId: part.id, name: part.material?.name ?? 'Material', density: Number(d) } }], 'Set density')} />
        </div>
      </section>

      {!!part.semantics.length && (
        <section className="cadm-section" aria-label="Engineering semantics">
          <h4 className="cadm-subtitle">Engineering semantics</h4>
          <ul className="cadm-list">
            {part.semantics.map((s) => (
              <li key={s.id} className="cadm-constraint">
                <span>{s.name}</span>
                <span className="cadm-muted">{s.kind}: <span className="cadm-mono">{s.targets.join(', ')}</span></span>
                <IconButton label={`Remove ${s.name}`} icon="close" size="sm" onPress={() => run([{ command: 'remove_semantic', input: { semanticId: s.id } }], 'Remove annotation')} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cadm-section" aria-label="References to other modules" data-help-id="cad-modeler.references">
        <h4 className="cadm-subtitle">References to other modules</h4>
        <p className="cadm-muted">Links are stored in this model and point to records owned by other modules; nothing is copied or synchronised.</p>
        {refs.length === 0 && <EmptyState icon="link" title="No references" />}
        <ul className="cadm-list">
          {refs.map((r) => (
            <li key={r.id} className="cadm-constraint">
              <span className="cadm-mono">{r.subject}</span>
              <span>{r.role}</span>
              <span className="cadm-mono">{r.target.module}:{r.target.id}{r.target.revision !== undefined ? `@${r.target.revision}` : ''}</span>
              {r.target.module === 'twin' && model.get(r.target.id) && (
                <Button size="sm" variant="text" onPress={() => api.select([r.target.id])}>
                  Select {r.target.id}
                </Button>
              )}
              <IconButton label={`Remove reference ${r.id}`} icon="unlink" size="sm" onPress={() => run([{ command: 'remove_reference', input: { referenceId: r.id } }], 'Remove reference')} />
            </li>
          ))}
        </ul>
        <div className="cadm-form-grid">
          <Select label="Role" value={role} onChange={(v) => setRole(v as ReferenceRole)} options={[{ id: 'represents', label: 'represents (component)' }, { id: 'satisfies', label: 'satisfies (requirement)' }, { id: 'verifies', label: 'verifies (requirement)' }, { id: 'realizes', label: 'realizes (concept)' }, { id: 'traces', label: 'traces (SysML element)' }, { id: 'related', label: 'related' }]} />
          <Select label="Module" value={module} onChange={(v) => setModule(v as ReferenceModule)} options={[{ id: 'product', label: 'Product element (Project Management)' }, { id: 'twin', label: 'Twin component (PRJ-ACT100 and older projects)' }, { id: 'requirements', label: 'Requirements' }, { id: 'sysml', label: 'SysML' }, { id: 'conceptualize', label: 'Conceptualize' }, { id: 'external', label: 'External URL' }]} />
          {module === 'twin' ? (
            <Select label="Component" value={component} placeholder="Choose a component" onChange={setComponent} options={components.map((c) => ({ id: c.id, label: `${c.id} ${c.name}` }))} />
          ) : (
            <TextField label={module === 'external' ? 'URL' : 'ID in the owning module'} value={target} onChange={setTarget} description={module === 'requirements' ? 'Requirement UUID or key, as shown in Requirements.' : module === 'product' ? 'Product element ID, as shown in Project Management (not checked here).' : undefined} />
          )}
          <Button
            size="sm"
            variant="tonal"
            icon="link"
            isDisabled={module === 'twin' ? !component : !target.trim()}
            onPress={async () => {
              const id = module === 'twin' ? component! : target.trim()
              const object = module === 'twin' ? model.get(id) : undefined
              let productTarget
              if (module === 'product') {
                // Product elements are checked with Project Management when it is connected (C3/C5).
                const check = await checkProductReference(services, projectId, id)
                if (check.status === 'refused') {
                  useToasts.getState().push({ tone: 'danger', title: 'Reference not added', body: check.message })
                  return
                }
                if (check.status === 'unverified') useToasts.getState().push({ tone: 'info', title: 'Product element not checked', body: check.reason })
                productTarget = check.target
              }
              const r = await run([{ command: 'add_reference', input: { subject: part.id, role, target: productTarget ?? { module, id, ...(object ? { revision: object.revision, kind: object.type, label: object.name } : {}) } } }], 'Add reference')
              if (r?.ok) setTarget('')
            }}
          >
            Link {part.name}
          </Button>
        </div>
      </section>
    </>
  )
}

/** Readable definition of a feature for the inspector. */
function featureFacts(f: Feature): Record<string, string> {
  const plane = (p: PlaneRef) => `${p.kind === 'standard' ? p.plane : p.kind === 'datum' ? `datum ${p.datum}` : `face ${p.face}`}${p.offset ? `, offset ${p.offset}` : ''}`
  switch (f.type) {
    case 'sketch':
      return { Plane: plane(f.plane), Entities: String(f.entities.length), Constraints: String(f.constraints.length) }
    case 'extrude':
      return { Sketch: f.sketch, Distance: String(f.extent.distance), Direction: f.extent.direction, Operation: f.operation, ...(f.target ? { Target: f.target } : {}) }
    case 'revolve':
      return { Sketch: f.sketch, Axis: f.axis, Angle: String(f.angle), Operation: f.operation, ...(f.target ? { Target: f.target } : {}) }
    case 'fillet':
      return { Radius: String(f.radius), Edges: f.edges.join(', '), ...(f.target ? { Target: f.target } : {}) }
    case 'chamfer':
      return { Distance: String(f.distance), Edges: f.edges.join(', '), ...(f.target ? { Target: f.target } : {}) }
    case 'datum-plane':
      return { Plane: plane(f.plane) }
  }
}
