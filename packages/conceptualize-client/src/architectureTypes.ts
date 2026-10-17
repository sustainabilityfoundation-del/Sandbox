/** Architecture-first generation, diversity and context readiness (ECII increment 2). Mirrors services/conceptualize/src/domain/architecture.ts. */

export type ArchitectureLevel = 'architecture' | 'variant'

/** How a solution is organised before dimensions are chosen. A variant names the architecture it varies. */
export interface ArchitectureBlock {
  level: ArchitectureLevel
  parent: string
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
export type ArchitectureInput = Partial<ArchitectureBlock> & { level: ArchitectureLevel }

export interface DiversityResult {
  subjects: { id: string; key: string; name: string; level: ArchitectureLevel | null }[]
  thresholds: { samePrinciple: number; sameMean: number; minimumDistinct: number }
  architectures: { representative: string; members: string[] }[]
  distinctCount: number
  variants: { id: string; key: string; name: string; parent: string; parentId: string | null }[]
  unclassified: { id: string; key: string; name: string }[]
  pairs: { a: string; b: string; similarity: number | null; fieldsCompared: number; principleSimilarity: number | null; verdict: 'same' | 'distinct' | 'unknown'; differsOnlyIn?: 'parameters' | 'wording' }[]
  minimum: number
  verdict: 'diverse' | 'insufficient'
  findings: string[]
}

export type ReadinessLevel = 'not-established' | 'exploratory' | 'context-established' | 'interfaces-verified'
export type ReadinessActivity = 'architecture-concepts' | 'host-specific-concepts' | 'dimensioned-design' | 'cad-handoff'
export interface ContextReadiness {
  intent: { id: string; key: string; revision: number; designObject: string; integration: string } | null
  concept: { id: string; key: string; name: string } | null
  architecturesConsidered: number
  criteriaVersion: string
  advisory: boolean
  level: ReadinessLevel
  contextReadiness: { state: 'exploratory' | 'established' | 'verified'; blockingIssues: string[] }
  activities: { activity: ReadinessActivity; requires: ReadinessLevel; met: boolean; unmet: { id: string; level: ReadinessLevel; text: string; ref?: string }[] }[]
  provisional: boolean
  label: string
}
