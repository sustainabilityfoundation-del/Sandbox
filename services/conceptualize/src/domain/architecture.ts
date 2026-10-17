/**
 * Architecture-first generation and the context readiness gate (ECII increment 2, docs/specifications/ecii-plan.md
 * sections 2 and 4). Everything here works on the structure of records: the architecture block of a Concept
 * definition, the engineering intent and its gaps. The model writes the block; this code validates it, compares
 * blocks as text and applies the readiness criteria below. There are no keyword rules and no nouns of any engineering
 * domain in this file (enforced by the isolation test). Readiness is advisory in Phase 1: it labels proposals
 * "provisional" and lists what is missing; it never refuses a write.
 */
import { involvesOtherSystem, type IntentContent, type IntentGaps } from './intent'

// ---- the architecture block --------------------------------------------------------------------------------------

export const ARCHITECTURE_LEVELS = ['architecture', 'variant'] as const
export type ArchitectureLevel = (typeof ARCHITECTURE_LEVELS)[number]

/**
 * How a solution is organised before any dimension is chosen. An architecture states the interface it uses, the
 * principle by which it attaches or fits, the geometry that interface needs, how loads reach the host, how it is
 * installed and removed, what speaks for and against it, the technical risks, the assumptions that are not verified
 * and the evidence needed before it can be relied on. A variant names the architecture it belongs to and varies
 * parameters, material or local shape only.
 */
export interface ArchitectureBlock {
  level: ArchitectureLevel
  /** Variants only: key, ID or name of the architecture this varies. */
  parent: string
  /** The interface to the system it works with; empty when the design object stands alone. */
  hostInterface: string
  attachmentPrinciple: string
  interfaceGeometry: string
  loadPath: string
  installationRemoval: string
  advantages: string[]
  disadvantages: string[]
  risks: string[]
  assumptions: string[]
  evidenceRequired: string[]
}

export const ARCHITECTURE_TEXT_FIELDS = ['hostInterface', 'attachmentPrinciple', 'interfaceGeometry', 'loadPath', 'installationRemoval'] as const
export const ARCHITECTURE_LIST_FIELDS = ['advantages', 'disadvantages', 'risks', 'assumptions', 'evidenceRequired'] as const
/** The fields that make two architectures different when compared. */
export const SIGNATURE_FIELDS = ['hostInterface', 'attachmentPrinciple', 'interfaceGeometry', 'loadPath', 'installationRemoval'] as const

export const EMPTY_ARCHITECTURE: ArchitectureBlock = {
  level: 'architecture',
  parent: '',
  hostInterface: '',
  attachmentPrinciple: '',
  interfaceGeometry: '',
  loadPath: '',
  installationRemoval: '',
  advantages: [],
  disadvantages: [],
  risks: [],
  assumptions: [],
  evidenceRequired: [],
}

/** Input as a caller writes it: everything optional but the level; missing fields are empty. */
export type ArchitectureInput = Partial<ArchitectureBlock> & { level: ArchitectureLevel }

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
const list = (v: unknown) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : [])

/** Normalizes a stored or supplied block (trimmed text, lists without empty entries). */
export function readArchitecture(raw: unknown): ArchitectureBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!ARCHITECTURE_LEVELS.includes(r.level as ArchitectureLevel)) return null
  return {
    level: r.level as ArchitectureLevel,
    parent: clean(r.parent),
    hostInterface: clean(r.hostInterface),
    attachmentPrinciple: clean(r.attachmentPrinciple),
    interfaceGeometry: clean(r.interfaceGeometry),
    loadPath: clean(r.loadPath),
    installationRemoval: clean(r.installationRemoval),
    advantages: list(r.advantages),
    disadvantages: list(r.disadvantages),
    risks: list(r.risks),
    assumptions: list(r.assumptions),
    evidenceRequired: list(r.evidenceRequired),
  }
}

/**
 * Structure validation (shared by the user and AI paths: it runs in the service). An architecture states how it
 * works and at least what speaks against it and what evidence is needed; a variant names its architecture.
 */
