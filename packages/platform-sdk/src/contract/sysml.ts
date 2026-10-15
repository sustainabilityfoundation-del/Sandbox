/**
 * SysML Modeler read access for other modules (SDK 1.8, CR-SYSML-01, milestone C5). Read-only; implemented by
 * `createSysmlModelService` in `@ews/sysml-client`.
 */
export const SYSML_SERVICE_CONTRACT_VERSION = '1.0.0'

export interface SysmlElementRef {
  module: 'sysml'
  kind: 'sysml-model-element'
  /** `<sysmlProjectId>/<elementId>` */
  id: string
  /** Commit number on the project's default branch; absent = follow the latest. */
  revision?: number
}

export interface SysmlProjectSummary {
  /** SysML project UUID. */
  id: string
  name: string
  platformProjectId: string
  /** Head commit number of the default branch. */
  revision: number
}

export interface SysmlElementSummary {
  ref: SysmlElementRef
  sysmlProjectId: string
  elementId: string
  /** KerML/SysML metaclass, e.g. 'PartDefinition'. */
  metaclass: string
  name?: string
  shortName?: string
  /** Display text, not identity. */
  qualifiedName?: string
  /** Types (usages) or generals (definitions), by qualified name. */
  types: string[]
  documentation?: string
  /** Commit number the summary was read at. */
  revision: number
  /** Head commit number of the default branch now. */
  latestRevision: number
}

export type SysmlResolution =
  | { status: 'resolved'; ref: SysmlElementRef; element: SysmlElementSummary }
  /** The project, commit or element does not exist (any more) in this platform project. */
  | { status: 'missing'; ref: SysmlElementRef }
  /** The caller may not read it (no tool:sysml, or not a member). */
  | { status: 'forbidden'; ref: SysmlElementRef }

export interface SysmlModelEvent {
  eventId: string
  sysmlProjectId: string
  type: 'project-created' | 'commit-created' | 'tag-created' | 'branch-created'
  /** Commit number for commit events. */
  revision?: number
  occurredAt: string
}

export interface SysmlModelService {
  readonly contractVersion: string
  /** 'api': the PostgreSQL-backed service. 'demo': the explicit in-browser repository. */
  readonly mode: 'api' | 'demo'
  /** SysML projects of a platform project. */
  listProjects(platformProjectId: string): Promise<SysmlProjectSummary[]>
  /** Resolves references; never throws for missing or forbidden ones. Refs of other platform projects are 'missing'. */
  resolve(platformProjectId: string, refs: SysmlElementRef[]): Promise<SysmlResolution[]>
  /** Element search at the default-branch heads (by name, qualified name or short name; optional metaclass). */
  find(platformProjectId: string, query: { text?: string; metaclass?: string; sysmlProjectId?: string; limit?: number }): Promise<SysmlElementSummary[]>
  /** Committed changes of the platform project's SysML projects (after commit, at least once; dedupe by eventId). */
  subscribe(platformProjectId: string, listener: (event: SysmlModelEvent) => void): () => void
}

