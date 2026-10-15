/**
 * Project Management: the cross-module Projects contract (SDK 1.7).
 *
 * Project Management owns the project registry and lifecycle, membership management, the artifact registry
 * (one global ID per artifact, mapped to its owning module's native reference), links no module owns, work
 * items, milestones, documents, project baselines and activity. Modules stay authoritative for their data.
 * Tools and the workspace use only this interface, through `services.projects`; the full typed client is in
 * @ews/projects-client. Agreed design: docs/modules/projects/api.md, ADR-0060, ADR-0061.
 */
import type { ArtifactCategory, ArtifactLifecycle, NativeRef } from './artifacts'

export const PROJECTS_CONTRACT_VERSION = '1.0.0'

export type ProjectRole = 'reader' | 'editor' | 'reviewer' | 'administrator'

/** Engineering lifecycle status: informational, any order. */
export type ProjectLifecycleStatus = 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'

/** Record state: archived projects are read-only; deleted ones are restorable within the retention window. */
export type ProjectRecordState = 'active' | 'archived' | 'deleted'

export interface ProjectSummary {
  /** Canonical ID: a UUID for new projects; 'PRJ-ACT100' for the legacy example project. */
  id: string
  /** Display identifier, unique; never a reference. */
  key: string
  name: string
  status: ProjectLifecycleStatus
  state: ProjectRecordState
  /** The caller's role in the project. */
  role: ProjectRole
  updatedAt: string
  revision: number
}

export type ArtifactAvailability = 'available' | 'module-unavailable' | 'missing-in-module' | 'not-entitled'

export interface ArtifactSummary {
  /** Global artifact identity (UUID), stable across module changes. */
  artifactId: string
  ref: NativeRef
  key: string
  title: string
  category: ArtifactCategory
  lifecycle: ArtifactLifecycle
  version: { value: number | string; label?: string }
  availability: ArtifactAvailability
  open?: { toolId: string; params: Record<string, string> }
}

export type ProjectsEventType =
  | 'project.created'
  | 'project.updated'
  | 'project.archived'
  | 'project.restored'
  | 'project.deleted'
  | 'project.members-changed'
  | 'artifact.registered'
  | 'artifact.updated'
  | 'artifact.availability-changed'
  | 'link.created'
  | 'link.removed'
  | 'work-item.created'
  | 'work-item.updated'
  | 'milestone.changed'
  | 'document.changed'
  | 'baseline.created'
  | 'baseline.released'

/** Emitted only after commit (transactional outbox); dedupe by eventId. */
export interface ProjectsEvent {
  eventId: string
  type: ProjectsEventType
  projectId: string
  entityId: string
  committedRevision: number
  occurredAt: string
  actor: string
}

export type ProjectsErrorCode = 'not-found' | 'conflict' | 'invalid' | 'forbidden' | 'unauthenticated' | 'unavailable'

export class ProjectsServiceError extends Error {
  constructor(
    readonly code: ProjectsErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ProjectsServiceError'
  }
}

export interface ProjectsService {
  readonly contractVersion: string
  /** 'api': the PostgreSQL-backed service. 'demo': explicit in-browser data. Never switches silently. */
  readonly mode: 'api' | 'demo'
  /** Projects the caller is a member of. */
  list: (query?: { q?: string; state?: ProjectRecordState | 'all'; limit?: number; cursor?: string }) => Promise<{ items: ProjectSummary[]; nextCursor?: string }>
  get: (projectId: string) => Promise<ProjectSummary | undefined>
  /** Registry entries for native references (registers refs the registry has not seen yet). */
  resolve: (projectId: string, refs: NativeRef[]) => Promise<ArtifactSummary[]>
  artifacts: (projectId: string, query?: { q?: string; module?: string; category?: ArtifactCategory; limit?: number; cursor?: string }) => Promise<{ items: ArtifactSummary[]; nextCursor?: string }>
  subscribe: (projectId: string, listener: (event: ProjectsEvent) => void) => () => void
}

/** The open project as the platform knows it (shared context). */
export interface CurrentProject {
  projectId: string
  key: string
  name: string
  role: ProjectRole
}
