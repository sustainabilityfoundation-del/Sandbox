import { create } from 'zustand'
import type { ActivitySource } from '../domain/types'
import { RepositoryError } from '../repository/EngineeringRepository'
import { useWorkspaceStore } from '../sdk/store'
import { createWorkspaceEnvironment } from './environment'
import { executeToolCall, type InspectedItem } from './executor'
import { affectedOutputs, buildUndo, describeChange, findConflicts, refreshChanges, toModelChanges } from './proposals'
import { ASSISTANT_TOOLS, TOOL_LABELS, isAllowedTool } from './toolSpecs'
import type {
  AssistantService,
  CapturedMessageContext,
  ChangeProposal,
  HistoryItem,
  PreviewChange,
  ToolCallResult,
} from './types'

export interface ToolStep {
  id: string
  name: string
  label: string
  status: 'running' | 'done' | 'error'
  summary: string
  inspected: InspectedItem[]
  error?: string
}

export type ChatMessage =
  | { id: string; role: 'user'; at: string; text: string; context: CapturedMessageContext }
  | {
      id: string
      role: 'assistant'
      at: string
      replyTo: string
      status: 'thinking' | 'running-tool' | 'done' | 'stopped' | 'error'
      text: string
      steps: ToolStep[]
      proposalIds: string[]
      suggestions: string[]
      clarification?: boolean
      error?: string
      note?: string
    }
  | {
      id: string
      role: 'event'
      at: string
      text: string
      tone: 'info' | 'success' | 'warning' | 'danger'
      event?: 'applied' | 'rejected' | 'conflict' | 'failed'
      proposalId?: string
      /** Proposal card shown with this event (e.g. an Undo created from a button). */
      cardProposalId?: string
    }

type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>

const MAX_STEPS = 8
const HISTORY_LIMIT = 20

interface ConversationState {
  service: AssistantService | null
  conversationId: string
  messages: ChatMessage[]
  proposals: Record<string, ChangeProposal>
  running: { messageId: string; controller: AbortController } | null
  attachSelection: boolean
  focusMessageId: string | null

  configure: (service: AssistantService) => void
  setAttachSelection: (attach: boolean) => void
  send: (text: string) => Promise<void>
  stop: () => void
  applyProposal: (id: string) => Promise<void>
  rejectProposal: (id: string) => void
  undoProposal: (id: string) => Promise<void>
  focusMessage: (id: string | null) => void
  clear: () => void
}

let messageSeq = 0
let proposalSeq = 0
const now = () => new Date().toISOString()

function newConversationId() {
  return `C-${Date.now().toString(36).toUpperCase()}`
}

/** Captures the shared context at send time. */
export function captureContext(attachSelection: boolean): CapturedMessageContext {
  const ws = useWorkspaceStore.getState()
  const model = ws.model
  if (!model) throw new Error('The model is not loaded.')
  const { context } = ws
  return {
    projectId: context.projectId,
    configurationId: context.configurationId,
    configurationName: model.snapshot.configurations.find((c) => c.id === context.configurationId)?.name ?? '',
    scenarioId: context.scenarioId,
    scenarioName: model.nameOf(context.scenarioId),
    scenarios: model.snapshot.scenarios.map((s) => ({ id: s.id, name: s.name })),
    modelRevision: model.revision,
    selection: attachSelection
      ? context.selectedIds.flatMap((id) => {
          const o = model.get(id)
          return o ? [{ id: o.id, name: o.name, type: o.type }] : []
        })
      : [],
    attachedSelection: attachSelection,
    capturedAt: now(),
  }
}

