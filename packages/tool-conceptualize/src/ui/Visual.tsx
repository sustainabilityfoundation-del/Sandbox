import { Badge, Button, Dialog, EmptyState, LoadingState, Notice, SegmentedControl, Select, TextField } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import { definitionInput, type CadHandoff, type ConceptCard, type Visual, type VisualAnnotation } from '@ews/conceptualize-client'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useModuleData, useResource } from '../data'
import type { ConceptualizeViewState } from '../domain'
import { componentAt, definitionDifferences, layoutSpanMm, parameterLabel, renderLayout, type LayoutDrawing } from '../layout/renderLayout'
import { visualizationPort } from '../visualization'
import { ApiErrorNotice, MaturityBadge, Section } from './common'

/**
 * Visual comparison (concept-visualization-contracts.md): concept cards with the structured layout as the
 * primary visual, highlighted differences, refinement through annotations and new revisions, CAD handoff.
 * Every action here is the same domain operation the assistant calls (visuals, annotations, decisions, handoffs).
 */

const VISUALIZATION_BASE = '/api/visualization/v1'
const COVERAGE = { intended: { label: 'Intended', tone: 'neutral' }, 'preliminary-check': { label: 'Checked (preliminary)', tone: 'info' }, verified: { label: 'Verified', tone: 'success' } } as const

// ---- drawing --------------------------------------------------------------------------------------------------

