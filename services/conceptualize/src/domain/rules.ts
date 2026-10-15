/**
 * Conceptualize domain rules: roles and permissions, maturity semantics, relationship semantics,
 * statement kinds and the basis of knowledge. Framework-free; enforced by the service on every request
 * and published in the OpenAPI document (x-permissions, x-relationship-types, x-maturity).
 */
import type { ConceptAbstraction, ConceptMaturity } from '@ews/platform-sdk'

export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export const ROLES: Role[] = ['reader', 'editor', 'reviewer', 'administrator']

export type Permission = 'read' | 'author' | 'decide' | 'administer'

/** Permissions matrix (contracts §6). Documented in OpenAPI and the progress file. */
export const PERMISSIONS: Record<Permission, { roles: Role[]; label: string }> = {
  read: { roles: ['reader', 'editor', 'reviewer', 'administrator'], label: 'Read Concepts, relationships, alternatives, decisions, trade studies, evidence, implementations, history and events' },
  author: {
    roles: ['editor', 'administrator'],
    label: 'Create and edit Concepts, statements, relationships, decompositions, alternative sets, trade studies, evidence, implementations and links; propose decisions; set maturity up to evaluated',
  },
  decide: {
    roles: ['reviewer', 'administrator'],
    label: 'Record accepted or rejected decisions (select alternatives), set maturity selected or later, supersede or archive Concepts that are selected or later, set verification status, clear decision review flags or record invalidation, review evidence',
  },
  administer: { roles: ['administrator'], label: 'Register link types' },
}

export function roleAllows(role: Role | string | null, permission: Permission): boolean {
  return !!role && (PERMISSIONS[permission].roles as string[]).includes(role)
}

// ---- maturity ---------------------------------------------------------------------------------------------

export const MATURITIES: ConceptMaturity[] = ['idea', 'exploring', 'defined', 'evaluated', 'selected', 'engineering-development', 'implemented', 'verified', 'superseded', 'archived']
export const ABSTRACTIONS: ConceptAbstraction[] = ['function', 'component', 'assembly', 'subsystem', 'system', 'abstract']

/** Maturities that are approval gates: entering them, or leaving them for superseded/archived, needs `decide`. */
export const GATED_MATURITIES: ConceptMaturity[] = ['selected', 'engineering-development', 'implemented', 'verified']

export const MATURITY_MEANING: Record<ConceptMaturity, string> = {
  idea: 'Captured; not yet explored',
  exploring: 'Being elaborated or compared; open questions expected',
  defined: 'Intent, constraints and interfaces are stated',
  evaluated: 'Assessed against criteria (trade study or analysis)',
  selected: 'Chosen for further development by a recorded decision or reviewer',
  'engineering-development': 'Being realized in other modules (SysML, CAD, analysis)',
  implemented: 'Realized by at least one implementation with status implemented',
  verified: 'Verification status verified (verified evidence recorded)',
  superseded: 'Replaced by another Concept; kept for history',
  archived: 'No longer pursued; kept for history and rationale',
}

/**
 * Maturity is not a mandatory sequence: any change is allowed except where the rule says otherwise.
 * Returns the reason a change is refused, or null.
 */
export function maturityProblem(input: { from: ConceptMaturity; to: ConceptMaturity; role: Role | string | null; implemented: boolean; verificationStatus: string; replacedBy?: string | null }): { code: 'forbidden' | 'invalid'; message: string } | null {
  const { from, to, role } = input
  if (from === to) return { code: 'invalid', message: `The Concept is already ${to}.` }
  const decide = roleAllows(role, 'decide')
  if (GATED_MATURITIES.includes(to) && !decide) return { code: 'forbidden', message: `Setting maturity to ${to} is an approval gate: it needs a reviewer or administrator.` }
  if ((to === 'superseded' || to === 'archived') && GATED_MATURITIES.includes(from) && !decide) {
    return { code: 'forbidden', message: `The Concept is ${from}; superseding or archiving it needs a reviewer or administrator.` }
  }
  if (to === 'implemented' && !input.implemented) return { code: 'invalid', message: 'Maturity implemented needs at least one implementation with status implemented.' }
  if (to === 'verified' && input.verificationStatus !== 'verified') return { code: 'invalid', message: 'Maturity verified needs verification status verified (recorded with verified evidence).' }
  return null
}

export type VerificationStatus = 'not-verified' | 'partially-verified' | 'verified' | 'failed'
export const VERIFICATION_STATUSES: VerificationStatus[] = ['not-verified', 'partially-verified', 'verified', 'failed']

// ---- basis of knowledge -------------------------------------------------------------------------------------

/**
 * How a statement, score or evidence record is known (brief §11). The service keeps them distinct:
 * the assistant may only write ai-hypothesis, assumption and estimate; evidence needs an evidence
 * record with basis evidence; decision needs a recorded decision.
 */
