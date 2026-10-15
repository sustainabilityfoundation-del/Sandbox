/**
 * Maturity assessment (brief §8): a deterministic checklist over the available evidence, unresolved
 * uncertainties and engineering completeness. It suggests a maturity and next steps; it never changes
 * the Concept. Rules are listed in `CHECKS` and documented in help (conceptualize.maturity).
 */
import type { ConceptMaturity } from '@ews/platform-sdk'
import type { Basis, StatementKind } from './rules'

export interface AssessmentInput {
  maturity: ConceptMaturity
  verificationStatus: string
  description: string
  purpose: string
  statements: { kind: StatementKind; basis: Basis; state: 'open' | 'resolved' | null; hasQuantity: boolean; confirmed: boolean }[]
  childCount: number
  interfaceCount: number
  alternativeSets: { asParent: number; asMember: number; memberCount: number }
  tradeStudies: number
  scoredTradeStudies: number
  decisions: { recorded: number; accepted: boolean; proposed: number }
  evidence: { preliminary: number; verified: number }
  requirementLinks: number
  implementations: { total: number; inDevelopment: number; implemented: number }
  pendingRealizations: number
}

export interface AssessmentCheck {
  id: string
  label: string
  met: boolean
  detail: string
}

export interface NextStep {
  id: string
  text: string
  /** Assistant operation or UI action that performs it. */
  operation?: string
  priority: 'high' | 'medium' | 'low'
}

export interface Assessment {
  completeness: number
  suggestedMaturity: ConceptMaturity
  checks: AssessmentCheck[]
  counts: { openQuestions: number; openUncertainties: number; unconfirmedHypotheses: number; assumptions: number; quantifiedConstraints: number }
  nextSteps: NextStep[]
  note: string
}

