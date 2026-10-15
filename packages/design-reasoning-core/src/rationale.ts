import type { Basis } from '@ews/engineering-calc'
import type { ConceptualizeKnowledgeApi, RequestContext } from './contract/conceptualize'
import { designRef, type DesignRef } from './refs'

/**
 * "Why was this design selected?" and "What alternatives were rejected?" answered from records only
 * (user-experience.md §3): no model is involved, and nothing is paraphrased. A model may summarize the
 * structured answer for a person, but the answer itself is the records.
 */
export interface RationaleAnswer {
  concept: { ref: DesignRef; key: string; name: string }
  decisions: {
    ref: DesignRef
    key: string
    title: string
    question: string
    status: string
    validity: string
    outcome: string
    rationale: string
    recordedBy?: string
    alternatives: { key: string; name: string; outcome: string; rationale: string }[]
    tradeStudy?: { key: string; ranking: string; preliminary: boolean; scores: { key: string; score: number | null; rank: number | null }[] }
    support: { key: string; title: string; basis: Basis; validationStatus: string; role: string; checks: string[] }[]
    assumptions: { key: string; statement: string; validationStatus: string; basis: Basis }[]
    constraints: { key: string; statement: string; pinnedRevision: number; currentRevision: number; formalizes?: string }[]
    invalidationConditions: string[]
    reviewFlags: string[]
  }[]
  summary: string
}

export async function explainSelection(knowledge: ConceptualizeKnowledgeApi, ctx: RequestContext, conceptId: string): Promise<RationaleAnswer> {
  const concept = await knowledge.get('concept', conceptId, ctx)
  if (!concept) throw new Error(`Concept ${conceptId} does not exist.`)
  const decisions = (await knowledge.list('decision', ctx)).filter((d) => d.outcomes.some((o) => o.conceptId === conceptId))
  const out: RationaleAnswer['decisions'] = []
  for (const d of decisions) {
    const r = await knowledge.decisionRationale(d.id, ctx)
    const nameOf = async (id: string) => {
      const c = await knowledge.get('concept', id, ctx)
      return { key: c?.key ?? id, name: c?.name ?? id }
    }
    const alternatives = []
    for (const o of d.outcomes) if (o.conceptId !== conceptId) alternatives.push({ ...(await nameOf(o.conceptId)), outcome: o.outcome, rationale: o.rationale })
    const constraints = []
    for (const pinned of d.constraintIds) {
      const cur = r.constraints.find((c) => c.id === pinned.id)!
      constraints.push({
        key: cur.key,
        statement: cur.statement,
        pinnedRevision: pinned.revision,
        currentRevision: cur.revision,
        formalizes: cur.source.kind === 'requirement' ? `${cur.source.ref.module}:${cur.source.ref.id}@${cur.source.ref.revision}` : undefined,
      })
    }
    const studyScores = []
    if (r.tradeStudy) for (const o of r.tradeStudy.result.options) studyScores.push({ key: (await nameOf(o.conceptId)).key, score: o.score, rank: o.rank })
    out.push({
      ref: designRef('decision', d.id),
      key: d.key,
      title: d.title,
      question: d.question,
      status: d.status,
      validity: d.validity,
      outcome: d.outcomes.find((o) => o.conceptId === conceptId)!.outcome,
      rationale: d.rationale,
      recordedBy: d.recordedBy,
      alternatives,
      tradeStudy: r.tradeStudy ? { key: r.tradeStudy.study.key, ranking: r.tradeStudy.result.ranking, preliminary: r.tradeStudy.result.preliminary, scores: studyScores } : undefined,
      support: r.support.map((s) => ({
        key: s.evidence?.key ?? s.ref.id,
        title: s.evidence?.title ?? '',
        basis: s.evidence?.basis ?? 'ai-hypothesis',
        validationStatus: s.evidence?.validationStatus ?? 'unknown',
        role: s.role,
        checks: s.evidence?.calculation?.manifest.checks.map((c) => `${c.text}: ${c.satisfied ? 'satisfied' : 'violated'}, margin ${c.margin.toFixed(1)} ${c.unit}`) ?? [],
      })),
      assumptions: r.assumptions.map((a) => ({ key: a.key, statement: a.statement, validationStatus: a.validationStatus, basis: a.basis })),
      constraints,
      invalidationConditions: d.invalidationConditions.map((c) => `${c.kind}: ${c.description}`),
      reviewFlags: d.reviewFlags.filter((f) => !f.cleared).map((f) => `${f.at} ${f.by}: ${f.reason}`),
    })
  }
  const lines = out.map(
    (d) =>
      `${d.key} (${d.status}, ${d.validity}) ${d.outcome} ${concept.key} ${concept.name}: “${d.rationale}”` +
      (d.support.length ? ` Evidence: ${d.support.map((s) => `${s.key} [${s.basis}]`).join(', ')}.` : '') +
      (d.assumptions.length ? ` Assumptions: ${d.assumptions.map((a) => `${a.key} [${a.validationStatus}]`).join(', ')}.` : '') +
      (d.alternatives.length ? ` Alternatives: ${d.alternatives.map((a) => `${a.key} ${a.outcome}`).join(', ')}.` : ''),
  )
  return {
    concept: { ref: designRef('concept', concept.id), key: concept.key, name: concept.name },
    decisions: out,
    summary: lines.length ? lines.join('\n') : `${concept.key} ${concept.name} has no recorded or proposed decision.`,
  }
}
