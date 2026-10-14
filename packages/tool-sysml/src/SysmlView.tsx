import './sysml.css'
import { AppIcon, Button, Dialog, EmptyState, IconButton, Notice, Select, StatusBadge, TextField } from '@ews/design-system'
import { displayId, isComponent, type EngineeringObject, type ModelChange, type SysmlElement } from '@ews/platform-sdk'
import {
  MockTag,
  ObjectRef,
  useModel,
  useResolvedSelection,
  useSelection,
  useToolApi,
  useToolViewState,
  useUnsavedChanges,
} from '@ews/platform-sdk/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  SUPPORTED_CONSTRUCTS,
  UNSUPPORTED_CONSTRUCTS,
  connectionKind,
  createPartChanges,
  createRequirementChanges,
  diagramModel,
  identifier,
  layoutDiagram,
  textNotation,
  unrepresentedComponents,
  type Box,
  type SysmlViewState,
} from './domain'

function useWrite() {
  const api = useToolApi()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (changes: ModelChange[], summary: string): Promise<string[] | null> => {
    setBusy(true)
    setError(null)
    try {
      const { createdIds } = await api.submitChanges(changes, summary)
      return createdIds
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

// ---- dialogs ---------------------------------------------------------------------------------

function AddPartDialog({ representsId, onClose }: { representsId?: string; onClose: () => void }) {
  const api = useToolApi()
  const model = useModel()
  const d = diagramModel(model)
  const component = representsId ? model.get(representsId) : undefined
  const [name, setName] = useState(component ? identifier(component.name) : '')
  const [typeName, setTypeName] = useState(component?.name.replace(/\s+/g, '') ?? '')
  const [owner, setOwner] = useState(d.definitions[0]?.id ?? '')
  const [represents, setRepresents] = useState(representsId ?? '')
  const { busy, error, run } = useWrite()
  const candidates = unrepresentedComponents(model)
  const submit = async () => {
    if (!name.trim()) return
    const created = await run(
      createPartChanges({ name: identifier(name), typeName: typeName.trim() || undefined, ownerId: owner || undefined, representsId: represents || undefined }),
      `Added SysML part ${identifier(name)}${represents ? ` representing ${represents}` : ''}`,
    )
    if (created) {
      api.select([created[0]])
      onClose()
    }
  }
  return (
    <Dialog
      title="Add part"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      footer={
        <>
          <Button variant="text" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="filled" icon="add" onPress={() => void submit()} isPending={busy} isDisabled={!name.trim()}>
            Add part
          </Button>
        </>
      }
    >
      <form className="sysml-form" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <TextField label="Name" value={name} onChange={setName} autoFocus description={name.trim() ? `Stored as ${identifier(name)}` : 'For example: seal'} />
        <TextField label="Type (optional)" value={typeName} onChange={setTypeName} />
        <Select
          label="Nested in"
          value={owner}
          onChange={setOwner}
          options={[{ id: '', label: 'Nothing (new part definition)' }, ...d.definitions.map((p) => ({ id: p.id, label: `${p.name} (${p.id})` }))]}
        />
        <Select
          label="Represents physical component"
          value={represents}
          onChange={setRepresents}
          description="Links the part to an existing component instead of creating a duplicate."
          options={[
            { id: '', label: 'None' },
            ...(component && !candidates.includes(component) ? [{ id: component.id, label: `${component.id} ${component.name}`, isDisabled: true }] : []),
            ...candidates.map((c) => ({ id: c.id, label: `${displayId(c)} ${c.name}` })),
          ]}
        />
        {error && <Notice tone="danger" title="Not added">{error}</Notice>}
      </form>
    </Dialog>
  )
}

function AddRequirementDialog({ requirementId, onClose }: { requirementId?: string; onClose: () => void }) {
  const api = useToolApi()
  const model = useModel()
  const available = model.objects.filter((o) => o.type === 'requirement' && !model.linkedObjects(o.id, 'references', 'in').some((e) => e.type === 'sysml-element'))
  const [choice, setChoice] = useState(requirementId && available.some((r) => r.id === requirementId) ? requirementId : (available[0]?.id ?? ''))
  const { busy, error, run } = useWrite()
  const submit = async () => {
    const requirement = model.get(choice)
    if (!requirement) return
    const created = await run(createRequirementChanges(requirement), `Referenced ${requirement.id} in the SysML model`)
    if (created) {
      api.select([created[0]])
      onClose()
    }
  }
  return (
    <Dialog
      title="Add requirement reference"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      footer={
        <>
          <Button variant="text" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="filled" icon="link" onPress={() => void submit()} isPending={busy} isDisabled={!choice}>
            Add reference
          </Button>
        </>
      }
    >
      <div className="sysml-form">
        {available.length ? (
          <Select label="Requirement" value={choice} onChange={setChoice} options={available.map((r) => ({ id: r.id, label: `${r.id} ${r.name}` }))} />
        ) : (
          <p className="m-0">Every requirement is already referenced in the SysML model.</p>
        )}
        <p className="ws-hint m-0">The requirement usage references the shared requirement; its text is maintained in Requirements.</p>
        {error && <Notice tone="danger" title="Not added">{error}</Notice>}
      </div>
    </Dialog>
  )
}

function ConnectDialog({ fromId, onClose }: { fromId?: string; onClose: () => void }) {
  const model = useModel()
  const d = diagramModel(model)
  const parts = d.elements.filter((e) => e.kind === 'part')
  const [from, setFrom] = useState(fromId && parts.some((p) => p.id === fromId) ? fromId : (parts[0]?.id ?? ''))
  const [to, setTo] = useState('')
  const { busy, error, run } = useWrite()
  const kind = connectionKind(d.elements.find((e) => e.id === from), d.elements.find((e) => e.id === to))
  const exists = 'kind' in kind && !!model.findRelationship(kind.kind, from, to)
  const submit = async () => {
    if (!('kind' in kind) || exists) return
    if (await run([{ kind: 'add-relationship', relationship: { type: kind.kind, from, to } }], `SysML: ${from} ${kind.kind} ${to}`)) onClose()
  }
  return (
    <Dialog
      title="Connect"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      footer={
        <>
          <Button variant="text" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="filled" icon="connect" onPress={() => void submit()} isPending={busy} isDisabled={!('kind' in kind) || exists}>
            {'kind' in kind && kind.kind === 'satisfies' ? 'Add satisfy link' : 'Connect'}
          </Button>
        </>
      }
    >
      <div className="sysml-form">
        <Select label="From part" value={from} onChange={setFrom} options={parts.map((p) => ({ id: p.id, label: `${p.name} (${p.id})` }))} />
        <Select
          label="To"
          value={to}
          onChange={setTo}
          placeholder="Choose a part or requirement usage"
          options={d.elements.filter((e) => e.id !== from).map((e) => ({ id: e.id, label: `${e.kind === 'requirement' ? '«requirement» ' : ''}${e.name} (${e.id})` }))}
        />
        <p className="ws-hint m-0">
          {'error' in kind ? kind.error : exists ? 'These elements are already linked.' : kind.kind === 'satisfies' ? `${from} satisfies ${to}.` : `${from} connects to ${to}.`}
        </p>
        {error && <Notice tone="danger" title="Not connected">{error}</Notice>}
      </div>
    </Dialog>
  )
}

// ---- property inspector ----------------------------------------------------------------------

function PropertyInspector({ element }: { element: SysmlElement }) {
  const model = useModel()
  const [name, setName] = useState(element.name)
  const [typeName, setTypeName] = useState(element.typeName ?? '')
  const { busy, error, run } = useWrite()
  useEffect(() => {
    setName(element.name)
    setTypeName(element.typeName ?? '')
  }, [element.id, element.revision]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = name !== element.name || typeName !== (element.typeName ?? '')
  useUnsavedChanges(dirty && !busy)

  const represents = model.linkedObjects(element.id, 'represents', 'out')[0]
  const references = model.linkedObjects(element.id, 'references', 'out')[0]
  const owner = element.ownerId ? model.get(element.ownerId) : undefined
  const links = model
    .relationshipsOf(element.id)
    .filter((r) => r.type === 'connects' || r.type === 'satisfies')
    .map((r) => ({ rel: r, other: model.get(r.from === element.id ? r.to : r.from)!, outgoing: r.from === element.id }))
    .filter((l) => l.other)
  const candidates = unrepresentedComponents(model)

  const save = () =>
    run(
      [{ kind: 'update-properties', targetId: element.id, baseRevision: element.revision, name: identifier(name), properties: { typeName: typeName.trim() } }],
      `Renamed SysML element ${element.id} to ${identifier(name)}`,
    )

  return (
    <div className="sysml-props" data-inspected-id={element.id}>
      <div className="flex items-center gap-2">
        <AppIcon name="sysml-element" size="md" className="text-accent" />
        <div>
          <div className="font-medium">«{element.kind === 'part' ? (element.ownerId ? 'part' : 'part def') : 'requirement'}» {element.name}</div>
          <div className="text-ui-xs text-fg-3">
            <span className="font-mono">{element.id}</span> · rev {element.revision}
          </div>
        </div>
      </div>
      <form className="sysml-form" onSubmit={(e) => (e.preventDefault(), void save())}>
        <TextField label="Name" value={name} onChange={setName} description={name.trim() && identifier(name) !== name ? `Stored as ${identifier(name)}` : undefined} />
        {element.kind === 'part' && <TextField label="Type" value={typeName} onChange={setTypeName} />}
        <div className="flex items-center gap-2">
          {busy ? <StatusBadge status="saving" /> : dirty ? <StatusBadge status="unsaved" /> : null}
          <span className="flex-1" />
          <Button type="submit" size="sm" variant="tonal" icon="save" isDisabled={!dirty || !name.trim()} isPending={busy}>
            Save
          </Button>
        </div>
      </form>
      <dl className="sysml-dl">
        {owner && (
          <div>
            <dt>Nested in</dt>
            <dd>
              <ObjectRef object={owner} />
            </dd>
          </div>
        )}
        {element.kind === 'part' && (
          <div>
            <dt>Represents</dt>
            <dd>
              {represents ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  <ObjectRef object={represents} />
                  <Button
                    size="sm"
                    variant="text"
                    icon="unlink"
                    onPress={() => {
                      const rel = model.findRelationship('represents', element.id, represents.id)
                      if (rel) void run([{ kind: 'remove-relationship', relationshipId: rel.id }], `Unlinked ${element.id} from ${represents.id}`)
                    }}
                  >
                    Unlink
                  </Button>
                </span>
              ) : candidates.length ? (
                <Select
                  ariaLabel="Link to physical component"
                  size="sm"
                  value={null}
                  placeholder="Link to a component…"
                  onChange={(id) => void run([{ kind: 'add-relationship', relationship: { type: 'represents', from: element.id, to: id } }], `Linked ${element.id} to ${id}`)}
                  options={candidates.map((c) => ({ id: c.id, label: `${displayId(c)} ${c.name}` }))}
                />
              ) : (
                <span className="text-fg-3">No unrepresented components</span>
              )}
            </dd>
          </div>
        )}
        {element.kind === 'requirement' && (
          <div>
            <dt>References</dt>
            <dd>{references ? <ObjectRef object={references} /> : <span className="text-fg-3">No requirement</span>}</dd>
          </div>
        )}
        <div>
          <dt>Connections and satisfy links</dt>
          <dd>
            {links.length === 0 ? (
              <span className="text-fg-3">None. Use Connect in the toolbar.</span>
            ) : (
              <ul className="sysml-links">
                {links.map(({ rel, other, outgoing }) => (
                  <li key={rel.id}>
                    <span className="text-ui-xs text-fg-3">{rel.type === 'satisfies' ? (outgoing ? 'satisfies' : 'satisfied by') : outgoing ? 'connects to' : 'connected from'}</span>
                    <ObjectRef object={other} />
                    <IconButton label={`Remove ${rel.type} link to ${other.id}`} icon="unlink" size="sm" onPress={() => void run([{ kind: 'remove-relationship', relationshipId: rel.id }], `Removed ${rel.type} ${rel.from} → ${rel.to}`)} />
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      {error && <Notice tone="danger" title="Not saved">{error} Your input is kept.</Notice>}
    </div>
  )
}

// ---- diagram ---------------------------------------------------------------------------------

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/** Point where the line from a box's centre towards `to` leaves the box. */
function edgePoint(b: Box, to: { x: number; y: number }) {
  const c = center(b)
  const dx = to.x - c.x
  const dy = to.y - c.y
  const s = Math.min(Math.abs(b.w / 2 / (dx || 1e-9)), Math.abs(b.h / 2 / (dy || 1e-9)))
  return { x: c.x + dx * s, y: c.y + dy * s }
}

export default function SysmlView() {
  const api = useToolApi<SysmlViewState>()
  const model = useModel()
  const { select } = useSelection()
  const { selectedIds, resolution } = useResolvedSelection('sysml')
  const [viewState, setViewState] = useToolViewState<SysmlViewState>()
  const d = useMemo(() => diagramModel(model), [model])
  const layout = useMemo(() => layoutDiagram(d), [d])
  const svgRef = useRef<SVGSVGElement>(null)
  const highlighted = new Set(resolution?.status === 'resolved' ? resolution.ids : [])
  const focusId = resolution?.status === 'resolved' ? resolution.ids[0] : undefined
  const focused = focusId ? d.elements.find((e) => e.id === focusId) : undefined
  const selectedComponent = selectedIds.map((id) => model.get(id)).find((o): o is EngineeringObject => !!o && isComponent(o))
  const { camera } = viewState
  const b = layout.bounds
  const vw = b.w / camera.zoom
  const vh = b.h / camera.zoom
  const vx = b.x + b.w / 2 + camera.panX - vw / 2
  const vy = b.y + b.h / 2 + camera.panY - vh / 2

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setViewState((vs) => ({ ...vs, camera: { ...vs.camera, zoom: Math.min(4, Math.max(0.4, vs.camera.zoom * Math.pow(1.0015, -e.deltaY))) } }))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [setViewState])

  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select([id])
    }
  }

  const renderBox = (e: SysmlElement) => {
    const box = layout.boxes.get(e.id)
    if (!box) return null
    const isDef = e.kind === 'part' && !e.ownerId
    const represents = model.linked(e.id, 'represents', 'out')[0]
    const references = model.linked(e.id, 'references', 'out')[0]
    const stereotype = e.kind === 'requirement' ? '«requirement»' : isDef ? '«part def»' : '«part»'
    return (
      <g
        key={e.id}
        className={['sysml-node', `is-${e.kind}`, isDef ? 'is-definition' : '', highlighted.has(e.id) ? 'is-selected' : ''].join(' ')}
        data-object-id={e.id}
        role="button"
        tabIndex={0}
        aria-pressed={highlighted.has(e.id)}
        aria-label={`${stereotype} ${e.name} (${e.id})`}
        onClick={(ev) => {
          ev.stopPropagation()
          select([e.id])
        }}
        onKeyDown={(ev) => onKey(ev, e.id)}
      >
        <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={isDef ? 10 : 6} />
        <text x={box.x + 10} y={box.y + 18} className="sysml-stereotype">
          {stereotype}
        </text>
        <text x={box.x + 10} y={box.y + 36} className="sysml-name">
          {e.name}
          {e.typeName ? ` : ${e.typeName}` : ''}
        </text>
        {(represents || references) && (
          <text x={box.x + 10} y={box.y + (isDef ? box.h - 10 : 56)} className="sysml-link-label">
            {represents ? `↔ ${represents}` : `⇢ ${references}`}
          </text>
        )}
      </g>
    )
  }

  const edge = (id: string, from: string, to: string, kind: 'connects' | 'satisfies') => {
    const a = layout.boxes.get(from)
    const z = layout.boxes.get(to)
    if (!a || !z) return null
    const p1 = edgePoint(a, center(z))
    const p2 = edgePoint(z, center(a))
    return (
      <g key={id} className={`sysml-edge is-${kind}`}>
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} markerEnd={kind === 'satisfies' ? 'url(#sysml-arrow)' : undefined} />
        {kind === 'satisfies' && (
          <text x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6} textAnchor="middle">
            «satisfy»
          </text>
        )}
      </g>
    )
  }

  const dialog = viewState.dialog
  const closeDialog = () => setViewState({ dialog: null })

  return (
    <div className={`sysml-root${viewState.showText ? ' has-text' : ''}`}>
      <div className="sysml-stage">
        <div className="sysml-notices">
          <MockTag>Subset of SysML · illustrative notation · not SysML v2 compliant</MockTag>
          {resolution?.status === 'none' && (
            <Notice
              tone="info"
              title="Not in the SysML model"
              actions={
                selectedComponent && !model.linkedObjects(selectedComponent.id, 'represents', 'in').some((o) => o.type === 'sysml-element') ? (
                  <Button size="sm" variant="outlined" icon="add" onPress={() => setViewState({ dialog: { kind: 'add-part', representsId: selectedComponent.id } })}>
                    Add part for {selectedComponent.id}
                  </Button>
                ) : selectedIds.some((id) => model.get(id)?.type === 'requirement') ? (
                  <Button size="sm" variant="outlined" icon="link" onPress={() => setViewState({ dialog: { kind: 'add-requirement', requirementId: selectedIds.find((id) => model.get(id)?.type === 'requirement') } })}>
                    Add reference
                  </Button>
                ) : undefined
              }
            >
              {resolution.reason} The selection is kept.
            </Notice>
          )}
        </div>
        <svg
          ref={svgRef}
          className="sysml-canvas"
          viewBox={`${vx} ${vy} ${vw} ${vh}`}
          role="group"
          aria-label="SysML diagram. Elements can be selected with Tab and Enter."
          onClick={() => select([])}
        >
          <defs>
            <marker id="sysml-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="sysml-arrowhead" />
            </marker>
          </defs>
          {d.definitions.map(renderBox)}
          {d.connections.map((c) => edge(c.id, c.from, c.to, 'connects'))}
          {d.satisfies.map((s) => edge(s.id, s.from, s.to, 'satisfies'))}
          {d.elements.filter((e) => !(e.kind === 'part' && !e.ownerId)).map(renderBox)}
        </svg>
        <div className="sysml-status">
          <span>
            {d.elements.length} elements · {d.connections.length} connections · {d.satisfies.length} satisfy links
          </span>
          <Button size="sm" variant="text" icon="fit" onPress={() => api.updateViewState({ camera: { panX: 0, panY: 0, zoom: 1 } })}>
            Fit
          </Button>
        </div>
      </div>
      <aside className="sysml-side" aria-label="SysML properties">
        {focused ? (
          <PropertyInspector element={focused} />
        ) : (
          <EmptyState icon="sysml-block" title="No element selected">
            Select an element, or a component or requirement that has a SysML representation.
          </EmptyState>
        )}
        <details className="sysml-support">
          <summary>Supported constructs</summary>
          <p className="m-0">Supported: {SUPPORTED_CONSTRUCTS.join(', ')}.</p>
          <p className="m-0">Not supported: {UNSUPPORTED_CONSTRUCTS.join(', ')}.</p>
          <p className="m-0">Not synchronised with CAD: links to components are explicit 'represents' relationships.</p>
        </details>
      </aside>
      {viewState.showText && (
        <section className="sysml-text" aria-label="Illustrative text notation">
          <header>
            <span>Text (illustrative, read-only)</span>
            <IconButton label="Close text" icon="close" size="sm" onPress={() => setViewState({ showText: false })} />
          </header>
          <pre tabIndex={0}>{textNotation(model, d)}</pre>
        </section>
      )}
      {dialog?.kind === 'add-part' && <AddPartDialog representsId={dialog.representsId} onClose={closeDialog} />}
      {dialog?.kind === 'add-requirement' && <AddRequirementDialog requirementId={dialog.requirementId} onClose={closeDialog} />}
      {dialog?.kind === 'connect' && <ConnectDialog fromId={dialog.fromId} onClose={closeDialog} />}
    </div>
  )
}

