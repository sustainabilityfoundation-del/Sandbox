import { Badge, Button, EmptyState, IconButton, LoadingState, Notice, Select, Tab, TabList, TabPanel, Tabs, TextField } from '@ews/design-system'
import type { ConceptAbstraction, ConceptMaturity } from '@ews/platform-sdk'
import { useToolViewState, useUnsavedChanges } from '@ews/platform-sdk/react'
import type { Basis, Concept, Graph, Quantity, StatementInput, StatementKind } from '@ews/conceptualize-client'
import { useState } from 'react'
import { useModuleData, useResource } from '../data'
import { BASIS, KIND_LABEL, KIND_ORDER, MATURITIES, MATURITY, RELATION_LABEL, formatDate, formatQuantity, type ConceptualizeViewState } from '../domain'
import { ApiErrorNotice, BasisBadge, ConceptLinkButton, MaturityBadge, ProvenanceBadge, RefLabel, Section } from './common'
import { EvidenceList, ImplementationsPanel, RequirementLinks } from './Integration'
import { ConceptKnowledge, DecisionRationale, DecisionValidityBadge, RefButton, dref, useStatementRecords } from './Knowledge'

const ABSTRACTIONS: ConceptAbstraction[] = ['function', 'component', 'assembly', 'subsystem', 'system', 'abstract']

