/**
 * Requirement quality assistance: explainable checks, never automatic rewriting or approval.
 *
 * Three classes are kept apart:
 *  - 'validation': deterministic checks of recorded data against the project's conventions
 *    (a field is empty, a referenced key does not exist, an expected relationship is missing).
 *  - 'heuristic': text patterns that often indicate a problem (vague words, several obligations);
 *    they can be wrong and may be dismissed with a reason.
 *  - 'assistant': optional review requested through the platform assistant (not produced here).
 *
 * Sources: NASA Systems Engineering Handbook SP-2016-6105 Rev 2, Appendix C (full text inspected).
 * INCOSE GtWR v4 and ISO/IEC/IEEE 29148 were not accessible; nothing here is attributed to them.
 * Necessity, feasibility, correctness and completeness need engineering judgement: no check can
 * establish them.
 */

export type FindingClass = 'validation' | 'heuristic' | 'assistant'
export type Severity = 'error' | 'warning' | 'info'

export interface QualityFinding {
  ruleId: string
  class: FindingClass
  severity: Severity
  field: 'statement' | 'title' | 'rationale' | 'source' | 'acceptanceCriteria' | 'verificationMethods' | 'attributes' | 'relationships'
  /** The issue, in one sentence. */
  message: string
  /** Why it matters and how the check decided. */
  explanation: string
  /** A proposed improvement for the author to consider; never applied automatically. */
  suggestion: string
  /** The matched text, when the finding points at part of a field. */
  evidence?: string
  /** Stable within one revision; used to record dismissals. */
  fingerprint: string
  reference?: string
}

export interface WritingConventions {
  requirementTypes: string[]
  /** Words that express a binding obligation (used to detect several obligations in one statement). */
  obligationVerbs: string[]
  /** When true, a statement without any obligation verb is flagged (heuristic). Off by default: no universal "shall". */
  requireObligationVerb: boolean
  vagueTerms: string[]
  ambiguousTerms: string[]
  indefinitePronouns: string[]
  placeholderMarkers: string[]
  units: string[]
  requireRationale: boolean
  requireSource: boolean
  requireAcceptanceCriteria: boolean
  requireVerificationMethod: boolean
  /** Relationship types every requirement (of the listed types, or all when empty) is expected to have. */
  expectedTraceability: { relationship: 'allocated-to' | 'derives-from' | 'decomposes' | 'depends-on'; requirementTypes: string[] }[]
  /** Word-trigram similarity (0–1) from which two statements are reported as potential duplicates. */
  duplicateThreshold: number
  disabledRules: string[]
}

const NASA = 'NASA SE Handbook Rev 2, Appendix C'

/** Defaults. Every list is editable per project (PUT /quality/conventions). */
export const DEFAULT_CONVENTIONS: WritingConventions = {
  requirementTypes: ['functional', 'performance', 'interface', 'environmental', 'physical', 'design-constraint', 'safety', 'other'],
  obligationVerbs: ['shall', 'must'],
  requireObligationVerb: false,
  // NASA App. C.4 "Verifiability/Testability" lists these as unverifiable terms.
  vagueTerms: [
    'flexible', 'easy', 'easily', 'sufficient', 'safe', 'ad hoc', 'adequate', 'adequately', 'accommodate', 'user-friendly', 'usable',
    'appropriate', 'fast', 'portable', 'light-weight', 'lightweight', 'small', 'large', 'maximize', 'minimize', 'robust', 'quickly', 'clearly',
  ],
  // NASA App. C.4 "Clarity": ambiguous terms.
  ambiguousTerms: ['and/or', 'etc.', 'as appropriate', 'but not limited to', 'when required', 'if required', 'as required', 'as necessary'],
  indefinitePronouns: ['this', 'these'],
  placeholderMarkers: ['TBD', 'TBR', 'TBC', '???'],
  units: [
    'mm', 'cm', 'm', 'km', 'µm', 'um', 'in', 'ft', 'kg', 'g', 'mg', 't', 'n', 'kn', 'mn', 'nm', 'pa', 'kpa', 'mpa', 'gpa', 'bar', 'psi', 's', 'ms', 'min', 'h',
    'hz', 'khz', 'rpm', 'v', 'mv', 'kv', 'a', 'ma', 'w', 'kw', 'mw', 'j', 'kj', 'wh', 'kwh', '°c', 'c', 'k', '°f', 'db', 'dba', '%', 'l', 'ml', 'm²', 'm2', 'm³', 'm3',
    'mm/s', 'm/s', 'km/h', 'g/s', 'l/min', 'n·m', 'nm', 'n.m', 'lux', 'cycles', 'years', 'year', 'hours', 'days', 'seconds', 'minutes', 'months', 'ip', 'ppm',
  ],
  requireRationale: true,
  requireSource: true,
  requireAcceptanceCriteria: true,
  requireVerificationMethod: true,
  expectedTraceability: [{ relationship: 'allocated-to', requirementTypes: [] }],
  duplicateThreshold: 0.6,
  disabledRules: [],
}

