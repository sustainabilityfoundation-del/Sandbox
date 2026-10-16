import type { AssistantRequest, AssistantResponse, AssistantService, HistoryItem, ToolCallRequest, ToolCallResult } from './types'
import { assistantContributions } from './contributions'
import { runScriptedPlan, scriptedPlans } from './scriptedPlans'
import { clientDecision } from './aiPolicy'

/**
 * DEMO ASSISTANT: deterministic, rule-based responses for a handful of example
 * requests. It is NOT connected to ChatGPT or any language model.
 *
 * It behaves like a tool-calling model would: it never reads the model
 * directly, only through the operations offered with the request (platform
 * operations plus the actions of tools in the subscription), deciding the next
 * step from the request and the results so far.
 */

export const EXAMPLE_PROMPTS = [
  'What requirements apply to the selected component?',
  'Set REQ-003 status to approved.',
  'Change the rod diameter to 28 mm.',
  'Add a SysML requirement reference for REQ-003.',
  'Connect the housing to the motor in SysML.',
  'Open SysML and show the rod.',
  'Which artifacts are stale?',
  'Undo the last model change.',
  // Example prompts of scripted plans shipped as fixtures (none is required).
  ...scriptedPlans().flatMap((p) => (p.examplePrompt ? [p.examplePrompt] : [])),
]

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

// ---- parsing helpers ----------------------------------------------------------------

const NOUNS = /\b(rod|housing|motor|actuator assembly|assembly|actuator)\b/gi
const OBJECT_ID = /\b[A-Z]{2,4}-\d{3}\b/g

const TOOLS: { pattern: RegExp; id: string; name: string }[] = [
  { pattern: /\bsysml\b/i, id: 'sysml', name: 'SysML' },
  { pattern: /\bcad\b|\bgeometry\b/i, id: 'cad', name: 'CAD' },
  { pattern: /\brequirements?( tool| management)?\b/i, id: 'requirements', name: 'Requirements' },
]

const DIMENSIONS: { pattern: RegExp; parameter: string }[] = [
  { pattern: /\bouter diameter\b/i, parameter: 'outerDiameter' },
  { pattern: /\bdiameter\b/i, parameter: 'diameter' },
  { pattern: /\blength\b/i, parameter: 'length' },
]

function parseValue(text: string): { value: number; unit?: string } | null {
  // Ignore digits that are part of IDs such as ROD-120.
  const match = /(?<![A-Za-z0-9-])(-?\d+(?:\.\d+)?)\s*(mm|cm|m)?(?![A-Za-z])/.exec(text)
  return match ? { value: Number(match[1]), unit: match[2] } : null
}

let callSeq = 0
function call(name: string, args: Record<string, unknown>): AssistantResponse {
  const calls: ToolCallRequest[] = [{ id: `call-${++callSeq}`, name, arguments: args }]
  return { type: 'tool_calls', calls }
}

function final(text: string, extra: { suggestions?: string[]; clarification?: boolean } = {}): AssistantResponse {
  return { type: 'final', text, ...extra }
}

// Loosely typed views of tool results (the assistant treats them as data).
type Data = any // eslint-disable-line @typescript-eslint/no-explicit-any

class Turn {
  readonly text: string
  readonly results: ToolCallResult[]
  readonly request: AssistantRequest

  constructor(request: AssistantRequest) {
    this.request = request
    this.text = request.turn.text
    this.results = request.turn.toolResults
  }

  get context() {
    return this.request.turn.context
  }

  /** Whether an operation was offered (i.e. its tool is in the subscription). */
  offered(name: string): boolean {
    return this.request.tools.some((t) => t.name === name)
  }

  last(name: string): ToolCallResult | undefined {
    return [...this.results].reverse().find((r) => r.name === name)
  }

