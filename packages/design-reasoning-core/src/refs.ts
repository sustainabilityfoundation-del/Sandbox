import type { ArtifactRef } from '@ews/platform-sdk'

/**
 * References (CR-S1). Defined here for the prototype; the coordinator promotes them to the SDK
 * (contract/concepts.ts) when Conceptualize implements the matching change requests.
 */
export type DesignEntityType =
  | 'function'
  | 'concept'
  | 'implementation'
  | 'constraint'
  | 'assumption'
  | 'evidence'
  | 'decision'
  | 'alternative-set'
  | 'trade-study'
  | 'exploration'
  | 'calculation-model'
  | 'statement'

/** A Conceptualize-owned design record. With `revision` it pins that revision. */
export interface DesignRef {
  module: 'conceptualize'
  type: DesignEntityType
  id: string
  revision?: number
}

/** SDK ArtifactModule plus the two values CR-S1 adds. */
export type ExtendedArtifactModule = ArtifactRef['module'] | 'conceptualize' | 'reasoning'

/** SDK ArtifactRef with the extended module list (requirements, sysml, cad, twin, analysis, external, reasoning). */
export interface ArtifactRefX extends Omit<ArtifactRef, 'module'> {
  module: Exclude<ExtendedArtifactModule, 'conceptualize'>
}

export type AnyRef = DesignRef | ArtifactRefX

export const isDesignRef = (ref: AnyRef): ref is DesignRef => ref.module === 'conceptualize'

/** Stable key of a ref without its revision ("conceptualize:decision:<id>", "twin:ROD-120"). */
export function refKey(ref: AnyRef): string {
  return isDesignRef(ref) ? `conceptualize:${ref.type}:${ref.id}` : `${ref.module}:${ref.id}`
}

export const sameTarget = (a: AnyRef, b: AnyRef) => refKey(a) === refKey(b)

export function designRef(type: DesignEntityType, id: string, revision?: number): DesignRef {
  return revision === undefined ? { module: 'conceptualize', type, id } : { module: 'conceptualize', type, id, revision }
}
