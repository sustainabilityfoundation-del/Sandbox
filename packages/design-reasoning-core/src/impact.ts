import { evaluateModel, qualifyManifest, type CalculationQualifications, type CalculationResult } from '@ews/engineering-calc'
import { toDefinition } from './adapters/conceptualizeContractAdapter'
import { BindingError, resolveInputs } from './bindings'
import type { ConceptualizeKnowledgeApi, DecisionRecord, Quantity, RequestContext } from './contract/conceptualize'
import { propagationOf } from './linkTypes'
import { isDesignRef, refKey, type AnyRef } from './refs'
import type { TwinSnapshot } from './sources'

/**
 * Change impact analysis (ADR-0046; reasoning-orchestration.md §6). Traverses typed links and derived
 * edges in the direction a change propagates, then tries to DEMONSTRATE impact with deterministic checks
 * (re-evaluating calculation models, decision invalidation conditions). Everything reached is at least
 * `possible`; `demonstrated` needs a failing check; `checked-unaffected` a passing one. Nothing is written.
 */

export interface ImpactChange {
  ref: AnyRef
  description: string
  /** Hypothetical new value of the changed record (e.g. a constraint bound); evaluated without writing. */
  hypothetical?: Quantity
  /** For an applied revision: the revision before the change (shown in the report). */
  fromRevision?: number
}

export interface ImpactItem {
  ref: AnyRef
  label: string
  classification: 'possible' | 'demonstrated' | 'checked-unaffected'
  /** Shortest propagation path from the change, as edge types and keys. */
  path: { type: string; from: string; to: string }[]
  mechanism: string
  evidence?: { summary: string; checks?: CalculationResult['checks'] }
}

export interface ImpactReport {
  change: ImpactChange
  items: ImpactItem[]
  decisionsUnderReview: AnyRef[]
  truncated: boolean
  method: string
}

const MECHANISM: Record<string, string> = {
  binds: 'a calculation model input is bound to the changed value',
  'produced-by': 'the evidence was produced by a calculation that uses it',
  'supported-by': 'the decision rests on this evidence',
  'contradicted-by': 'the decision is contradicted by this evidence',
  'selected-through': 'the alternative was selected or rejected through this decision',
  realizes: 'the implementation realizes this Concept',
  'realized-as': 'the artifact belongs to an implementation that may need to change',
  constrains: 'the constraint limits this subject',
  performs: 'the Concept performs a constrained Function (alternatives may need reconsidering)',
  formalizes: 'the constraint no longer matches its formalized requirement revision',
  'decision-assumes': 'the decision rests on this assumption',
  'decision-constrained-by': 'the decision took this constraint into account',
  watches: 'a decision invalidation condition watches this record',
  'depends-on': 'declared dependency',
  'decomposes-into': 'function decomposition',
  'interfaces-with': 'interface',
  'derived-from': 'derived record',
  affects: 'named as affected by the decision',
}