export function assess(c: AssessmentInput): Assessment {
  const of = (k: StatementKind) => c.statements.filter((s) => s.kind === k)
  const openQuestions = of('question').filter((s) => s.state !== 'resolved').length
  const openUncertainties = of('uncertainty').filter((s) => s.state !== 'resolved').length
  const unconfirmedHypotheses = c.statements.filter((s) => s.basis === 'ai-hypothesis' && !s.confirmed).length
  const assumptions = c.statements.filter((s) => s.kind === 'assumption' || s.basis === 'assumption').length
  const quantifiedConstraints = of('constraint').filter((s) => s.hasQuantity).length
  const functions = of('function').length
  const interfaces = of('interface').length + c.interfaceCount

  const checks: AssessmentCheck[] = [
    { id: 'described', label: 'Described in natural language', met: c.description.trim().length >= 20, detail: c.description.trim() ? `${c.description.trim().length} characters` : 'No description yet' },
    { id: 'purpose', label: 'Purpose stated', met: !!c.purpose.trim() || of('problem').length > 0, detail: c.purpose.trim() ? 'Purpose given' : 'No purpose or problem statement' },
    { id: 'functions', label: 'Functions identified', met: functions > 0 || c.childCount > 0, detail: `${functions} function statement(s), ${c.childCount} child Concept(s)` },
    { id: 'constraints', label: 'Constraints quantified with units', met: quantifiedConstraints > 0, detail: `${quantifiedConstraints} quantified constraint(s)` },
    { id: 'interfaces', label: 'Interfaces identified', met: interfaces > 0, detail: `${interfaces} interface(s)` },
    { id: 'questions', label: 'No open questions', met: openQuestions === 0, detail: `${openQuestions} open question(s)` },
    { id: 'uncertainties', label: 'Known uncertainties resolved', met: openUncertainties === 0, detail: `${openUncertainties} open uncertaint${openUncertainties === 1 ? 'y' : 'ies'}` },
    { id: 'hypotheses', label: 'AI hypotheses reviewed', met: unconfirmedHypotheses === 0, detail: `${unconfirmedHypotheses} unconfirmed AI hypothes${unconfirmedHypotheses === 1 ? 'is' : 'es'}` },
    { id: 'alternatives', label: 'Alternatives considered', met: c.alternativeSets.asMember > 0 || c.alternativeSets.memberCount >= 2, detail: `${c.alternativeSets.memberCount} alternative(s) under this Concept; member of ${c.alternativeSets.asMember} set(s)` },
    { id: 'evaluated', label: 'Evaluated (trade study or calculation)', met: c.scoredTradeStudies > 0 || c.evidence.preliminary + c.evidence.verified > 0, detail: `${c.scoredTradeStudies} scored trade stud${c.scoredTradeStudies === 1 ? 'y' : 'ies'}, ${c.evidence.preliminary} preliminary and ${c.evidence.verified} verified evidence record(s)` },
    { id: 'decision', label: 'Decision recorded', met: c.decisions.recorded > 0, detail: `${c.decisions.recorded} recorded, ${c.decisions.proposed} proposed` },
    { id: 'requirements', label: 'Linked to requirements', met: c.requirementLinks > 0, detail: `${c.requirementLinks} requirement link(s)` },
    { id: 'implementation', label: 'Implementation linked', met: c.implementations.total > 0, detail: `${c.implementations.total} implementation(s), ${c.implementations.implemented} implemented` },
    { id: 'verified', label: 'Verified with evidence', met: c.verificationStatus === 'verified' && c.evidence.verified > 0, detail: `Verification status ${c.verificationStatus}; ${c.evidence.verified} verified evidence record(s)` },
  ]
  const completeness = Math.round((checks.filter((x) => x.met).length / checks.length) * 100) / 100

  const met = (id: string) => checks.find((x) => x.id === id)!.met
  let suggested: ConceptMaturity = 'idea'
  if (met('described')) suggested = 'exploring'
  if (met('described') && met('purpose') && met('functions') && met('constraints')) suggested = 'defined'
  if (suggested === 'defined' && met('evaluated')) suggested = 'evaluated'
  if (c.decisions.accepted) suggested = 'selected'
  if (c.implementations.inDevelopment > 0 || c.pendingRealizations > 0) suggested = 'engineering-development'
  if (c.implementations.implemented > 0) suggested = 'implemented'
  if (met('verified')) suggested = 'verified'
  if (c.maturity === 'superseded' || c.maturity === 'archived') suggested = c.maturity

  const steps: NextStep[] = []
  const add = (id: string, text: string, priority: NextStep['priority'], operation?: string) => steps.push({ id, text, priority, operation })
  if (!met('described')) add('describe', 'Describe the idea in a few sentences: what it should achieve and why.', 'high')
  if (!met('purpose')) add('purpose', 'State the purpose or the problem this Concept solves.', 'high')
  if (!met('functions')) add('decompose', 'Identify the functions, or decompose the Concept into child Concepts.', 'high', 'conceptualize.decompose')
  if (!met('constraints')) add('constraints', 'Quantify the main constraints with units (force, envelope, mass, cost …).', 'high')
  if (unconfirmedHypotheses) add('hypotheses', `Review ${unconfirmedHypotheses} AI hypothes${unconfirmedHypotheses === 1 ? 'is' : 'es'}: confirm, edit or remove them.`, 'high')
  if (openQuestions) add('questions', `Answer ${openQuestions} open question(s).`, 'medium')
  if (!met('alternatives') && c.maturity !== 'archived') add('alternatives', 'Generate alternative solutions before committing to one.', 'medium', 'conceptualize.develop_alternatives')
  if (met('alternatives') && c.alternativeSets.memberCount >= 2 && !c.scoredTradeStudies) add('trade-study', 'Compare the alternatives in a trade study (criteria, weights, scores with uncertainty).', 'medium', 'conceptualize.compare')
  if (!c.evidence.preliminary && !c.evidence.verified && met('constraints')) add('calculation', 'Add a preliminary calculation with stated assumptions and units.', 'medium')
  if (c.scoredTradeStudies && !c.decisions.recorded && c.alternativeSets.memberCount >= 2) add('decision', 'Propose a design decision: which alternative to pursue, which to reject or defer, and why.', 'medium', 'conceptualize.propose_decision')
  if (!met('requirements') && quantifiedConstraints) add('requirements', 'Propose draft requirements for the quantified constraints (approval stays in Requirements).', 'low', 'conceptualize.propose_requirement')
  if (c.decisions.accepted && !c.implementations.total) add('implement', 'Link an implementation (SysML element, CAD part) or record a realization request.', 'low', 'conceptualize.link_artifact')
  if (c.evidence.preliminary && !c.evidence.verified && c.implementations.total) add('verify', 'Replace preliminary estimates with verified analysis or test evidence.', 'low')

  return {
    completeness,
    suggestedMaturity: suggested,
    checks,
    counts: { openQuestions, openUncertainties, unconfirmedHypotheses, assumptions, quantifiedConstraints },
    nextSteps: steps,
    note: 'Deterministic checklist (not an AI judgement). The suggested maturity is advice; maturity changes are explicit and audited.',
  }
}
