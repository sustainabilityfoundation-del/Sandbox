/**
 * Engineering Intent: vocabularies, structure validation and the deterministic gap computation (ECII increment 1,
 * docs/specifications/ecii-plan.md). Everything here works on the structure of the record. The model fills in the
 * intent; this code only validates it and derives gaps from it. There are no keyword rules and no nouns of any
 * engineering domain in this file (enforced by the isolation test).
 */

export const INTENT_ROLES = ['standalone', 'accessory', 'component', 'modification', 'system'] as const
export type IntentRole = (typeof INTENT_ROLES)[number]

/** How the design object relates to systems outside it. Anything other than standalone or undetermined involves another system. */
export const INTEGRATION_MODES = ['standalone', 'hosted', 'embedded', 'connected', 'replacement', 'undetermined'] as const
export type IntegrationMode = (typeof INTEGRATION_MODES)[number]

export const SYSTEM_RELATIONS = ['mounts-to', 'connects-to', 'integrates-with', 'interferes-with'] as const
export type SystemRelation = (typeof SYSTEM_RELATIONS)[number]

export const SYSTEM_OWNERS = ['project', 'external', 'shared'] as const
export const NEED_ROUTES = ['research', 'ask-user', 'measure', 'defer'] as const
export const NEED_STATES = ['open', 'resolved'] as const
export const QUESTION_IMPACTS = ['blocks', 'changes-architecture', 'refines'] as const
export const QUESTION_STATES = ['open', 'answered', 'withdrawn'] as const
/** Intent bases the assistant may record (rules.ts ASSISTANT_BASES) and the ones a person may add. */
export const INTENT_BASES = ['user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate'] as const
export type IntentBasis = (typeof INTENT_BASES)[number]

export const GAP_TIERS = ['essential', 'concept', 'detail', 'immaterial'] as const
export type GapTier = (typeof GAP_TIERS)[number]
const TIER_OF_NEED: Record<1 | 2 | 3 | 4, GapTier> = { 1: 'essential', 2: 'concept', 3: 'detail', 4: 'immaterial' }

export interface IntentSystem {
  /** Stable id (sys-1, ...), assigned by the service; a need's subject points at it. */
  id?: string
  name: string
  role: string
  description: string
  productElement?: { module: string; id: string; revision?: number; kind?: string; label?: string }
  identified: boolean
  owner: (typeof SYSTEM_OWNERS)[number]
  relation: SystemRelation
}
export interface IntentNeed {
  id: string
  text: string
  tier: 1 | 2 | 3 | 4
  subject?: string
  route: (typeof NEED_ROUTES)[number]
  state: (typeof NEED_STATES)[number]
}
export interface IntentQuestion {
  id: string
  text: string
  why: string
  impact: (typeof QUESTION_IMPACTS)[number]
  options: string[]
  state: (typeof QUESTION_STATES)[number]
  needId?: string
}
/** The structural content of an intent revision (what validation and gap computation read). */
export interface IntentContent {
  designObject: string
  role: IntentRole
  integration: IntegrationMode
  rationale: string
  externalSystems: IntentSystem[]
  objectives: string[]
  environment: string[]
  informationNeeds: IntentNeed[]
  questions: IntentQuestion[]
}

/** True when the design object works with some other system (any mode but standalone and undetermined). */
export const involvesOtherSystem = (mode: IntegrationMode) => mode !== 'standalone' && mode !== 'undetermined'

/** Structural validation; returns a field to message map (empty when valid). */
export function intentProblems(c: IntentContent): Record<string, string> {
  const errors: Record<string, string> = {}
  if (c.role === 'standalone' && involvesOtherSystem(c.integration)) errors.integration = `a design object with role standalone cannot have the integration mode ${c.integration}`
  if (c.integration === 'standalone' && c.externalSystems.length) errors.externalSystems = 'a standalone design object has no external systems; change the integration mode or remove them'
  c.externalSystems.forEach((s, i) => {
    const at = `externalSystems.${i}`
    if (s.identified && !s.productElement && !s.name.trim()) errors[`${at}.identified`] = 'an identified system needs a name or a product element'
    if (s.productElement && !s.identified) errors[`${at}.identified`] = 'a system with a product element is identified'
  })
  const seen = new Set<string>()
  c.informationNeeds.forEach((n, i) => {
    if (seen.has(n.id)) errors[`informationNeeds.${i}.id`] = `duplicate id ${n.id}`
    seen.add(n.id)
  })
  const questionIds = new Set<string>()
  c.questions.forEach((q, i) => {
    if (questionIds.has(q.id)) errors[`questions.${i}.id`] = `duplicate id ${q.id}`
    questionIds.add(q.id)
    if (!q.why.trim()) errors[`questions.${i}.why`] = 'a question states why it is asked'
    if (!q.options.length) errors[`questions.${i}.options`] = 'a question offers at least one option'
    if (q.needId && !seen.has(q.needId) && !STRUCTURAL_GAP_ID.test(q.needId)) errors[`questions.${i}.needId`] = `no information need or gap ${q.needId}`
  })
  c.informationNeeds.forEach((n, i) => {
    if (n.tier === 4 && n.route === 'research') errors[`informationNeeds.${i}.route`] = 'tier 4 (immaterial) needs are never researched'
  })
  return errors
}

