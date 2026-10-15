import { Badge, Button, ComboBox, EmptyState, Notice, Select, TextField, type Tone } from '@ews/design-system'
import type { ArtifactModule, ModelIndex, PlatformServices } from '@ews/platform-sdk'
import { useModel, usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import { referencePortsFor, isLegacyTwinReference, isRealModuleReference, referenceKind, scopedId, type ArtifactRefInput, type Concept, type Implementation, type ImplementationArtifact, type ReferencePort } from '@ews/conceptualize-client'
import { registeredReferencePorts } from '../references'
import { useEffect, useMemo, useState } from 'react'
import { useModuleData, useResource } from '../data'
import { formatDate, formatQuantity } from '../domain'
import { ApiErrorNotice, BasisBadge, ConceptLinkButton, ProvenanceBadge, Section } from './common'
import { EvidenceReviewControl } from './Knowledge'
import { EvidenceForm, VerificationControl } from './EvidenceForm'

// ---- stale and broken link detection (contracts §9: client-side through the SDK and the model index) ----

export type LinkState = 'current' | 'stale' | 'broken' | 'follows-latest' | 'test-adapter' | 'unchecked' | 'module-unavailable'
export interface LinkStatus {
  state: LinkState
  detail: string
  latest?: number
  /** Checked through a labelled adapter (not an SDK read client). */
  via?: { name: string; adapter: boolean }
  /** A legacy twin object of the illustrative tools (PRJ-ACT100 demo data). */
  demo?: boolean
}
export const LINK_TONE: Record<LinkState, Tone> = { current: 'success', stale: 'warning', broken: 'danger', 'follows-latest': 'neutral', 'test-adapter': 'warning', unchecked: 'neutral', 'module-unavailable': 'neutral' }
export const LINK_LABEL: Record<LinkState, string> = { current: 'Current', stale: 'Changed since linked', broken: 'Not found', 'follows-latest': 'Follows latest', 'test-adapter': 'Test adapter', unchecked: 'Not checked', 'module-unavailable': 'Module unavailable' }

const TWIN_MODULES: ArtifactModule[] = ['sysml', 'cad', 'twin']

/** Status of a version-aware reference: compared with the owning module's current revision. */
/** Ports for real-module references: SDK 1.8 read clients, the Project Management registry, then injected adapters. */
function portsFor(services: PlatformServices): ReferencePort[] {
  return referencePortsFor(services, registeredReferencePorts())
}

export async function checkArtifact(ref: { module: ArtifactModule; id: string; revision?: number | null; kind?: string | null }, ctx: { model: ModelIndex; services: PlatformServices; projectId: string }): Promise<LinkStatus> {
  if (isRealModuleReference(ref)) {
    const kind = referenceKind(ref)
    const port = portsFor(ctx.services).find((p) => p.supports(ref))
    if (!port) return { state: 'module-unavailable', detail: `The module that owns ${kind} references is not available here (no read client in this host). The reference is kept.` }
    const via = { name: port.name, adapter: port.adapter }
    const r = await port.resolve(ctx.projectId, ref)
    if (r.state === 'missing') return { state: 'broken', detail: r.detail ?? 'Not found in the owning module. The Concept stays valid; relink or remove the reference.', via }
    if (r.state === 'unavailable') return { state: 'module-unavailable', detail: r.detail ?? 'The owning module cannot be checked now. The reference is kept.', via }
    const label = r.label ?? ref.id
    if (!ref.revision || r.latest === undefined) return { state: 'follows-latest', detail: `${label}${r.latest !== undefined ? ` (rev ${r.latest})` : ''}${r.detail ? `. ${r.detail}` : ''}`, latest: r.latest, via }
    if (r.latest > ref.revision) return { state: 'stale', detail: `${label}: revision ${r.latest}, linked at ${ref.revision}.${port.adapter ? ' The adapter compares model revisions; the entity itself may be unchanged.' : ''}`, latest: r.latest, via }
    return { state: 'current', detail: `${label} (rev ${r.latest})`, latest: r.latest, via }
  }
  if (ref.module === 'analysis') return { state: 'test-adapter', detail: 'No Analysis module exists: this reference comes from a labelled test adapter and is not checked.' }
  if (ref.module === 'external') return { state: 'unchecked', detail: 'External references are not checked automatically.' }
  if (ref.module === 'requirements') {
    const svc = ctx.services.requirements
    if (!svc) return { state: 'module-unavailable', detail: 'The Requirements service is not available here. The reference is kept.' }
    try {
      const r = await svc.get(ref.id, { projectId: ctx.projectId })
      if (!r) return { state: 'broken', detail: 'The requirement no longer exists in Requirements (or is not visible to you).' }
      if (!ref.revision) return { state: 'follows-latest', detail: `${r.key} rev ${r.revision}`, latest: r.revision }
      return r.revision > ref.revision ? { state: 'stale', detail: `${r.key} is at revision ${r.revision}; linked at ${ref.revision}.`, latest: r.revision } : { state: 'current', detail: `${r.key} rev ${r.revision}`, latest: r.revision }
    } catch (e) {
      return { state: 'module-unavailable', detail: `Requirements not reachable: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
  if (TWIN_MODULES.includes(ref.module) && isLegacyTwinReference(ref)) {
    // Legacy twin objects of the illustrative SysML and mock CAD tools: the PRJ-ACT100 demo.
    const o = ctx.model.get(ref.id)
    if (!o) return { state: 'broken', detail: `${ref.id} is not in the demo twin (deleted or replaced). The Concept stays valid; relink or remove the reference.`, demo: true }
    if (!ref.revision) return { state: 'follows-latest', detail: `${o.name} (rev ${o.revision}, demo twin)`, latest: o.revision, demo: true }
    return o.revision > ref.revision ? { state: 'stale', detail: `${o.name} changed: revision ${o.revision}, linked at ${ref.revision} (demo twin).`, latest: o.revision, demo: true } : { state: 'current', detail: `${o.name} (rev ${o.revision}, demo twin)`, latest: o.revision, demo: true }
  }
  return { state: 'unchecked', detail: '' }
}

function useStatuses(refs: { key: string; module: ArtifactModule; id: string; revision?: number | null; kind?: string | null }[]) {
  const model = useModel()
  const services = usePlatformServices()
  const { projectId } = useSharedContext()
  const [statuses, setStatuses] = useState<Record<string, LinkStatus>>({})
  const [nonce, setNonce] = useState(0)
  const sig = refs.map((r) => `${r.key}:${r.module}:${r.kind ?? ''}:${r.id}:${r.revision ?? ''}`).join('|')
  // Change notifications: a committed change of a linked requirement re-checks the references.
  useEffect(() => {
    const svc = services.requirements
    if (!svc) return
    const ids = new Set(refs.filter((r) => r.module === 'requirements').map((r) => r.id))
    if (!ids.size) return
    return svc.subscribe(projectId, (e) => ids.has(e.entityId) && setNonce((n) => n + 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, services, projectId])
  useEffect(() => {
    let alive = true
    void Promise.all(refs.map(async (r) => [r.key, await checkArtifact(r, { model, services, projectId })] as const)).then((pairs) => alive && setStatuses(Object.fromEntries(pairs)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, model, services, projectId, nonce])
  return statuses
}

export function LinkStatusBadge({ status }: { status: LinkStatus | undefined }) {
  if (!status) return null
  return (
    <>
      <Badge tone={LINK_TONE[status.state]} title={status.detail}>
        {LINK_LABEL[status.state]}
      </Badge>
      {status.via?.adapter && (
        <Badge tone="warning" title={`Checked through ${status.via.name}`}>
          adapter
        </Badge>
      )}
      {status.demo && (
        <Badge tone="neutral" title="Object of the illustrative SysML or mock CAD tool (PRJ-ACT100 demo data), not the SysML or CAD Modeler">
          Demo twin
        </Badge>
      )}
    </>
  )
}

// ---- implementations ----------------------------------------------------------------------------------------

const MODULE_LABEL: Record<ArtifactModule, string> = { requirements: 'Requirement', sysml: 'SysML element', cad: 'CAD representation', twin: 'Component or saved result', analysis: 'Analysis (test adapter)', external: 'External document or URL', projects: 'Project document', product: 'Product element', conceptualize: 'Conceptualize record' }

type PickerChoice = 'sysml-modeler' | 'cad-modeler' | 'product' | 'projects' | 'demo-twin' | 'analysis' | 'external'
const CHOICES: { id: PickerChoice; label: string; module: ArtifactModule; kind?: string; field?: string; revisionLabel?: string }[] = [
  { id: 'sysml-modeler', label: 'SysML Modeler element', module: 'sysml', kind: 'sysml-model-element', field: 'SysML project / element ID (<projectId>/<elementId>)', revisionLabel: 'Commit number (empty = follow latest)' },
  { id: 'cad-modeler', label: 'CAD Modeler entity', module: 'cad', kind: 'cad-modeler-entity', field: 'CAD document / entity ID (<documentUuid>/<entityId>)', revisionLabel: 'Document revision (empty = follow latest)' },
  { id: 'product', label: MODULE_LABEL.product, module: 'product', kind: 'product-element', field: 'Product element UUID (Project Management)', revisionLabel: 'Revision (empty = follow latest)' },
  { id: 'projects', label: MODULE_LABEL.projects, module: 'projects', kind: 'document', field: 'Project document UUID (Project Management)', revisionLabel: 'Revision (empty = follow latest)' },
  { id: 'demo-twin', label: 'Demo twin object (illustrative tools)', module: 'cad' },
  { id: 'analysis', label: MODULE_LABEL.analysis, module: 'analysis', kind: 'analysis-result', field: 'Test-adapter result ID' },
  { id: 'external', label: MODULE_LABEL.external, module: 'external', kind: 'document', field: 'URL or document reference' },
]
const DEMO_TYPES = ['sysml-element', 'cad-representation', 'assembly', 'part']
const demoModule = (type: string): ArtifactModule => (type === 'sysml-element' ? 'sysml' : type === 'cad-representation' ? 'cad' : 'twin')
const ID_HINT: Partial<Record<PickerChoice, RegExp>> = {
  'sysml-modeler': /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'cad-modeler': /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^/\s]+$/i,
  product: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  projects: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
}

/**
 * Picks a version-aware artifact reference. Real modules (SysML Modeler, CAD Modeler, Project Management) by
 * ID and revision, checked through the owning module; the legacy twin objects only in the PRJ-ACT100 demo.
 */
function ArtifactPicker({ onPick, busy, label }: { onPick: (ref: ArtifactRefInput) => void; busy?: boolean; label: string }) {
  const model = useModel()
  const { projectId } = useSharedContext()
  const demo = projectId === 'PRJ-ACT100'
  const choices = CHOICES.filter((c) => c.id !== 'demo-twin' || demo)
  const [choice, setChoice] = useState<PickerChoice>('sysml-modeler')
  const [typed, setTyped] = useState('')
  const [revision, setRevision] = useState('')
  const c = choices.find((x) => x.id === choice) ?? choices[0]
  const objects = useMemo(() => model.objects.filter((o) => DEMO_TYPES.includes(o.type)), [model])
  const id = typed.trim()
  const rev = revision.trim() === '' ? undefined : Number(revision)
  const idOk = !ID_HINT[c.id] || ID_HINT[c.id]!.test(id)
  const revOk = rev === undefined || (Number.isInteger(rev) && rev >= 1)
  const scoped = scopedId(id)
  return (
    <div className="con-inline-form" data-help-id="conceptualize.implementation.link">
      <Select label="Artifact type" size="sm" value={c.id} onChange={(m) => (setChoice(m as PickerChoice), setTyped(''), setRevision(''))} options={choices.map((x) => ({ id: x.id, label: x.label }))} />
      {c.id === 'demo-twin' ? (
        <>
          <ComboBox label={label} placeholder="Search the demo twin" options={objects.map((o) => ({ id: o.id, label: `${o.id} ${o.name}`, description: `${o.type}, revision ${o.revision}` }))} onSelect={(opt) => {
            const o = objects.find((x) => x.id === opt.id)!
            onPick({ module: demoModule(o.type), id: o.id, revision: o.revision, kind: o.type, label: `${o.id} ${o.name} (demo twin)` })
          }} />
          <Badge tone="neutral">Demo: illustrative SysML and mock CAD objects of PRJ-ACT100</Badge>
        </>
      ) : (
        <>
          <TextField label={c.field ?? 'ID'} value={typed} onChange={setTyped} />
          {c.revisionLabel && <TextField label={c.revisionLabel} value={revision} onChange={setRevision} className="con-num" />}
          <Button size="sm" variant="outlined" icon="link" isPending={busy} isDisabled={!id || !idOk || !revOk} onPress={() => onPick({ module: c.module, id, ...(rev ? { revision: rev } : {}), ...(c.kind ? { kind: c.kind } : {}), label: scoped ? `${c.label} ${scoped.entity}` : id })}>
            {label}
          </Button>
          {id && !idOk && <span className="con-muted">Format: {c.field}</span>}
        </>
      )}
      {c.id === 'analysis' && <Badge tone="warning">Test adapter: no Analysis module exists</Badge>}
    </div>
  )
}

function ArtifactRow({ impl, a, status }: { impl: Implementation; a: ImplementationArtifact; status: LinkStatus | undefined }) {
  const { client, invalidate, can } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const [replacing, setReplacing] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      setReplacing(false)
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <li data-removed={a.removed || undefined}>
      <div className="con-row">
        <Badge tone="neutral">{MODULE_LABEL[a.module]}</Badge>
        <span>{a.label || a.artifactId}</span>
        <span className="con-muted">{a.revision ? `pinned rev ${a.revision}` : 'follows latest'}</span>
        {a.removed ? <Badge tone="neutral">removed {formatDate(a.removedAt)}</Badge> : <LinkStatusBadge status={status} />}
        <ProvenanceBadge provenance={a.provenance} />
        {!a.removed && can('author') && (
          <>
            {status?.state === 'stale' && status.latest && (
              <Button size="sm" variant="text" icon="sync" onPress={() => void run(() => client.repinArtifact(impl.id, a.id, status.latest!, { expectedRevision: impl.revision, reason: `Reviewed change to revision ${status.latest}` }))}>
                Accept revision {status.latest}
              </Button>
            )}
            <Button size="sm" variant="text" icon="swap" onPress={() => setReplacing((r) => !r)}>
              Replace
            </Button>
            <Button size="sm" variant="text" icon="unlink" onPress={() => void run(() => client.unlinkArtifact(impl.id, a.id, { expectedRevision: impl.revision, reason: 'Unlinked in Conceptualize' }))}>
              Unlink
            </Button>
          </>
        )}
      </div>
      {status && status.state !== 'current' && !a.removed && <span className="con-muted">{status.detail}</span>}
      {replacing && <ArtifactPicker label="Replace with" onPick={(ref) => void run(() => client.linkArtifact(impl.id, ref, { expectedRevision: impl.revision, replaces: a.id, reason: 'Implementation redesigned' }))} />}
      {error ? <ApiErrorNotice error={error} /> : null}
    </li>
  )
}

function ImplementationCard({ impl }: { impl: Implementation }) {
  const { client, invalidate, can } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const refs = impl.artifacts.filter((a) => !a.removed).map((a) => ({ key: a.id, module: a.module, id: a.artifactId, revision: a.revision, kind: a.kind }))
  const statuses = useStatuses(refs)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const visible = impl.artifacts.filter((a) => showRemoved || !a.removed)
  return (
    <li className="con-card" data-help-id="conceptualize.implementation">
      <div className="con-row">
        <strong>
          {impl.key} {impl.name}
        </strong>
        <Badge tone={impl.status === 'implemented' ? 'success' : impl.status === 'retired' ? 'neutral' : 'info'}>{impl.status}</Badge>
        {can('author') && (
          <Select ariaLabel="Implementation status" size="sm" value={impl.status} onChange={(s) => void run(() => client.updateImplementation(impl.id, { status: s as Implementation['status'] }, { expectedRevision: impl.revision }))} options={['candidate', 'in-development', 'implemented', 'retired'].map((s) => ({ id: s, label: s }))} />
        )}
      </div>
      {impl.description && <p className="con-muted">{impl.description}</p>}
      <ul className="con-artifacts">
        {visible.map((a) => (
          <ArtifactRow key={a.id} impl={impl} a={a} status={statuses[a.id]} />
        ))}
        {!visible.length && <li className="con-muted">No artifacts linked.</li>}
      </ul>
      {impl.artifacts.some((a) => a.removed) && (
        <Button size="sm" variant="text" onPress={() => setShowRemoved((s) => !s)}>
          {showRemoved ? 'Hide removed references' : 'Show removed references (history)'}
        </Button>
      )}
      {impl.realizationRequests.map((r) => (
        <Notice key={r.id} tone={r.status === 'pending' ? 'info' : 'neutral'} title={`Realization request (${r.targetModule}): ${r.status}`}>
          {r.requestKind}
          {r.description ? `: ${r.description}` : ''}. {r.targetModule === 'cad' && r.status === 'pending' ? 'No CAD generation API exists yet; the request is recorded and stays pending until the CAD module offers one.' : ''}
          {r.fulfilledBy ? ` Fulfilled by ${r.fulfilledBy.module}:${r.fulfilledBy.id}.` : ''}
          {r.status === 'pending' && can('author') && (
            <span className="con-row">
              <Button size="sm" variant="text" onPress={() => void run(() => client.setRealizationStatus(r.id, 'cancelled', { reason: 'Cancelled in Conceptualize' }))}>
                Cancel request
              </Button>
              <ArtifactPicker label="Fulfilled by" onPick={(ref) => void run(() => client.setRealizationStatus(r.id, 'fulfilled', { fulfilledBy: ref, reason: 'Realized by the linked artifact' }))} />
            </span>
          )}
        </Notice>
      ))}
      {can('author') && (
        <div className="con-row">
          <ArtifactPicker label="Link artifact" onPick={(ref) => void run(() => client.linkArtifact(impl.id, ref, { expectedRevision: impl.revision }))} />
          <Button size="sm" variant="outlined" icon="cad" onPress={() => void run(() => client.requestRealization(impl.id, { targetModule: 'cad', requestKind: 'generate-geometry', description: `Generate geometry realizing ${impl.name}` }, { expectedRevision: impl.revision }))} data-help-id="conceptualize.implementation.realization">
            Request CAD generation
          </Button>
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </li>
  )
}

/** ConceptImplementations of a Concept: concrete artifacts, separate from the Concept's identity. */
export function ImplementationsPanel({ concept }: { concept: Concept }) {
  const { client, invalidate, can } = useModuleData()
  const impls = useResource(() => client.implementations(concept.id), [client, concept.id])
  const [name, setName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const create = async () => {
    setError(null)
    try {
      await client.createImplementation({ name: name.trim(), conceptIds: [concept.id] })
      setName('')
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Section title="Implementations" helpId="conceptualize.implementation">
      <p className="con-muted">An implementation realizes the Concept with artifacts owned by other modules. Replacing or deleting artifacts never changes the Concept itself.</p>
      <ul className="con-cards">
        {(impls.data ?? []).map((i) => (
          <ImplementationCard key={i.id} impl={i} />
        ))}
      </ul>
      {impls.data && !impls.data.length && <p className="con-muted">No implementation yet.</p>}
      {can('author') && (
        <div className="con-inline-form">
          <TextField label="New implementation" placeholder="e.g. Ball-screw design v1" value={name} onChange={setName} />
          <Button size="sm" variant="outlined" icon="add" isDisabled={!name.trim()} onPress={() => void create()} data-help-id="conceptualize.implementation.create">
            Add implementation
          </Button>
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </Section>
  )
}

/** Requirement traceability: Concept ↔ requirement links with revision checks (requirements stay authoritative in Requirements). */
export function RequirementLinks({ concept }: { concept: Concept }) {
  const { client, invalidate, can } = useModuleData()
  const services = usePlatformServices()
  const { projectId } = useSharedContext()
  const links = useResource(() => client.links({ conceptId: concept.id }), [client, concept.id])
  const statuses = useStatuses((links.data ?? []).map((l) => ({ key: l.id, module: l.artifact.module, id: l.artifact.id, revision: l.artifact.revision, kind: l.artifact.kind })))
  const [options, setOptions] = useState<{ id: string; label: string; revision: number }[]>([])
  const [relation, setRelation] = useState<'satisfies' | 'refines' | 'derives'>('satisfies')
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let alive = true
    services.requirements?.list({ projectId, limit: 200 }).then(
      (p) => alive && setOptions(p.items.map((r) => ({ id: r.id, label: `${r.key} ${r.title}`, revision: r.revision }))),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [services, projectId])
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Section title="Requirement traceability" helpId="conceptualize.requirements">
      <ul className="con-artifacts">
        {(links.data ?? []).map((l) => {
          const s = statuses[l.id]
          return (
            <li key={l.id}>
              <div className="con-row">
                <Badge tone="info">{l.relation}</Badge>
                <span>{l.artifact.label || l.artifact.id}</span>
                <span className="con-muted">{l.artifact.revision ? `pinned rev ${l.artifact.revision}` : 'follows latest'}</span>
                <LinkStatusBadge status={s} />
                <ProvenanceBadge provenance={l.provenance} />
                {can('author') && s?.state === 'stale' && s.latest && (
                  <Button size="sm" variant="text" icon="sync" onPress={() => void run(() => client.repinLink(l.id, s.latest!, { reason: `Reviewed requirement revision ${s.latest}` }))}>
                    Accept revision {s.latest}
                  </Button>
                )}
                {can('author') && (
                  <Button size="sm" variant="text" icon="unlink" onPress={() => void run(() => client.removeLink(l.id, { reason: 'Unlinked in Conceptualize' }))}>
                    Unlink
                  </Button>
                )}
              </div>
              {s && s.state !== 'current' && <span className="con-muted">{s.detail}</span>}
            </li>
          )
        })}
        {links.data && !links.data.length && <li className="con-muted">No requirement links.</li>}
      </ul>
      {can('author') && services.requirements && (
        <div className="con-inline-form">
          <Select label="Relation" size="sm" value={relation} onChange={(v) => setRelation(v as typeof relation)} options={[{ id: 'satisfies', label: 'satisfies (intent, not verification)' }, { id: 'refines', label: 'refines' }, { id: 'derives', label: 'derives' }]} />
          <ComboBox label="Requirement" placeholder="Search requirements" options={options.map((o) => ({ id: o.id, label: o.label }))} onSelect={(opt) => { const o = options.find((x) => x.id === opt.id)!; void run(() => client.createLink(concept.id, { relation, artifact: { module: 'requirements', id: o.id, revision: o.revision, kind: 'requirement', label: o.label } })) }} />
        </div>
      )}
      {!services.requirements && <p className="con-muted">The Requirements service is not available here, so requirement links cannot be checked.</p>}
      {error ? <ApiErrorNotice error={error} /> : null}
    </Section>
  )
}

export function EvidenceList({ concept }: { concept: Concept }) {
  const { client, can } = useModuleData()
  const evidence = useResource(() => client.evidence(concept.id), [client, concept.id])
  const [adding, setAdding] = useState(false)
  return (
    <Section
      title="Engineering evidence"
      helpId="conceptualize.evidence"
      actions={
        can('author') &&
        !adding && (
          <Button size="sm" variant="outlined" icon="add" onPress={() => setAdding(true)}>
            Record evidence
          </Button>
        )
      }
    >
      <p className="con-muted">Preliminary estimates show their method, inputs, units and assumptions. Only records labelled “Verified evidence” reference an authoritative result.</p>
      {adding && <EvidenceForm concept={concept} onDone={() => setAdding(false)} />}
      <VerificationControl concept={concept} evidence={evidence.data ?? []} />
      <ul className="con-cards">
        {(evidence.data ?? []).map((e) => (
          <li key={e.id} className="con-card">
            <div className="con-row">
              <strong>
                {e.key} {e.title}
              </strong>
              <Badge tone="neutral">{e.kind}</Badge>
              <BasisBadge basis={e.basis} />
              <ProvenanceBadge provenance={e.provenance} />
            </div>
            {e.summary && <p>{e.summary}</p>}
            {e.method && (
              <p>
                <code>{e.method}</code>
              </p>
            )}
            {(e.inputs.length > 0 || e.outputs.length > 0) && (
              <p className="con-muted">
                Inputs: {e.inputs.map((q) => `${q.name} = ${formatQuantity(q)}`).join(', ') || '—'}; outputs: {e.outputs.map((q) => `${q.name} = ${formatQuantity(q)}`).join(', ') || '—'}
              </p>
            )}
            {e.assumptions.length > 0 && <p className="con-muted">Assumptions: {e.assumptions.join('; ')}</p>}
            <span className="con-muted">
              {e.conceptRevision ? `For revision ${e.conceptRevision}, ` : ''}{formatDate(e.createdAt)} by {e.createdBy}
            </span>
            <EvidenceReviewControl e={e} />
          </li>
        ))}
        {evidence.data && !evidence.data.length && <li className="con-muted">No evidence yet.</li>}
      </ul>
    </Section>
  )
}

/** Engineering integration: all implementations and links of the project with change notifications. */
export function IntegrationPage() {
  const { client } = useModuleData()
  const impls = useResource(() => client.implementations(), [client])
  const links = useResource(() => client.links(), [client])
  const graph = useResource(() => client.graph(), [client])
  const names = new Map((graph.data?.nodes ?? []).map((n) => [n.id, `${n.key} ${n.name}`]))
  const refs = [
    ...(impls.data ?? []).flatMap((i) => i.artifacts.filter((a) => !a.removed).map((a) => ({ key: `a:${a.id}`, module: a.module, id: a.artifactId, revision: a.revision, kind: a.kind, label: a.label || a.artifactId, concepts: i.conceptIds, via: i.key }))),
    ...(links.data ?? []).map((l) => ({ key: `l:${l.id}`, module: l.artifact.module, id: l.artifact.id, revision: l.artifact.revision ?? null, kind: l.artifact.kind, label: l.artifact.label || l.artifact.id, concepts: [l.conceptId], via: l.relation })),
  ]
  const statuses = useStatuses(refs)
  const notifications = refs.filter((r) => statuses[r.key]?.state === 'stale' || statuses[r.key]?.state === 'broken')
  return (
    <div className="con-page" data-help-id="conceptualize.integration">
      <h3 className="con-page-title">Engineering integration</h3>
      <Section title="Change notifications" helpId="conceptualize.integration.notifications">
        <p className="con-muted">Changes in implementations never overwrite design intent. Review each change, then accept the new revision (a recorded synchronization) or revise the Concept.</p>
        <ul className="con-artifacts">
          {notifications.map((r) => (
            <li key={r.key}>
              <div className="con-row">
                <LinkStatusBadge status={statuses[r.key]} />
                <span>{r.label}</span>
                <span className="con-muted">({r.via})</span>
                {r.concepts.map((c) => (
                  <ConceptLinkButton key={c} id={c} label={names.get(c) ?? c.slice(0, 8)} />
                ))}
              </div>
              <span className="con-muted">{statuses[r.key]?.detail}</span>
            </li>
          ))}
          {!notifications.length && <li className="con-muted">No stale or broken references.</li>}
        </ul>
      </Section>
      <Section title="All references">
        <ul className="con-artifacts">
          {refs.map((r) => (
            <li key={r.key} className="con-row">
              <Badge tone="neutral">{MODULE_LABEL[r.module]}</Badge>
              <span>{r.label}</span>
              <span className="con-muted">{r.revision ? `pinned rev ${r.revision}` : 'follows latest'} · {r.via}</span>
              <LinkStatusBadge status={statuses[r.key]} />
              {r.concepts.map((c) => (
                <ConceptLinkButton key={c} id={c} label={names.get(c) ?? c.slice(0, 8)} />
              ))}
            </li>
          ))}
          {!refs.length && <EmptyState title="No references yet">Link Concepts to SysML, CAD, requirements or analysis results from the Concept workspace.</EmptyState>}
        </ul>
      </Section>
    </div>
  )
}
