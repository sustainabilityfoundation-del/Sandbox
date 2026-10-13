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
} from '../domain/types'

export type RepositoryErrorCode = 'unavailable' | 'conflict' | 'invalid' | 'not-found'

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
}