export interface IntentGap {
  /** Stable within one intent revision: derived from the structure, never random. */
  id: string
  tier: GapTier
  text: string
  route: (typeof NEED_ROUTES)[number]
  source: 'structure' | 'information-need'
  subject?: string
  /** Index into externalSystems (structure) or the information need ID. */
  ref?: string
  /** Every ID this gap answers to: its own plus the information needs merged into it (structure gap and need about the same system). */
  ids?: string[]
  /** Internal: what a need's subject may name to point at this system (its id, or its product element as module:id). Never a name. */
  systemKeys?: string[]
}
export interface IntentGaps {
  gaps: IntentGap[]
  counts: Record<GapTier, number>
  /** Essential gaps routed to research: what a research step would look into (tier 1 only, later increments). */
  researchItems: IntentGap[]
  /** Essential gaps routed to ask-user that no open question covers yet. */
  unaskedEssential: IntentGap[]
  /** Gaps about systems the design object works with. Empty for a standalone intent. */
  systemGaps: IntentGap[]
}

/** IDs of structural gaps (see structureGaps); a question may name one even after the gap is closed. */
const STRUCTURAL_GAP_ID = /^(integration|systems|system-\d+)$/

const FEATURES: Record<SystemRelation, string> = {
  'mounts-to': 'mounting features',
  'connects-to': 'connection features',
  'integrates-with': 'integration features',
  'interferes-with': 'clearance and keep-out features',
}

/**
 * Missing information, in four tiers, computed from the structure alone:
 * - an undetermined integration mode is an essential gap (decide it first);
 * - a mode that involves another system with no system listed is an essential gap;
 * - each unidentified external system is a gap (essential when the design attaches to it, concept tier when it only
 *   has to stay clear of it), routed to the user because it cannot be searched for without an identity;
 * - each open information need, by its tier and route;
 * A standalone intent has no system gaps.
 */
export function structureGaps(c: IntentContent): IntentGap[] {
  const gaps: IntentGap[] = []
  if (c.integration === 'undetermined') {
    gaps.push({ id: 'integration', tier: 'essential', text: 'decide whether the design object works with an existing system', route: 'ask-user', source: 'structure' })
  }
  if (involvesOtherSystem(c.integration)) {
    if (!c.externalSystems.length) gaps.push({ id: 'systems', tier: 'essential', text: 'identify the system the design object works with', route: 'ask-user', source: 'structure' })
    c.externalSystems.forEach((s, i) => {
      if (s.identified) return
      const label = s.role.trim() || 'external system'
      gaps.push({
        id: `system-${i}`,
        tier: s.relation === 'interferes-with' ? 'concept' : 'essential',
        text: `identify ${label} model and ${FEATURES[s.relation]}`,
        route: 'ask-user',
        source: 'structure',
        subject: s.name,
        ref: String(i),
        systemKeys: [s.id, s.productElement ? `${s.productElement.module}:${s.productElement.id}` : undefined].filter((k): k is string => !!k),
      })
    })
  }
  return gaps
}

/** The gaps of one intent revision (see structureGaps for the structural ones). */
export function computeGaps(c: IntentContent): IntentGaps {
  const systemGaps = structureGaps(c)
  const gaps = [...systemGaps]
  for (const n of c.informationNeeds) {
    if (n.state !== 'open') continue
    // An open need about a system that already has a structural gap is the same gap: one entry keeping both IDs.
    const twin = n.subject ? systemGaps.find((g) => g.source === 'structure' && g.ref !== undefined && n.subject !== undefined && g.systemKeys?.includes(n.subject)) : undefined
    if (twin) {
      twin.ids = [...(twin.ids ?? [twin.id]), `need-${n.id}`]
      if (GAP_TIERS.indexOf(TIER_OF_NEED[n.tier]) < GAP_TIERS.indexOf(twin.tier)) twin.tier = TIER_OF_NEED[n.tier]
      continue
    }
    gaps.push({ id: `need-${n.id}`, tier: TIER_OF_NEED[n.tier], text: n.text, route: n.route, source: 'information-need', ...(n.subject ? { subject: n.subject } : {}), ref: n.id })
  }
  const counts: Record<GapTier, number> = { essential: 0, concept: 0, detail: 0, immaterial: 0 }
  gaps.forEach((g) => counts[g.tier]++)
  // A question covers a gap when its needId names the information need (need-ID) or the structural gap (its gap ID).
  const covered = new Set(c.questions.filter((q) => q.state === 'open' && q.needId).map((q) => q.needId as string))
  const isCovered = (g: IntentGap) => (g.ids ?? [g.id]).some((id) => covered.has(id) || covered.has(id.replace(/^need-/, ''))) || (g.source === 'information-need' && covered.has(g.ref as string))
  const unaskedEssential = gaps.filter((g) => g.tier === 'essential' && g.route === 'ask-user' && !isCovered(g))
  const out = (list: IntentGap[]) => list.map(({ systemKeys: _keys, ...g }) => g)
  return {
    gaps: out(gaps),
    counts,
    researchItems: out(gaps.filter((g) => g.tier === 'essential' && g.route === 'research')),
    unaskedEssential: out(unaskedEssential),
    systemGaps: out(systemGaps),
  }
}