export const useConversation = create<ConversationState>()((set, get) => {
  const patchMessage = (id: string, patch: Partial<AssistantMessage> | ((m: AssistantMessage) => Partial<AssistantMessage>)) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id && m.role === 'assistant' ? ({ ...m, ...(typeof patch === 'function' ? patch(m) : patch) } as ChatMessage) : m,
      ),
    }))

  const patchProposal = (id: string, patch: Partial<ChangeProposal>) =>
    set((s) => ({ proposals: { ...s.proposals, [id]: { ...s.proposals[id], ...patch } } }))

  const addEvent = (event: Omit<Extract<ChatMessage, { role: 'event' }>, 'id' | 'at' | 'role'>) => {
    const message: ChatMessage = { id: `M${++messageSeq}`, role: 'event', at: now(), ...event }
    set((s) => ({ messages: [...s.messages, message] }))
    return message.id
  }

  const createProposal = (
    messageId: string,
    draft: {
      title: string
      explanation: string
      configurationId: string
      changes: PreviewChange[]
      affectedOutputIds: string[]
      undoOf?: string
    },
  ): ChangeProposal => {
    const proposal: ChangeProposal = {
      ...draft,
      id: `CP-${++proposalSeq}`,
      previewModelRevision: useWorkspaceStore.getState().model?.revision ?? 0,
      status: 'pending',
      conversationId: get().conversationId,
      messageId,
      createdAt: now(),
    }
    set((s) => ({ proposals: { ...s.proposals, [proposal.id]: proposal } }))
    return proposal
  }

  /** History shared with the assistant: recent messages and change events, no UI state. */
  const buildHistory = (beforeId: string): HistoryItem[] => {
    const { messages, proposals } = get()
    const items: HistoryItem[] = []
    for (const m of messages) {
      if (m.id === beforeId) break
      if (m.role === 'user') items.push({ role: 'user', text: m.text, context: m.context })
      else if (m.role === 'assistant' && m.text) items.push({ role: 'assistant', text: m.text })
      else if (m.role === 'event' && m.event && m.proposalId) {
        const p = proposals[m.proposalId]
        items.push({
          role: 'event',
          event: m.event,
          proposalId: m.proposalId,
          summary: p ? p.changes.map(describeChange).join('; ') : m.text,
          revision: p?.committedRevision,
          undoOf: p?.undoOf,
          undoneBy: p?.undoneBy,
        })
      }
    }
    return items.slice(-HISTORY_LIMIT)
  }

  const sourceFor = (proposalOrMessage: { messageId: string; label: string }): ActivitySource => ({
    kind: 'conversation',
    conversationId: get().conversationId,
    messageId: proposalOrMessage.messageId,
    label: proposalOrMessage.label,
  })

  return {
    service: null,
    conversationId: newConversationId(),
    messages: [],
    proposals: {},
    running: null,
    attachSelection: true,
    focusMessageId: null,

    configure: (service) => set({ service }),
    setAttachSelection: (attachSelection) => set({ attachSelection }),
    focusMessage: (focusMessageId) => set({ focusMessageId }),
    clear: () => {
      get().running?.controller.abort()
      set({ messages: [], proposals: {}, running: null, conversationId: newConversationId() })
    },

    send: async (rawText) => {
      const text = rawText.trim()
      const { service, running, attachSelection } = get()
      if (!text || running || !service) return

      const context = captureContext(attachSelection)
      const userMessage: ChatMessage = { id: `M${++messageSeq}`, role: 'user', at: now(), text, context }
      const reply: AssistantMessage = {
        id: `M${++messageSeq}`,
        role: 'assistant',
        at: now(),
        replyTo: userMessage.id,
        status: 'thinking',
        text: '',
        steps: [],
        proposalIds: [],
        suggestions: [],
      }
      const controller = new AbortController()
      const history = buildHistory(userMessage.id)
      set((s) => ({ messages: [...s.messages, userMessage, reply], running: { messageId: reply.id, controller } }))

      const source = sourceFor({ messageId: userMessage.id, label: `ChatGPT panel, message ${userMessage.id}` })
      const env = createWorkspaceEnvironment({
        createProposal: (draft) => createProposal(reply.id, draft),
        getProposal: (id) => get().proposals[id],
      })
      const toolResults: ToolCallResult[] = []
      const aborted = new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }),
      )
      aborted.catch(() => undefined)

      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          patchMessage(reply.id, { status: 'thinking' })
          const response = await service.respond(
            { history, turn: { text, context, toolResults: [...toolResults] }, tools: ASSISTANT_TOOLS },
            controller.signal,
          )
          if (response.type === 'final') {
            patchMessage(reply.id, {
              status: 'done',
              text: response.text,
              suggestions: response.suggestions ?? [],
              clarification: response.clarification,
            })
            return
          }
          for (const toolCall of response.calls) {
            if (controller.signal.aborted) throw new DOMException('Stopped', 'AbortError')
            const label = isAllowedTool(toolCall.name) ? TOOL_LABELS[toolCall.name] : toolCall.name
            patchMessage(reply.id, (m) => ({
              status: 'running-tool',
              steps: [...m.steps, { id: toolCall.id, name: toolCall.name, label, status: 'running', summary: `${label}…`, inspected: [] }],
            }))
            const execution = executeToolCall(toolCall, { captured: context, source, env }).then((outcome) => {
              // Record the outcome even if the user pressed Stop meanwhile.
              patchMessage(reply.id, (m) => ({
                steps: m.steps.map((s) =>
                  s.id === toolCall.id
                    ? { ...s, status: outcome.ok ? 'done' : 'error', summary: outcome.summary, inspected: outcome.inspected, error: outcome.error }
                    : s,
                ),
                proposalIds: outcome.proposalId ? [...m.proposalIds, outcome.proposalId] : m.proposalIds,
              }))
              return outcome
            })
            const outcome = await Promise.race([execution, aborted])
            toolResults.push({
              callId: outcome.callId,
              name: outcome.name,
              arguments: toolCall.arguments,
              ok: outcome.ok,
              data: outcome.data,
              error: outcome.error,
              errorCode: outcome.errorCode,
            })
          }
        }
        patchMessage(reply.id, { status: 'error', error: `Stopped after ${MAX_STEPS} steps without an answer.` })
      } catch (error) {
        if (controller.signal.aborted) {
          patchMessage(reply.id, (m) => ({
            status: 'stopped',
            note: m.steps.some((s) => s.status === 'running' && s.name === 'run_analysis')
              ? 'Stopped. The analysis that had already started will still finish and be saved by the application.'
              : 'Stopped. No further operations were run.',
          }))
        } else {
          patchMessage(reply.id, { status: 'error', error: error instanceof Error ? error.message : String(error) })
        }
      } finally {
        set((s) => (s.running?.messageId === reply.id ? { running: null } : {}))
      }
    },

    stop: () => get().running?.controller.abort(),

    applyProposal: async (id) => {
      const proposal = get().proposals[id]
      if (!proposal || !['pending', 'conflict', 'failed'].includes(proposal.status)) return
      const workspace = useWorkspaceStore.getState()
      const model = workspace.model
      if (!model) return

      const refreshAsConflict = (reason: string) => {
        const current = useWorkspaceStore.getState()
        const changes = refreshChanges(proposal.changes, current.model!)
        patchProposal(id, {
          status: 'conflict',
          changes,
          previewModelRevision: current.model!.revision,
          affectedOutputIds: affectedOutputs(changes, current.outputs),
          message: `${reason} The preview now shows the current values; nothing was overwritten. Review it and apply again if it is still what you want.`,
        })
        addEvent({ text: `${id} not applied: the model changed since the preview.`, tone: 'warning', event: 'conflict', proposalId: id })
      }

      // Check the expected revisions before committing.
      const conflicts = findConflicts(proposal, model)
      if (conflicts.length) return refreshAsConflict(`The model changed after this preview was created: ${conflicts.join(' ')}`)

      patchProposal(id, { status: 'applying', message: undefined })
      const summary = `${proposal.title}: ${proposal.changes.map(describeChange).join('; ')} [${id}]`
      try {
        const { modelRevision } = await workspace.submitChanges('assistant', toModelChanges(proposal.changes), summary, {
          configurationId: proposal.configurationId,
          source: sourceFor({ messageId: proposal.messageId, label: `ChatGPT panel, ${id}` }),
        })
        patchProposal(id, { status: 'applied', committedRevision: modelRevision })
        if (proposal.undoOf) patchProposal(proposal.undoOf, { undoneBy: id })
        addEvent({
          text: `Applied ${id} as model rev ${modelRevision}${proposal.undoOf ? ` (undoes ${proposal.undoOf})` : ''}.`,
          tone: 'success',
          event: 'applied',
          proposalId: id,
        })
      } catch (error) {
        if (error instanceof RepositoryError && error.code === 'conflict') {
          refreshAsConflict(error.message)
        } else {
          const message = error instanceof Error ? error.message : String(error)
          patchProposal(id, { status: 'failed', message: `Not applied: ${message}` })
          addEvent({ text: `${id} failed: ${message}`, tone: 'danger', event: 'failed', proposalId: id })
        }
      }
    },

    rejectProposal: (id) => {
      const proposal = get().proposals[id]
      if (!proposal || (proposal.status !== 'pending' && proposal.status !== 'conflict' && proposal.status !== 'failed')) return
      patchProposal(id, { status: 'rejected' })
      addEvent({ text: `Rejected ${id}. Nothing was changed.`, tone: 'info', event: 'rejected', proposalId: id })
    },

    undoProposal: async (id) => {
      const original = get().proposals[id]
      const workspace = useWorkspaceStore.getState()
      if (!original || !workspace.model) return
      const undo = buildUndo(original, workspace.model)
      if (!undo.ok) {
        addEvent({ text: `Can't undo ${id}: ${undo.message}`, tone: 'warning' })
        return
      }
      const eventId = addEvent({ text: `Undo requested for ${id}.`, tone: 'info' })
      const proposal = createProposal(eventId, {
        title: `Undo ${id}`,
        explanation: `Compensating change for ${id}, requested with the Undo button.`,
        configurationId: original.configurationId,
        changes: undo.changes,
        affectedOutputIds: affectedOutputs(undo.changes, workspace.outputs),
        undoOf: id,
      })
      set((s) => ({
        messages: s.messages.map((m) => (m.id === eventId && m.role === 'event' ? { ...m, cardProposalId: proposal.id } : m)),
      }))
      await get().applyProposal(proposal.id)
    },
  }
})