function IntentView({ concept }: { concept: Concept }) {
  const records = useStatementRecords(concept.id)
  const groups = KIND_ORDER.map((k) => ({ kind: k, items: concept.statements.filter((s) => s.kind === k) })).filter((g) => g.items.length)
  return (
    <div className="con-stack">
      {concept.description ? <p className="con-description" data-help-id="conceptualize.workspace.description">{concept.description}</p> : <p className="con-muted">No description yet.</p>}
      {concept.purpose && (
        <p>
          <strong>Purpose:</strong> {concept.purpose}
        </p>
      )}
      {Object.keys(concept.attributes).length > 0 && (
        <dl className="con-attributes">
          {Object.entries(concept.attributes).map(([k, a]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {formatQuantity(a)} {a.basis && <BasisBadge basis={a.basis} />}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {groups.map((g) => (
        <Section key={g.kind} title={KIND_LABEL[g.kind]}>
          <ul className="con-statements">
            {g.items.map((s) => (
              <li key={s.id} data-basis={s.basis}>
                <span className="con-statement-text">
                  {s.text}
                  {s.quantity && <strong> {formatQuantity(s.quantity)}</strong>}
                </span>
                <span className="con-row">
                  <BasisBadge basis={s.basis} />
                  {s.state && <Badge tone={s.state === 'open' ? 'warning' : 'success'}>{s.state}</Badge>}
                  {records.get(s.id) && <RefButton target={dref(records.get(s.id)!.type, records.get(s.id)!.id)} label={`${records.get(s.id)!.key} (${records.get(s.id)!.status})`} />}
                  {s.confirmedBy && <span className="con-muted">confirmed by {s.confirmedBy}</span>}
                  {s.source && <span className="con-muted" title={s.source}>{s.source.length > 40 ? `${s.source.slice(0, 39)}…` : s.source}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      {!groups.length && <p className="con-muted">No statements yet: add functions, constraints with units, assumptions and open questions with Edit.</p>}
    </div>
  )
}

interface DraftStatement extends StatementInput {
  key: string
  wasHypothesis?: boolean
}

const EDIT_BASES: Basis[] = ['user-assertion', 'assumption', 'estimate']

/** Editing creates a new immutable revision. AI hypotheses stay labelled until confirmed explicitly. */
function IntentEditor({ concept, onDone }: { concept: Concept; onDone: () => void }) {
  const { client, invalidate } = useModuleData()
  const [name, setName] = useState(concept.name)
  const [summary, setSummary] = useState(concept.summary)
  const [description, setDescription] = useState(concept.description)
  const [purpose, setPurpose] = useState(concept.purpose)
  const [abstraction, setAbstraction] = useState<ConceptAbstraction>(concept.abstraction)
  const [reason, setReason] = useState('')
  const [statements, setStatements] = useState<DraftStatement[]>(() => concept.statements.map((s) => ({ key: s.id, id: s.id, kind: s.kind, text: s.text, basis: s.basis, quantity: s.quantity, state: s.state, evidenceId: s.evidenceId, decisionId: s.decisionId, source: s.source, wasHypothesis: s.basis === 'ai-hypothesis' })))
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  useUnsavedChanges(true)
  const patch = (i: number, p: Partial<DraftStatement>) => setStatements((list) => list.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const setQ = (i: number, field: keyof Quantity, raw: string) => {
    const s = statements[i]
    const q: Quantity = { ...(s.quantity ?? { unit: '' }) }
    if (field === 'unit') q.unit = raw.trim()
    else q[field] = raw.trim() === '' ? null : Number(raw)
    patch(i, { quantity: q.unit || q.value != null || q.min != null || q.max != null ? q : null })
  }
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await client.updateConcept(
        concept.id,
        { name, summary, description, purpose, abstraction, statements: statements.map(({ key: _k, wasHypothesis: _w, ...s }) => s) },
        { expectedRevision: concept.revision, reason: reason.trim() || undefined },
      )
      invalidate()
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="con-form" data-help-id="conceptualize.workspace.edit">
      <TextField label="Name" value={name} onChange={setName} />
      <TextField label="Summary" value={summary} onChange={setSummary} />
      <TextField label="Description (natural language, kept verbatim)" multiline rows={4} value={description} onChange={setDescription} />
      <div className="con-form-grid">
        <TextField label="Purpose" value={purpose} onChange={setPurpose} />
        <Select label="Abstraction (does not restrict what it can become)" value={abstraction} onChange={(v) => setAbstraction(v as ConceptAbstraction)} options={ABSTRACTIONS.map((a) => ({ id: a, label: a }))} />
      </div>
      <fieldset className="con-fieldset">
        <legend>Statements of design intent</legend>
        {statements.map((s, i) => (
          <div key={s.key} className="con-statement-edit">
            <Select ariaLabel="Kind" size="sm" value={s.kind} onChange={(k) => patch(i, { kind: k as StatementKind })} options={KIND_ORDER.map((k) => ({ id: k, label: KIND_LABEL[k] }))} />
            <TextField aria-label="Statement" value={s.text} onChange={(text) => patch(i, { text })} className="con-grow" />
            <TextField aria-label="Value" placeholder="value" value={s.quantity?.value?.toString() ?? ''} onChange={(v) => setQ(i, 'value', v)} className="con-num" />
            <TextField aria-label="Min" placeholder="min" value={s.quantity?.min?.toString() ?? ''} onChange={(v) => setQ(i, 'min', v)} className="con-num" />
            <TextField aria-label="Max" placeholder="max" value={s.quantity?.max?.toString() ?? ''} onChange={(v) => setQ(i, 'max', v)} className="con-num" />
            <TextField aria-label="Unit" placeholder="unit" value={s.quantity?.unit ?? ''} onChange={(v) => setQ(i, 'unit', v)} className="con-num" />
            {s.wasHypothesis && !s.confirm ? (
              <>
                <BasisBadge basis="ai-hypothesis" />
                <Button size="sm" variant="outlined" icon="check" onPress={() => patch(i, { confirm: true, basis: undefined })}>
                  Confirm
                </Button>
              </>
            ) : s.basis === 'evidence' || s.basis === 'decision' ? (
              <BasisBadge basis={s.basis} />
            ) : (
              <Select ariaLabel="Basis" size="sm" value={s.confirm ? 'user-assertion' : (s.basis ?? 'user-assertion')} onChange={(b) => patch(i, { basis: b as Basis })} options={EDIT_BASES.map((b) => ({ id: b, label: BASIS[b].label }))} isDisabled={!!s.confirm} />
            )}
            {(s.kind === 'question' || s.kind === 'uncertainty') && (
              <Select ariaLabel="State" size="sm" value={s.state ?? 'open'} onChange={(v) => patch(i, { state: v as 'open' | 'resolved' })} options={[{ id: 'open', label: 'Open' }, { id: 'resolved', label: 'Resolved' }]} />
            )}
            <IconButton size="sm" label="Remove statement" icon="close" onPress={() => setStatements((l) => l.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Button size="sm" variant="text" icon="add" onPress={() => setStatements((l) => [...l, { key: `new-${l.length}-${Date.now()}`, kind: 'constraint', text: '', basis: 'user-assertion' }])}>
          Add statement
        </Button>
      </fieldset>
      <TextField label="Reason for the change (recorded with the revision)" value={reason} onChange={setReason} />
      {error ? <ApiErrorNotice error={error} /> : null}
      <div className="con-row con-form-actions">
        <Button variant="filled" icon="save" isPending={busy} onPress={() => void save()} data-help-id="conceptualize.workspace.save">
          Save as revision {concept.revision + 1}
        </Button>
        <Button variant="text" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function MaturityControl({ concept, graph }: { concept: Concept; graph: Graph | undefined }) {
  const { client, invalidate, can } = useModuleData()
  const [to, setTo] = useState<ConceptMaturity>(concept.maturity)
  const [reason, setReason] = useState('')
  const [replacedBy, setReplacedBy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  if (!can('author') && !can('decide')) return null
  const apply = async () => {
    setError(null)
    try {
      await client.changeMaturity(concept.id, to, { expectedRevision: concept.revision, reason: reason.trim() || `Set to ${to}`, ...(to === 'superseded' && replacedBy ? { replacedBy } : {}) })
      setReason('')
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <div className="con-inline-form" data-help-id="conceptualize.maturity.change">
      <Select label="Maturity" size="sm" value={to} onChange={(v) => setTo(v as ConceptMaturity)} options={MATURITIES.map((m) => ({ id: m, label: MATURITY[m].label }))} />
      {to === 'superseded' && (
        <Select label="Replaced by" size="sm" value={replacedBy} placeholder="Optional" onChange={setReplacedBy} options={(graph?.nodes ?? []).filter((n) => n.id !== concept.id).map((n) => ({ id: n.id, label: `${n.key} ${n.name}` }))} />
      )}
      <TextField label="Reason" value={reason} onChange={setReason} />
      <Button size="sm" variant="outlined" isDisabled={to === concept.maturity} onPress={() => void apply()}>
        Change maturity
      </Button>
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

function StructureView({ concept, graph }: { concept: Concept; graph: Graph | undefined }) {
  const { client, invalidate, can } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const nodes = new Map((graph?.nodes ?? []).map((n) => [n.id, n]))
  const edges = (graph?.edges ?? []).filter((e) => e.fromId === concept.id || e.toId === concept.id)
  const [type, setType] = useState<keyof typeof RELATION_LABEL>('depends-on')
  const [target, setTarget] = useState<string | null>(null)
  const add = async () => {
    if (!target) return
    setError(null)
    try {
      await client.createRelationship({ type, fromId: concept.id, toId: target, ...(type === 'contains' && decomposition ? { decompositionId: decomposition } : {}) })
      setTarget(null)
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const remove = async (id: string, revision: number) => {
    setError(null)
    try {
      await client.removeRelationship(id, { expectedRevision: revision, reason: 'Removed in the Concept workspace' })
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const decs = (graph?.decompositions ?? []).filter((d) => d.parentId === concept.id)
  const [decName, setDecName] = useState('')
  const [decomposition, setDecomposition] = useState<string | null>(null)
  const children = (graph?.edges ?? []).filter((e) => e.type === 'contains' && e.fromId === concept.id)
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
    <div className="con-stack" data-help-id="conceptualize.structure">
      <Section title="Decompositions" helpId="conceptualize.structure">
        <p className="con-muted">Alternative decomposition structures of this Concept. Children may be shared; the decomposition need not match a CAD assembly or SysML containment.</p>
        <ul className="con-rel-list">
          {decs.map((d) => (
            <li key={d.id}>
              <strong>{d.name}</strong>
              <span className="con-muted">{children.filter((e) => e.decompositionId === d.id).length} children</span>
              {can('author') ? (
                <Select ariaLabel={`Status of ${d.name}`} size="sm" value={d.status} onChange={(s) => void run(() => client.updateDecomposition(d.id, { status: s as typeof d.status }, { expectedRevision: d.recordVersion }))} options={['candidate', 'preferred', 'rejected'].map((s) => ({ id: s, label: s }))} />
              ) : (
                <Badge tone="neutral">{d.status}</Badge>
              )}
            </li>
          ))}
          {!decs.length && <li className="con-muted">No named decomposition; children are linked directly.</li>}
        </ul>
        {can('author') && (
          <div className="con-inline-form">
            <TextField label="New decomposition" placeholder="e.g. Hybrid-electric" value={decName} onChange={setDecName} />
            <Button size="sm" variant="outlined" icon="add" isDisabled={!decName.trim()} onPress={() => void run(async () => { await client.createDecomposition({ parentId: concept.id, name: decName.trim() }); setDecName('') })}>
              Add decomposition
            </Button>
          </div>
        )}
      </Section>
      <ul className="con-rel-list">
        {edges.map((e) => {
          const out = e.fromId === concept.id
          const other = nodes.get(out ? e.toId : e.fromId)
          return (
            <li key={e.id}>
              <span className="con-muted">{out ? RELATION_LABEL[e.type].out : RELATION_LABEL[e.type].in}</span>
              {other ? <ConceptLinkButton id={other.id} label={`${other.key} ${other.name}`} /> : <span>(archived Concept)</span>}
              {e.decompositionId && <Badge tone="neutral">{decs.find((d) => d.id === e.decompositionId)?.name ?? 'decomposition'}</Badge>}
              {e.interface && <Badge tone="info" title={e.interface.flows?.join(', ')}>{e.interface.kind}: {e.interface.name}</Badge>}
              {e.basis !== 'user-assertion' && <BasisBadge basis={e.basis} />}
              {can('author') && <IconButton size="sm" label="Remove relationship" icon="unlink" onPress={() => void remove(e.id, e.revision)} />}
            </li>
          )
        })}
        {!edges.length && <li className="con-muted">No relationships yet.</li>}
      </ul>
      {can('author') && (
        <div className="con-inline-form" data-help-id="conceptualize.relationship.create">
          <Select label="Relationship" size="sm" value={type} onChange={(v) => setType(v as typeof type)} options={Object.entries(RELATION_LABEL).map(([k, v]) => ({ id: k, label: v.out }))} />
          <Select label="Concept" size="sm" value={target} placeholder="Choose a Concept" onChange={setTarget} options={(graph?.nodes ?? []).filter((n) => n.id !== concept.id).map((n) => ({ id: n.id, label: `${n.key} ${n.name}` }))} />
          {type === 'contains' && decs.length > 0 && (
            <Select label="In decomposition" size="sm" value={decomposition} placeholder="None" onChange={setDecomposition} options={decs.map((d) => ({ id: d.id, label: d.name }))} />
          )}
          <Button size="sm" variant="outlined" icon="link" isDisabled={!target} onPress={() => void add()}>
            Add relationship
          </Button>
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

function DecisionsView({ concept }: { concept: Concept }) {
  const { client } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const sets = useResource(() => client.alternativeSets(concept.id), [client, concept.id])
  const decisions = useResource(() => client.decisions({ conceptId: concept.id }), [client, concept.id])
  return (
    <div className="con-stack">
      <Section title="Alternative sets">
        <ul className="con-rel-list">
          {(sets.data ?? []).map((s) => (
            <li key={s.id}>
              <Button size="sm" variant="text" onPress={() => setState({ page: 'alternatives', setId: s.id })}>
                {s.key} {s.name}
              </Button>
              <span className="con-muted">{s.parentId === concept.id ? `${s.members.length} alternatives` : `member (${s.members.find((m) => m.conceptId === concept.id)?.status})`}</span>
            </li>
          ))}
          {!sets.data?.length && <li className="con-muted">Not part of an alternative set.</li>}
        </ul>
      </Section>
      <Section title="Design decisions">
        <DecisionList decisions={decisions.data ?? []} />
      </Section>
    </div>
  )
}

function RationaleToggle({ d }: { d: import('@ews/conceptualize-client').Decision }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="text" icon={open ? 'chevron-down' : 'chevron-right'} onPress={() => setOpen(!open)} data-help-id="conceptualize.decision.rationale">
        {open ? 'Hide rationale' : 'Rationale and validity'}
      </Button>
      {open && <DecisionRationale d={d} />}
    </>
  )
}

export function DecisionList({ decisions }: { decisions: import('@ews/conceptualize-client').Decision[] }) {
  if (!decisions.length) return <p className="con-muted">No decisions yet.</p>
  return (
    <ul className="con-cards">
      {decisions.map((d) => (
        <li key={d.id} className="con-card" data-status={d.status}>
          <div className="con-row">
            <strong>
              {d.key} {d.title}
            </strong>
            <Badge tone={d.status === 'recorded' ? (d.supersededById ? 'neutral' : 'success') : d.status === 'proposed' ? 'warning' : 'neutral'}>{d.supersededById ? 'superseded' : d.status}</Badge>
            <ProvenanceBadge provenance={d.provenance} />
            <DecisionValidityBadge d={d} />
          </div>
          <p>{d.rationale}</p>
          <ul className="con-outcomes">
            {d.outcomes.map((o) => (
              <li key={o.conceptId}>
                <Badge tone={o.outcome === 'accepted' ? 'success' : o.outcome === 'rejected' ? 'danger' : 'neutral'}>{o.outcome}</Badge> <ConceptLinkButton id={o.conceptId} label={<RefLabel type="concept" id={o.conceptId} />} /> {o.rationale}
              </li>
            ))}
          </ul>
          <span className="con-muted">
            Proposed by {d.proposedBy} {formatDate(d.proposedAt)}
            {d.recordedBy ? `; recorded by ${d.recordedBy} ${formatDate(d.recordedAt)}` : ''}
          </span>
          <RationaleToggle d={d} />
        </li>
      ))}
    </ul>
  )
}

function HistoryView({ concept }: { concept: Concept }) {
  const { client } = useModuleData()
  const revisions = useResource(() => client.revisions(concept.id), [client, concept.id, concept.revision])
  const history = useResource(() => client.history(concept.id), [client, concept.id])
  return (
    <div className="con-stack" data-help-id="conceptualize.history">
      <Section title="Revisions (immutable)">
        <ul className="con-history">
          {(revisions.data ?? []).map((r) => (
            <li key={r.revision}>
              <strong>Revision {r.revision}</strong> {r.name} <span className="con-muted">{formatDate(r.createdAt)} by {r.createdBy}</span> <ProvenanceBadge provenance={r.provenance} />
              {r.changeReason && <span className="con-muted"> — {r.changeReason}</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Change history">
        <ul className="con-history">
          {(history.data ?? []).map((h) => (
            <li key={h.id}>
              <span>
                {h.entityType} {h.action}
                {h.revision ? ` (rev ${h.revision})` : ''}
              </span>{' '}
              <span className="con-muted">
                {formatDate(h.occurredAt)} by {h.actor}
                {h.reason ? ` — ${h.reason}` : ''}
              </span>{' '}
              <ProvenanceBadge provenance={h.provenance} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

/** The Concept Workspace: one Concept with intent, structure, decisions, implementations, evidence and history. */
export function ConceptWorkspace({ graph }: { graph: Graph | undefined }) {
  const { client, can } = useModuleData()
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const [editing, setEditing] = useState(false)
  const id = state.conceptId
  const concept = useResource(id ? () => client.concept(id) : null, [client, id])
  if (!id) return <EmptyState icon="info" title="No Concept open">Choose a Concept in the explorer, or create one from a description with New concept.</EmptyState>
  if (concept.error && !concept.data) return <ApiErrorNotice error={new Error(concept.error)} title="The Concept could not be loaded" />
  const c = concept.data
  if (!c) return <LoadingState label="Loading Concept" />
  return (
    <div className="con-workspace" data-help-id="conceptualize.workspace">
      <header className="con-workspace-head">
        <div>
          <span className="con-key">{c.key}</span>
          <h3>{c.name}</h3>
          <p className="con-muted">{c.summary}</p>
        </div>
        <div className="con-row">
          <MaturityBadge maturity={c.maturity} />
          <Badge tone="neutral" title="Implementation status (derived from implementations)">implementation: {c.implementationStatus}</Badge>
          <Badge tone={c.verificationStatus === 'verified' ? 'success' : 'neutral'} title="Verification status (needs verified evidence)">verification: {c.verificationStatus}</Badge>
          <Badge tone="neutral">{c.abstraction}</Badge>
          <span className="con-muted">rev {c.revision}</span>
          <ProvenanceBadge provenance={c.provenance} />
          <IconButton label="Close" icon="close" onPress={() => setState({ conceptId: null })} />
        </div>
      </header>
      {c.statements.some((s) => s.basis === 'ai-hypothesis') && (
        <Notice tone="warning" title="Contains AI hypotheses">
          Statements labelled “AI hypothesis” were proposed by the assistant and are not verified. Confirm them with Edit, or open AI collaboration.
        </Notice>
      )}
      <Tabs selectedKey={state.tab} onSelectionChange={(k) => setState({ tab: k as ConceptualizeViewState['tab'] })}>
        <TabList aria-label="Concept sections">
          <Tab id="intent">Intent</Tab>
          <Tab id="structure">Structure</Tab>
          <Tab id="knowledge">Design knowledge</Tab>
          <Tab id="decisions">Alternatives and decisions</Tab>
          <Tab id="implementations">Implementations</Tab>
          <Tab id="evidence">Evidence</Tab>
          <Tab id="history">History</Tab>
        </TabList>
        <TabPanel id="intent">
          {editing ? (
            <IntentEditor concept={c} onDone={() => setEditing(false)} />
          ) : (
            <>
              {can('author') && c.maturity !== 'archived' && c.maturity !== 'superseded' && (
                <div className="con-row">
                  <Button size="sm" variant="outlined" icon="edit" onPress={() => setEditing(true)} data-help-id="conceptualize.workspace.edit">
                    Edit
                  </Button>
                </div>
              )}
              <IntentView concept={c} />
              <MaturityControl concept={c} graph={graph} />
            </>
          )}
        </TabPanel>
        <TabPanel id="structure">
          <StructureView concept={c} graph={graph} />
        </TabPanel>
        <TabPanel id="knowledge">
          <ConceptKnowledge concept={c} graph={graph} />
        </TabPanel>
        <TabPanel id="decisions">
          <DecisionsView concept={c} />
        </TabPanel>
        <TabPanel id="implementations">
          <ImplementationsPanel concept={c} />
          <RequirementLinks concept={c} />
        </TabPanel>
        <TabPanel id="evidence">
          <EvidenceList concept={c} />
        </TabPanel>
        <TabPanel id="history">
          <HistoryView concept={c} />
        </TabPanel>
      </Tabs>
    </div>
  )
}