export function architectureProblems(b: ArchitectureBlock): Record<string, string> {
  const e: Record<string, string> = {}
  if (b.level === 'variant') {
    if (!b.parent) e['architecture.parent'] = 'a variant names the architecture it varies (key, ID or name)'
    return e
  }
  if (b.parent) e['architecture.parent'] = 'an architecture has no parent; only a variant names one'
  if (!b.attachmentPrinciple) e['architecture.attachmentPrinciple'] = 'state the principle by which the solution works with the host or its surroundings'
  if (!b.loadPath) e['architecture.loadPath'] = 'state how loads or flows pass through the solution'
  if (!b.installationRemoval) e['architecture.installationRemoval'] = 'state how it is installed and removed'
  if (!b.disadvantages.length) e['architecture.disadvantages'] = 'state at least one principal disadvantage'
  if (!b.evidenceRequired.length) e['architecture.evidenceRequired'] = 'state the evidence needed before the architecture can be relied on'
  return e
}

// ---- diversity ---------------------------------------------------------------------------------------------------

/** Thresholds are data, not code paths; a later increment may let a project override them. */
export const DIVERSITY_THRESHOLDS = {
  /** Two architectures whose principle texts are at least this similar are the same architecture. */
  samePrinciple: 0.8,
  /** ... or whose mean similarity over the compared fields is at least this. */
  sameMean: 0.6,
  /** Architectures needed for the set to count as diverse. */
  minimumDistinct: 2,
}

/** English function words only (no domain vocabulary); they carry no architectural meaning. */
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto', 'its', 'are', 'was', 'not', 'but', 'via', 'any', 'all', 'has', 'have', 'then', 'than', 'when', 'where', 'which', 'each', 'one', 'two', 'per', 'can', 'may', 'only', 'also', 'such', 'both', 'over', 'under', 'between', 'through', 'using', 'used', 'use', 'their', 'there', 'they', 'them', 'will', 'shall', 'should', 'would', 'could', 'been', 'being', 'does', 'did', 'out', 'off', 'too', 'very', 'same', 'other', 'more', 'most', 'some', 'many'])

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  )
}

/** Jaccard similarity of the token sets of two texts; undefined when either has no tokens. */
export function textSimilarity(a: string, b: string): number | undefined {
  const x = tokens(a)
  const y = tokens(b)
  if (!x.size || !y.size) return undefined
  let both = 0
  for (const t of x) if (y.has(t)) both++
  return both / (x.size + y.size - both)
}

export interface DiversityItem {
  id: string
  key: string
  name: string
  architecture: ArchitectureBlock | null
  /** Parameter symbol to nominal value, for telling a parameter-only difference from a wording difference. */
  parameters?: Record<string, number | null>
}
export interface PairComparison {
  a: string
  b: string
  similarity: number | null
  fieldsCompared: number
  principleSimilarity: number | null
  /** same: one architecture; distinct: different architectures; unknown: too little text to compare. */
  verdict: 'same' | 'distinct' | 'unknown'
  /** For a same pair: what the two differ in. */
  differsOnlyIn?: 'parameters' | 'wording'
}
export interface DiversityResult {
  /** Architecture-level items grouped into distinct architectures (each group lists the items that are the same). */
  architectures: { representative: string; members: string[] }[]
  distinctCount: number
  variants: { id: string; key: string; name: string; parent: string; parentId: string | null }[]
  unclassified: { id: string; key: string; name: string }[]
  pairs: PairComparison[]
  minimum: number
  verdict: 'diverse' | 'insufficient'
  findings: string[]
}

const label = (i: { key: string; name: string }) => `${i.key} ${i.name}`
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Compares the structured fields of architecture-level items (never a keyword list) and reports which alternatives are
 * really different architectures. Variants and items that differ only in parameters are reported as variants, not as
 * distinct architectures. Deterministic: the same records give the same result.
 */