export async function assessChangeImpact(
  change: ImpactChange,
  deps: { knowledge: ConceptualizeKnowledgeApi; ctx: RequestContext; twin?: TwinSnapshot },
  options: { maxDepth?: number } = {},
): Promise<ImpactReport> {
  const maxDepth = Math.min(options.maxDepth ?? 6, 6)
  const graph = await deps.knowledge.traverse({ start: [change.ref], maxDepth: 6, limit: 500 }, deps.ctx)
  const labels = new Map(graph.nodes.map((n) => [refKey(n.ref), n.key ? `${n.key} ${n.label}` : n.label]))
  const startKey = refKey(change.ref)

  // 1. Propagate along edges in their impact direction (breadth first: shortest paths).
  const reached = new Map<string, { ref: AnyRef; path: ImpactItem['path']; via: string }>()
  let frontier = [startKey]
  const visited = new Set([startKey])
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = []
    for (const key of frontier) {
      const pathHere = reached.get(key)?.path ?? []
      for (const e of graph.edges) {
        const dir = propagationOf(e.type)
        if (dir === 'none') continue
        const targets: AnyRef[] = []
        if ((dir === 'to-from' || dir === 'both') && refKey(e.to) === key) targets.push(e.from)
        if ((dir === 'from-to' || dir === 'both') && refKey(e.from) === key) targets.push(e.to)
        for (const t of targets) {
          const k = refKey(t)
          if (visited.has(k)) continue
          visited.add(k)
          reached.set(k, { ref: t, via: e.type, path: [...pathHere, { type: e.type, from: refKey(e.from), to: refKey(e.to) }] })
          next.push(k)
        }
      }
    }
    frontier = next
  }

  const overrides = new Map<string, Quantity>()
  if (change.hypothetical) overrides.set(startKey, change.hypothetical)

  // 2. Demonstrate: re-evaluate calculations whose evidence was reached.
  const reevaluations = new Map<string, { result?: CalculationResult; error?: string; before: CalculationQualifications['checks'] }>() // by model id
  const items: ImpactItem[] = []
  const evidenceOutcome = new Map<string, ImpactItem['classification']>()
  for (const [key, r] of reached) {
    if (!isDesignRef(r.ref) || r.ref.type !== 'evidence') continue
    const ev = await deps.knowledge.get('evidence', r.ref.id, deps.ctx)
    if (!ev?.calculation) continue
    const model = await deps.knowledge.get('calculation-model', ev.calculation.modelId, deps.ctx, ev.calculation.modelRevision)
    if (!model) continue
    let entry = reevaluations.get(model.id)
    if (!entry) {
      try {
        // C11: compare proven statuses; stored qualifications (or the manifest, for older evidence) are the "before".
        const before = (ev.qualifications ?? qualifyManifest(ev.calculation.manifest)).checks
        const resolved = await resolveInputs(model, deps, { overrides })
        const uncertainty = ev.calculation.manifest.uncertainty === 'point' ? 'point' : 'interval'
        entry = { result: evaluateModel(toDefinition(model), resolved.inputs, { uncertainty }), before }
      } catch (e) {
        entry = { error: e instanceof BindingError || e instanceof Error ? e.message : String(e), before: (ev.qualifications ?? qualifyManifest(ev.calculation.manifest)).checks }
      }
      reevaluations.set(model.id, entry)
    }
    // C11: demonstrated only by a proven violation; a check that can no longer be proven is a possible impact.
    const wasSatisfied = (id: string) => entry!.before.find((b) => b.relationId === id)?.status === 'satisfied'
    const newlyViolated = entry.result?.checks.filter((c) => c.status === 'violated' && wasSatisfied(c.relationId)) ?? []
    const noLongerProven = entry.result?.checks.filter((c) => c.status === 'uncertain' && wasSatisfied(c.relationId)) ?? []
    const classification: ImpactItem['classification'] = entry.error ? 'possible' : newlyViolated.length ? 'demonstrated' : noLongerProven.length ? 'possible' : 'checked-unaffected'
    evidenceOutcome.set(key, classification)
    items.push({
      ref: r.ref,
      label: labels.get(key) ?? key,
      classification,
      path: r.path,
      mechanism: MECHANISM[r.via] ?? r.via,
      evidence: entry.error
        ? { summary: `Re-evaluation not possible: ${entry.error}` }
        : {
            summary: newlyViolated.length
              ? `Re-evaluated ${model.key}: ${newlyViolated.map((c) => `${c.text} now violated (${basisText(c.statusBasis)}; nominal margin ${fmt(c.margin)} ${c.unit})`).join('; ')}.`
              : noLongerProven.length
                ? `Re-evaluated ${model.key}: ${noLongerProven.map((c) => `${c.text} can no longer be shown to hold over the input ranges (${basisText(c.statusBasis)})`).join('; ')}.`
                : `Re-evaluated ${model.key}: all checks still hold (${entry.result!.checks.map((c) => `${c.text}: ${basisText(c.statusBasis)}, nominal margin ${fmt(c.margin)} ${c.unit}`).join('; ')}).`,
            checks: entry.result!.checks,
          },
    })
  }

  // 3. Decisions: supporting evidence outcome and invalidation conditions.
  for (const [key, r] of reached) {
    if (!isDesignRef(r.ref) || r.ref.type !== 'decision') continue
    const d = await deps.knowledge.get('decision', r.ref.id, deps.ctx)
    if (!d) continue
    const verdict = classifyDecision(d, change, evidenceOutcome, reevaluations)
    items.push({ ref: r.ref, label: labels.get(key) ?? key, classification: verdict.classification, path: r.path, mechanism: MECHANISM[r.via] ?? r.via, evidence: { summary: verdict.summary } })
  }

  // 4. Everything else reached is possible.
  for (const [key, r] of reached) {
    if (items.some((i) => refKey(i.ref) === key)) continue
    items.push({ ref: r.ref, label: labels.get(key) ?? key, classification: 'possible', path: r.path, mechanism: MECHANISM[r.via] ?? r.via })
  }

  const order = { demonstrated: 0, possible: 1, 'checked-unaffected': 2 }
  items.sort((a, b) => order[a.classification] - order[b.classification] || a.path.length - b.path.length)
  return {
    change,
    items,
    decisionsUnderReview: items.filter((i) => isDesignRef(i.ref) && i.ref.type === 'decision' && i.classification === 'demonstrated').map((i) => i.ref),
    truncated: graph.truncated,
    method:
      'Propagation along typed links and derived edges (ADR-0046); demonstrated = a deterministic check fails (re-evaluated calculation or invalidation condition), checked-unaffected = the check passes, possible = reachable without a check. Nothing is written.',
  }
}

