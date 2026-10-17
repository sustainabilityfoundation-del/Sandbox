import './modeler.css'
import type { SketchFeature } from '@ews/cad-core'
import { Badge, Button, EmptyState, Notice, Select, Spinner, StatusBadge, Tab, TabList, TabPanel, Tabs, useToasts } from '@ews/design-system'
import { useSharedContext, useToolViewState, useUnsavedChanges, useSetting, usePlatformServices } from '@ews/platform-sdk/react'
import { OpenDialog } from './ui/OpenDialog'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { checkOpenDocument } from './checkRun'
import { plateCommands } from './assistant'
import { cadSession, useCadSession, useEngineState } from './session'
import { takeCadDeepLink } from './deepLink'
import { handoffPort, type ConceptRevisionStaleness } from './handoff'
import { CAD_SETTING_IDS } from './settings'
import { DiagnosticsPanel } from './ui/DiagnosticsPanel'
import { EditPanel } from './ui/EditPanel'
import { InspectPanel } from './ui/InspectPanel'
import { ModelPanel } from './ui/ModelPanel'
import { SketchStage } from './ui/SketchStage'
import { Viewport } from './ui/Viewport'
import type { CadModelerViewState, PanelTab } from './viewState'

/** The CAD view: panels (model, edit, inspect, diagnostics) and the 3D viewport or sketcher. */
export default function CadModelerView() {
  const [vs, setVs] = useToolViewState<CadModelerViewState>()
  const session = useCadSession()
  const { projectId } = useSharedContext()
  const showEdgesSetting = useSetting<boolean>(CAD_SETTING_IDS.showEdges)
  const platformServices = usePlatformServices()
  const meshTolerance = useSetting<number>(CAD_SETTING_IDS.meshTolerance)
  const orientation = useSetting<string>(CAD_SETTING_IDS.orientation)
  // Assistant operations save their changes as revisions while no view is mounted (C9).
  useEffect(() => cadSession.attachView(), [])
  // C13: the session shows this project's documents only.
  useEffect(() => cadSession.setProject(projectId), [projectId])
  useEffect(() => {
    if (session.store) cadSession.watchProject(projectId)
  }, [projectId, session.store])
  // Deep link ?tool=cad-modeler&document=<uuid>[&revision=<n>]: open the stored document once.
  useEffect(() => {
    if (!session.store) return
    const link = takeCadDeepLink()
    if (!link) return
    cadSession.openFromStore(projectId, link.documentId, link.revision).then(
      (d) => setVs({ documentId: d.id }),
      (e) => useToasts.getState().push({ tone: 'danger', title: 'Cannot open the linked CAD document', body: e instanceof Error ? e.message : String(e) }),
    )
  }, [projectId, session.store, setVs])
  const own = cadSession.document(vs.documentId)
  const open = (own && cadSession.inCurrentProject(own) ? own : undefined) ?? cadSession.active
  const state = useEngineState(open?.engine)
  // Source concept revised since the document was started (derived from Conceptualize; never regenerates anything).
  const src = state?.doc.metadata.source
  const [sourceStale, setSourceStale] = useState<ConceptRevisionStaleness | undefined>(undefined)
  useEffect(() => {
    setSourceStale(undefined)
    const port = handoffPort(platformServices)
    if (!src || !port) return
    let live = true
    const read = () => port.revisionStaleness(src.concept.id, src.concept.revision, { projectId, purpose: 'downstream' }).then((x) => live && setSourceStale(x), () => undefined)
    void read()
    const off = platformServices.concepts?.subscribe?.(projectId, () => void read())
    return () => {
      live = false
      off?.()
    }
  }, [src?.concept.id, src?.concept.revision, projectId, platformServices])
  const update = useCallback((u: Partial<CadModelerViewState>) => setVs(u), [setVs])
  // "Check against constraints": the toolbar command and the panel button only request it; the same function as
  // cad-modeler.check runs it on the open document (read-only) and the result is shown in Diagnostics.
  const handledCheck = useRef(vs.checkRequest)
  const concepts = platformServices.concepts
  const runCheck = useCallback(async () => {
    if (!open) return
    setVs({ tab: 'diagnostics', check: { state: 'running' } })
    try {
      const report = await checkOpenDocument(open, { projectId, concepts })
      setVs({ check: { state: 'done', report, at: new Date().toISOString() } })
    } catch (e) {
      setVs({ check: { state: 'error', message: e instanceof Error ? e.message : String(e) } })
    }
  }, [open, projectId, concepts, setVs])
  useEffect(() => {
    if (vs.checkRequest === undefined || vs.checkRequest === handledCheck.current) return
    handledCheck.current = vs.checkRequest
    void runCheck()
  }, [vs.checkRequest, runCheck])
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

  const dialog = vs.dialog === 'open' && session.store && (
    <OpenDialog projectId={projectId} onClose={() => update({ dialog: null })} onOpened={(id) => update({ dialog: null, documentId: id, editing: null, selection: [], tab: 'model', viewRequest: { kind: 'fit', seq: Date.now() } })} />
  )
  if (!open || !state)
    return (
      <>
        <Welcome update={update} kernel={session.kernel.status} canOpenStored={!!session.store} />
        {dialog}
      </>
    )
  const entry = session.documents.find((d) => d.id === open.id)
  const reloadRemote = async () => {
    try {
      const d = await cadSession.openFromStore(entry!.stored!.projectId, open.id)
      update({ documentId: d.id, selection: [] })
    } catch (e) {
      useToasts.getState().push({ tone: 'danger', title: 'Cannot open the latest revision', body: e instanceof Error ? e.message : String(e) })
    }
  }

  const editingSketch = vs.editing?.kind === 'sketch' ? vs.editing.sketchId : null
  const sketchPart = editingSketch ? state.doc.parts.find((p) => p.features.some((f) => f.id === editingSketch)) : undefined
  const sketch = sketchPart?.features.find((f) => f.id === editingSketch) as SketchFeature | undefined
  const sketchResult = sketchPart && state.regen?.parts.find((p) => p.partId === sketchPart.id)?.features.find((f) => f.featureId === editingSketch)?.sketch
  const ok = state.regen?.ok
  const selectedFaces = vs.selection.flatMap((s) => (s.kind === 'face' ? [{ bodyId: s.bodyId, face: s.id }] : s.kind === 'edge' ? [{ bodyId: s.bodyId, edge: s.id }] : s.kind === 'body' ? [{ bodyId: s.id }] : []))

  return (
    <div className="cadm-root" onKeyDown={onKeyDown}>
      <aside className="cadm-side" aria-label="CAD panels">
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
            <DiagnosticsPanel engine={open.engine} state={state} session={session} update={update} check={vs.check} onCheck={() => void runCheck()} />
          </TabPanel>
        </Tabs>
      </aside>
      <main className="cadm-stage">
        <header className="cadm-stage-header">
          <strong className="cadm-doc-title">{state.doc.metadata.title}</strong>
          <span className="cadm-muted">v{state.doc.version}</span>
          {state.doc.metadata.source && (
            <Badge tone="neutral" icon="link" title={`Started from Conceptualize concept ${state.doc.metadata.source.concept.id} at revision ${state.doc.metadata.source.concept.revision}${state.doc.metadata.source.handoff ? `, handoff ${state.doc.metadata.source.handoff.id} revision ${state.doc.metadata.source.handoff.revision}` : ''}`}>
              From {state.doc.metadata.source.concept.label ?? 'concept'} r{state.doc.metadata.source.concept.revision}
            </Badge>
          )}
          {sourceStale?.outdated && (
            <Badge tone="warning" icon="stale" title={`The concept is now at revision ${sourceStale.currentConceptRevision}: ${sourceStale.changes.map((c) => c.label).join('; ')}. Nothing is regenerated automatically.`}>
              Possibly outdated (concept r{sourceStale.currentConceptRevision})
            </Badge>
          )}
          {entry?.stored && (
            <Badge tone="info" icon="repository" title={`Stored in the ${session.store?.mode === 'local' ? 'local store of this browser tab' : 'CAD service'}, project ${entry.stored.projectId}`}>
              Revision {entry.stored.revision}
            </Badge>
          )}
          {dirty ? (
            <StatusBadge status="unsaved" />
          ) : entry?.stored ? (
            <StatusBadge status="saved" label="Saved" />
          ) : entry?.everSaved ? (
            <StatusBadge status="saved" label="Saved to file" />
          ) : (
            <Badge tone="warning" icon="unsaved" title="This document exists only in this window until you save it">
              Not saved to a file
            </Badge>
          )}
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
            <span className="cadm-doc-switch" data-help-id="cad-modeler.documents.switcher">
              <Select
                ariaLabel="Switch document"
                size="sm"
                value={open.id}
                options={session.documents.map((d) => ({ id: d.id, label: `${d.title} (v${d.version})${d.dirty ? ' – unsaved' : ''}` }))}
                onChange={(id) => {
                  cadSession.setActive(id)
                  update({ documentId: id, editing: null, selection: [], viewRequest: { kind: 'fit', seq: Date.now() } })
                }}
              />
            </span>
          )}
          {sketch && (
            <Button size="sm" variant="text" icon="close" onPress={() => update({ editing: null })}>
              Leave sketch
            </Button>
          )}
        </header>
        {entry?.remoteRevision && (
          <div className="cadm-remote" role="status">
            <Notice
              tone="warning"
              title={`Revision ${entry.remoteRevision} was saved by someone else`}
              actions={
                <Button size="sm" variant="outlined" icon="sync" isDisabled={dirty} onPress={reloadRemote}>
                  Open the latest revision
                </Button>
              }
            >
              {dirty ? 'You have unsaved changes: save them to a file first, or they would be lost. Saving here would be refused (no overwrite).' : 'This view shows an older revision.'}
            </Notice>
          </div>
        )}
        {sketch ? (
          <SketchStage key={sketch.id} engine={open.engine} sketch={sketch} result={sketchResult} vs={vs} update={update} />
        ) : (
          <Viewport
            engine={open.engine}
            regen={state.regen}
            selected={selectedFaces}
            showEdges={vs.showEdgesSet ? vs.showEdges : showEdgesSetting !== false}
            meshTolerance={typeof meshTolerance === 'number' ? meshTolerance : undefined}
            orientation={orientation === 'front' || orientation === 'top' || orientation === 'right' ? orientation : 'iso'}
            viewRequest={vs.viewRequest}
            highlightEdges={vs.highlightEdges ?? []}
            onPick={(p) => {
              if (!p) return update({ selection: [] })
              const item = p.edge ? ({ kind: 'edge', id: p.edge, bodyId: p.bodyId } as const) : ({ kind: 'face', id: p.face!, bodyId: p.bodyId } as const)
              // While a fillet or chamfer is edited, picks accumulate (toggle) and the Edit tab stays open.
              if (vs.editing?.kind === 'fillet' || vs.editing?.kind === 'chamfer') {
                const has = vs.selection.some((x) => x.kind === item.kind && x.id === item.id)
                return update({ selection: has ? vs.selection.filter((x) => !(x.kind === item.kind && x.id === item.id)) : [...vs.selection.filter((x) => x.kind === 'edge' || x.kind === 'face'), item] })
              }
              update({ selection: [item], tab: 'inspect' })
            }}
            onView={(kind) => update({ viewRequest: { kind, seq: Date.now() } })}
            onToggleEdges={() => update({ showEdges: !(vs.showEdgesSet ? vs.showEdges : showEdgesSetting !== false), showEdgesSet: true })}
          />
        )}
        <footer className="cadm-status">
          <span>{session.kernel.status === 'ready' ? `Kernel: OCCT in a Web Worker` : session.kernel.status === 'loading' ? 'Loading the geometry kernel…' : session.kernel.status === 'failed' ? `Kernel failed: ${session.kernel.error}` : ''}</span>
          {state.regen && <span>Last regeneration {state.regen.durationMs.toFixed(0)} ms</span>}
        </footer>
      </main>
      {dialog}
    </div>
  )
}

function Welcome({ update, kernel, canOpenStored }: { update: (u: Partial<CadModelerViewState>) => void; kernel: string; canOpenStored: boolean }) {
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
        title="CAD"
        action={
          <div className="cadm-actions">
            <Button variant="filled" icon="add" onPress={() => start(false)}>
              New part
            </Button>
            <Button variant="outlined" icon="cad-representation" onPress={() => start(true)}>
              Example: plate with hole
            </Button>
            {canOpenStored && (
              <Button variant="outlined" icon="repository" onPress={() => update({ dialog: 'open' })}>
                Open from project
              </Button>
            )}
          </div>
        }
      >
        Parametric part modeling on an exact B-rep kernel (Open CASCADE, running in a Web Worker): constrained sketches, extrude and revolve, parameters and regeneration. Save revisions to the project{canOpenStored ? '' : ' (when the CAD service is connected)'} or as an open .ewscad file; export STEP AP242. Use <strong>Open</strong> in the toolbar for a saved model.
      </EmptyState>
      {kernel === 'loading' && (
        <div className="cadm-row" role="status">
          <Spinner size={14} label="Loading the kernel" /> <span className="cadm-muted">Loading the geometry kernel…</span>
        </div>
      )}
    </div>
  )
}
