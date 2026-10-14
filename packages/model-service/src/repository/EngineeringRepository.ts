import type {
  ActivityDraft,
  ActivitySource,
  ActivityEntry,
  ChangeMeta,
  ChangeResult,
  ModelChange,
  ModelSnapshot,
  OutputDraft,
  OutputRecord,
  ReviewStatus,
  Baseline,
  BaselineDraft,
  ObjectRevision,
  ObjectType,
} from '../domain/types'

/** 'forbidden': the writer's module does not own the artifact (see domain/ownership.ts). */
export type RepositoryErrorCode = 'unavailable' | 'conflict' | 'invalid' | 'not-found' | 'forbidden'

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode

  constructor(code: RepositoryErrorCode, message: string) {
    super(message)
    this.name = 'RepositoryError'
    this.code = code
  }
}

/**
 * The only way the workspace and its tools read or write engineering data.
 * Every method is asynchronous so a cloud API can implement it unchanged.
 */
export interface EngineeringRepository {
  readonly info: { label: string; description: string }

  loadModel(projectId: string): Promise<ModelSnapshot>
  /** Applies all changes atomically as one new model revision. */
  submitChanges(projectId: string, changes: ModelChange[], meta: ChangeMeta): Promise<ChangeResult>

  listOutputs(projectId: string): Promise<OutputRecord[]>
  saveOutput(draft: OutputDraft, options?: { source?: ActivitySource }): Promise<OutputRecord>
  setReviewStatus(outputId: string, status: ReviewStatus, meta: ChangeMeta): Promise<OutputRecord>

  listActivity(projectId: string, limit?: number): Promise<ActivityEntry[]>
  addActivity(projectId: string, entry: ActivityDraft): Promise<ActivityEntry>

  /** One exact revision of an object or scenario (revision-qualified references, baselines). */
  getRevision(projectId: string, id: string, revision: number): Promise<ObjectRevision>
  /** All recorded revisions of an object or scenario, newest first. */
  listHistory(projectId: string, id: string): Promise<ObjectRevision[]>
  listBaselines(projectId: string): Promise<Baseline[]>
  /**
   * Objects owned by another service (e.g. requirements in the Requirements API) that twin
   * relationships and artifacts may reference. Optional; hosts without external services skip it.
   */
  registerExternalObjects?(objects: { id: string; type: ObjectType; revision: number }[]): void
  createBaseline(projectId: string, draft: BaselineDraft, meta: { toolId: string }): Promise<Baseline>
}
