import type { ObjectType, PropertyValue, RelationshipType } from '@ews/model-service'
import type { ChangeInput, EntitlementId } from '@ews/platform-sdk'

export type { ChangeInput }

/**
 * Context captured when the user sends a message. Everything the assistant
 * does for that message uses this snapshot, so later selection, scenario or
 * configuration changes cannot redirect an action already in progress.
 */
export interface CapturedMessageContext {
  projectId: string
  configurationId: string
  configurationName: string
  scenarioId: string
  scenarioName: string
  /** Available scenarios (load cases), so the assistant can resolve "maximum load" etc. */
  scenarios: { id: string; name: string }[]
  modelRevision: number
  /** Attached selection (empty unless the user attached it). */
  selection: { id: string; name: string; type: ObjectType }[]
  attachedSelection: boolean
  capturedAt: string
}

/**
 * Operation names: platform operations (read_object, propose_changes, open_tool, …)
 * and tool-contributed actions ('<toolId>.<action>'). Only names in the request's
 * tool list are executed, and only for tools the subscription includes.
 */
export type AssistantToolName = string

/** JSON-schema style description, suitable for a model provider's tool-calling API. */
export interface AssistantToolSpec {
  name: AssistantToolName
  /** Short label for execution status. */
  label?: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

export interface ToolCallRequest {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolCallResult {
  callId: string
  name: string
  /** The call's arguments, so a stateless backend can replay the exchange to the model. */
  arguments?: Record<string, unknown>
  ok: boolean
  data?: unknown
  error?: string
  /** Machine-readable failure reason, e.g. 'unit', 'no-op', 'not-allowed'. */
  errorCode?: string
}

/** Conversation history as shared with the assistant (no UI state). */
export type HistoryItem =
  | { role: 'user'; text: string; context: CapturedMessageContext }
  | { role: 'assistant'; text: string }
  | {
      role: 'event'
      event: 'applied' | 'rejected' | 'conflict' | 'failed'
      proposalId: string
      summary: string
      revision?: number
      undoOf?: string
      /** Set on applied events whose change has since been undone. */
      undoneBy?: string
    }

export interface AssistantRequest {
  history: HistoryItem[]
  turn: {
    text: string
    context: CapturedMessageContext
    /** Results of tool calls made so far in this turn, in order. */
    toolResults: ToolCallResult[]
  }
  tools: AssistantToolSpec[]
}

export type AssistantResponse =
  | { type: 'tool_calls'; calls: ToolCallRequest[] }
  | {
      type: 'final'
      /** May reference objects and outputs as [[ID]]; the UI renders them as links. */
      text: string
      /** Quick replies / follow-up prompts. */
      suggestions?: string[]
      /** True when the assistant needs more information before acting. */
      clarification?: boolean
    }

/**
 * Replaceable assistant provider. The demo implementation is deterministic;
 * a real one would call our backend, which calls the model provider.
 */
export interface AssistantService {
  readonly info: {
    name: string
    kind: 'demo' | 'remote'
    description: string
  }
  respond(request: AssistantRequest, signal: AbortSignal): Promise<AssistantResponse>
}

// ---- Change proposals --------------------------------------------------------

export type PreviewChange =
  | {
      kind: 'set-property'
      targetId: string
      targetName: string
      targetKind: ObjectType | 'scenario'
      property: string
      label: string
      current: PropertyValue | undefined
      proposed: PropertyValue
      /** Revision of the target the preview was based on. */
      expectedRevision: number
      /** E.g. "converted from 12000 N". */
      note?: string
    }
  | {
      kind: 'add-relationship' | 'remove-relationship'
      type: RelationshipType
      from: string
      to: string
      fromName: string
      toName: string
      /** For removals: the relationship being removed. */
      relationshipId?: string
    }
  | {
      kind: 'create-object'
      /** Placeholder used by other changes in the proposal; replaced by the new ID on apply. */
      ref: string
      type: ObjectType
      idPrefix: string
      name: string
      parentId?: string
      properties: Record<string, PropertyValue>
    }

export type ProposalStatus = 'pending' | 'applying' | 'applied' | 'rejected' | 'conflict' | 'failed'

export interface ChangeProposal {
  id: string
  title: string
  explanation: string
  configurationId: string
  /** Model revision when the preview was (last) built. */
  previewModelRevision: number
  changes: PreviewChange[]
  /** Saved outputs that depend on a changed input and would become potentially stale. */
  affectedOutputIds: string[]
  status: ProposalStatus
  /** Conflict or failure explanation. */
  message?: string
  committedRevision?: number
  /** This proposal reverts another one. */
  undoOf?: string
  /** This proposal was reverted by another one. */
  undoneBy?: string
  /**
   * Subscription entitlements of the tools whose rules allowed these changes.
   * Checked again when the user applies the preview; the operation never moves
   * to another tool or context.
   */
  requiredEntitlements: EntitlementId[]
  /** IDs created when applied (for create-object changes). */
  createdIds?: string[]
  conversationId: string
  messageId: string
  createdAt: string
  /** Last change, used to merge the conversation between windows. */
  updatedAt?: string
}