export function normalizeConventions(input: Partial<WritingConventions> | null | undefined): WritingConventions {
  return { ...DEFAULT_CONVENTIONS, ...(input ?? {}) }
}

export interface CheckedRequirement {
  id: string
  key: string
  type: string
  title: string
  statement: string
  rationale: string
  source: string
  acceptanceCriteria: string
  verificationMethods: string[]
  attributes: Record<string, unknown>
}

export interface CheckContext {
  conventions: WritingConventions
  /** Keys that exist in the project (for undefined-reference checks). */
  knownKeys: Set<string>
  /** Outgoing relationship types of this requirement. */
  relationshipTypes: Set<string>
  /** Required custom attributes: id → name. */
  requiredAttributes: { id: string; name: string }[]
  /** Other requirements to compare for duplicates. */
  others?: { id: string; key: string; statement: string }[]
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const lower = (s: string) => s.toLowerCase()

function termRegex(term: string): RegExp {
  // Word boundaries only where the term starts/ends with a word character.
  const start = /^\w/.test(term) ? '(?<![\\w-])' : ''
  const end = /\w$/.test(term) ? '(?![\\w-])' : ''
  return new RegExp(start + escape(term) + end, 'gi')
}

function findTerms(text: string, terms: string[]): string[] {
  const found = new Set<string>()
  for (const t of terms) if (termRegex(t).test(text)) found.add(t)
  return [...found]
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+/).map((s) => s.trim()).filter(Boolean)
}

const COMPARATORS = /(at least|at most|no more than|no less than|not more than|not less than|less than|greater than|more than|up to|within|between|maximum|minimum|max\.?|min\.?|not exceed|exceed|±|\+\/-|≤|≥|<=|>=|<|>|or less|or more|or better|tolerance)/i