export type Basis = 'user-assertion' | 'ai-hypothesis' | 'assumption' | 'assessment' | 'estimate' | 'calculated' | 'evidence' | 'decision'
export const BASES: Basis[] = ['user-assertion', 'ai-hypothesis', 'assumption', 'assessment', 'estimate', 'calculated', 'evidence', 'decision']
/** ADR-0043 ladder, lowest first (user-assertion ranks with assumption). */
export const BASIS_RANK: Record<Basis, number> = { 'ai-hypothesis': 0, assumption: 1, 'user-assertion': 1, assessment: 2, estimate: 3, calculated: 4, evidence: 5, decision: 6 }
export const BASIS_MEANING: Record<Basis, string> = {
  'user-assertion': 'Stated by a person (not verified)',
  'ai-hypothesis': 'Proposed by the assistant; unverified until a person confirms it or evidence supports it',
  assumption: 'Engineering assumption, to be confirmed',
  assessment: 'Qualitative engineering judgement (not a calculation)',
  estimate: 'Preliminary estimate (calculation with stated assumptions), not validated',
  calculated: 'Result of a registered calculation model with a reproducibility manifest (not yet reviewed)',
  evidence: 'Supported by a verified evidence record (analysis, test, review)',
  decision: 'Established by a recorded design decision',
}

export type StatementKind =
  | 'function'
  | 'behavior'
  | 'principle'
  | 'effect'
  | 'input'
  | 'output'
  | 'constraint'
  | 'interface'
  | 'mechanism'
  | 'problem'
  | 'capability'
  | 'performance'
  | 'assumption'
  | 'uncertainty'
  | 'question'
  | 'rationale'
  | 'note'
export const STATEMENT_KINDS: StatementKind[] = ['function', 'behavior', 'principle', 'effect', 'input', 'output', 'constraint', 'interface', 'mechanism', 'problem', 'capability', 'performance', 'assumption', 'uncertainty', 'question', 'rationale', 'note']
export const STATEMENT_KIND_LABEL: Record<StatementKind, string> = {
  function: 'Function',
  behavior: 'Desired behavior',
  principle: 'Physical principle',
  effect: 'Intended effect',
  input: 'Input',
  output: 'Output',
  constraint: 'Constraint',
  interface: 'Interface',
  mechanism: 'Candidate mechanism',
  problem: 'Problem solved',
  capability: 'Capability',
  performance: 'Expected performance',
  assumption: 'Assumption',
  uncertainty: 'Known uncertainty',
  question: 'Open question',
  rationale: 'Engineering rationale',
  note: 'Note',
}
/** Kinds that carry an open/resolved state. */
export const STATEFUL_KINDS: StatementKind[] = ['question', 'uncertainty']

// ---- relationships -----------------------------------------------------------------------------------------

export type RelationshipType = 'contains' | 'depends-on' | 'interfaces-with' | 'alternative-to' | 'derived-from' | 'refines' | 'implements' | 'conflicts-with' | 'replaces'
export const RELATIONSHIP_TYPES: RelationshipType[] = ['contains', 'depends-on', 'interfaces-with', 'alternative-to', 'derived-from', 'refines', 'implements', 'conflicts-with', 'replaces']

export interface RelationshipRule {
  /** Cycles through this type are refused. */
  acyclic: boolean
  /** A–B equals B–A; duplicates in either direction are refused. */
  symmetric: boolean
  reads: string
  inverse: string
  meaning: string
}

export const RELATIONSHIP_RULES: Record<RelationshipType, RelationshipRule> = {
  contains: {
    acyclic: true,
    symmetric: false,
    reads: '{from} contains {to}',
    inverse: '{to} is part of {from}',
    meaning: 'Decomposition: the to Concept is a part (function, element) of the from Concept. A Concept may be part of several parents (shared Concepts) and a parent may have alternative decompositions. Cycles are refused over all decompositions together. Concept decomposition need not match a CAD assembly or SysML containment hierarchy.',
  },
  'depends-on': { acyclic: false, symmetric: false, reads: '{from} depends on {to}', inverse: '{to} is needed by {from}', meaning: 'The from Concept cannot work or be assessed without the to Concept (cross-system dependency).' },
  'interfaces-with': {
    acyclic: false,
    symmetric: true,
    reads: '{from} interfaces with {to}',
    inverse: '{to} interfaces with {from}',
    meaning: 'The Concepts exchange force, energy, material, signals or data. May carry an interface definition (name, kind, flows).',
  },
  'alternative-to': { acyclic: false, symmetric: true, reads: '{from} is an alternative to {to}', inverse: '{to} is an alternative to {from}', meaning: 'The Concepts are competing solutions for the same purpose. Alternative sets group several alternatives under a parent.' },
  'derived-from': { acyclic: true, symmetric: false, reads: '{from} is derived from {to}', inverse: '{to} is the origin of {from}', meaning: 'The from Concept was created from the to Concept (for example a branch); it has its own identity and history.' },
  refines: { acyclic: true, symmetric: false, reads: '{from} refines {to}', inverse: '{to} is refined by {from}', meaning: 'The from Concept states the to Concept more precisely, at the same purpose.' },
  implements: {
    acyclic: true,
    symmetric: false,
    reads: '{from} implements {to}',
    inverse: '{to} is implemented by {from}',
    meaning: 'The from Concept is a solution concept for the more abstract to Concept (for example "Belt drive" implements "Provide controlled mechanical power transmission"). Concrete artifacts are linked through ConceptImplementations instead.',
  },
  'conflicts-with': { acyclic: false, symmetric: true, reads: '{from} conflicts with {to}', inverse: '{to} conflicts with {from}', meaning: 'The Concepts cannot both be pursued as stated (incompatible constraints or interfaces).' },
  replaces: { acyclic: true, symmetric: false, reads: '{from} replaces {to}', inverse: '{to} is replaced by {from}', meaning: 'The from Concept supersedes the to Concept; the replaced Concept and its rationale stay in the history.' },
}