export function LayoutSvg({ drawing, annotations = [], pending, onPick, title }: { drawing: LayoutDrawing; annotations?: VisualAnnotation[]; pending?: { x: number; y: number; w?: number; h?: number } | null; onPick?: (x: number, y: number) => void; title: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const click = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPick || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    onPick(Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1))
  }
  const W = drawing.width
  const H = drawing.height
  return (
    <svg ref={ref} className={`cv-layout${onPick ? ' is-pickable' : ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onClick={click}>
      <title>{title}</title>
      <defs>
        <marker id="cv-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path className="cv-arrow" d="M0,0 L8,4 L0,8 z" />
        </marker>
      </defs>
      {drawing.components.map((c) => (
        <g key={c.componentId} className={`cv-component cv-kind-${c.kind}${c.highlighted ? ' cv-highlight' : ''}`} data-component-id={c.componentId}>
          {c.shape === 'circle' ? <ellipse cx={c.x + c.w / 2} cy={c.y + c.h / 2} rx={c.w / 2} ry={c.h / 2} /> : <rect x={c.x} y={c.y} width={c.w} height={c.h} />}
          <text className="cv-component-label" x={c.x + c.w / 2} y={c.y + c.h / 2} textAnchor="middle" dominantBaseline="middle">
            {c.componentId} {c.name}
          </text>
        </g>
      ))}
      {drawing.interfaces.map((f) => (
        <g key={f.id} className={`cv-interface cv-interface-${f.kind}`} data-interface-id={f.id}>
          <line x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
          <text x={(f.x1 + f.x2) / 2} y={(f.y1 + f.y2) / 2 - 4} textAnchor="middle">
            {f.name}
          </text>
        </g>
      ))}
      {drawing.dimensions.map((m) => (
        <g key={m.id} className={`cv-dimension${m.toScale ? '' : ' cv-not-to-scale'}${m.highlighted ? ' cv-highlight' : ''}`} data-parameter-id={m.parameterId}>
          <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} markerStart="url(#cv-arrow)" markerEnd="url(#cv-arrow)" />
          {m.extensions.map(([a, b, c, e], i) => (
            <line key={i} className="cv-extension" x1={a} y1={b} x2={c} y2={e} />
          ))}
          <text x={m.lx} y={m.ly} textAnchor="middle" transform={m.axis === 'y' ? `rotate(-90 ${m.lx} ${m.ly})` : undefined}>
            {m.label}
            {m.toScale ? '' : ' (n.t.s.)'}
          </text>
        </g>
      ))}
      {annotations.map((a) => (
        <g key={a.id} className="cv-annotation" data-annotation={a.number}>
          {a.shape === 'rect' ? <rect x={a.x * W} y={a.y * H} width={(a.width ?? 0) * W} height={(a.height ?? 0) * H} /> : <circle cx={a.x * W} cy={a.y * H} r={9} />}
          <text x={a.x * W} y={a.y * H} textAnchor="middle" dominantBaseline="middle">
            {a.number}
          </text>
        </g>
      ))}
      {pending && (
        <g className="cv-annotation is-pending">
          {pending.w ? <rect x={pending.x * W} y={pending.y * H} width={pending.w * W} height={(pending.h ?? 0) * H} /> : <circle cx={pending.x * W} cy={pending.y * H} r={9} />}
        </g>
      )}
    </svg>
  )
}

export function VisualView({ visual, card, highlight, annotate, onPick, pending, compact, commonSpanMm }: { visual: Visual; card: ConceptCard; highlight?: { components: Set<string>; parameters: Set<string> }; annotate?: boolean; onPick?: (x: number, y: number, drawing: LayoutDrawing) => void; pending?: { x: number; y: number; w?: number; h?: number } | null; compact?: boolean; commonSpanMm?: { x: number; y: number } }) {
  const { client, projectId } = useModuleData()
  // The drawing shows the pinned Concept revision, never the current one.
  // Drawn at the width it is shown, so labels keep their size (no scaled-down text).
  const [box, setBox] = useState<HTMLElement | null>(null)
  const [broken, setBroken] = useState(false)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = box
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width / 20) * 20))
    ro.observe(el)
    return () => ro.disconnect()
  }, [box])
  const concept = useResource(() => client.concept(visual.conceptId, visual.conceptRevision), [client, visual.conceptId, visual.conceptRevision])
  const def = concept.data?.definition
  const drawing = useMemo(() => (def && visual.kind === 'layout' ? renderLayout(def, { width: width ? Math.max(width, 280) : undefined, commonSpanMm, highlightComponents: highlight?.components, highlightParameters: highlight?.parameters, caption: { key: card.concept.key, name: concept.data!.name, revision: visual.conceptRevision } }) : null), [def, visual.kind, highlight, card.concept.key, concept.data, visual.conceptRevision, width, commonSpanMm])
  if (visual.kind === 'layout') {
    if (concept.loading && !def) return <LoadingState label="Drawing the layout" />
    if (!drawing) return <Notice tone="warning">This revision of {card.concept.key} has no structured layout.</Notice>
    return (
      <figure ref={setBox} className={`cv-figure${compact ? ' is-compact' : ''}`} data-help-id="conceptualize.visual.layout">
        <LayoutSvg drawing={drawing} annotations={annotate ? visual.annotations : []} pending={pending} title={`${visual.key} rev ${visual.revision}: ${visual.title}`} onPick={onPick ? (x, y) => onPick(x, y, drawing) : undefined} />
        <figcaption className="con-muted">
          {visual.key} rev {visual.revision} · from {card.concept.key} rev {visual.conceptRevision} · {drawing.view} view · {drawing.notToScale ? 'not to scale' : 'to scale'}{commonSpanMm ? ' (common scale)' : ''} · labels from parameters
          {drawing.unplaced.length ? ` · not placed: ${drawing.unplaced.map((u) => `${u.componentId} ${u.name}`).join(', ')}` : ''}
        </figcaption>
      </figure>
    )
  }
  const g = visual.generation
  return (
    <figure className="cv-figure" data-help-id="conceptualize.visual.illustration">
      {g?.state === 'succeeded' && g.assetId && !broken ? (
        <>
          <img className="cv-illustration" onError={() => setBroken(true)} alt={`${visual.title} (illustrative, not to scale)`} src={visualizationPort()?.contentUrl(projectId, g.assetId) ?? `${VISUALIZATION_BASE}/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(g.assetId)}/content`} />
          {g.testAsset && <Badge tone="warning" icon="warning">TEST ASSET (fake adapter)</Badge>}
        </>
      ) : (
        <Notice tone={broken || g?.state === 'failed' || g?.state === 'refused' ? 'warning' : 'info'} title={broken ? 'The image could not be loaded' : g ? `Illustration ${g.state}` : 'No illustration generated'}>
          {broken ? `Asset ${g?.assetId} is recorded${g?.testAsset ? ' (TEST ASSET)' : ''}, but the visualization service did not return it.` : g?.error?.message ?? (g ? 'The visualization service is working on it.' : 'Image generation was not requested or is not available; the structured layout is the engineering view.')}
        </Notice>
      )}
      <figcaption className="con-muted">
        {visual.key} rev {visual.revision} · illustrative, not to scale, never evidence{g ? ` · ${g.adapter || g.provider} ${g.model}` : ''}
      </figcaption>
    </figure>
  )
}

// ---- cards ----------------------------------------------------------------------------------------------------

function StalenessNotice({ visual, onRerender }: { visual: Visual; onRerender?: () => void }) {
  if (!visual.staleness.outdated) return null
  return (
    <Notice
      tone="warning"
      title="Possibly outdated"
      actions={
        onRerender && visual.kind === 'layout' ? (
          <Button size="sm" variant="outlined" icon="sync" onPress={onRerender}>
            Re-render as a new revision
          </Button>
        ) : undefined
      }
    >
      Made from revision {visual.conceptRevision}; now {visual.staleness.currentConceptRevision}. Changed: {visual.staleness.changes.map((c) => `${c.area} ${c.label} (${c.change})`).join('; ')}. Nothing was regenerated automatically.
    </Notice>
  )
}

function ConceptCardView({ card, highlight, commonSpanMm, expanded, onExpand, onRefine, onDecide, onHandoff }: { card: ConceptCard; highlight: { components: Set<string>; parameters: Set<string> }; commonSpanMm?: { x: number; y: number }; expanded: boolean; onExpand: () => void; onRefine: (v: Visual) => void; onDecide: (outcome: 'accepted' | 'rejected') => void; onHandoff: () => void }) {
  const { client, invalidate } = useModuleData()
  const [state] = useToolViewState<ConceptualizeViewState>()
  const [error, setError] = useState<unknown>(null)
  const primary = card.visuals.find((v) => v.id === card.primaryVisualId)
  const others = card.visuals.filter((v) => v.id !== card.primaryVisualId)
  const member = card.membership[0]
  const rerender = (v: Visual) => async () => {
    setError(null)
    try {
      await client.reviseVisual(v.id, { reason: 'Re-rendered from the current Concept revision' }, { expectedRevision: v.revision })
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <article className={`cv-card${member?.status === 'rejected' ? ' is-rejected' : ''}${member?.status === 'selected' ? ' is-selected' : ''}`} data-help-id="conceptualize.visual.card" data-concept-key={card.concept.key}>
      <header className="cv-card-head">
        <div>
          <span className="con-key">{card.concept.key} rev {card.concept.revision}</span>
          <h3>{card.concept.name}</h3>
        </div>
        <div className="con-row">
          <MaturityBadge maturity={card.concept.maturity as never} />
          <Badge tone="neutral" title="Visual maturity stage">{card.concept.stage}</Badge>
          {member && <Badge tone={member.status === 'selected' ? 'success' : member.status === 'rejected' ? 'danger' : 'neutral'}>{member.status}</Badge>}
        </div>
      </header>
      {primary ? (
        <>
          <VisualView visual={primary} card={card} highlight={highlight} compact={!expanded} commonSpanMm={commonSpanMm} />
          <StalenessNotice visual={primary} onRerender={state.readOnly ? undefined : () => void rerender(primary)()} />
        </>
      ) : (
        <Notice tone="info" title="No layout yet">Define components, parameters and a layout (or ask the assistant) to draw this alternative.</Notice>
      )}
      {card.principle.length > 0 && <p className="cv-principle">{card.principle.join(' ')}</p>}
      <Section title="Components and interfaces">
        <ul className="cv-list">
          {card.components.map((c) => (
            <li key={c.id} className={highlight.components.has(c.id) ? 'cv-diff' : undefined}>
              <code>{c.id}</code> {c.name} <span className="con-muted">{c.kind}</span>
              {highlight.components.has(c.id) && <Badge tone="info">differs</Badge>}
            </li>
          ))}
          {card.interfaces.map((f) => (
            <li key={f.id}>
              <code>{f.id}</code> {f.name}: {f.betweenNames.join(' ↔ ')} <span className="con-muted">{f.kind}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Key parameters">
        <ul className="cv-list">
          {card.parameters.map((p) => (
            <li key={p.id} className={highlight.parameters.has(p.id) ? 'cv-diff' : undefined}>
              {parameterLabel(p)} <span className="con-muted">{p.name !== p.symbol ? p.name : ''} · {p.basis}</span>
            </li>
          ))}
        </ul>
      </Section>
      {(card.benefits.length > 0 || card.tradeOffs.length > 0) && (
        <Section title="Benefits and trade-offs">
          <ul className="cv-list">
            {card.benefits.map((b) => (
              <li key={`b${b}`}>+ {b}</li>
            ))}
            {card.tradeOffs.map((t) => (
              <li key={`t${t}`}>− {t}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Requirements and constraints">
        {card.constraints.length + card.requirements.length === 0 ? (
          <p className="con-muted">None linked.</p>
        ) : (
          <ul className="cv-list">
            {card.constraints.map((x) => (
              <li key={x.id}>
                {x.key} {x.statement} <Badge tone={COVERAGE[x.coverage].tone}>{COVERAGE[x.coverage].label}</Badge>
                {x.checkStatus && <span className="con-muted"> {x.checkStatus} ({x.checkedBy})</span>}
              </li>
            ))}
            {card.requirements.map((r) => (
              <li key={`${r.artifact.id}`}>
                {r.artifact.label ?? r.artifact.id} <span className="con-muted">{r.relation}</span> <Badge tone="neutral">Intended</Badge>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {expanded && (
        <>
          <Section title="Assumptions and open questions">
            <ul className="cv-list">
              {card.assumptions.map((a) => (
                <li key={a.id}>
                  {a.key} {a.statement} <span className="con-muted">{a.validationStatus}</span>
                </li>
              ))}
              {card.questions.map((q) => (
                <li key={q.text}>? {q.text}</li>
              ))}
            </ul>
          </Section>
          {card.decisions.length > 0 && (
            <Section title="Decisions">
              <ul className="cv-list">
                {card.decisions.map((d) => (
                  <li key={`${d.id}${d.outcome}`}>
                    {d.key} {d.outcome} ({d.status}): {d.rationale}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {others.map((v) => (
            <div key={v.id}>
              <VisualView visual={v} card={card} />
              <StalenessNotice visual={v} />
            </div>
          ))}
        </>
      )}
      <p className="con-muted cv-validation">
        Validation: {card.validation.verificationStatus}; {card.validation.constraintsVerified}/{card.validation.constraintsTotal} constraints verified, {card.validation.constraintsChecked} checked; {card.validation.openQuestions} open questions; {card.validation.unconfirmedHypotheses} unconfirmed AI hypotheses.
      </p>
      {error ? <ApiErrorNotice error={error} /> : null}
      <footer className="con-row cv-card-actions">
        <Button size="sm" variant="text" icon={expanded ? 'minus' : 'add'} onPress={onExpand}>
          {expanded ? 'Collapse' : 'Expand'}
        </Button>
        {primary && !state.readOnly && (
          <Button size="sm" variant="outlined" icon="pin" onPress={() => onRefine(primary)}>
            Refine
          </Button>
        )}
        {!state.readOnly && (
          <>
            <Button size="sm" variant="outlined" icon="approved" onPress={() => onDecide('accepted')}>
              Select
            </Button>
            <Button size="sm" variant="text" icon="rejected" onPress={() => onDecide('rejected')}>
              Reject…
            </Button>
            <Button size="sm" variant="text" icon="cad" onPress={onHandoff}>
              CAD handoff
            </Button>
          </>
        )}
      </footer>
    </article>
  )
}

// ---- decisions, handoff, refinement ----------------------------------------------------------------------------

function DecisionDialog({ card, setId, others, outcome, onClose }: { card: ConceptCard; setId: string; others: ConceptCard[]; outcome: 'accepted' | 'rejected'; onClose: () => void }) {
  const { client, invalidate, permissions } = useModuleData()
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<unknown>(null)
  const canRecord = !!permissions?.permissions.includes('decide')
  const save = async () => {
    setError(null)
    try {
      await client.createDecision({
        title: outcome === 'accepted' ? `Select ${card.concept.name}` : `Reject ${card.concept.name}`,
        rationale,
        setId,
        subjectId: card.concept.id,
        outcomes: outcome === 'accepted' ? [{ conceptId: card.concept.id, outcome: 'accepted', rationale }, ...others.map((o) => ({ conceptId: o.concept.id, outcome: 'deferred' as const }))] : [{ conceptId: card.concept.id, outcome: 'rejected', rationale }],
        record: canRecord,
      })
      invalidate()
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      title={outcome === 'accepted' ? `Select ${card.concept.key} for refinement` : `Reject ${card.concept.key}`}
      isOpen
      onOpenChange={(o) => !o && onClose()}
      footer={
        <>
          <Button variant="text" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="filled" isDisabled={!rationale.trim()} onPress={() => void save()}>
            {canRecord ? 'Record decision' : 'Propose decision'}
          </Button>
        </>
      }
    >
      <div className="con-form">
        <p>{outcome === 'accepted' ? 'The other alternatives are deferred, not deleted.' : 'The alternative stays in the set with its rationale.'} {canRecord ? '' : 'You can propose; a reviewer records it.'}</p>
        <TextField label="Rationale (required)" multiline rows={3} value={rationale} onChange={setRationale} />
        {error ? <ApiErrorNotice error={error} /> : null}
      </div>
    </Dialog>
  )
}

function HandoffDialog({ card, onClose }: { card: ConceptCard; onClose: () => void }) {
  const { client } = useModuleData()
  const [handoff, setHandoff] = useState<CadHandoff | null>(null)
  const [error, setError] = useState<unknown>(null)
  const existing = useResource(() => client.handoffs(card.concept.id), [client, card.concept.id])
  const create = async () => {
    setError(null)
    try {
      setHandoff(await client.createHandoff(card.concept.id))
    } catch (e) {
      setError(e)
    }
  }
  const shown = handoff ?? existing.data?.[existing.data.length - 1] ?? null
  return (
    <Dialog title={`CAD handoff: ${card.concept.key}`} isOpen onOpenChange={(o) => !o && onClose()} footer={<Button variant="text" onPress={onClose}>Close</Button>}>
      <div className="con-form" data-help-id="conceptualize.visual.handoff">
        <p>A revision-pinned package of intent, components, interfaces, parameters, envelopes, constraints, requirement and decision links. Missing information is listed, never invented. Open it in the CAD Modeler to create the CAD document.</p>
        <Button variant="filled" icon="add" onPress={() => void create()}>
          Build handoff from revision {card.concept.revision}
        </Button>
        {error ? <ApiErrorNotice error={error} /> : null}
        {shown && (
          <div className="cv-handoff">
            <p>
              <strong>{shown.key}</strong> from {card.concept.key} rev {shown.conceptRevision} · {shown.package.components.length} components, {shown.package.parameters.length} parameters, {shown.package.interfaces.length} interfaces, {shown.package.constraints.length} constraints
              {shown.staleness.outdated && <Badge tone="warning">possibly outdated</Badge>}
            </p>
            <h4>Unresolved ({shown.package.unresolved.length})</h4>
            <ul className="cv-list">
              {shown.package.unresolved.map((u, i) => (
                <li key={i}>
                  <span className="con-muted">{u.kind}</span> {u.text}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  )
}

/** Refinement: annotate one visual revision, change the definition, apply as a new Concept and visual revision. */
function RefinePanel({ card, visual, onClose }: { card: ConceptCard; visual: Visual; onClose: () => void }) {
  const { client, invalidate } = useModuleData()
  const [mode, setMode] = useState<'pin' | 'rect'>('pin')
  const [point, setPoint] = useState<{ x: number; y: number; w?: number; h?: number } | null>(null)
  const [component, setComponent] = useState<string | null>(null)
  const [instruction, setInstruction] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [answered, setAnswered] = useState<string[]>([])
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const current = useResource(() => client.visual(visual.id), [client, visual.id])
  const v = current.data ?? visual
  const concept = useResource(() => client.concept(card.concept.id), [client, card.concept.id])
  const panel = useRef<HTMLElement>(null)
  // Bring the panel into view when it opens (it sits above the cards).
  useEffect(() => {
    panel.current?.scrollIntoView?.({ block: 'start' })
  }, [visual.id])
  const pick = (x: number, y: number, drawing: LayoutDrawing) => {
    if (mode === 'pin') {
      setPoint({ x, y })
      setComponent(componentAt(drawing, x, y)?.componentId ?? null)
    } else if (!point || point.w) {
      setPoint({ x, y, w: 0, h: 0 })
    } else {
      const x0 = Math.min(point.x, x)
      const y0 = Math.min(point.y, y)
      setPoint({ x: x0, y: y0, w: Math.max(Math.abs(x - point.x), 0.01), h: Math.max(Math.abs(y - point.y), 0.01) })
    }
  }
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      current.reload()
      invalidate()
    } catch (e) {
      setError(e)
    }
  }
  const saveAnnotation = () =>
    run(async () => {
      const a = await client.addAnnotation(v.id, v.revision, { shape: point?.w ? 'rect' : 'pin', x: point!.x, y: point!.y, ...(point?.w ? { width: point.w, height: point.h } : {}), instruction, ...(component ? { componentId: component } : {}) })
      setAnswered((s) => [...s, a.id])
      setPoint(null)
      setInstruction('')
    })
  const apply = () =>
    run(async () => {
      const c = concept.data!
      const def = c.definition!
      const parameters = def.parameters.map((p) => (values[p.id] !== undefined && values[p.id].trim() !== '' ? { ...p, value: Number(values[p.id]), basis: 'user-assertion' as const } : p))
      const updated = await client.updateConcept(c.id, { definition: { ...definitionInput(def), parameters }, reason: `Refinement of ${v.key} rev ${v.revision}: ${v.annotations.filter((a) => answered.includes(a.id)).map((a) => `${a.number}. ${a.instruction}`).join('; ') || 'parameter change'}` }, { expectedRevision: c.revision })
      const next = await client.reviseVisual(v.id, { conceptRevision: updated.revision, refinedFrom: answered, instruction: v.annotations.filter((a) => answered.includes(a.id)).map((a) => a.instruction).join('; '), reason: 'Refinement' }, { expectedRevision: v.revision })
      setDone(`${updated.key} is now revision ${updated.revision}; ${next.key} revision ${next.revision} is drawn from it. The annotations stay on revision ${v.revision}.`)
      setValues({})
      setAnswered([])
      concept.reload()
    })
  const params = concept.data?.definition?.parameters ?? []
  return (
    <section ref={panel} className="cv-refine" data-help-id="conceptualize.visual.refine">
      <header className="con-section-head">
        <h3>
          Refine {card.concept.key} · {v.key} rev {v.revision}
        </h3>
        <Button size="sm" variant="text" icon="close" onPress={onClose}>
          Close
        </Button>
      </header>
      <div className="cv-refine-body">
        <div>
          <SegmentedControl label="Annotation" size="sm" value={mode} onChange={(m) => { setMode(m as 'pin' | 'rect'); setPoint(null) }} options={[{ value: 'pin', label: 'Numbered pin' }, { value: 'rect', label: 'Rectangle (two clicks)' }]} />
          <VisualView visual={v} card={card} annotate onPick={pick} pending={point} />
          <Select
            label="Or place the pin on a component"
            value={component}
            placeholder="Choose a component"
            onChange={(id) => {
              setComponent(id)
              setMode('pin')
              setPoint({ x: 0.5, y: 0.5 })
            }}
            options={card.components.map((c) => ({ id: c.id, label: `${c.id} ${c.name}` }))}
          />
        </div>
        <div className="con-form">
          <p className="con-muted">{point ? `Selected ${point.w ? 'region' : 'point'} (${point.x.toFixed(2)}, ${point.y.toFixed(2)})${component ? ` on ${component} (structured component ID)` : ''}.` : 'Click the layout to place a pin, or two clicks for a rectangle.'}</p>
          <TextField label="Instruction" multiline rows={2} placeholder="Move this part toward the rear; reduce the overall width…" value={instruction} onChange={setInstruction} />
          <Button variant="outlined" icon="pin" isDisabled={!point || !instruction.trim() || (mode === 'rect' && !point.w)} onPress={() => void saveAnnotation()}>
            Save annotation on revision {v.revision}
          </Button>
          <p className="con-muted">Or ask the assistant: “Refine {v.key} from annotation 1”. It proposes the Concept changes; you apply them.</p>
          <h4>Change the definition</h4>
          <ul className="cv-list">
            {params.map((p) => (
              <li key={p.id}>
                <TextField label={`${p.symbol} (${p.unit})`} className="con-num" value={values[p.id] ?? String(p.value ?? '')} onChange={(s) => setValues((x) => ({ ...x, [p.id]: s }))} />
              </li>
            ))}
          </ul>
          <Button variant="filled" icon="saved" isDisabled={!concept.data || (!Object.keys(values).length && !answered.length)} onPress={() => void apply()}>
            Apply: new Concept revision and new layout revision
          </Button>
          {done && <Notice tone="success">{done}</Notice>}
          {error ? <ApiErrorNotice error={error} /> : null}
        </div>
      </div>
    </section>
  )
}

// ---- page -----------------------------------------------------------------------------------------------------

export function VisualComparisonPage() {
  const { client } = useModuleData()
  const [state, setState] = useToolViewState<ConceptualizeViewState>()
  const sets = useResource(() => client.alternativeSets(), [client])
  const list = sets.data ?? []
  const current = list.find((s) => s.id === state.setId) ?? list[list.length - 1]
  const cards = useResource(current ? () => client.setCards(current.id) : null, [client, current?.id, current?.recordVersion])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [refine, setRefine] = useState<{ card: ConceptCard; visual: Visual } | null>(null)
  const [decide, setDecide] = useState<{ card: ConceptCard; outcome: 'accepted' | 'rejected' } | null>(null)
  const [handoff, setHandoff] = useState<ConceptCard | null>(null)
  const items = cards.data?.cards ?? []
  const diff = useMemo(() => definitionDifferences(items.map((c) => ({ intent: c.intent, components: c.components, interfaces: c.interfaces, parameters: c.parameters, relationships: [], layout: null, idSeq: 0 }))), [items])
  // One scale for all alternatives (the largest extent), so sizes compare at a glance.
  const defs = useResource(items.length ? () => Promise.all(items.map((c) => c.visuals.find((v) => v.id === c.primaryVisualId)).filter((v): v is Visual => !!v).map((v) => client.concept(v.conceptId, v.conceptRevision))) : null, [client, cards.data])
  const commonSpanMm = useMemo(() => {
    const spans = (defs.data ?? []).map((c) => (c.definition ? layoutSpanMm(c.definition) : null)).filter((s): s is { x: number; y: number } => !!s)
    return spans.length > 1 ? { x: Math.max(...spans.map((s) => s.x)), y: Math.max(...spans.map((s) => s.y)) } : undefined
  }, [defs.data])
  return (
    <div className="con-page" data-help-id="conceptualize.visual">
      <div className="con-row">
        <Select label="Alternative set" value={current?.id ?? null} placeholder="No alternative sets" onChange={(setId) => setState({ setId })} options={list.map((s) => ({ id: s.id, label: `${s.key} ${s.name}` }))} />
        {cards.data && <span className="con-muted">{cards.data.question}</span>}
      </div>
      {!current && !sets.loading && <EmptyState title="No alternatives yet">Ask the assistant to develop alternatives with layouts, then compare them here.</EmptyState>}
      {cards.loading && !cards.data && <LoadingState label="Loading alternatives" />}
      {cards.error && <Notice tone="danger">{cards.error}</Notice>}
      {refine && <RefinePanel key={refine.visual.id} card={items.find((c) => c.concept.id === refine.card.concept.id) ?? refine.card} visual={refine.visual} onClose={() => setRefine(null)} />}
      <div className="cv-grid">
        {items.map((card, i) => (
          <ConceptCardView
            key={card.concept.id}
            card={card}
            highlight={{ components: diff.components[i] ?? new Set(), parameters: diff.parameters[i] ?? new Set() }}
            commonSpanMm={commonSpanMm}
            expanded={!!expanded[card.concept.id]}
            onExpand={() => setExpanded((e) => ({ ...e, [card.concept.id]: !e[card.concept.id] }))}
            onRefine={(visual) => setRefine({ card, visual })}
            onDecide={(outcome) => setDecide({ card, outcome })}
            onHandoff={() => setHandoff(card)}
          />
        ))}
      </div>
      {decide && current && <DecisionDialog card={decide.card} setId={current.id} others={items.filter((c) => c.concept.id !== decide.card.concept.id)} outcome={decide.outcome} onClose={() => setDecide(null)} />}
      {handoff && <HandoffDialog card={handoff} onClose={() => setHandoff(null)} />}
    </div>
  )
}