export function assessDiversity(items: DiversityItem[], minimum: number = DIVERSITY_THRESHOLDS.minimumDistinct): DiversityResult {
  const findings: string[] = []
  const archs = items.filter((i) => i.architecture?.level === 'architecture')
  const variantItems = items.filter((i) => i.architecture?.level === 'variant')
  const unclassified = items.filter((i) => !i.architecture).map(({ id, key, name }) => ({ id, key, name }))
  const parentOf = (parent: string) => items.find((i) => i.id === parent || sameName(i.key, parent) || sameName(i.name, parent))
  const variants = variantItems.map((v) => {
    const p = parentOf(v.architecture!.parent)
    return { id: v.id, key: v.key, name: v.name, parent: v.architecture!.parent, parentId: p && p.id !== v.id ? p.id : null }
  })

  const pairs: PairComparison[] = []
  const group = new Map<string, string>(archs.map((i) => [i.id, i.id]))
  const find = (x: string): string => (group.get(x) === x ? x : find(group.get(x)!))
  for (let i = 0; i < archs.length; i++) {
    for (let j = i + 1; j < archs.length; j++) {
      const a = archs[i]
      const b = archs[j]
      const sims = SIGNATURE_FIELDS.map((f) => textSimilarity(a.architecture![f], b.architecture![f])).filter((s): s is number => s !== undefined)
      const principle = textSimilarity(a.architecture!.attachmentPrinciple, b.architecture!.attachmentPrinciple)
      const mean = sims.length ? sims.reduce((s, x) => s + x, 0) / sims.length : undefined
      let verdict: PairComparison['verdict'] = 'unknown'
      if (sims.length >= 2 || principle !== undefined) {
        const same = (principle !== undefined && principle >= DIVERSITY_THRESHOLDS.samePrinciple) || (mean !== undefined && sims.length >= 2 && mean >= DIVERSITY_THRESHOLDS.sameMean)
        verdict = same ? 'same' : 'distinct'
      }
      const pair: PairComparison = { a: a.id, b: b.id, similarity: mean ?? null, fieldsCompared: sims.length, principleSimilarity: principle ?? null, verdict }
      if (verdict === 'same') {
        const pa = a.parameters ?? {}
        const pb = b.parameters ?? {}
        const keys = new Set([...Object.keys(pa), ...Object.keys(pb)])
        const parametersDiffer = [...keys].some((k) => pa[k] !== pb[k])
        pair.differsOnlyIn = parametersDiffer ? 'parameters' : 'wording'
        group.set(find(b.id), find(a.id))
        findings.push(`${label(b)} is the same architecture as ${label(a)} (${parametersDiffer ? 'it differs only in parameters' : 'its structured fields say the same'}); present it as a variant, not as a different architecture.`)
      } else if (verdict === 'unknown') {
        findings.push(`${label(a)} and ${label(b)} cannot be compared: too little text in their architecture fields.`)
      }
      pairs.push(pair)
    }
  }
  const byRoot = new Map<string, string[]>()
  for (const i of archs) byRoot.set(find(i.id), [...(byRoot.get(find(i.id)) ?? []), i.id])
  const architectures = [...byRoot.entries()].map(([representative, members]) => ({ representative, members }))
  const distinctCount = architectures.length
  if (variants.length) findings.push(`${variants.length} item(s) are variants of an architecture and do not count as different architectures.`)
  if (unclassified.length) findings.push(`${unclassified.map(label).join(', ')} carry no architecture block; their difference cannot be assessed.`)
  const verdict = distinctCount >= minimum ? 'diverse' : 'insufficient'
  if (verdict === 'insufficient') findings.push(`${distinctCount} distinct architecture(s) found; ${minimum} are needed before dimensional variants are explored.`)
  return { architectures, distinctCount, variants, unclassified, pairs, minimum, verdict, findings }
}

// ---- readiness ---------------------------------------------------------------------------------------------------

export const READINESS_LEVELS = ['not-established', 'exploratory', 'context-established', 'interfaces-verified'] as const
export type ReadinessLevel = (typeof READINESS_LEVELS)[number]
export const READINESS_ACTIVITIES = ['architecture-concepts', 'host-specific-concepts', 'dimensioned-design', 'cad-handoff'] as const
export type ReadinessActivity = (typeof READINESS_ACTIVITIES)[number]