  /**
   * Resolves the n-th component the request mentions: an explicit ID, a named
   * part ("the rod", via search), or the attached selection.
   */
  component(index = 0): { id: string } | { next: AssistantResponse } | { missing: string } {
    const ids = [...this.text.matchAll(OBJECT_ID)].map((m) => m[0])
    if (ids[index]) return { id: ids[index] }
    const nouns = [...this.text.matchAll(NOUNS)].map((m) => m[1].toLowerCase())
    const noun = nouns[index]
    if (noun) {
      const query = noun.includes('assembly') || noun === 'actuator' ? 'assembly' : noun
      const search = this.results.find((r) => r.name === 'search_objects' && (r.data as Data)?.query === query)
      if (!search) return { next: call('search_objects', { query }) }
      const match = ((search.data as Data)?.matches ?? []).find((m: Data) => m.type === 'part' || m.type === 'assembly')
      return match ? { id: match.id } : { missing: `I couldn't find a component called “${noun}”.` }
    }
    if (index > 0) return { missing: 'I need two components.' }
    const selected = this.context.selection.find((s) => s.type === 'part' || s.type === 'assembly')
    if (selected) return { id: selected.id }
    const represented = this.context.selection[0]
    if (represented) return { id: represented.id }
    return { missing: this.context.attachedSelection ? 'No component was selected when you sent the message.' : 'The selection was not attached to your message.' }
  }
}

/**
 * Reply when an operation isn't offered: because of the person's AI access settings (with the policy's reason), or
 * because its tool is not in the subscription. The two causes are never confused.
 */
function notInSubscription(toolName: string, operation: string): AssistantResponse {
  const policy = clientDecision(operation)
  if (!policy.ok) return final(`${policy.reason} So I can't run ${operation} here; nothing was changed. You can change what the assistant may do in Settings → AI and reasoning.`)
  return final(
    `That needs **${toolName}**, which isn't included in your subscription, so I can't do it from here. Nothing was changed. ` +
      'Your existing data is kept and still visible in the product tree and inspector.',
  )
}

function failed(result: ToolCallResult, what: string): AssistantResponse {
  if (result.errorCode === 'not-entitled') return final(`${result.error}`)
  if (result.errorCode === 'no-op') return final(`No change needed: ${result.error}`)
  return final(`I couldn't ${what}: ${result.error}`)
}

function proposalReply(result: ToolCallResult): AssistantResponse {
  const data = result.data as Data
  const affected: string[] = data.affectedArtifacts ?? []
  return final(
    `I've prepared **${data.proposalId}** for your review: ${data.changes.join('; ')}.\n` +
      (affected.length
        ? `Applying it will mark ${affected.length} saved artifact${affected.length === 1 ? '' : 's'} that used the old value as potentially stale: ${affected.map((id) => `[[${id}]]`).join(', ')}.\n`
        : '') +
      'Nothing has changed yet. Review the card below and choose **Apply** or **Reject**.',
    { suggestions: ['Which artifacts are stale?', 'Undo the last model change.'] },
  )
}

// ---- intents ------------------------------------------------------------------------

function requirementsIntent(turn: Turn): AssistantResponse {
  const name = 'requirements.read_for_component'
  if (!turn.offered(name)) return notInSubscription('Requirements', name)
  const target = turn.component()
  if ('next' in target) return target.next
  if ('missing' in target) {
    return final(`${target.missing} Which component do you mean? Select one and attach it, or name it.`, {
      clarification: true,
      suggestions: ['What requirements apply to the rod?', 'What requirements apply to the housing?'],
    })
  }
  const result = turn.last(name)
  if (!result) return call(name, { objectId: target.id })
  if (!result.ok) return failed(result, 'read the requirements')
  const data = result.data as Data
  if (!data.requirements.length) return final(`No requirements are allocated to [[${data.component.id}]] or its parent assemblies.`)
  const lines = data.requirements.map((r: Data) => {
    const via = r.appliesVia === 'direct' ? '' : ` (via the parent assembly [[${r.appliesVia.replace('parent ', '')}]])`
    const sysml = r.sysmlReferences.length ? `; in SysML as ${r.sysmlReferences.map((id: string) => `[[${id}]]`).join(', ')}` : ''
    return `- [[${r.id}]] **${r.title}**${via}: “${r.statement}” Status: ${r.status}${sysml}.`
  })
  return final(`**${data.requirements.length} requirement${data.requirements.length === 1 ? '' : 's'} apply to [[${data.component.id}]] ${data.component.name}:**\n${lines.join('\n')}`, {
    suggestions: ['Set REQ-003 status to approved.', 'Open SysML and show the rod.'],
  })
}

