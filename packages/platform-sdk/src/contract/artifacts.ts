/**
 * Artifact sources (SDK 1.7): how a module tells Project Management which artifacts exist in a project.
 *
 * Server-side and framework-free. Each module implements `ArtifactSource` in its own service package over
 * its own tables and outbox; the API host wires the adapters into the Project Management plugin. The
 * interface is read-only: Project Management never writes module data through it. Agreed contract:
 * docs/modules/projects/registration-and-provisioning.md, ADR-0062.
 */

export const ARTIFACT_SOURCE_CONTRACT_VERSION = '1.0.0'

/** Native reference without revision: identifies an artifact in its owning module. */
export interface NativeRef {
  module: string
  kind: string
  id: string
}

/** Normalised lifecycle for cross-module views; the module's own state is kept verbatim alongside. */
export type ArtifactLifecycle = 'working' | 'in-review' | 'released' | 'superseded' | 'retired'

export type ArtifactCategory =
  | 'product-element'
  | 'concept'
  | 'design-knowledge'
  | 'requirement'
  | 'model'
  | 'geometry'
  | 'analysis'
  | 'verification'
  | 'document'
  | 'work-item'
  | 'milestone'
  | 'baseline'

export const ARTIFACT_LIFECYCLES: readonly ArtifactLifecycle[] = ['working', 'in-review', 'released', 'superseded', 'retired']

export const ARTIFACT_CATEGORIES: readonly ArtifactCategory[] = ['product-element', 'concept', 'design-knowledge', 'requirement', 'model', 'geometry', 'analysis', 'verification', 'document', 'work-item', 'milestone', 'baseline']

export interface ArtifactKindInfo {
  kind: string
  label: string
  category: ArtifactCategory
  /** Whether a person can open it in the module's UI (a deep link is available). */
  navigable: boolean
}

/** Summary metadata a module publishes for one artifact. No content. */
export interface ArtifactDescriptor {
  ref: NativeRef
  /** Display identifier (REQ-001, CON-003 …). Not an identity. */
  key: string
  title: string
  /** The module's own state, verbatim. */
  moduleState?: string
  lifecycle: ArtifactLifecycle
  /** Current version in the module's own numbering (revision, commit number, document revision). */
  version: { value: number | string; label?: string; at: string }
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
  /** Containing artifact in the module (SysML element → SysML project; CAD part → CAD document). */
  container?: NativeRef
  /** Module-owned relationships to report into Project Management's derived link index (optional). */
  relations?: { type: string; to: NativeRef; toRevision?: number }[]
  /** Deep link for the workspace, e.g. `{ toolId: 'requirements', params: { id } }`. */
  open?: { toolId: string; params: Record<string, string> }
}

/** A committed change, delivered at least once after commit; consumers dedupe by `eventId`. */
export type ArtifactChange =
  | { kind: 'upserted'; eventId: string; projectId: string; refs: NativeRef[]; occurredAt: string; actor: string }
  /** The module retired, archived or deleted the artifacts; the registry keeps the records and marks them. */
  | { kind: 'retired'; eventId: string; projectId: string; refs: NativeRef[]; occurredAt: string; actor: string }
  /** Something changed that the adapter cannot itemise (e.g. a bulk import): reconcile the project. */
  | { kind: 'reconcile'; eventId: string; projectId: string; reason: string; occurredAt: string }

export interface ArtifactPage {
  items: ArtifactDescriptor[]
  nextCursor?: string
}

export interface ProvisionRequest {
  projectId: string
  /** 'blank' never creates artifacts. Content templates are a later extension. */
  template: { id: string; content: 'blank' }
  actor: string
  /** The same key must give the same outcome. */
  idempotencyKey: string
}

export type ProvisionResult =
  /** For a 'blank' template `createdRefs` is always empty. */
  | { status: 'provisioned'; createdRefs: NativeRef[] }
  /** The module keys its data by project ID; nothing to do. */
  | { status: 'not-needed' }
  | { status: 'failed'; retryable: boolean; message: string }

/** A module's project content in its own open format (interchange package, ADR-0064). */
export interface ModulePayload {
  module: string
  /** The module's format and version, e.g. 'ews-requirements-json' '1.0.0'. */
  format: string
  formatVersion: string
  files: { path: string; mediaType: string; bytes: Uint8Array }[]
  artifactCount: number
}

export interface ModuleImportReport {
  ok: boolean
  created: number
  /** Old native ID → new native ID (copy mode, or when the module mints new IDs). */
  idMap: Record<string, string>
  problems: { severity: 'error' | 'warning'; message: string; path?: string }[]
}

export interface ArtifactSource {
  readonly module: string
  readonly contractVersion: string
  /** Module display name and the kinds it registers. */
  describeModule(): { name: string; kinds: ArtifactKindInfo[] }
  /** Current artifacts of a project in a stable order, paged (reconciliation). At most 500 per page. Unknown project → empty page. */
  list(projectId: string, options?: { cursor?: string; limit?: number; kinds?: string[] }): Promise<ArtifactPage>
  /** Descriptors for the given refs; refs that do not exist (any more) are absent from the result. */
  describe(projectId: string, refs: NativeRef[]): Promise<ArtifactDescriptor[]>
  /** Committed changes for all projects, after commit, at least once. Returns an unsubscribe function. */
  subscribe(listener: (change: ArtifactChange) => void): () => void
  /** Optional: prepare a new project. Must not create engineering artifacts for a blank template. */
  provision?(request: ProvisionRequest): Promise<ProvisionResult>
  /** Optional (interchange): the module's payload for a project. */
  exportProject?(projectId: string): Promise<ModulePayload>
  /** Optional (interchange): import a payload into a project. */
  importProject?(
    projectId: string,
    payload: ModulePayload,
    options: { mode: 'restore' | 'copy'; idMap?: Record<string, string>; dryRun: boolean; actor: string },
  ): Promise<ModuleImportReport>
}