/** The level each downstream activity needs (data, keyed by activity; a project override is a later increment). */
export const ACTIVITY_REQUIRES: Record<ReadinessActivity, ReadinessLevel> = {
  'architecture-concepts': 'exploratory',
  'host-specific-concepts': 'context-established',
  'dimensioned-design': 'interfaces-verified',
  'cad-handoff': 'interfaces-verified',
}
export const CRITERIA_VERSION = 'readiness-criteria/1'

/** The mapping to the three-state hook of the context package (context engineering brief section 2). */
export const CONTEXT_STATE: Record<ReadinessLevel, 'exploratory' | 'established' | 'verified'> = {
  'not-established': 'exploratory',
  exploratory: 'exploratory',
  'context-established': 'established',
  'interfaces-verified': 'verified',
}

export interface ReadinessInput {
  intent: IntentContent | null
  gaps: IntentGaps | null
  /** Architecture blocks of the Concepts under assessment (one selected Concept, or all architecture-level Concepts of the project). */
  architectures: ArchitectureBlock[]
}
export interface UnmetCriterion {
  id: string
  level: ReadinessLevel
  text: string
  /** Gap or record this criterion points at, when there is one. */
  ref?: string
}
interface Criterion {
  id: string
  level: Exclude<ReadinessLevel, 'not-established'>
  text: string
  /** Returns the unmet items (empty when met). */
  unmet: (i: ReadinessInput) => { text: string; ref?: string }[]
}

/** Readiness criteria as data: an ordered list per level, each a named check over the structure of the records. */
export const READINESS_CRITERIA: Criterion[] = [
  { id: 'intent-recorded', level: 'exploratory', text: 'an engineering intent is recorded', unmet: (i) => (i.intent ? [] : [{ text: 'no engineering intent is recorded; interpret the request first' }]) },
  { id: 'integration-decided', level: 'exploratory', text: 'it is decided whether the design object works with another system', unmet: (i) => (i.intent && i.intent.integration === 'undetermined' ? [{ text: 'decide whether the design object works with an existing system', ref: 'integration' }] : []) },
  {
    id: 'systems-and-gaps',
    level: 'context-established',
    text: 'the systems involved are identified and no essential or concept-tier information is missing',
    unmet: (i) => (i.gaps?.gaps ?? []).filter((g) => g.tier === 'essential' || g.tier === 'concept').map((g) => ({ text: g.text, ref: g.id })),
  },
  {
    id: 'host-interface-stated',
    level: 'context-established',
    text: 'a solution architecture states the interface to the system it works with',
    unmet: (i) => {
      if (!i.intent || !involvesOtherSystem(i.intent.integration)) return []
      if (!i.architectures.length) return [{ text: 'no solution architecture is recorded for the system the design object works with' }]
      // A variant states no interface of its own; the caller resolves it to its parent architecture's block before evaluating.
      return i.architectures.some((a) => a.level === 'architecture' && a.hostInterface)
        ? []
        : [{ text: 'no solution architecture states its host interface' }]
    },
  },
  {
    id: 'interfaces-verified',
    level: 'interfaces-verified',
    text: 'the critical interface information is verified',
    // Interface and fact records, and so verified facts, arrive in ECII increment 3. Until then nothing about an
    // outside system can be verified; a design object that works with none has nothing to verify.
    unmet: (i) => (i.intent && involvesOtherSystem(i.intent.integration) ? [{ text: 'critical interface facts are not verified (interface and fact records are not available yet, so none can be)' }] : []),
  },
  {
    id: 'open-evidence',
    level: 'interfaces-verified',
    text: 'the evidence an architecture requires for the system it works with is supplied',
    unmet: (i) => (i.intent && !involvesOtherSystem(i.intent.integration) ? [] : i.architectures).filter((a) => a.level === 'architecture' && a.evidenceRequired.length).flatMap((a) => a.evidenceRequired.map((t) => ({ text: `evidence required: ${t}` }))),
  },
]

