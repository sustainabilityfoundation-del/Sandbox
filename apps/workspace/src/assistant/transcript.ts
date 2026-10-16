import { useAiConnection } from './connection'
import { useConversation, type ChatMessage } from './conversation'

/**
 * Exported transcript of a conversation: the evidence of an assistant run (for example a live run of a
 * demonstration). It holds the messages, every operation the model requested with its arguments, outcome and
 * response round, the proposals with their status, and the connection (provider, model, method; never a
 * credential). `replayScript` is the same run in the format the fake provider replays (services/assistant
 * providers/replay.ts), so a recorded live run can become a regression test.
 */
export const TRANSCRIPT_FORMAT = 'ews-assistant-transcript'

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildTranscript() {
  const c = useConversation.getState()
  const connection = useAiConnection.getState().connection
  const messages = c.messages.map((m: ChatMessage) => {
    if (m.role === 'user') return { role: 'user', id: m.id, at: m.at, text: m.text, context: m.context }
    if (m.role === 'event') return { role: 'event', id: m.id, at: m.at, event: m.event, text: m.text, proposalId: m.proposalId }
    return {
      role: 'assistant',
      id: m.id,
      at: m.at,
      status: m.status,
      model: m.model,
      text: m.text,
      error: m.error,
      proposalIds: m.proposalIds,
      operations: m.steps.map((s) => ({ round: s.round, name: s.name, arguments: s.arguments, status: s.status, summary: s.summary, error: s.error })),
    }
  })
  const turns = c.messages.flatMap((m) => {
    if (m.role !== 'user') return []
    const reply = c.messages.find((x) => x.role === 'assistant' && x.replyTo === m.id)
    if (!reply || reply.role !== 'assistant') return []
    const rounds = new Map<number, { name: string; arguments: Record<string, unknown> }[]>()
    for (const s of reply.steps) rounds.set(s.round ?? 0, [...(rounds.get(s.round ?? 0) ?? []), { name: s.name, arguments: s.arguments ?? {} }])
    const steps: ({ calls: { name: string; arguments: Record<string, unknown> }[] } | { final: string })[] = [...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([, calls]) => ({ calls }))
    if (reply.text) steps.push({ final: reply.text })
    return [{ user: `^${escape(m.text.trim())}$`, steps }]
  })
  return {
    format: TRANSCRIPT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    projectId: c.projectId,
    conversationId: c.conversationId,
    assistant: c.service?.info ? { name: c.service.info.name, kind: c.service.info.kind, model: c.service.info.model, method: c.service.info.method } : null,
    connection: connection ? { provider: connection.provider, method: connection.method, model: connection.model, account: connection.account } : null,
    messages,
    proposals: Object.values(c.proposals).map((p) => ({ id: p.id, title: p.title, status: p.status, module: p.service?.module ?? 'workspace', kind: p.server?.kind ?? (p.service ? 'closure' : 'twin'), serverId: p.server?.id, projectId: p.projectId, createdIds: p.createdIds, message: p.message })),
    replayScript: { id: `recorded-${c.conversationId}`, description: 'Recorded from an assistant conversation (transcript export).', turns },
  }
}

/** Downloads the transcript as a JSON file. */
export function downloadTranscript(): void {
  const t = buildTranscript()
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `assistant-transcript-${t.conversationId}.json`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
