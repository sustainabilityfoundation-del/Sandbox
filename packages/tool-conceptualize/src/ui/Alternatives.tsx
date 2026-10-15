import { Badge, Button, Dialog, EmptyState, Notice, Select, TextField } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import type { AlternativeSet, Concept, Criterion, DecisionOutcomeKind, Score, TradeStudy } from '@ews/conceptualize-client'
import { useState } from 'react'
import { useModuleData, useResource } from '../data'
import { KIND_LABEL, QUALITATIVE, formatQuantity, type ConceptualizeViewState } from '../domain'
import { ApiErrorNotice, BasisBadge, ConceptLinkButton, MaturityBadge, ProvenanceBadge, Section } from './common'
import { DecisionList } from './Workspace'

const MEMBER_TONE = { candidate: 'neutral', selected: 'success', rejected: 'danger', deferred: 'warning', withdrawn: 'neutral' } as const

function scoreText(c: Criterion, s: Score | undefined): string {
  if (!s) return '—'
  if (c.scale === 'qualitative') return `${s.qualitative} (${QUALITATIVE[s.qualitative ?? 0]})`
  return formatQuantity({ value: s.value, min: s.low, max: s.high, unit: c.unit ?? '' })
}

function ScoreEditor({ study, criterion, conceptId, current, onClose }: { study: TradeStudy; criterion: Criterion; conceptId: string; current?: Score; onClose: () => void }) {
  const { client, invalidate } = useModuleData()
  const [value, setValue] = useState(current?.value?.toString() ?? '')
  const [low, setLow] = useState(current?.low?.toString() ?? '')
  const [high, setHigh] = useState(current?.high?.toString() ?? '')
  const [unit, setUnit] = useState(current?.enteredUnit ?? criterion.unit ?? '')
  const [qualitative, setQualitative] = useState(String(current?.qualitative ?? 3))
  const [basis, setBasis] = useState<'user-assertion' | 'assumption' | 'estimate'>('estimate')
  const [rationale, setRationale] = useState(current?.rationale ?? '')
  const [error, setError] = useState<unknown>(null)
  const n = (s: string) => (s.trim() === '' ? null : Number(s))
  const save = async () => {
    setError(null)
    try {
      await client.putScores(study.id, [criterion.scale === 'qualitative' ? { criterionId: criterion.id, conceptId, qualitative: Number(qualitative), basis, rationale } : { criterionId: criterion.id, conceptId, value: n(value), low: n(low), high: n(high), unit, basis, rationale }], { expectedRevision: study.revision })
      invalidate()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog title={`Score: ${criterion.name}`} isOpen onOpenChange={(o) => !o && onClose()} footer={<><Button variant="text" onPress={onClose}>Cancel</Button><Button variant="filled" onPress={() => void save()}>Save score</Button></>}>
      <div className="con-form">
        {criterion.scale === 'qualitative' ? (
          <Select label="Score" value={qualitative} onChange={setQualitative} options={[1, 2, 3, 4, 5].map((q) => ({ id: String(q), label: `${q} ${QUALITATIVE[q]}` }))} />
        ) : (
          <div className="con-form-grid">
            <TextField label="Value" value={value} onChange={setValue} />
            <TextField label="Low (range)" value={low} onChange={setLow} />
            <TextField label="High (range)" value={high} onChange={setHigh} />
            <TextField label={`Unit (converted to ${criterion.unit})`} value={unit} onChange={setUnit} />
          </div>
        )}
        <Select label="Basis" value={basis} onChange={(b) => setBasis(b as typeof basis)} options={[{ id: 'estimate', label: 'Estimate' }, { id: 'assumption', label: 'Assumption' }, { id: 'user-assertion', label: 'User statement' }]} />
        <TextField label="Rationale" value={rationale} onChange={setRationale} />
        {error ? <ApiErrorNotice error={error} /> : null}
      </div>
    </Dialog>
  )
}

const CATEGORIES = ['performance', 'mass', 'cost', 'complexity', 'manufacturability', 'risk', 'custom'] as const

function WeightField({ label, initial, onSet }: { label: string; initial: number; onSet: (w: number) => void }) {
  const [value, setValue] = useState(String(initial))
  const n = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(n) && n >= 0
  return (
    <span className="con-row">
      <TextField aria-label={label} className="con-num" value={value} onChange={setValue} errorMessage={valid ? undefined : 'weight ≥ 0'} />
      <Button size="sm" variant="text" isDisabled={!valid || n === initial} onPress={() => onSet(n)}>
        Set
      </Button>
    </span>
  )
}

/** Criteria of a trade study: add (with unit or qualitative scale), reweight, remove. Each change is a new study revision. */
function CriteriaEditor({ study }: { study: TradeStudy }) {
  const { client, invalidate } = useModuleData()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('custom')
  const [scale, setScale] = useState<'quantity' | 'qualitative'>('qualitative')
  const [unit, setUnit] = useState('')
  const [direction, setDirection] = useState<'maximize' | 'minimize'>('maximize')
  const [weight, setWeight] = useState('1')
  const [error, setError] = useState<unknown>(null)
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
    <details className="con-card">
      <summary>Edit criteria and weights</summary>
      <ul className="con-rel-list">
        {study.criteria.map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <WeightField key={`${c.id}-${c.weight}`} label={`Weight of ${c.name}`} initial={c.weight} onSet={(w) => void run(() => client.updateTradeStudy(study.id, { updateCriteria: [{ id: c.id, weight: w }] }, { expectedRevision: study.revision }))} />
            <Button size="sm" variant="text" icon="close" onPress={() => void run(() => client.updateTradeStudy(study.id, { removeCriteria: [c.id] }, { expectedRevision: study.revision }))}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="con-inline-form">
        <TextField label="Criterion" value={name} onChange={setName} />
        <Select label="Category" size="sm" value={category} onChange={(v) => setCategory(v as typeof category)} options={CATEGORIES.map((c) => ({ id: c, label: c }))} />
        <Select label="Scale" size="sm" value={scale} onChange={(v) => setScale(v as typeof scale)} options={[{ id: 'qualitative', label: 'Qualitative 1–5' }, { id: 'quantity', label: 'Quantity with unit' }]} />
        {scale === 'quantity' && <TextField label="Unit" className="con-num" value={unit} onChange={setUnit} />}
        <Select label="Better is" size="sm" value={direction} onChange={(v) => setDirection(v as typeof direction)} options={[{ id: 'maximize', label: 'higher' }, { id: 'minimize', label: 'lower' }]} />
        <TextField label="Weight" className="con-num" value={weight} onChange={setWeight} />
        <Button
          size="sm"
          variant="outlined"
          icon="add"
          isDisabled={!name.trim()}
          onPress={() => void run(async () => {
            await client.updateTradeStudy(study.id, { addCriteria: [{ name: name.trim(), category, scale, direction, weight: Number(weight) || 0, ...(scale === 'quantity' ? { unit } : {}) }] }, { expectedRevision: study.revision })
            setName('')
          })}
        >
          Add criterion
        </Button>
      </div>
      {error ? <ApiErrorNotice error={error} /> : null}
    </details>
  )
}

function TradeStudyTable({ study, concepts }: { study: TradeStudy; concepts: Map<string, Concept> }) {
  const { can } = useModuleData()
  const [editing, setEditing] = useState<{ criterion: Criterion; conceptId: string } | null>(null)
  const score = (cr: string, co: string) => study.scores.find((s) => s.criterionId === cr && s.conceptId === co)
  const result = (co: string) => study.result.options.find((o) => o.conceptId === co)
  return (
    <Section title={`${study.key} ${study.title}`} helpId="conceptualize.tradestudy">
      {study.result.preliminary && (
        <Notice tone="warning" title="Preliminary comparison">
          Scores are estimates, assumptions or AI hypotheses, not verified results. Ranking: {study.result.ranking === 'robust' ? 'robust (ranges do not overlap)' : study.result.ranking === 'uncertain' ? 'uncertain (ranges overlap)' : 'incomplete (missing scores)'}.
        </Notice>
      )}
      <div className="con-table-wrap">
        <table className="con-trade">
          <thead>
            <tr>
              <th scope="col">Criterion (weight)</th>
              {study.options.map((o) => (
                <th key={o} scope="col">
                  {concepts.get(o)?.name ?? o.slice(0, 8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {study.criteria.map((c) => (
              <tr key={c.id}>
                <th scope="row">
                  {c.name} <span className="con-muted">({c.weight}, {c.direction === 'maximize' ? 'higher is better' : 'lower is better'}{c.unit ? `, ${c.unit}` : ''})</span>
                </th>
                {study.options.map((o) => {
                  const s = score(c.id, o)
                  return (
                    <td key={o}>
                      <span>{scoreText(c, s)}</span> {s && <BasisBadge basis={s.basis} />}
                      {can('author') && (
                        <Button size="sm" variant="text" onPress={() => setEditing({ criterion: c, conceptId: o })}>
                          {s ? 'Edit' : 'Score'}
                        </Button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="con-trade-total">
              <th scope="row">Weighted score (0–1) and range</th>
              {study.options.map((o) => {
                const r = result(o)
                return (
                  <td key={o}>
                    {r?.score == null ? '—' : <strong>{r.score.toFixed(2)}</strong>} {r?.score != null && <span className="con-muted">[{r.low!.toFixed(2)}–{r.high!.toFixed(2)}]</span>} {r?.rank && <Badge tone={r.rank === 1 ? 'success' : 'neutral'}>#{r.rank}</Badge>}
                    {r && r.coverage < 1 && <span className="con-muted"> coverage {Math.round(r.coverage * 100)} %</span>}
                    {r?.score != null && <span className="con-bar" aria-hidden="true"><span className={`con-bar-fill w-${Math.round(r.score * 10)}`} /></span>}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="con-muted">{study.result.method}</p>
      {can('author') && <CriteriaEditor study={study} />}
      {editing && <ScoreEditor study={study} criterion={editing.criterion} conceptId={editing.conceptId} current={score(editing.criterion.id, editing.conceptId)} onClose={() => setEditing(null)} />}
    </Section>
  )
}

function DecisionDialog({ set, study, concepts, onClose }: { set: AlternativeSet; study?: TradeStudy; concepts: Map<string, Concept>; onClose: () => void }) {
  const { client, invalidate, permissions } = useModuleData()
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [outcomes, setOutcomes] = useState<Record<string, DecisionOutcomeKind>>(() => Object.fromEntries(set.members.filter((m) => m.status !== 'withdrawn').map((m) => [m.conceptId, 'deferred'])))
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [error, setError] = useState<unknown>(null)
  const submit = async (record: boolean) => {
    setError(null)
    try {
      await client.createDecision({ title: title.trim() || `Decision on ${set.name}`, rationale: rationale.trim(), setId: set.id, tradeStudyId: study?.id, question: set.question, outcomes: Object.entries(outcomes).map(([conceptId, outcome]) => ({ conceptId, outcome, rationale: notes[conceptId] })), record })
      invalidate()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      title={`Decision: ${set.name}`}
      isOpen
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Button variant="text" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="outlined" isDisabled={!rationale.trim()} onPress={() => void submit(false)}>
            Propose decision
          </Button>
          {permissions?.role === 'administrator' && (
            <Button variant="filled" isDisabled={!rationale.trim()} onPress={() => void submit(true)}>
              Record decision
            </Button>
          )}
        </>
      }
    >
      <div className="con-form" data-help-id="conceptualize.decision.create">
        <TextField label="Title" value={title} onChange={setTitle} />
        {set.members
          .filter((m) => m.status !== 'withdrawn')
          .map((m) => (
            <div key={m.conceptId} className="con-inline-form">
              <span className="con-grow">{concepts.get(m.conceptId)?.name ?? m.conceptId}</span>
              <Select ariaLabel="Outcome" size="sm" value={outcomes[m.conceptId]} onChange={(v) => setOutcomes((o) => ({ ...o, [m.conceptId]: v as DecisionOutcomeKind }))} options={[{ id: 'accepted', label: 'Accept' }, { id: 'rejected', label: 'Reject' }, { id: 'deferred', label: 'Defer' }]} />
              <TextField aria-label="Rationale for this alternative" placeholder="Why" value={notes[m.conceptId] ?? ''} onChange={(v) => setNotes((n) => ({ ...n, [m.conceptId]: v }))} />
            </div>
          ))}
        <TextField label="Rationale (required)" multiline rows={3} value={rationale} onChange={setRationale} />
        <p className="con-muted">Editors propose; recording accepted or rejected outcomes is an approval gate for reviewers. Rejected alternatives are kept with their rationale.</p>
        {error ? <ApiErrorNotice error={error} /> : null}
      </div>
    </Dialog>
  )
}

function SetView({ set }: { set: AlternativeSet }) {
  const { client, invalidate, can } = useModuleData()
  const ids = set.members.map((m) => m.conceptId)
  const concepts = useResource(() => Promise.all([set.parentId, ...ids].map((i) => client.concept(i))), [client, set.id, set.recordVersion])
  const studies = useResource(() => client.tradeStudies({ setId: set.id }), [client, set.id])
  const decisions = useResource(() => client.decisions({ setId: set.id }), [client, set.id])
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const byId = new Map((concepts.data ?? []).map((c) => [c.id, c]))
  const parent = byId.get(set.parentId)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const pending = (decisions.data ?? []).filter((d) => d.status === 'proposed')
  return (
    <div className="con-stack">
      <header className="con-row">
        <h3 className="con-page-title">
          {set.key} {set.name}
        </h3>
        {parent && <ConceptLinkButton id={parent.id} label={`for ${parent.key} ${parent.name}`} />}
      </header>
      {set.question && <p>{set.question}</p>}
      <div className="con-compare" data-help-id="conceptualize.alternatives.compare">
        {set.members.map((m) => {
          const c = byId.get(m.conceptId)
          return (
            <article key={m.conceptId} className="con-card con-compare-col" data-status={m.status}>
              <div className="con-row">
                <Badge tone={MEMBER_TONE[m.status]}>{m.status}</Badge>
                {c && <MaturityBadge maturity={c.maturity} />}
                {c && <ProvenanceBadge provenance={c.provenance} />}
              </div>
              <h4>{c ? <ConceptLinkButton id={c.id} label={`${c.key} ${c.name}`} /> : m.conceptId}</h4>
              {c?.summary && <p>{c.summary}</p>}
              <ul className="con-statements">
                {(c?.statements ?? [])
                  .filter((s) => ['principle', 'mechanism', 'performance', 'assumption', 'uncertainty', 'constraint'].includes(s.kind))
                  .map((s) => (
                    <li key={s.id}>
                      <span className="con-muted">{KIND_LABEL[s.kind]}:</span> {s.text} {s.quantity && <strong>{formatQuantity(s.quantity)}</strong>} <BasisBadge basis={s.basis} />
                    </li>
                  ))}
              </ul>
              {can('author') && c && (
                <div className="con-row">
                  <Button size="sm" variant="text" icon="split" onPress={() => void run(() => client.branch(c.id, { alternativeSetId: set.id, name: `${c.name} (variant)` }))}>
                    Branch
                  </Button>
                  {m.status === 'candidate' && (
                    <Button size="sm" variant="text" onPress={() => void run(() => client.withdrawAlternative(set.id, c.id, { reason: 'Withdrawn in the Alternative Explorer' }))}>
                      Withdraw
                    </Button>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
      {(studies.data ?? []).map((s) => (
        <TradeStudyTable key={s.id} study={s} concepts={byId} />
      ))}
      {studies.data && !studies.data.length && can('author') && (
        <Button variant="outlined" icon="add" onPress={() => void run(() => client.createTradeStudy({ title: `Trade study: ${set.name}`, setId: set.id, useDefaultCriteria: true }))} data-help-id="conceptualize.tradestudy.create">
          Start a trade study (default criteria)
        </Button>
      )}
      <Section
        title="Decisions"
        helpId="conceptualize.decision"
        actions={
          (can('author') || can('decide')) && (
            <Button size="sm" variant="filled" icon="approved" onPress={() => setDeciding(true)}>
              Decide
            </Button>
          )
        }
      >
        {pending.length > 0 && can('decide') && (
          <Notice tone="info" title="Proposed decisions waiting for a reviewer">
            {pending.map((d) => (
              <div key={d.id} className="con-row">
                <span>
                  {d.key} {d.title} (proposed by {d.proposedBy})
                </span>
                <Button size="sm" variant="filled" onPress={() => void run(() => client.recordDecision(d.id, { expectedRevision: d.recordVersion, reason: 'Reviewed' }))}>
                  Record
                </Button>
              </div>
            ))}
          </Notice>
        )}
        <DecisionList decisions={decisions.data ?? []} />
      </Section>
      {error ? <ApiErrorNotice error={error} /> : null}
      {deciding && <DecisionDialog set={set} study={studies.data?.[0]} concepts={byId} onClose={() => setDeciding(false)} />}
    </div>
  )
}

/** Alternative Explorer: side-by-side comparison, trade study, branching and decisions. */
export function AlternativesPage() {
  const { client } = useModuleData()
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const sets = useResource(() => client.alternativeSets(), [client])
  const list = sets.data ?? []
  const current = list.find((s) => s.id === state.setId) ?? list.find((s) => s.parentId === state.conceptId || s.members.some((m) => m.conceptId === state.conceptId)) ?? list[list.length - 1]
  return (
    <div className="con-page" data-help-id="conceptualize.alternatives">
      <div className="con-row">
        <Select label="Alternative set" value={current?.id ?? null} placeholder="No alternative sets" onChange={(setId) => setState({ setId })} options={list.map((s) => ({ id: s.id, label: `${s.key} ${s.name}` }))} />
      </div>
      {current ? <SetView key={current.id} set={current} /> : <EmptyState title="No alternatives yet">Ask the assistant to develop alternatives, or branch a Concept from the Concept workspace.</EmptyState>}
    </div>
  )
}