function classifyDecision(
  d: DecisionRecord,
  change: ImpactChange,
  evidenceOutcome: Map<string, ImpactItem['classification']>,
  reevaluations: Map<string, { result?: CalculationResult; error?: string }>,
): { classification: ImpactItem['classification']; summary: string } {
  const reasons: string[] = []
  const possibleReasons: string[] = []
  let checked = false
  for (const c of d.invalidationConditions) {
    if (c.kind === 'relation-violated' && c.relation) {
      const re = reevaluations.get(c.relation.modelId)
      const check = re?.result?.checks.find((x) => x.relationId === c.relation!.relationId)
      if (check?.status === 'uncertain') possibleReasons.push(`${c.description}: no longer proven (${basisText(check.statusBasis)})`)
      else if (check) {
        checked = true
        if (check.status === 'violated') reasons.push(`invalidation condition fired: ${c.description} (${check.text}, margin ${fmt(check.margin)} ${check.unit})`)
      }
    } else if (c.kind === 'constraint-changed' && refKey(c.subject) === refKey(change.ref)) {
      checked = true
      reasons.push(`invalidation condition fired: ${c.description}`)
    }
  }
  const supportDemonstrated = d.support.filter((s) => s.role === 'supports' && evidenceOutcome.get(refKey(s.ref)) === 'demonstrated')
  if (supportDemonstrated.length) reasons.push(`${supportDemonstrated.length} supporting evidence item(s) no longer support it`)
  const supportChecked = d.support.some((s) => evidenceOutcome.get(refKey(s.ref)) === 'checked-unaffected')
  if (reasons.length) return { classification: 'demonstrated', summary: `${d.key}: ${reasons.join('; ')}.` }
  if (possibleReasons.length) return { classification: 'possible', summary: `${d.key}: ${possibleReasons.join('; ')}.` }
  if (checked || supportChecked) return { classification: 'checked-unaffected', summary: `${d.key}: its invalidation conditions and supporting calculations still hold.` }
  return { classification: 'possible', summary: `${d.key}: reachable from the change; no deterministic check covers it.` }
}

const basisText = (b: string) => (b === 'point' ? 'at the nominal point' : b === 'exact-bounds' ? 'proven with exact bounds' : b === 'enclosure' ? 'from an enclosure' : 'sampled, not proven')

const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3))