function requirementEditIntent(turn: Turn): AssistantResponse {
  const name = 'requirements.update'
  if (!turn.offered(name)) return notInSubscription('Requirements', name)
  const id = [...turn.text.matchAll(OBJECT_ID)].map((m) => m[0]).find((x) => x.startsWith('REQ-'))
  if (!id) return final('Which requirement? Please give its ID, e.g. REQ-003.', { clarification: true })
  const field = /\brationale\b/i.test(turn.text) ? 'rationale' : /\bstatus\b/i.test(turn.text) ? 'status' : 'statement'
  let value: string | undefined
  if (field === 'status') {
    value = /\bin[- ]review\b/i.test(turn.text) ? 'in-review' : /\bapproved?\b/i.test(turn.text) ? 'approved' : /\bobsolete\b/i.test(turn.text) ? 'obsolete' : /\bdraft\b/i.test(turn.text) ? 'draft' : undefined
  } else {
    value = /["“](.+)["”]/.exec(turn.text)?.[1] ?? /\bto\s+(.+)$/i.exec(turn.text)?.[1]?.replace(/\.$/, '')
  }
  if (!value) {
    return final(`What should the ${field} of [[${id}]] be?${field === 'status' ? ' Draft, in review, approved or obsolete.' : ' Put the new text in quotes.'}`, { clarification: true })
  }
  const result = turn.last(name)
  if (!result) return call(name, { requirementId: id, [field]: value })
  if (!result.ok) return failed(result, `prepare the edit of ${id}`)
  return proposalReply(result)
}

function dimensionIntent(turn: Turn, parameter: string): AssistantResponse {
  const name = 'cad.set_dimension'
  if (!turn.offered(name)) return notInSubscription('CAD', name)
  const parsed = parseValue(turn.text)
  if (!parsed) return final(`What should the ${parameter} be, in mm?`, { clarification: true })
  const target = turn.component()
  if ('next' in target) return target.next
  if ('missing' in target) return final(`${target.missing} Which part's ${parameter} should change?`, { clarification: true, suggestions: [`Change the rod ${parameter} to ${parsed.value} mm.`] })
  const result = turn.last(name)
  if (!result) return call(name, { objectId: target.id, parameter, value: parsed.value, unit: parsed.unit ?? 'mm' })
  if (!result.ok) return failed(result, 'prepare the dimension change')
  return proposalReply(result)
}

function sysmlReferenceIntent(turn: Turn): AssistantResponse {
  const name = 'sysml.add_requirement_reference'
  if (!turn.offered(name)) return notInSubscription('SysML', name)
  const id = [...turn.text.matchAll(OBJECT_ID)].map((m) => m[0]).find((x) => x.startsWith('REQ-'))
  if (!id) return final('Which requirement should the SysML model reference? Give its ID, e.g. REQ-003.', { clarification: true })
  const result = turn.last(name)
  if (!result) return call(name, { requirementId: id })
  if (!result.ok) return failed(result, `add a reference to ${id}`)
  return proposalReply(result)
}

function sysmlPartIntent(turn: Turn): AssistantResponse {
  const name = 'sysml.create_part'
  if (!turn.offered(name)) return notInSubscription('SysML', name)
  const called = /\b(?:called|named)\s+["“]?([A-Za-z][\w -]{0,40}?)["”]?(?:\s+(?:for|that|representing)\b|[.?!]?$)/i.exec(turn.text)?.[1]
  let representsId: string | undefined
  if (/\bfor\b|\brepresent/i.test(turn.text)) {
    const target = turn.component()
    if ('next' in target) return target.next
    if ('id' in target) representsId = target.id
  }
  const partName = called ?? (representsId ? representsId.split('-')[0].toLowerCase() : undefined)
  if (!partName) return final('What should the new part be called, and which component (if any) does it represent?', { clarification: true })
  const result = turn.last(name)
  if (!result) return call(name, { name: partName, ownerId: 'SYS-001', ...(representsId ? { representsId } : {}) })
  if (!result.ok) return failed(result, 'prepare the new SysML part')
  return proposalReply(result)
}

