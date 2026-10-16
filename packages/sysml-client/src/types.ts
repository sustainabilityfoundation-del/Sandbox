import type { Command, CommandSchema, Diagnostic, DiagnosticsDelta, JsonElement, Model, ValidationPolicy } from '@ews/sysml-core'

/** Client-side view of the SysML Modeler API (same shapes for the HTTP and local adapters). */

export interface ProjectInfo {
  id: string
  name: string
  description: string
  platformProjectId: string
  defaultBranchId: string
  rootElementId: string
  created: string
}

export interface BranchInfo {
  id: string
  name: string
  projectId: string
  headCommitId: string | null
  revision: number
  created: string
}

export interface TagInfo {
  id: string
  name: string
  commitId: string
  created: string
}

export interface CommitSource {
  kind: 'user' | 'assistant' | 'import' | 'api' | 'revert' | 'seed'
  conversationId?: string
  proposalId?: string
  messageId?: string
  revertedCommitId?: string
  tool?: string
}

export interface CommitInfo {
  id: string
  projectId: string
  number: number
  parentIds: string[]
  branchId: string | null
  actor: string
  source: CommitSource
  description: string
  summary: string
  changeCount: number
  created: string
}

export interface ChangeView {
  id: string
  kind: 'created' | 'updated' | 'deleted'
  metaclass: string
  after?: JsonElement
}

export interface TransactionOutcome {
  dryRun: boolean
  rebased: boolean
  baseCommitId: string
  commit?: CommitInfo
  summary: { id: string; kind: string; metaclass: string; label: string }[]
  summaryText: string
  changes: ChangeView[]
  createdIds: Record<string, string>
  diagnostics: DiagnosticsDelta
}

export interface TransactionRequest {
  /** Commit the commands were prepared against (required unless dryRun). */
  baseCommitId?: string
  commands: Command[]
  dryRun?: boolean
  validationPolicy?: ValidationPolicy
  reason?: string
  source?: CommitSource
}

export interface ValidationReport {
  commitId: string
  counts: { error: number; warning: number; info: number }
  diagnostics: Diagnostic[]
}

export interface CommandCatalog {
  commands: CommandSchema[]
  creatableKinds: readonly string[]
  metaclasses: { name: string; supers: readonly string[]; abstract: boolean; layer: string; attributes: string[]; references: string[] }[]
  notes: string
}

export interface SysmlEvent {
  eventId: string
  type: 'sysml.project-created' | 'sysml.commit-created' | 'sysml.branch-created' | 'sysml.tag-created'
  projectId: string
  entityId: string
  commitNumber?: number
  branchId?: string
  occurredAt: string
  actor: string
}

export type SysmlErrorCode = 'invalid' | 'rejected' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'unavailable'

export class SysmlClientError extends Error {
  constructor(
    readonly code: SysmlErrorCode,
    message: string,
    readonly details?: { commandIndex?: number; diagnostics?: Diagnostic[]; conflictingElementIds?: string[]; headCommitId?: string; [k: string]: unknown },
    readonly status?: number,
  ) {
    super(message)
    this.name = 'SysmlClientError'
  }
}

/** The one interface the tool and its assistant actions use (ADR-0030). */
export interface SysmlClient {
  /** 'api': the PostgreSQL-backed service. 'local': explicit in-browser repository. Never switches silently. */
  readonly mode: 'api' | 'local'
  listProjects(platformProjectId?: string): Promise<ProjectInfo[]>
  createProject(input: { name: string; platformProjectId: string; description?: string; initialText?: string; source?: CommitSource }, options?: { idempotencyKey?: string }): Promise<ProjectInfo>
  getProject(projectId: string): Promise<ProjectInfo>
  listBranches(projectId: string): Promise<BranchInfo[]>
  getBranch(projectId: string, branchId: string): Promise<BranchInfo>
  createBranch(projectId: string, name: string, headCommitId: string): Promise<BranchInfo>
  listTags(projectId: string): Promise<TagInfo[]>
  createTag(projectId: string, name: string, commitId: string): Promise<TagInfo>
  listCommits(projectId: string, options?: { branchId?: string; limit?: number }): Promise<CommitInfo[]>
  getCommit(projectId: string, commitId: string): Promise<CommitInfo>
  /** The model at a commit (on the platform library). Treat as immutable. */
  loadModel(projectId: string, commitId: string): Promise<Model>
  transact(projectId: string, branchId: string, request: TransactionRequest, options?: { idempotencyKey?: string }): Promise<TransactionOutcome>
  revert(projectId: string, commitId: string, branchId: string, options?: { reason?: string; source?: CommitSource; dryRun?: boolean; idempotencyKey?: string }): Promise<TransactionOutcome>
  validation(projectId: string, commitId: string): Promise<ValidationReport>
  describeCommands(): Promise<CommandCatalog>
  /** Committed-change notifications for a project. Returns an unsubscribe function. */
  subscribe(projectId: string, listener: (event: SysmlEvent) => void): () => void
}
