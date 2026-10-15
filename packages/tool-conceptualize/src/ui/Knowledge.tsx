import { Badge, Button, EmptyState, IconButton, LoadingState, Notice, SearchField, Select, TextField } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { AnyRef, Assumption, AssumptionStatus, Basis, Concept, ConstraintStatus, Decision, DesignConstraint, DesignEntityType, DesignFunction, DesignRef, Evidence, Graph, GraphNode } from '@ews/conceptualize-client'
import { useState, type ReactNode } from 'react'
import { useModuleData, useResource } from '../data'
import { BASIS, formatDate, formatQuantity, type ConceptualizeViewState, type DesignRecordType } from '../domain'
import { ApiErrorNotice, BasisBadge, ConceptLinkButton, ProvenanceBadge, Section } from './common'

/**
 * Design knowledge (Design Reasoning P1): Functions, Constraints and Assumptions in the Explorer and the
 * inspector, typed design links, decision rationale and evidence reviews. Every write goes through the
 * module client with an expected revision or an idempotency key; the server enforces every rule.
 */

export const dref = (type: DesignEntityType, id: string, revision?: number): DesignRef => ({ module: 'conceptualize', type, id, ...(revision ? { revision } : {}) })
const isDesignRef = (r: AnyRef): r is DesignRef => r.module === 'conceptualize'

const TYPE_LABEL: Record<string, string> = { concept: 'Concept', function: 'Function', constraint: 'Constraint', assumption: 'Assumption', evidence: 'Evidence', decision: 'Decision', implementation: 'Implementation', exploration: 'Exploration' }
const VALIDATION_TONE: Record<AssumptionStatus, 'neutral' | 'warning' | 'success' | 'danger' | 'info'> = { unvalidated: 'warning', 'under-review': 'info', validated: 'success', invalidated: 'danger', retired: 'neutral' }
const CONSTRAINT_TONE: Record<ConstraintStatus, 'neutral' | 'warning' | 'success' | 'info'> = { proposed: 'warning', active: 'success', relaxed: 'info', retired: 'neutral' }
const LINK_BASES: Basis[] = ['user-assertion', 'assumption', 'assessment', 'estimate']

