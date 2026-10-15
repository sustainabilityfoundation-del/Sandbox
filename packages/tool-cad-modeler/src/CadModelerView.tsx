import './modeler.css'
import type { SketchFeature } from '@ews/cad-core'
import { Badge, Button, EmptyState, Spinner, StatusBadge, Tab, TabList, TabPanel, Tabs, useToasts } from '@ews/design-system'
import { useToolViewState, useUnsavedChanges } from '@ews/platform-sdk/react'
import { useCallback, useEffect, type KeyboardEvent } from 'react'
import { plateCommands } from './assistant'
import { cadSession, useCadSession, useEngineState } from './session'
import { DiagnosticsPanel } from './ui/DiagnosticsPanel'
import { EditPanel } from './ui/EditPanel'
import { InspectPanel } from './ui/InspectPanel'
import { ModelPanel } from './ui/ModelPanel'
import { Sketcher } from './ui/Sketcher'
import { Viewport } from './ui/Viewport'
import type { CadModelerViewState, PanelTab } from './viewState'

/** The CAD Modeler view: panels (model, edit, inspect, diagnostics) and the 3D viewport or sketcher. */
export default function CadModelerView() {
  const [vs, setVs] = useToolViewState<CadModelerViewState>()
  const session = useCadSession()
  const open = cadSession.document(vs.documentId) ?? cadSession.document(session.activeId)
  const state = useEngineState(open?.engine)
  const update = useCallback((u: Partial<CadModelerViewState>) => setVs(u), [setVs])
  const dirty = !!open && !!session.documents.find((d) => d.id === open.id)?.dirty
  useUnsavedChanges(dirty)

  // This view follows the session's active document when its own is closed.
  useEffect(() => {
    if (open && vs.documentId !== open.id) setVs({ documentId: open.id })
    if (open && session.activeId !== open.id) cadSession.setActive(open.id)
  }, [open, vs.documentId, session.activeId, setVs])

  // Mirror session flags into view state so the toolbar (a function of view state) stays current.
  const status = {
    hasDoc: !!open,
    canUndo: !!state?.canUndo,
    canRedo: !!state?.canRedo,
    hasBody: !!state?.regen?.parts.some((p) => p.bodies.length),
    dirty,
    busy: !!state?.regenerating,
  }
  const statusKey = JSON.stringify(status)
  useEffect(() => {
    if (JSON.stringify(vs.status) !== statusKey) setVs({ status })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey])

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || !(e.ctrlKey || e.metaKey)) return
    const target = e.target as HTMLElement
    if (target.closest('input, textarea')) return
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      void open.engine.undo().catch(() => undefined)
    } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
      e.preventDefault()
      void open.engine.redo().catch(() => undefined)
    }
  }

  if (!open || !state) return <Welcome update={update} kernel={session.kernel.status} />

  const editingSketch = vs.editing?.kind === 'sketch' ? vs.editing.sketchId : null
  const sketchPart = editingSketch ? state.doc.parts.find((p) => p.features.some((f) => f.id === editingSketch)) : undefined
  const sketch = sketchPart?.features.find((f) => f.id === editingSketch) as SketchFeature | undefined
  const sketchResult = sketchPart && state.regen?.parts.find((p) => p.partId === sketchPart.id)?.features.find((f) => f.featureId === editingSketch)?.sketch
  const ok = state.regen?.ok
  const selectedFaces = vs.selection.flatMap((s) => (s.kind === 'face' ? [{ bodyId: s.bodyId, face: s.id }] : s.kind === 'body' ? [{ bodyId: s.id }] : []))

  return (
    <div className="cadm-root" onKeyDown={onKeyDown}>
      <aside className="cadm-side" aria-label="CAD Modeler panels">
        <Tabs selectedKey={vs.tab} onSelectionChange={(k) => update({ tab: k as PanelTab })} className="cadm-tabs">
          <TabList aria-label="Panels" className="cadm-tablist">
            <Tab id="model">Model</Tab>
            <Tab id="edit">Edit</Tab>
            <Tab id="inspect">Inspect</Tab>
            <Tab id="diagnostics">Diagnostics</Tab>
          </TabList>
          <TabPanel id="model" className="cadm-tabpanel">
            <ModelPanel engine={open.engine} state={state} vs={vs} update={update} />
          </TabPanel>
          <TabPanel id="edit" className="cadm-tabpanel">
            <EditPanel engine={open.engine} state={state} vs={vs} update={update} />
          </TabPanel>
          <TabPanel id="inspect" className="cadm-tabpanel">
            <InspectPanel engine={open.engine} state={state} vs={vs} update={update} />
          </TabPanel>
          <TabPanel id="diagnostics" className="cadm-tabpanel">
            <DiagnosticsPanel engine={open.engine} state={state} session={session} />
          </TabPanel>
        </Tabs>
      </aside>
      <main className="cadm-stage">
        <header className="cadm-stage-header">
          <strong className="cadm-doc-title">{state.doc.metadata.title}</strong>
          <span className="cadm-muted">v{state.doc.version}</span>
          {dirty ? <StatusBadge status="unsaved" /> : <StatusBadge status="saved" label="Saved to file" />}
          {state.regenerating ? (
            <Badge tone="info" icon="spinner" spin>
              Regenerating
            </Badge>
          ) : ok === false ? (
            <Badge tone="danger" icon="error">
              Regeneration problems
            </Badge>
          ) : ok ? (
            <Badge tone="success" icon="success">
              Regenerated
            </Badge>
          ) : null}
          {session.documents.length > 1 && (
            <span className="cadm-muted">{session.documents.length} documents open</span>
          )}
          {sketch && (
            <Button size="sm" variant="text" icon="close" onPress={() => update({ editing: null })}>
              Leave sketch
            </Button>
          )}
        </header>
        {sketch ? (
          <div className="cadm-sketch-stage">
            <Sketcher
              sketch={sketch}
              result={sketchResult}
              selected={vs.selection.filter((s) => s.kind === 'sketch-entity').map((s) => s.id)}
              onToggle={(id) => {
                const has = vs.selection.some((s) => s.kind === 'sketch-entity' && s.id === id)
                update({ selection: has ? vs.selection.filter((s) => !(s.kind === 'sketch-entity' && s.id === id)) : [...vs.selection.filter((s) => s.kind === 'sketch-entity'), { kind: 'sketch-entity', id, sketchId: sketch.id }] })
              }}
            />
          </div>
        ) : (
          <Viewport
            engine={open.engine}
            regen={state.regen}
            selected={selectedFaces}
            showEdges={vs.showEdges}
            viewRequest={vs.viewRequest}
            onPick={(p) => update({ selection: p ? [{ kind: 'face', id: p.face, bodyId: p.bodyId }] : [], ...(p ? { tab: 'inspect' } : {}) })}
            onView={(kind) => update({ viewRequest: { kind, seq: Date.now() } })}
            onToggleEdges={() => update({ showEdges: !vs.showEdges })}
          />
        )}
        <footer className="cadm-status">
          <span>{session.kernel.status === 'ready' ? `Kernel: OCCT in a Web Worker` : session.kernel.status === 'loading' ? 'Loading the geometry kernel…' : session.kernel.status === 'failed' ? `Kernel failed: ${session.kernel.error}` : ''}</span>
          {state.regen && <span>Last regeneration {state.regen.durationMs.toFixed(0)} ms</span>}
        </footer>
      </main>
    </div>
  )
}

