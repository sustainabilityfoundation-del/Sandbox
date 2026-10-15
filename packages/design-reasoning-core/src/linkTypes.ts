import type { DesignEntityType } from './refs'

/**
 * Built-in design link vocabulary (CR-C4; knowledge-representation.md §2.2). Endpoint `'artifact'`
 * means an ArtifactRef of another module. `propagation` says in which direction a change travels for
 * impact analysis (ADR-0046): 'to-from' = a change of the `to` end may affect the `from` end.
 */
export type Endpoint = DesignEntityType | 'artifact'

export interface LinkTypeDefinition {
  name: string
  from: Endpoint[]
  to: Endpoint[]
  inverse: string
  meaning: string
  acyclic: boolean
  symmetric: boolean
  /** Whether assistant or reasoning sources may assert it (subject to basis rules). */
  assistantMayAssert: boolean
  propagation: 'to-from' | 'from-to' | 'both' | 'none'
  /** Only these modules may be the `to` end when `to` includes 'artifact'. */
  artifactModules?: string[]
  /** At most one active link of this type per `from`. */
  singlePerFrom?: boolean
}

const ANY: Endpoint[] = ['function', 'concept', 'implementation', 'constraint', 'assumption', 'evidence', 'decision', 'alternative-set', 'trade-study', 'exploration', 'calculation-model']

export const BUILT_IN_LINK_TYPES: LinkTypeDefinition[] = [
  { name: 'performs', from: ['concept'], to: ['function'], inverse: 'performed by', meaning: 'The Concept is intended to perform the Function.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'to-from' },
  { name: 'decomposes-into', from: ['function'], to: ['function'], inverse: 'part of', meaning: 'Function decomposition (shared sub-functions allowed).', acyclic: true, symmetric: false, assistantMayAssert: true, propagation: 'both' },
  { name: 'depends-on', from: ANY, to: [...ANY, 'artifact'], inverse: 'needed by', meaning: 'The from record cannot work or be assessed without the to record.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'to-from' },
  { name: 'constrains', from: ['constraint'], to: ['function', 'concept', 'exploration'], inverse: 'constrained by', meaning: 'The constraint limits the subject.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'from-to' },
  { name: 'interfaces-with', from: ['function', 'concept'], to: ['function', 'concept'], inverse: 'interfaces with', meaning: 'Exchange of force, energy, material, signals or data.', acyclic: false, symmetric: true, assistantMayAssert: true, propagation: 'both' },
  { name: 'derived-from', from: ANY, to: [...ANY, 'artifact'], inverse: 'origin of', meaning: 'The from record was created from the to record.', acyclic: true, symmetric: false, assistantMayAssert: true, propagation: 'to-from' },
  { name: 'supported-by', from: ['decision', 'assumption', 'constraint', 'concept'], to: ['evidence'], inverse: 'supports', meaning: 'The evidence supports the from record.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'to-from' },
  { name: 'contradicted-by', from: ['decision', 'assumption', 'constraint', 'concept'], to: ['evidence'], inverse: 'contradicts', meaning: 'The evidence contradicts the from record.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'to-from' },
  { name: 'verified-by', from: ['concept', 'function', 'constraint'], to: ['evidence', 'artifact'], inverse: 'verifies', meaning: 'Verification-grade evidence or a twin verification record.', acyclic: false, symmetric: false, assistantMayAssert: false, propagation: 'to-from', artifactModules: ['twin'] },
  { name: 'invalidated-by', from: ['decision', 'assumption', 'evidence'], to: ['evidence', 'assumption'], inverse: 'invalidates', meaning: 'Recorded invalidation (a person’s action).', acyclic: false, symmetric: false, assistantMayAssert: false, propagation: 'none' },
  { name: 'formalizes', from: ['constraint'], to: ['artifact'], inverse: 'formalized by', meaning: 'The constraint formalizes one pinned requirement revision.', acyclic: false, symmetric: false, assistantMayAssert: true, propagation: 'both', artifactModules: ['requirements'], singlePerFrom: true },
]

/**
 * Edges the graph API derives from stored records rather than from links (they cannot drift from their
 * source): implementation membership, decision structure, alternative membership, calculation bindings.
 */
export const DERIVED_EDGE_TYPES: Record<string, { meaning: string; propagation: LinkTypeDefinition['propagation'] }> = {
  realizes: { meaning: 'Implementation realizes Concept (inverse reading: implemented by)', propagation: 'to-from' },
  'realized-as': { meaning: 'Implementation → artifact of another module', propagation: 'from-to' },
  'selected-through': { meaning: 'Concept selected (or rejected) through a recorded decision', propagation: 'to-from' },
  decides: { meaning: 'Decision decides an alternative set', propagation: 'none' },
  member: { meaning: 'Alternative set → member Concept', propagation: 'none' },
  'decision-assumes': { meaning: 'Decision rests on an assumption', propagation: 'to-from' },
  'decision-constrained-by': { meaning: 'Decision took a constraint into account', propagation: 'to-from' },
  binds: { meaning: 'Calculation model input bound to a record or artifact property', propagation: 'to-from' },
  'produced-by': { meaning: 'Evidence produced by executing a calculation model', propagation: 'to-from' },
  subject: { meaning: 'Evidence is about the subject', propagation: 'none' },
  affects: { meaning: 'Decision names an affected record or artifact', propagation: 'from-to' },
  watches: { meaning: 'Decision invalidation condition watches the subject', propagation: 'to-from' },
}

export function propagationOf(type: string, registry: LinkTypeDefinition[] = BUILT_IN_LINK_TYPES): LinkTypeDefinition['propagation'] {
  return registry.find((t) => t.name === type)?.propagation ?? DERIVED_EDGE_TYPES[type]?.propagation ?? 'to-from'
}