/** Cycle check: does adding from → to close a cycle in the graph of `edges` (from → to)? */
export function wouldCreateCycle(edges: { from: string; to: string }[], from: string, to: string): string[] | null {
  if (from === to) return [from, to]
  const out = new Map<string, string[]>()
  for (const e of edges) out.set(e.from, [...(out.get(e.from) ?? []), e.to])
  // Path to → … → from means from → to closes a cycle.
  const prev = new Map<string, string>()
  const queue = [to]
  const seen = new Set([to])
  while (queue.length) {
    const n = queue.shift()!
    if (n === from) {
      const path = [from]
      let c = from
      while (c !== to) {
        c = prev.get(c)!
        path.unshift(c)
      }
      return [from, ...path]
    }
    for (const m of out.get(n) ?? []) {
      if (seen.has(m)) continue
      seen.add(m)
      prev.set(m, n)
      queue.push(m)
    }
  }
  return null
}

// ---- implementations, links, trade studies -------------------------------------------------------------------

export const IMPLEMENTATION_STATUSES = ['candidate', 'in-development', 'implemented', 'retired'] as const
export const ARTIFACT_MODULES = ['requirements', 'sysml', 'cad', 'analysis', 'twin', 'external'] as const
export const LINK_RELATIONS = ['satisfies', 'derives', 'refines', 'proposes', 'references'] as const
export const LINK_MEANING: Record<(typeof LINK_RELATIONS)[number], string> = {
  satisfies: 'The Concept is intended to satisfy the requirement (design intent; not verification)',
  derives: 'The requirement was derived from the Concept',
  refines: 'The Concept refines the requirement',
  proposes: 'The Concept proposed the requirement (created as a draft in Requirements; approval stays there)',
  references: 'Reference to an artifact for context',
}
export const CRITERION_CATEGORIES = ['performance', 'mass', 'cost', 'complexity', 'manufacturability', 'risk', 'custom'] as const
export const QUALITATIVE_LABELS = ['', 'very poor', 'poor', 'fair', 'good', 'very good'] as const
export const EVIDENCE_KINDS = ['calculation', 'analysis', 'simulation', 'test', 'review', 'reference', 'estimate'] as const
export const DECISION_OUTCOMES = ['accepted', 'rejected', 'deferred'] as const

/** Which artifact modules are only reachable through a labelled test adapter (contracts §9). */
export const TEST_ADAPTER_MODULES = ['analysis'] as const

export const KEY_PREFIX = { concept: 'CON', decision: 'DEC', study: 'TS', implementation: 'IMP', set: 'ALT', evidence: 'EVD', function: 'FN', constraint: 'CST', assumption: 'ASM' } as const

// ---- design knowledge (docs/modules/design-reasoning, CR-C1…C6) ------------------------------------------

/** Design entity types (SDK DesignEntityType, CR-S1; defined here until the SDK carries it). */
export type DesignEntityType = 'function' | 'concept' | 'implementation' | 'constraint' | 'assumption' | 'evidence' | 'decision' | 'alternative-set' | 'trade-study' | 'exploration' | 'statement'
export const DESIGN_ENTITY_TYPES: DesignEntityType[] = ['function', 'concept', 'implementation', 'constraint', 'assumption', 'evidence', 'decision', 'alternative-set', 'trade-study', 'exploration', 'statement']
export interface DesignRef {
  module: 'conceptualize'
  type: DesignEntityType
  id: string
  revision?: number
}

export const FUNCTION_STATUSES = ['draft', 'active', 'retired'] as const
export const CONSTRAINT_KINDS = ['qualitative', 'logical', 'mathematical', 'dimensional', 'interface'] as const
export const CONSTRAINT_STRENGTHS = ['hard', 'soft', 'preference'] as const
export const CONSTRAINT_STATUSES = ['proposed', 'active', 'relaxed', 'retired'] as const
export const BOUND_OPERATORS = ['<=', '<', '=', '>=', '>', 'in-range'] as const
export const ASSUMPTION_STATUSES = ['unvalidated', 'under-review', 'validated', 'invalidated', 'retired'] as const
export const DECISION_VALIDITY = ['valid', 'under-review', 'invalidated'] as const
export const INVALIDATION_KINDS = ['assumption-invalidated', 'constraint-changed', 'evidence-superseded', 'requirement-revised', 'artifact-revised', 'relation-violated', 'manual'] as const
