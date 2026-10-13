import { create } from 'zustand'
import type { ActivitySource } from '../domain/types'
import { RepositoryError } from '../repository/EngineeringRepository'
import { useWorkspaceStore } from '../sdk/store'
import { broadcast, instanceId, windowTag } from '../session/windowSession'
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
  | { id: string; role: 'user'; at: string; updatedAt?: string; text: string; context: CapturedMessageContext }
  | {
      id: string
      role: 'assistant'
      at: string
      updatedAt?: string
      /** Page instance running this reply; only that window executes it. */
      owner?: string
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
      updatedAt?: string
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
  startedAt: string
  messages: ChatMessage[]
  proposals: Record<string, ChangeProposal>
  running: { messageId: string; controller: AbortController } | null
  attachSelection: boolean
  focusMessageId: string | null
  /** Unsent text, kept here so layout changes and window moves don't lose it. */
  draft: string

  configure: (service: AssistantService) => void
  setAttachSelection: (attach: boolean) => void
  send: (text: string) => Promise<void>
  stop: () => void
  applyProposal: (id: string) => Promise<void>
  rejectProposal: (id: string) => void
  undoProposal: (id: string) => Promise<void>
  focusMessage: (id: string | null) => void
  setDraft: (draft: string) => void
  clear: () => void
}

let messageSeq = 0
let proposalSeq = 0
const now = () => new Date().toISOString()

// IDs carry a window tag in detached windows, so windows can't create the same ID.
const suffix = windowTag ? `-${windowTag}` : ''
const nextMessageId = () => `M${++messageSeq}${suffix}`
const nextProposalId = () => `CP-${++proposalSeq}${suffix}`

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
        m.id === id && m.role === 'assistant'
          ? ({ ...m, ...(typeof patch === 'function' ? patch(m) : patch), updatedAt: now() } as ChatMessage)
          : m,
      ),
    }))

  const patchProposal = (id: string, patch: Partial<ChangeProposal>) =>
    set((s) => ({ proposals: { ...s.proposals, [id]: { ...s.proposals[id], ...patch, updatedAt: now() } } }))

  const addEvent = (event: Omit<Extract<ChatMessage, { role: 'event' }>, 'id' | 'at' | 'role'>) => {
    const message: ChatMessage = { id: nextMessageId(), role: 'event', at: now(), updatedAt: now(), ...event }
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
      id: nextProposalId(),
      previewModelRevision: useWorkspaceStore.getState().model?.revision ?? 0,
      status: 'pending',
      conversationId: get().conversationId,
      messageId,
      createdAt: now(),
      updatedAt: now(),
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
    // Empty until the user starts a conversation, so a stored conversation always wins on load.
    startedAt: '',
    messages: [],
    proposals: {},
    running: null,
    attachSelection: true,
    focusMessageId: null,
    draft: '',

    configure: (service) => set({ service }),
    setAttachSelection: (attachSelection) => set({ attachSelection }),
    focusMessage: (focusMessageId) => set({ focusMessageId }),
    setDraft: (draft) => set({ draft }),
    clear: () => {
      get().running?.controller.abort()
      set({ messages: [], proposals: {}, running: null, conversationId: newConversationId(), startedAt: now() })
    },

    send: async (rawText) => {
      const text = rawText.trim()
      const { service, running, attachSelection } = get()
      if (!text || running || !service) return

      if (!get().startedAt) set({ startedAt: now() }) // first message starts the stored conversation
      const context = captureContext(attachSelection)
      const userMessage: ChatMessage = { id: nextMessageId(), role: 'user', at: now(), updatedAt: now(), text, context }
      const reply: AssistantMessage = {
        id: nextMessageId(),
        role: 'assistant',
        at: now(),
        updatedAt: now(),
        owner: instanceId,
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

// ---- persistence and sharing between windows ------------------------------------------
//
// The conversation is stored in the browser so it survives reloads and appears in
// every workspace window. Saving rereads and merges the stored copy first, so two
// windows writing at nearly the same time can't drop each other's messages. Only
// the window that owns a running reply executes it; others just display it.

interface StoredConversation {
  conversationId: string
  startedAt: string
  messages: ChatMessage[]
  proposals: Record<string, ChangeProposal>
}

const CONVERSATION_KEY = 'ews.conversation.v1'
let applyingStored = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function readStored(): StoredConversation | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CONVERSATION_KEY) : null
    return raw ? (JSON.parse(raw) as StoredConversation) : null
  } catch {
    return null
  }
}

const newer = <T extends { updatedAt?: string }>(a: T | undefined, b: T): T =>
  !a || (b.updatedAt ?? '') > (a.updatedAt ?? '') ? b : a

/** Union of two copies of the same conversation, keeping the most recently updated version of each item. */
export function mergeConversations(local: StoredConversation, remote: StoredConversation): StoredConversation {
  if (remote.conversationId !== local.conversationId) return remote.startedAt > local.startedAt ? remote : local
  const messages = new Map(local.messages.map((m) => [m.id, m]))
  for (const m of remote.messages) messages.set(m.id, newer(messages.get(m.id), m))
  const proposals = { ...local.proposals }
  for (const [id, p] of Object.entries(remote.proposals)) proposals[id] = newer(proposals[id], p)
  return {
    conversationId: local.conversationId,
    startedAt: local.startedAt,
    messages: [...messages.values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)),
    proposals,
  }
}

function snapshot(): StoredConversation {
  const { conversationId, startedAt, messages, proposals } = useConversation.getState()
  return { conversationId, startedAt, messages, proposals }
}

/** Keeps ID counters ahead of every ID already used in the conversation. */
function syncCounters(stored: StoredConversation) {
  const highest = (ids: string[], prefix: RegExp) =>
    ids.reduce((max, id) => Math.max(max, Number(prefix.exec(id)?.[1] ?? 0)), 0)
  messageSeq = Math.max(messageSeq, highest(stored.messages.map((m) => m.id), /^M(\d+)/))
  proposalSeq = Math.max(proposalSeq, highest(Object.keys(stored.proposals), /^CP-(\d+)/))
}

/** Loads the stored conversation (on start, or when another window saved it). */
export function reloadConversation(): void {
  const stored = readStored()
  if (!stored) return
  const merged = mergeConversations(snapshot(), stored)
  syncCounters(merged)
  applyingStored = true
  try {
    useConversation.setState(merged)
  } finally {
    applyingStored = false
  }
}

function persist() {
  clearTimeout(saveTimer)
  const stored = readStored()
  const merged = stored ? mergeConversations(snapshot(), stored) : snapshot()
  try {
    localStorage.setItem(CONVERSATION_KEY, JSON.stringify(merged))
  } catch {
    return // storage unavailable: the conversation stays in this window only
  }
  broadcast({ type: 'conversation' })
}

if (typeof localStorage !== 'undefined') {
  reloadConversation()
  useConversation.subscribe((state, previous) => {
    if (applyingStored) return
    if (state.messages === previous.messages && state.proposals === previous.proposals && state.conversationId === previous.conversationId) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 150)
  })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', persist)
}