export function checkRequirement(r: CheckedRequirement, ctx: CheckContext): QualityFinding[] {
  const c = ctx.conventions
  const out: QualityFinding[] = []
  const add = (f: Omit<QualityFinding, 'fingerprint'> & { fingerprint?: string }) => {
    if (c.disabledRules.includes(f.ruleId)) return
    out.push({ ...f, fingerprint: f.fingerprint ?? `${f.ruleId}:${lower(f.evidence ?? f.field)}` })
  }
  const statement = r.statement.trim()

  // ---- deterministic validation --------------------------------------------------------------
  if (!statement) {
    add({ ruleId: 'validation.empty-statement', class: 'validation', severity: 'error', field: 'statement', message: 'The statement is empty.', explanation: 'A requirement needs normative text; the title alone is not the requirement.', suggestion: 'Write the statement: what the system of interest must do or be, under which conditions, to what measurable level.' })
  }
  if (c.requireRationale && !r.rationale.trim()) {
    add({ ruleId: 'validation.missing-rationale', class: 'validation', severity: 'warning', field: 'rationale', message: 'No rationale is recorded.', explanation: `Your conventions expect a rationale. A rationale (with assumptions) helps reviewers judge necessity and helps later change decisions (${NASA}, C.3).`, suggestion: 'Record why the requirement exists and which assumptions it relies on.', reference: `${NASA}, C.3` })
  }
  if (c.requireSource && !r.source.trim()) {
    add({ ruleId: 'validation.missing-source', class: 'validation', severity: 'warning', field: 'source', message: 'No source is recorded.', explanation: 'Your conventions expect each requirement to name its origin (stakeholder, document, regulation or parent analysis) so it can be traced and questioned.', suggestion: 'Name the source document, clause or stakeholder.', reference: `${NASA}, C.4 Traceability` })
  }
  if (c.requireAcceptanceCriteria && !r.acceptanceCriteria.trim()) {
    add({ ruleId: 'validation.missing-acceptance-criteria', class: 'validation', severity: 'warning', field: 'acceptanceCriteria', message: 'No acceptance criteria are recorded.', explanation: 'Without stated criteria for verification it is unclear what evidence would show the requirement is met.', suggestion: 'State the measurable criterion and conditions under which verification passes.', reference: `${NASA}, C.4 Verifiability/Testability` })
  }
  if (c.requireVerificationMethod && r.verificationMethods.length === 0) {
    add({ ruleId: 'validation.missing-verification-method', class: 'validation', severity: 'info', field: 'verificationMethods', message: 'No verification method is chosen.', explanation: 'Choosing test, analysis, inspection or demonstration early shows whether the requirement can be verified at this level.', suggestion: 'Choose at least one verification method.', reference: `${NASA}, C.4 Verifiability/Testability; Appendix D` })
  }
  for (const a of ctx.requiredAttributes) {
    const v = r.attributes[a.id]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      add({ ruleId: 'validation.required-attribute', class: 'validation', severity: 'error', field: 'attributes', message: `The required attribute “${a.name}” has no value.`, explanation: 'The project defines this attribute as required.', suggestion: `Set “${a.name}”.`, evidence: a.name })
    }
  }
  for (const m of new Set([...`${r.statement} ${r.acceptanceCriteria}`.matchAll(/\b[A-Z][A-Z0-9]*-\d{2,}\b/g)].map((x) => x[0]))) {
    if (m !== r.key && !ctx.knownKeys.has(m)) {
      add({ ruleId: 'validation.undefined-reference', class: 'validation', severity: 'warning', field: 'statement', message: `“${m}” looks like a requirement key, but no requirement has that key.`, explanation: 'References to other requirements should resolve; an unresolved key may be a typo or a deleted or renumbered requirement.', suggestion: `Check the key, or replace the textual reference with a typed relationship to the intended requirement.`, evidence: m })
    }
  }
  for (const marker of findTerms(`${r.statement} ${r.acceptanceCriteria}`, c.placeholderMarkers)) {
    add({ ruleId: 'validation.placeholder', class: 'validation', severity: 'warning', field: 'statement', message: `The text contains the placeholder “${marker}”.`, explanation: `Open values should be tracked. NASA recommends a best estimate marked TBR with rationale, owner and due date instead of TBD (${NASA}, C.3).`, suggestion: 'Replace the placeholder with a best estimate, or record who resolves it and by when.', evidence: marker, reference: `${NASA}, C.3` })
  }
  for (const rule of c.expectedTraceability) {
    if (rule.requirementTypes.length && !rule.requirementTypes.includes(r.type)) continue
    if (!ctx.relationshipTypes.has(rule.relationship)) {
      const what = rule.relationship === 'allocated-to' ? 'is not allocated to any component' : `has no “${rule.relationship}” relationship`
      add({ ruleId: 'validation.missing-trace', class: 'validation', severity: 'info', field: 'relationships', message: `The requirement ${what}.`, explanation: 'Your conventions expect this traceability for requirements of this type. Missing trace makes impact assessment incomplete.', suggestion: rule.relationship === 'allocated-to' ? 'Allocate it to the component(s) responsible, or record why it is not allocated.' : `Add the expected “${rule.relationship}” relationship.`, evidence: rule.relationship, reference: `${NASA}, C.4 Traceability` })
    }
  }

  if (!statement) return out

  // ---- heuristics -------------------------------------------------------------------------------
  const obligations = c.obligationVerbs.flatMap((v) => [...statement.matchAll(termRegex(v))].map(() => v))
  const obligationSentences = sentences(statement).filter((s) => c.obligationVerbs.some((v) => termRegex(v).test(s)))
  if (obligations.length > 1 || obligationSentences.length > 1) {
    add({ ruleId: 'heuristic.multiple-obligations', class: 'heuristic', severity: 'warning', field: 'statement', message: `The statement contains ${obligations.length} obligations.`, explanation: `One thought per statement keeps each obligation separately verifiable and traceable (${NASA}, C.4 Clarity). Counted occurrences of: ${c.obligationVerbs.join(', ')}.`, suggestion: 'Split the statement into separate requirements, one obligation each, and relate them if needed.', evidence: obligations.join(', '), fingerprint: `heuristic.multiple-obligations:${obligations.length}` })
  } else if (/\b(and|or)\b/i.test(statement) && obligations.length === 1 && /\b(shall|must)\b[^.]*\b(and|or)\s+(shall|must|\w+s)\b/i.test(statement)) {
    // "shall X and Y" with a second verb: possible compound requirement.
    add({ ruleId: 'heuristic.compound', class: 'heuristic', severity: 'info', field: 'statement', message: 'The statement may combine several capabilities with “and”/“or”.', explanation: 'Conjunctions joining verbs often hide two requirements in one sentence.', suggestion: 'Check whether each joined capability needs its own requirement.', evidence: 'and/or' })
  }
  if (c.requireObligationVerb && obligations.length === 0) {
    add({ ruleId: 'heuristic.no-obligation-verb', class: 'heuristic', severity: 'info', field: 'statement', message: 'The statement has no obligation verb.', explanation: `Your conventions use ${c.obligationVerbs.map((v) => `“${v}”`).join(' or ')} for binding requirements; without one, readers may take it as a goal or a statement of fact (${NASA}, C.1).`, suggestion: 'Rephrase with the project’s obligation verb, or record the statement as a goal or note instead.', reference: `${NASA}, C.1` })
  }
  for (const term of findTerms(statement, c.vagueTerms)) {
    add({ ruleId: 'heuristic.vague-term', class: 'heuristic', severity: 'warning', field: 'statement', message: `“${term}” is not verifiable as written.`, explanation: `Subjective words leave the pass criterion to interpretation (${NASA}, C.4 Verifiability/Testability lists such terms).`, suggestion: `Replace “${term}” with a measurable criterion (value, unit, tolerance and conditions).`, evidence: term, reference: `${NASA}, C.4` })
  }
  for (const term of findTerms(statement, c.ambiguousTerms)) {
    add({ ruleId: 'heuristic.ambiguous-term', class: 'heuristic', severity: 'warning', field: 'statement', message: `“${term}” is ambiguous.`, explanation: `Open-ended or alternative wording allows several readings (${NASA}, C.4 Clarity).`, suggestion: `State the complete, closed set of cases instead of “${term}”.`, evidence: term, reference: `${NASA}, C.4 Clarity` })
  }
  for (const p of findTerms(statement, c.indefinitePronouns)) {
    add({ ruleId: 'heuristic.indefinite-pronoun', class: 'heuristic', severity: 'info', field: 'statement', message: `“${p}” may not say what it refers to.`, explanation: `A requirement should stand alone; indefinite pronouns depend on surrounding text (${NASA}, C.4 Clarity).`, suggestion: `Name the thing “${p}” refers to.`, evidence: p, reference: `${NASA}, C.4 Clarity` })
  }
  if (/\b(shall|must)\s+not\b/i.test(statement)) {
    add({ ruleId: 'heuristic.negative-statement', class: 'heuristic', severity: 'info', field: 'statement', message: 'The requirement is stated negatively.', explanation: `Negative statements can be hard to verify because they describe what must never happen (${NASA}, C.3 prefers positive statements).`, suggestion: 'Consider stating the required behaviour or limit positively, if that keeps the intent.', evidence: 'not', reference: `${NASA}, C.3` })
  }
  const units = new Set(c.units.map(lower))
  const numberMatches = [...statement.matchAll(/(?<![\w.-])(\d+(?:[.,]\d+)?)(?![\w.,])\s*([^\s,;:)]*)/g)]
  let missingUnits = 0
  let withUnit = 0
  for (const m of numberMatches) {
    const next = lower(m[2] ?? '').replace(/[.]$/, '')
    if (units.has(next) || next.startsWith('%') || /^(°|x\b)/.test(next)) withUnit++
    else missingUnits++
  }
  if (missingUnits > 0 && numberMatches.length) {
    const sample = numberMatches.filter((m) => !units.has(lower(m[2] ?? '').replace(/[.]$/, ''))).map((m) => m[1])[0]
    add({ ruleId: 'heuristic.number-without-unit', class: 'heuristic', severity: 'warning', field: 'statement', message: `The value ${sample} has no recognised unit.`, explanation: 'Quantities need units to be verifiable. The check looks for a known unit right after the number; counts and dimensionless values may be fine — dismiss with a reason if so.', suggestion: `Add the unit after ${sample}, or reword if the number is a count.`, evidence: sample })
  }
  if (withUnit > 0 && !COMPARATORS.test(statement)) {
    add({ ruleId: 'heuristic.missing-tolerance', class: 'heuristic', severity: 'info', field: 'statement', message: 'A quantity is given without a limit or tolerance.', explanation: `Performance values should say whether they are minimums, maximums or nominal values with a tolerance (${NASA}, C.2).`, suggestion: 'Add “at least”, “no more than”, a range, or a ± tolerance.', reference: `${NASA}, C.2` })
  }
  if (ctx.others?.length) {
    const mine = trigrams(statement)
    if (mine.size >= 3) {
      for (const o of ctx.others) {
        if (o.id === r.id) continue
        const sim = similarity(mine, trigrams(o.statement))
        if (sim >= c.duplicateThreshold) {
          add({ ruleId: 'heuristic.potential-duplicate', class: 'heuristic', severity: 'warning', field: 'statement', message: `The statement is ${Math.round(sim * 100)} % similar to ${o.key}.`, explanation: 'Near-identical statements can be duplicates, a decomposition written as a copy, or variants for different configurations. Only an engineer can tell which.', suggestion: `Compare with ${o.key}: merge, relate them (derives-from/decomposes), or set configuration applicability.`, evidence: o.key })
        }
      }
    }
  }
  return out
}

export function trigrams(text: string): Set<string> {
  const words = lower(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const set = new Set<string>()
  for (let i = 0; i + 2 < words.length; i++) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  return set
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const x of a) if (b.has(x)) common++
  return common / (a.size + b.size - common)
}

export const QUALITY_DISCLAIMER =
  'These checks are aids for authors and reviewers. They cannot establish whether a requirement is necessary, feasible, correct or complete; that needs engineering judgement. Nothing is rewritten or approved automatically.'