function sysmlConnectIntent(turn: Turn): AssistantResponse {
  const name = 'sysml.connect'
  if (!turn.offered(name)) return notInSubscription('SysML', name)
  const reqId = [...turn.text.matchAll(OBJECT_ID)].map((m) => m[0]).find((x) => x.startsWith('REQ-'))
  const from = turn.component(0)
  if ('next' in from) return from.next
  if ('missing' in from) return final('Which parts should be connected?', { clarification: true })
  let toId = reqId
  if (!toId) {
    const to = turn.component(1)
    if ('next' in to) return to.next
    if ('missing' in to) return final(`${to.missing} Which part should [[${from.id}]] connect to?`, { clarification: true })
    toId = to.id
  }
  const result = turn.last(name)
  if (!result) return call(name, { fromId: from.id, toId })
  if (!result.ok) return failed(result, 'prepare the connection')
  return proposalReply(result)
}

function staleIntent(turn: Turn, history: HistoryItem[]): AssistantResponse {
  const result = turn.last('read_artifacts')
  if (!result) return call('read_artifacts', { staleOnly: true })
  if (!result.ok) return final(`I couldn't read the saved artifacts: ${result.error}`)
  const artifacts = (result.data as Data).artifacts as Data[]
  const lastChange = [...history].reverse().find((h) => h.role === 'event' && h.event === 'applied')
  const intro = lastChange && lastChange.role === 'event' ? `Since ${lastChange.proposalId} was applied (model rev ${lastChange.revision}), ` : ''
  if (!artifacts.length) return final(`${intro}no saved artifacts in ${turn.context.configurationId} are stale.`)
  const lines = artifacts.map((o) => `- [[${o.id}]] ${o.title} (from ${o.producedBy}, inputs at rev ${o.inputRevision}): ${o.staleReasons.join('; ')}`)
  return final(
    `${intro}${artifacts.length} saved artifact${artifacts.length === 1 ? ' is' : 's are'} potentially stale in ${turn.context.configurationId}. They are kept as they were, not overwritten:\n${lines.join('\n')}`,
  )
}

function openIntent(turn: Turn): AssistantResponse {
  const tool = TOOLS.find((t) => t.pattern.test(turn.text))
  if (!tool) return helpReply()
  const showsSomething = /\b(show|select|and)\b/i.test(turn.text) && (OBJECT_ID.test(turn.text) || new RegExp(NOUNS.source, 'i').test(turn.text))
  OBJECT_ID.lastIndex = 0
  let selectId: string | undefined
  if (showsSomething) {
    const target = turn.component()
    if ('next' in target) return target.next
    if ('id' in target) selectId = target.id
  }
  const open = turn.last('open_tool')
  if (!open) return call('open_tool', { toolId: tool.id })
  if (!open.ok) return final(`I can't open ${tool.name}: ${open.error}`)
  if (selectId && !turn.last('select_objects')) return call('select_objects', { ids: [selectId] })
  const failure = turn.results.find((r) => !r.ok)
  if (failure) return final(`That didn't work: ${failure.error}`)
  return final(
    `Opened **${tool.name}**${selectId ? ` and selected [[${selectId}]]` : ''}. The selection is shared, so ${tool.name} shows the matching representation and the inspector shows the details.`,
  )
}

function undoIntent(turn: Turn, history: HistoryItem[]): AssistantResponse {
  const last = [...history].reverse().find((h) => h.role === 'event' && h.event === 'applied' && !h.undoneBy)
  if (!last || last.role !== 'event') return final('No change has been applied from this conversation yet, so there is nothing to undo here.')
  const proposal = turn.last('propose_changes')
  if (!proposal) {
    return call('propose_changes', {
      title: `Undo ${last.proposalId}`,
      explanation: `Reverts ${last.proposalId} (${last.summary}) with a new compensating revision. The original revision stays in the history.`,
      undoOf: last.proposalId,
    })
  }
  if (!proposal.ok) return final(`I can't undo ${last.proposalId}: ${proposal.error}`)
  const data = proposal.data as Data
  return final(
    `I've prepared **${data.proposalId}** to undo ${last.proposalId}: ${data.changes.join('; ')}.\n` +
      'Applying it creates a new revision rather than deleting history. Review the card and choose **Apply** or **Reject**.',
  )
}