function useRun() {
  const { invalidate } = useModuleData()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(true)
    try {
      const r = await fn()
      invalidate()
      return r
    } catch (e) {
      setError(e)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { error, busy, run, setError }
}

/** Opens a referenced record: Concepts in the Concept workspace, design records in the inspector. */
export function RefButton({ target, label }: { target: AnyRef; label: ReactNode }) {
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  if (!isDesignRef(target)) return <span title={`${target.module} ${target.id}`}>{label}</span>
  if (target.type === 'concept') return <ConceptLinkButton id={target.id} label={label} />
  if (target.type === 'function' || target.type === 'constraint' || target.type === 'assumption')
    return (
      <Button size="sm" variant="text" className="con-link" onPress={() => setState({ record: { type: target.type as DesignRecordType, id: target.id }, conceptId: null, page: 'explorer' })}>
        {label}
      </Button>
    )
  return <span>{label}</span>
}

export function boundText(c: Pick<DesignConstraint, 'bound'>): string {
  if (!c.bound) return ''
  const q = c.bound.quantity
  const v = c.bound.operator === 'in-range' ? formatQuantity(q) : formatQuantity({ unit: q.unit, value: q.value ?? (c.bound.operator.startsWith('<') ? q.max : q.min) ?? null })
  return `${c.bound.symbol ? `${c.bound.symbol} ` : ''}${c.bound.operator === 'in-range' ? 'in' : c.bound.operator} ${v}`
}

// ---- Explorer lists -----------------------------------------------------------------------------------------

export function RecordList({ type }: { type: DesignRecordType }) {
  const { client } = useModuleData()
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const text = state.search.trim() || undefined
  const data = useResource<{ id: string; key: string; label: string; status: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'info'; basis?: Basis; ai: boolean }[]>(
    async () => {
      if (type === 'function') return (await client.functions({ text })).map((f) => ({ id: f.id, key: f.key, label: f.name, status: f.status, tone: f.status === 'active' ? 'success' : 'neutral', ai: f.provenance.sourceKind === 'assistant' }))
      if (type === 'constraint') return (await client.constraints({ text })).map((c) => ({ id: c.id, key: c.key, label: `${c.statement}${c.bound ? ` (${boundText(c)})` : ''}`, status: c.status, tone: CONSTRAINT_TONE[c.status], basis: c.basis, ai: c.provenance.sourceKind === 'assistant' }))
      return (await client.assumptions({ text })).map((a) => ({ id: a.id, key: a.key, label: `${a.statement}${a.quantity ? ` ${formatQuantity(a.quantity)}` : ''}`, status: a.validationStatus, tone: VALIDATION_TONE[a.validationStatus], basis: a.basis, ai: a.provenance.sourceKind === 'assistant' }))
    },
    [client, type, text],
  )
  if (data.error) return <ApiErrorNotice error={new Error(data.error)} title={`${TYPE_LABEL[type]}s could not be loaded`} />
  if (!data.data) return <LoadingState label={`Loading ${TYPE_LABEL[type].toLowerCase()}s`} />
  if (!data.data.length)
    return (
      <EmptyState title={`No ${TYPE_LABEL[type].toLowerCase()}s${text ? ' match' : ' yet'}`}>
        {type === 'function' ? 'Create a Function below, or convert a function-Concept in its Design knowledge tab.' : type === 'constraint' ? 'Promote a constraint statement of a Concept, or formalize a requirement.' : 'Assumption statements of Concepts become Assumptions; record free assumptions in a Concept’s Design knowledge tab.'}
      </EmptyState>
    )
  return (
    <ul className="con-results" aria-label={`${TYPE_LABEL[type]}s`} data-help-id={`conceptualize.knowledge.${type}s`}>
      {data.data.map((r) => (
        <li key={r.id} className={state.record?.id === r.id ? 'is-open' : undefined}>
          <Button size="sm" variant="quiet" className="con-tree-label" onPress={() => setState({ record: { type, id: r.id }, conceptId: null })}>
            <span className="con-key">{r.key}</span> {r.label.length > 80 ? `${r.label.slice(0, 79)}…` : r.label}
          </Button>
          <span className="con-tree-badges">
            <Badge tone={r.tone}>{r.status}</Badge>
            {r.basis && <BasisBadge basis={r.basis} />}
            {r.ai && (
              <Badge tone="warning" icon="assistant" title="Created from an assistant proposal">
                AI
              </Badge>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function NewFunctionForm() {
  const { client, can } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const [name, setName] = useState('')
  const { error, busy, run } = useRun()
  if (!can('author')) return null
  return (
    <div className="con-inline-form" data-help-id="conceptualize.knowledge.function.create">
      <TextField label="New function" placeholder="e.g. Reject heat" value={name} onChange={setName} />
      <Button
        size="sm"
        variant="outlined"
        icon="add"
        isPending={busy}
        isDisabled={!name.trim()}
        onPress={() =>
          void run(async () => {
            const f = await client.createFunction({ name: name.trim() })
            setName('')
            setState({ record: { type: 'function', id: f.id }, conceptId: null })
          })
        }
      >
        Create function
      </Button>
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

// ---- design links -----------------------------------------------------------------------------------------------

/** Typed links of one record: the stored design links plus readings of Concept relationships and other stored data. */
export function DesignLinksSection({ subject }: { subject: DesignRef }) {
  const { client, can } = useModuleData()
  const nb = useResource(() => client.neighbourhood(subject.type, subject.id, 1), [client, subject.type, subject.id])
  const stored = useResource(() => client.designLinks({ id: subject.id }), [client, subject.id])
  const types = useResource(() => client.linkTypes(), [client])
  const { error, busy, run } = useRun()
  const [type, setType] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string | null>(null)
  const [basis, setBasis] = useState<Basis>('user-assertion')
  const candidates = useResource(query.trim().length >= 2 ? () => client.search(query.trim(), undefined, 20) : null, [client, query])
  const nodes = new Map((nb.data?.nodes ?? []).map((n) => [`${n.ref.module}:${n.ref.id}`, n]))
  const linkType = new Map((types.data ?? []).map((t) => [t.name, t]))
  const revisions = new Map((stored.data ?? []).map((l) => [l.id, l.revision]))
  const edges = (nb.data?.edges ?? []).filter((e) => e.from.id === subject.id || e.to.id === subject.id)
  const label = (n: GraphNode | undefined, r: AnyRef) => (n ? `${n.key} ${n.label}` : `${r.module} ${r.id.slice(0, 8)}`)
  const addable = (types.data ?? []).filter((t) => t.stored === 'design-links' && t.fromTypes.includes(subject.type))
  const chosen = type ? linkType.get(type) : undefined
  const targets = (candidates.data?.items ?? []).filter((i) => i.ref.id !== subject.id && (!chosen || chosen.toTypes.includes(i.ref.type)))
  return (
    <Section title="Design links" helpId="conceptualize.knowledge.links">
      {nb.error && <ApiErrorNotice error={new Error(nb.error)} title="Links could not be loaded" />}
      <ul className="con-rel-list">
        {edges.map((e) => {
          const out = e.from.id === subject.id
          const other = out ? e.to : e.from
          const t = linkType.get(e.type)
          return (
            <li key={`${e.stored}:${e.id}:${out}`}>
              <span className="con-muted">{t ? (out ? t.label : t.inverse) : e.type}</span>
              <RefButton target={other} label={label(nodes.get(`${other.module}:${other.id}`), other)} />
              {isDesignRef(other) && <Badge tone="neutral">{TYPE_LABEL[other.type] ?? other.type}</Badge>}
              {e.pinned && <Badge tone="neutral" title="Pinned to one revision">pinned</Badge>}
              {e.basis && e.basis !== 'user-assertion' && BASIS[e.basis as Basis] && <BasisBadge basis={e.basis as Basis} />}
              {e.stored === 'derived' && <span className="con-muted" title="Read from stored records, not a separate link">(derived)</span>}
              {e.stored === 'design-links' && can('author') && revisions.has(e.id) && (
                <IconButton size="sm" label="Remove link" icon="unlink" onPress={() => void run(() => client.removeDesignLink(e.id, { expectedRevision: revisions.get(e.id)!, reason: 'Removed in the inspector' }))} />
              )}
            </li>
          )
        })}
        {nb.data && !edges.length && <li className="con-muted">No links yet.</li>}
      </ul>
      {can('author') && addable.length > 0 && (
        <div className="con-inline-form" data-help-id="conceptualize.knowledge.link.create">
          <Select label="Link type" size="sm" value={type} placeholder="Choose a type" onChange={(v) => (setType(v), setTarget(null))} options={addable.map((t) => ({ id: t.name, label: `${t.label} (${t.toTypes.join(', ')})` }))} />
          <SearchField label="Find the target" placeholder="Key or words" value={query} onChange={(q) => (setQuery(q), setTarget(null))} />
          <Select label="Target" size="sm" value={target} placeholder={query.trim().length < 2 ? 'Type to search' : targets.length ? 'Choose' : 'No match'} onChange={setTarget} options={targets.map((i) => ({ id: `${i.ref.type}:${i.ref.id}`, label: `${i.key} ${i.label}` }))} />
          <Select label="Basis" size="sm" value={basis} onChange={(b) => setBasis(b as Basis)} options={LINK_BASES.map((b) => ({ id: b, label: BASIS[b].label }))} />
          <Button
            size="sm"
            variant="outlined"
            icon="link"
            isPending={busy}
            isDisabled={!type || !target}
            onPress={() =>
              void run(async () => {
                const [tt, tid] = target!.split(':')
                await client.createDesignLink({ type: type!, from: dref(subject.type, subject.id), to: dref(tt as DesignEntityType, tid), basis })
                setTarget(null)
                setQuery('')
              })
            }
          >
            Add link
          </Button>
        </div>
      )}
      {chosen?.description && <p className="con-muted">{chosen.description}</p>}
      {error ? <ApiErrorNotice error={error} /> : null}
    </Section>
  )
}

// ---- inspector ------------------------------------------------------------------------------------------------------

function RecordHead({ keyText, title, children }: { keyText: string; title: string; children: ReactNode }) {
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  return (
    <header className="con-workspace-head">
      <div>
        <span className="con-key">{keyText}</span>
        <h3>{title}</h3>
      </div>
      <div className="con-row">
        {children}
        <IconButton label="Close" icon="close" onPress={() => setState({ record: null })} />
      </div>
    </header>
  )
}

function StatusForm<S extends string>({ label, value, options, onApply, note, helpId }: { label: string; value: S; options: { id: S; label: string }[]; onApply: (s: S, reason: string) => Promise<unknown>; note?: ReactNode; helpId: string }) {
  const [to, setTo] = useState<S>(value)
  const [reason, setReason] = useState('')
  const { error, busy, run } = useRun()
  return (
    <div className="con-inline-form" data-help-id={helpId}>
      <Select label={label} size="sm" value={to} onChange={(v) => setTo(v as S)} options={options} />
      <TextField label="Reason (recorded)" value={reason} onChange={setReason} />
      <Button size="sm" variant="outlined" isPending={busy} isDisabled={to === value || !reason.trim()} onPress={() => void run(async () => (await onApply(to, reason.trim()), setReason('')))}>
        Change
      </Button>
      {note && <p className="con-muted">{note}</p>}
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

function Revisions({ load, deps }: { load: () => Promise<{ revision: number; createdAt: string; createdBy: string; changeReason: string; provenance: import('@ews/conceptualize-client').ProvenanceInfo }[]>; deps: unknown[] }) {
  const revs = useResource(load, deps)
  return (
    <Section title="Revisions (immutable)">
      <ul className="con-history">
        {(revs.data ?? []).map((r) => (
          <li key={r.revision}>
            <strong>Revision {r.revision}</strong> <span className="con-muted">{formatDate(r.createdAt)} by {r.createdBy}</span> <ProvenanceBadge provenance={r.provenance} />
            {r.changeReason && <span className="con-muted"> — {r.changeReason}</span>}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function FunctionDetail({ fn }: { fn: DesignFunction }) {
  const { client, can } = useModuleData()
  const constraints = useResource(() => client.constraints({ subjectId: fn.id }), [client, fn.id])
  const [sub, setSub] = useState('')
  const { error, busy, run } = useRun()
  return (
    <div className="con-stack">
      <RecordHead keyText={fn.key} title={fn.name}>
        <Badge tone={fn.status === 'active' ? 'success' : 'neutral'}>{fn.status}</Badge>
        <Badge tone="neutral" title="What the system must accomplish, independent of how; never implemented directly">Function</Badge>
        <span className="con-muted">rev {fn.revision}</span>
        <ProvenanceBadge provenance={fn.provenance} />
      </RecordHead>
      {fn.verbPhrase && (
        <p>
          <strong>Verb phrase:</strong> {fn.verbPhrase}
        </p>
      )}
      {fn.description ? <p className="con-description">{fn.description}</p> : <p className="con-muted">No description.</p>}
      {fn.purpose && (
        <p>
          <strong>Purpose:</strong> {fn.purpose}
        </p>
      )}
      {fn.originConceptId && (
        <p className="con-muted">
          Converted from <ConceptLinkButton id={fn.originConceptId} label="its original Concept" /> (kept as history).
        </p>
      )}
      {fn.flows.length > 0 && (
        <Section title="Flows">
          <ul className="con-statements">
            {fn.flows.map((f, i) => (
              <li key={i}>
                <span className="con-statement-text">
                  {f.direction === 'in' ? 'In' : 'Out'}: {f.name} {f.quantity && <strong>{formatQuantity(f.quantity)}</strong>}
                </span>
                <Badge tone="neutral">{f.kind}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Objectives" helpId="conceptualize.knowledge.function.objectives">
        <ul className="con-statements">
          {fn.objectives.map((o, i) => (
            <li key={i} data-basis={o.basis ?? 'user-assertion'}>
              <span className="con-statement-text">
                {o.name} <strong>{formatQuantity(o.quantity)}</strong> <span className="con-muted">({o.direction})</span>
              </span>
              <BasisBadge basis={o.basis ?? 'user-assertion'} />
            </li>
          ))}
          {!fn.objectives.length && <li className="con-muted">No objectives.</li>}
        </ul>
      </Section>
      {fn.statements.length > 0 && (
        <Section title="Statements">
          <ul className="con-statements">
            {fn.statements.map((s) => (
              <li key={s.id} data-basis={s.basis}>
                <span className="con-statement-text">
                  {s.text} {s.quantity && <strong>{formatQuantity(s.quantity)}</strong>}
                </span>
                <BasisBadge basis={s.basis} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Constraints on this function">
        <ConstraintRows items={constraints.data ?? []} />
      </Section>
      <DesignLinksSection subject={dref('function', fn.id)} />
      {can('author') && (
        <div className="con-inline-form" data-help-id="conceptualize.knowledge.function.decompose">
          <TextField label="Add sub-function" placeholder="e.g. Convert to linear motion" value={sub} onChange={setSub} />
          <Button size="sm" variant="outlined" icon="tree" isPending={busy} isDisabled={!sub.trim()} onPress={() => void run(async () => (await client.createFunction({ name: sub.trim(), parentFunctionId: fn.id }), setSub('')))}>
            Decompose
          </Button>
          {error ? <ApiErrorNotice error={error} /> : null}
        </div>
      )}
      {can('author') && (
        <StatusForm
          label="Status"
          value={fn.status}
          helpId="conceptualize.knowledge.function.status"
          options={[
            { id: 'draft', label: 'Draft' },
            { id: 'active', label: 'Active' },
            { id: 'retired', label: 'Retired' },
          ]}
          onApply={(status, reason) => client.updateFunction(fn.id, { status }, { expectedRevision: fn.revision, reason })}
        />
      )}
      <Revisions load={() => client.functionRevisions(fn.id)} deps={[client, fn.id, fn.revision]} />
    </div>
  )
}

function ConstraintRows({ items }: { items: DesignConstraint[] }) {
  if (!items.length) return <p className="con-muted">None.</p>
  return (
    <ul className="con-rel-list">
      {items.map((c) => (
        <li key={c.id}>
          <RefButton target={dref('constraint', c.id)} label={`${c.key} ${c.statement}`} />
          {c.bound && <strong>{boundText(c)}</strong>}
          <Badge tone="neutral">{c.strength}</Badge>
          <Badge tone={CONSTRAINT_TONE[c.status]}>{c.status}</Badge>
          {c.source.kind === 'requirement' && <Badge tone="info" icon="requirement" title="Formalizes a pinned requirement revision">formalizes {c.source.ref.label ?? 'requirement'}</Badge>}
          <BasisBadge basis={c.basis} />
        </li>
      ))}
    </ul>
  )
}

function ConstraintDetail({ c }: { c: DesignConstraint }) {
  const { client, can } = useModuleData()
  const formalizes = c.source.kind === 'requirement'
  return (
    <div className="con-stack">
      <RecordHead keyText={c.key} title={c.statement}>
        <Badge tone={CONSTRAINT_TONE[c.status]}>{c.status}</Badge>
        <Badge tone="neutral">{c.kind}</Badge>
        <Badge tone="neutral">{c.strength}</Badge>
        <BasisBadge basis={c.basis} />
        <span className="con-muted">rev {c.revision}</span>
        <ProvenanceBadge provenance={c.provenance} />
      </RecordHead>
      {c.bound && (
        <p>
          <strong>Bound:</strong> {boundText(c)}
        </p>
      )}
      <Section title="Source" helpId="conceptualize.knowledge.constraint.source">
        {c.source.kind === 'requirement' && (
          <p>
            Formalizes <strong>{c.source.ref.label ?? c.source.ref.id}</strong> at revision {c.source.ref.revision ?? '—'} (pinned). If the requirement has a newer revision, this constraint is suspect until someone reviews it; the Integration page shows requirement link status.
          </p>
        )}
        {c.source.kind === 'derived' && (
          <p>
            Derived from <RefButton target={c.source.from} label={`${TYPE_LABEL[c.source.from.type] ?? c.source.from.type} ${c.source.from.id.slice(0, 8)}`} />
          </p>
        )}
        {c.source.kind === 'stated' && <p className="con-muted">Stated by {c.createdBy}; the basis label says how it is known.</p>}
        {c.origin && (
          <p className="con-muted">
            Promoted from a statement of <ConceptLinkButton id={c.origin.conceptId} label="its Concept" /> (the statement is unchanged).
          </p>
        )}
      </Section>
      <Section title="Applies to">
        <ul className="con-rel-list">
          {c.subjects.map((s) => (
            <li key={s.id}>
              <RefButton target={s} label={`${TYPE_LABEL[s.type]} ${s.id.slice(0, 8)}`} />
            </li>
          ))}
          {!c.subjects.length && <li className="con-muted">No subject.</li>}
        </ul>
      </Section>
      <DesignLinksSection subject={dref('constraint', c.id)} />
      {(can('author') || can('decide')) && (
        <StatusForm
          label="Status"
          value={c.status}
          helpId="conceptualize.knowledge.constraint.status"
          options={(['proposed', 'active', 'relaxed', 'retired'] as const).map((s) => ({ id: s, label: s }))}
          note={formalizes && c.strength === 'hard' ? 'Relaxing or retiring a hard constraint that formalizes a requirement needs a reviewer; the assistant can only propose it.' : undefined}
          onApply={(status, reason) => client.changeConstraintStatus(c.id, status, { expectedRevision: c.revision, reason })}
        />
      )}
      <Revisions load={() => client.constraintRevisions(c.id)} deps={[client, c.id, c.revision]} />
    </div>
  )
}

function AssumptionDetail({ a }: { a: Assumption }) {
  const { client, can } = useModuleData()
  const evidence = useResource(() => client.evidence(), [client])
  const [to, setTo] = useState<AssumptionStatus>(a.validationStatus)
  const [ev, setEv] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const { error, busy, run } = useRun()
  const needsEvidence = to === 'validated' || to === 'invalidated'
  return (
    <div className="con-stack">
      <RecordHead keyText={a.key} title={a.statement}>
        <Badge tone={VALIDATION_TONE[a.validationStatus]}>{a.validationStatus}</Badge>
        <BasisBadge basis={a.basis} />
        <span className="con-muted">rev {a.revision}</span>
        <ProvenanceBadge provenance={a.provenance} />
      </RecordHead>
      {a.quantity && (
        <p>
          <strong>Value:</strong> {formatQuantity(a.quantity)}
        </p>
      )}
      {a.origin && (
        <p className="con-muted">
          From an assumption statement of <ConceptLinkButton id={a.origin.conceptId} label="its Concept" />.
        </p>
      )}
      <Section title="Scope">
        {a.scope.applicability && <p>{a.scope.applicability}</p>}
        <ul className="con-rel-list">
          {a.scope.subjects.map((s) => (
            <li key={s.id}>
              <RefButton target={s} label={`${TYPE_LABEL[s.type]} ${s.id.slice(0, 8)}`} />
            </li>
          ))}
          {!a.scope.subjects.length && <li className="con-muted">Project-wide.</li>}
        </ul>
      </Section>
      <Section title="Validation history" helpId="conceptualize.knowledge.assumption.validation">
        <ul className="con-history">
          {a.validations.map((v) => (
            <li key={v.id}>
              {v.fromStatus} → <strong>{v.toStatus}</strong> <span className="con-muted">{formatDate(v.occurredAt)} by {v.actor} — {v.reason}</span> {v.evidenceIds.length > 0 && <Badge tone="info">{v.evidenceIds.length} evidence</Badge>} <ProvenanceBadge provenance={v.provenance} />
            </li>
          ))}
          {!a.validations.length && <li className="con-muted">Not reviewed yet.</li>}
        </ul>
        {(can('author') || can('decide')) && (
          <div className="con-inline-form">
            <Select label="Validation" size="sm" value={to} onChange={(v) => setTo(v as AssumptionStatus)} options={(['unvalidated', 'under-review', 'validated', 'invalidated', 'retired'] as const).map((s) => ({ id: s, label: s }))} />
            {needsEvidence && <Select label="Evidence" size="sm" value={ev} placeholder="Required" onChange={setEv} options={(evidence.data ?? []).map((e) => ({ id: e.id, label: `${e.key} ${e.title} (${BASIS[e.basis].label})` }))} />}
            <TextField label="Reason (recorded)" value={reason} onChange={setReason} />
            <Button size="sm" variant="outlined" isPending={busy} isDisabled={to === a.validationStatus || !reason.trim() || (needsEvidence && !ev)} onPress={() => void run(async () => (await client.changeAssumptionValidation(a.id, to, { expectedRevision: a.revision, reason: reason.trim(), ...(needsEvidence && ev ? { evidenceIds: [ev] } : {}) }), setReason('')))}>
              Record
            </Button>
          </div>
        )}
        {error ? <ApiErrorNotice error={error} /> : null}
      </Section>
      <DesignLinksSection subject={dref('assumption', a.id)} />
      <Revisions load={() => client.assumptionRevisions(a.id)} deps={[client, a.id, a.revision]} />
    </div>
  )
}

/** Inspector of the open Function, Constraint or Assumption. */
export function DesignRecordPanel() {
  const { client } = useModuleData()
  const [state] = useToolViewState<ConceptualizeViewState>()
  const rec = state.record
  const data = useResource<{ type: 'function'; v: DesignFunction } | { type: 'constraint'; v: DesignConstraint } | { type: 'assumption'; v: Assumption } | null>(
    rec ? async () => (rec.type === 'function' ? { type: 'function', v: await client.function(rec.id) } : rec.type === 'constraint' ? { type: 'constraint', v: await client.constraint(rec.id) } : { type: 'assumption', v: await client.assumption(rec.id) }) : null,
    [client, rec?.type, rec?.id],
  )
  if (!rec) return null
  if (data.error && !data.data) return <ApiErrorNotice error={new Error(data.error)} title="The record could not be loaded" />
  const d = data.data
  if (!d || d.v.id !== rec.id) return <LoadingState label="Loading" />
  return (
    <div className="con-workspace" data-help-id={`conceptualize.knowledge.${rec.type}`}>
      {d.type === 'function' && <FunctionDetail fn={d.v} />}
      {d.type === 'constraint' && <ConstraintDetail c={d.v} />}
      {d.type === 'assumption' && <AssumptionDetail a={d.v} />}
    </div>
  )
}

// ---- Concept: design knowledge tab ----------------------------------------------------------------------------------

const CONVERTED_KINDS = ['function', 'behavior', 'performance', 'constraint']

function ConvertToFunction({ concept, graph }: { concept: Concept; graph: Graph | undefined }) {
  const { client, can } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const existing = useResource(() => client.functions(), [client])
  const [preview, setPreview] = useState(false)
  const { error, busy, run } = useRun()
  const converted = (existing.data ?? []).find((f) => f.originConceptId === concept.id)
  const copied = concept.statements.filter((s) => CONVERTED_KINDS.includes(s.kind))
  const implementers = (graph?.edges ?? []).filter((e) => e.type === 'implements' && e.toId === concept.id)
  const names = new Map((graph?.nodes ?? []).map((n) => [n.id, `${n.key} ${n.name}`]))
  if (converted)
    return (
      <Notice tone="info" title="Converted to a Function">
        This Concept was converted to <RefButton target={dref('function', converted.id)} label={`${converted.key} ${converted.name}`} />. The Concept stays as history.
      </Notice>
    )
  if (concept.abstraction !== 'function' && !concept.statements.some((s) => s.kind === 'function') && !implementers.length) return null
  return (
    <Section title="Convert to Function" helpId="conceptualize.knowledge.convert">
      <p className="con-muted">This Concept describes what must be accomplished rather than how. Converting is explicit and never automatic; nothing about the Concept is changed or deleted.</p>
      {can('author') && !preview && (
        <Button size="sm" variant="outlined" icon="swap" onPress={() => setPreview(true)}>
          Preview conversion
        </Button>
      )}
      {preview && (
        <Notice
          tone="info"
          title="What the conversion does"
          actions={
            <>
              <Button
                size="sm"
                variant="filled"
                isPending={busy}
                onPress={() =>
                  void run(async () => {
                    const r = await client.convertToFunction(concept.id, { expectedRevision: concept.revision, reason: 'Converted in the Concept workspace' })
                    setState({ record: { type: 'function', id: r.function.id }, conceptId: null })
                  })
                }
              >
                Convert
              </Button>
              <Button size="sm" variant="text" onPress={() => setPreview(false)}>
                Cancel
              </Button>
            </>
          }
        >
          <ul>
            <li>
              Creates a Function “{concept.name}” derived from {concept.key} revision {concept.revision}.
            </li>
            <li>Copies {copied.length} statement(s) (function, behaviour, performance, constraint); quantified ones become objectives with their basis.</li>
            <li>{implementers.length ? `Re-expresses ${implementers.length} “implements” relationship(s) as “performs”: ${implementers.map((e) => names.get(e.fromId) ?? e.fromId.slice(0, 8)).join(', ')}.` : 'There are no implementing Concepts to re-express.'}</li>
            <li>Keeps the Concept, its relationships and its history unchanged.</li>
          </ul>
        </Notice>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </Section>
  )
}

/** Design knowledge of one Concept: functions it performs, Assumptions and Constraints, typed links, conversions. */
export function ConceptKnowledge({ concept, graph }: { concept: Concept; graph: Graph | undefined }) {
  const { client, can } = useModuleData()
  const assumptions = useResource(() => client.assumptions({ subjectId: concept.id }), [client, concept.id])
  const constraints = useResource(() => client.constraints({ subjectId: concept.id }), [client, concept.id])
  const [statement, setStatement] = useState('')
  const { error, busy, run } = useRun()
  const asmStatements = concept.statements.filter((s) => s.kind === 'assumption' || s.basis === 'assumption')
  const unlinked = asmStatements.filter((s) => !(assumptions.data ?? []).some((a) => a.origin?.statementId === s.id))
  const promotable = concept.statements.filter((s) => s.kind === 'constraint' && s.quantity && !(constraints.data ?? []).some((c) => c.origin?.statementId === s.id))
  return (
    <div className="con-stack" data-help-id="conceptualize.knowledge">
      <ConvertToFunction concept={concept} graph={graph} />
      <Section
        title="Assumptions"
        helpId="conceptualize.knowledge.assumptions"
        actions={
          can('author') &&
          unlinked.length > 0 && (
            <Button size="sm" variant="outlined" icon="add" isPending={busy} onPress={() => void run(() => client.assumptionsFromStatements(concept.id))}>
              Record {unlinked.length} assumption statement(s)
            </Button>
          )
        }
      >
        <ul className="con-rel-list">
          {(assumptions.data ?? []).map((a) => (
            <li key={a.id}>
              <RefButton target={dref('assumption', a.id)} label={`${a.key} ${a.statement}`} />
              {a.quantity && <strong>{formatQuantity(a.quantity)}</strong>}
              <Badge tone={VALIDATION_TONE[a.validationStatus]}>{a.validationStatus}</Badge>
              <BasisBadge basis={a.basis} />
            </li>
          ))}
          {assumptions.data && !assumptions.data.length && <li className="con-muted">No Assumptions recorded for this Concept.</li>}
        </ul>
        {can('author') && (
          <div className="con-inline-form">
            <TextField label="Record an assumption" placeholder="e.g. Rod ends are pinned (K = 1)" value={statement} onChange={setStatement} />
            <Button size="sm" variant="outlined" icon="add" isPending={busy} isDisabled={!statement.trim()} onPress={() => void run(async () => (await client.createAssumption({ statement: statement.trim(), basis: 'assumption', scope: { subjects: [dref('concept', concept.id)] } }), setStatement('')))}>
              Add assumption
            </Button>
          </div>
        )}
      </Section>
      <Section title="Constraints" helpId="conceptualize.knowledge.constraints">
        <ConstraintRows items={constraints.data ?? []} />
        {can('author') && promotable.length > 0 && (
          <ul className="con-rel-list" data-help-id="conceptualize.knowledge.promote">
            {promotable.map((s) => (
              <li key={s.id}>
                <span>
                  {s.text} <strong>{formatQuantity(s.quantity)}</strong>
                </span>
                <BasisBadge basis={s.basis} />
                <Button size="sm" variant="outlined" icon="arrow-right" isPending={busy} onPress={() => void run(() => client.promoteStatement(concept.id, { statementId: s.id }))}>
                  Promote to constraint
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <DesignLinksSection subject={dref('concept', concept.id)} />
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

/** For the Intent view: the Assumption or Constraint recorded for each statement. */
export function useStatementRecords(conceptId: string) {
  const { client } = useModuleData()
  const assumptions = useResource(() => client.assumptions({ subjectId: conceptId }), [client, conceptId])
  const constraints = useResource(() => client.constraints({ subjectId: conceptId }), [client, conceptId])
  const map = new Map<string, { type: 'assumption' | 'constraint'; id: string; key: string; status: string }>()
  for (const a of assumptions.data ?? []) if (a.origin) map.set(a.origin.statementId, { type: 'assumption', id: a.id, key: a.key, status: a.validationStatus })
  for (const c of constraints.data ?? []) if (c.origin) map.set(c.origin.statementId, { type: 'constraint', id: c.id, key: c.key, status: c.status })
  return map
}

// ---- decisions: rationale, validity, review flags ----------------------------------------------------------------------

export function DecisionValidityBadge({ d }: { d: Decision }) {
  if (!d.validity || d.validity === 'valid') return null
  return (
    <Badge tone={d.validity === 'invalidated' ? 'danger' : 'warning'} icon={d.validity === 'invalidated' ? 'failed' : 'review'} title="Validity of a recorded decision; the record itself is never edited">
      {d.validity}
    </Badge>
  )
}

export function DecisionRationale({ d }: { d: Decision }) {
  const { client, can } = useModuleData()
  const r = useResource(() => client.rationale(d.id), [client, d.id, d.recordVersion])
  const [reason, setReason] = useState('')
  const { error, busy, run } = useRun()
  if (r.error) return <ApiErrorNotice error={new Error(r.error)} title="Rationale could not be assembled" />
  if (!r.data) return <LoadingState label="Assembling rationale" />
  const x = r.data
  return (
    <div className="con-stack" data-help-id="conceptualize.decision.rationale">
      {x.question && (
        <p>
          <strong>Question:</strong> {x.question}
        </p>
      )}
      {x.stale.length > 0 && (
        <Notice tone="warning" title="Rests on revised records">
          {x.stale.join('; ')}
        </Notice>
      )}
      <dl className="con-attributes">
        <div>
          <dt>Alternatives</dt>
          <dd>{x.alternatives.map((a) => `${a.key} ${a.name}: ${a.outcome ?? '—'}`).join('; ') || '—'}</dd>
        </div>
        <div>
          <dt>Evidence</dt>
          <dd>
            {x.support.map((s) => (
              <span key={s.ref.id} className="con-row">
                {s.key} {s.title} ({s.role}) <BasisBadge basis={s.basis as Basis} /> <Badge tone={s.validationStatus === 'accepted' ? 'success' : 'neutral'}>{s.validationStatus}</Badge>
              </span>
            ))}
            {!x.support.length && '—'}
          </dd>
        </div>
        <div>
          <dt>Assumptions</dt>
          <dd>
            {x.assumptions.map((a) => (
              <span key={a.ref.id} className="con-row">
                <RefButton target={a.ref} label={`${a.key} ${a.statement}`} /> <span className="con-muted">pinned rev {a.pinnedRevision ?? '—'}, current {a.currentRevision}</span> <Badge tone="neutral">{a.validationStatus}</Badge>
              </span>
            ))}
            {!x.assumptions.length && '—'}
          </dd>
        </div>
        <div>
          <dt>Constraints</dt>
          <dd>
            {x.constraints.map((c) => (
              <span key={c.ref.id} className="con-row">
                <RefButton target={c.ref} label={`${c.key} ${c.statement}`} /> <span className="con-muted">pinned rev {c.pinnedRevision ?? '—'}, current {c.currentRevision}</span> <Badge tone="neutral">{c.status}</Badge>
              </span>
            ))}
            {!x.constraints.length && '—'}
          </dd>
        </div>
        {x.tradeStudy && (
          <div>
            <dt>Trade study</dt>
            <dd>
              {x.tradeStudy.key} {x.tradeStudy.title}: {x.tradeStudy.ranking} {x.tradeStudy.preliminary && <Badge tone="warning">preliminary</Badge>}
            </dd>
          </div>
        )}
        {x.invalidationConditions.length > 0 && (
          <div>
            <dt>Invalid if</dt>
            <dd>{x.invalidationConditions.map((c) => `${c.id ?? ''} ${c.description}`).join('; ')}</dd>
          </div>
        )}
      </dl>
      {x.reviewFlags.length > 0 && (
        <ul className="con-history">
          {x.reviewFlags.map((f, i) => (
            <li key={i}>
              Review flag: {f.reason} <span className="con-muted">{f.by ? `by ${f.by} ` : ''}{formatDate(f.at)}</span> {f.cleared && <Badge tone="neutral">cleared by {f.cleared.by}: {f.cleared.outcome}</Badge>}
            </li>
          ))}
        </ul>
      )}
      {d.status === 'recorded' && (can('author') || can('decide')) && (
        <div className="con-inline-form" data-help-id="conceptualize.decision.validity">
          <TextField label="Reason (recorded)" value={reason} onChange={setReason} />
          {x.validity === 'valid' && (
            <Button size="sm" variant="outlined" icon="review" isPending={busy} isDisabled={!reason.trim()} onPress={() => void run(async () => (await client.flagDecision(d.id, { reason: reason.trim() }), setReason('')))}>
              Flag for review
            </Button>
          )}
          {x.validity === 'under-review' && can('decide') && (
            <Button size="sm" variant="outlined" icon="check" isPending={busy} isDisabled={!reason.trim()} onPress={() => void run(async () => (await client.changeDecisionValidity(d.id, 'valid', { expectedRevision: d.recordVersion, reason: reason.trim() }), setReason('')))}>
              Still valid
            </Button>
          )}
          {x.validity !== 'invalidated' && can('decide') && (
            <Button size="sm" variant="outlined" icon="failed" isPending={busy} isDisabled={!reason.trim()} onPress={() => void run(async () => (await client.changeDecisionValidity(d.id, 'invalidated', { expectedRevision: d.recordVersion, reason: reason.trim() }), setReason('')))}>
              Invalidate
            </Button>
          )}
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}

// ---- evidence: reviews -------------------------------------------------------------------------------------------------

export function EvidenceReviewControl({ e }: { e: Evidence }) {
  const { client, can, permissions } = useModuleData()
  const [note, setNote] = useState('')
  const { error, busy, run } = useRun()
  return (
    <div className="con-stack" data-help-id="conceptualize.evidence.review">
      <div className="con-row">
        {e.validationStatus && <Badge tone={e.validationStatus === 'accepted' ? 'success' : e.validationStatus === 'rejected' ? 'danger' : 'neutral'} title="Independent review of this record">{e.validationStatus}</Badge>}
        {e.manifest && <Badge tone="info" title="A reproducibility manifest is recorded">manifest</Badge>}
        {(e.subjects?.length ?? 0) > 1 && <Badge tone="neutral">{e.subjects!.length} subjects</Badge>}
        {(e.reviews ?? []).map((r) => (
          <span key={r.id} className="con-muted">
            {r.outcome} by {r.reviewer} {formatDate(r.reviewedAt)}
            {r.method ? ` (${r.method})` : ''}
          </span>
        ))}
      </div>
      {can('decide') && permissions?.userId !== e.createdBy && (
        <div className="con-inline-form">
          <TextField label="Review note" value={note} onChange={setNote} />
          <Button size="sm" variant="outlined" icon="approved" isPending={busy} onPress={() => void run(async () => (await client.reviewEvidence(e.id, { outcome: 'accepted', note }), setNote('')))}>
            Accept
          </Button>
          <Button size="sm" variant="outlined" icon="rejected" isPending={busy} onPress={() => void run(async () => (await client.reviewEvidence(e.id, { outcome: 'rejected', note }), setNote('')))}>
            Reject
          </Button>
        </div>
      )}
      {error ? <ApiErrorNotice error={error} /> : null}
    </div>
  )
}