export interface ActivityReadiness {
  activity: ReadinessActivity
  requires: ReadinessLevel
  met: boolean
  /** Unmet criteria up to the required level, in order. */
  unmet: UnmetCriterion[]
}
export interface ReadinessResult {
  criteriaVersion: string
  advisory: true
  level: ReadinessLevel
  /** The hook of the context package: state and the blocking issues that stop the next level. */
  contextReadiness: { state: 'exploratory' | 'established' | 'verified'; blockingIssues: string[] }
  activities: ActivityReadiness[]
  /** True when the gate for the evaluated activity is not met: label the output provisional. */
  provisional: boolean
  /** One line for previews and handoff lists. */
  label: string
}

const unmetAt = (input: ReadinessInput, upTo: number): UnmetCriterion[] =>
  READINESS_CRITERIA.filter((c) => READINESS_LEVELS.indexOf(c.level) <= upTo).flatMap((c) => c.unmet(input).map((u) => ({ id: c.id, level: c.level, text: u.text, ...(u.ref ? { ref: u.ref } : {}) })))

/**
 * The highest level whose criteria (and those of every level below) are all met, and for each downstream activity
 * whether its required level is reached. Readiness is per activity, not one completeness percentage.
 */
export function evaluateReadiness(input: ReadinessInput, activity?: ReadinessActivity): ReadinessResult {
  let level: ReadinessLevel = 'not-established'
  for (const l of READINESS_LEVELS.slice(1)) {
    if (unmetAt(input, READINESS_LEVELS.indexOf(l)).length) break
    level = l
  }
  const activities = READINESS_ACTIVITIES.map((a): ActivityReadiness => {
    const requires = ACTIVITY_REQUIRES[a]
    const unmet = unmetAt(input, READINESS_LEVELS.indexOf(requires))
    return { activity: a, requires, met: unmet.length === 0, unmet }
  })
  const nextIndex = Math.min(READINESS_LEVELS.indexOf(level) + 1, READINESS_LEVELS.length - 1)
  const blocking = READINESS_LEVELS.indexOf(level) === READINESS_LEVELS.length - 1 ? [] : unmetAt(input, nextIndex).filter((u) => READINESS_LEVELS.indexOf(u.level) === nextIndex)
  const focus = activity ? activities.find((x) => x.activity === activity) : undefined
  // Provisional means not validated: any level below Interfaces Verified (Exploratory permits provisional concepts, brief section 8),
  // and always when the gate of the activity is not met.
  const unverified = level !== 'interfaces-verified'
  const provisional = focus ? !focus.met || unverified : activities.some((x) => !x.met) || unverified
  return {
    criteriaVersion: CRITERIA_VERSION,
    advisory: true,
    level,
    contextReadiness: { state: CONTEXT_STATE[level], blockingIssues: blocking.map((b) => b.text) },
    activities: activity ? activities.filter((x) => x.activity === activity) : activities,
    provisional,
    label: focus ? (provisional ? provisionalLabel(level, focus.unmet, focus.activity) : `Readiness is ${levelName(level)}; the gate for ${focus.activity} is met`) : `${provisional ? 'Provisional: readiness' : 'Readiness'} is ${levelName(level)}; ${activities.filter((x) => x.met).length} of ${activities.length} activities are ready`,
  }
}

export const levelName = (level: ReadinessLevel) => (level === 'not-established' ? 'Not established' : level === 'exploratory' ? 'Exploratory' : level === 'context-established' ? 'Context Established' : 'Interfaces Verified')

/** One line for previews and handoff lists: "provisional: readiness Exploratory; <first unmet>". */
export function provisionalLabel(level: ReadinessLevel, unmet: UnmetCriterion[], activity?: ReadinessActivity): string {
  const name = levelName(level)
  if (unmet.length) return `Provisional: readiness is ${name}; ${unmet.length} item(s) unmet, first: ${unmet[0].text}`
  return `Provisional: readiness is ${name}${activity ? `; the gate for ${activity} is met` : ''}, but the interface information is not verified`
}