/**
 * Tool-contributed demo planning (SDK 1.5 `AssistantContribution.demo`, demo only): a tool may map
 * a prompt to a sequence of its own registered actions. The calls run one per step through the normal
 * executor, so validation, subscription checks and previews are unchanged.
 */
function toolDemoIntent(turn: Turn): AssistantResponse | null {
  for (const tool of assistantContributions()) {
    const plan = tool.assistant.demo?.(turn.text, { selectionIds: turn.context.selection.map((s) => s.id) })
    if (!plan || !plan.calls.length) continue
    const missing = plan.calls.find((c) => !turn.offered(c.name))
    if (missing) return notInSubscription(tool.name, missing.name)
    const done = turn.results.filter((r) => plan.calls.some((c) => c.name === r.name))
    const failure = done.find((r) => !r.ok)
    if (failure) return failed(failure, plan.calls.find((c) => c.name === failure.name)?.name ?? failure.name)
    if (done.length < plan.calls.length) {
      const next = plan.calls[done.length]
      return call(next.name, next.arguments)
    }
    const prepared = done.map((r) => (r.data as Data)?.proposalId).filter(Boolean)
    return final(
      plan.reply +
        (prepared.length ? `\n\nPrepared for your review: ${prepared.map((id: string) => `**${id}**`).join(', ')}. Nothing has changed yet; choose **Apply** or **Reject** on each card.` : ''),
    )
  }
  return null
}

function helpReply(): AssistantResponse {
  return final(
    "I'm the **demo assistant**: a deterministic mock that understands a few example requests. I'm not connected to an AI model; connect your own account in Settings → AI and reasoning. " +
      'I can read requirements and the shared model, prepare change previews (requirements, SysML elements and links, CAD dimensions) for you to apply, open tools in your subscription, and select objects.',
    { suggestions: EXAMPLE_PROMPTS },
  )
}

export class DemoAssistantService implements AssistantService {
  readonly info = {
    name: 'Demo assistant',
    kind: 'demo' as const,
    description: 'Deterministic mock with scripted responses. Not connected to ChatGPT or any language model.',
  }

  private readonly thinkingMs: number

  constructor(options: { thinkingMs?: number } = {}) {
    this.thinkingMs = options.thinkingMs ?? 400
  }

  async respond(request: AssistantRequest, signal: AbortSignal): Promise<AssistantResponse> {
    await wait(request.turn.toolResults.length ? this.thinkingMs * 0.6 : this.thinkingMs, signal)
    const turn = new Turn(request)
    const text = turn.text
    const history = request.history

    // Scripted demonstration plans from fixtures (data, not product logic), before the general intents.
    const scripted = runScriptedPlan(request)
    if (scripted) return scripted
    if (/\b(undo|revert|roll ?back)\b/i.test(text)) return undoIntent(turn, history)
    if (/\b(stale|out of date|outdated)\b/i.test(text)) return staleIntent(turn, history)
    if (/\bsysml\b/i.test(text) && /\b(reference|ref)\b/i.test(text)) return sysmlReferenceIntent(turn)
    if (/\bsysml\b/i.test(text) && /\b(connect|link|satisf)/i.test(text)) return sysmlConnectIntent(turn)
    if (/\bsysml\b/i.test(text) && /\b(add|create|new)\b.*\bpart\b/i.test(text)) return sysmlPartIntent(turn)
    if (/\b(open|go to|switch to)\b/i.test(text) && TOOLS.some((t) => t.pattern.test(text))) return openIntent(turn)
    const dimension = DIMENSIONS.find((d) => d.pattern.test(text))
    if (dimension && /\b(change|set|make|increase|decrease)\b/i.test(text)) return dimensionIntent(turn, dimension.parameter)
    if (/\bREQ-\d{3}\b/.test(text) && /\b(set|change|update|edit|approve|mark)\b/i.test(text)) return requirementEditIntent(turn)
    if (/\brequirements?\b/i.test(text) && /\b(apply|applies|allocated|relevant)\b/i.test(text)) return requirementsIntent(turn)
    return toolDemoIntent(turn) ?? helpReply()
  }
}