function Welcome({ update, kernel }: { update: (u: Partial<CadModelerViewState>) => void; kernel: string }) {
  const start = async (example: boolean) => {
    try {
      const d = await cadSession.newDocument({ title: example ? 'Bracket plate' : undefined, partName: example ? 'Plate' : undefined })
      if (example) {
        const r = await d.engine.execute({ commands: plateCommands(80, 40, 10, 12), label: 'Example: plate with hole' })
        if (!r.ok) throw new Error(r.error.message)
      }
      update({ documentId: d.id, editing: example ? null : { kind: 'new-sketch' }, tab: example ? 'model' : 'edit', selection: [], viewRequest: { kind: 'iso', seq: Date.now() } })
    } catch (e) {
      useToasts.getState().push({ tone: 'danger', title: 'Cannot create the document', body: e instanceof Error ? e.message : String(e) })
    }
  }
  return (
    <div className="cadm-welcome">
      <EmptyState
        icon="cad"
        title="CAD Modeler"
        action={
          <div className="cadm-actions">
            <Button variant="filled" icon="add" onPress={() => start(false)}>
              New part
            </Button>
            <Button variant="outlined" icon="cad-representation" onPress={() => start(true)}>
              Example: plate with hole
            </Button>
          </div>
        }
      >
        Parametric part modeling on an exact B-rep kernel (Open CASCADE, running in a Web Worker): constrained sketches, extrude and revolve, parameters and regeneration. Save as the open .ewscad format; export STEP AP242. Use <strong>Open</strong> in the toolbar for a saved model.
        {kernel === 'loading' && (
          <span className="cadm-block">
            <Spinner size={14} label="Loading the kernel" /> Loading the geometry kernel…
          </span>
        )}
      </EmptyState>
    </div>
  )
}
