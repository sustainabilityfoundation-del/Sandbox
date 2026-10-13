import type {
  AssistantRequest,
  AssistantResponse,
  AssistantService,
  HistoryItem,
  ToolCallRequest,
  ToolCallResult,
} from './types'

/**
 * DEMO ASSISTANT: deterministic, rule-based responses for a handful of example
 * requests. It is NOT connected to ChatGPT or any language model.
 *
 * It behaves like a tool-calling model would: it never reads the model
 * directly, only through the allowed tools, deciding the next step from the
 * request and the tool results so far.
 */

export const EXAMPLE_PROMPTS = [
  'What requirements apply to the selected component?',
  'Change the maximum operating load to 12 kN.',
  'Run the maximum-load analysis for this component.',
  'Which results became stale after that change?',
  'Open the requirements tool and show the load requirement.',
  'Undo the last model change.',
]

const COMPLIANCE: Record<string, string> = {
  'not-assessed': 'not assessed',
  compliant: 'compliant',
  'non-compliant': 'non-compliant',
}

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

interface FieldPattern {
  pattern: RegExp
  property: string
  target: 'scenario' | 'part'
  noun: string
}

const FIELDS: FieldPattern[] = [
  { pattern: /\boperating load\b|\bload\b/i, property: 'operatingLoad', target: 'scenario', noun: 'operating load' },
  { pattern: /\btemperature\b/i, property: 'ambientTemperature', target: 'scenario', noun: 'ambient temperature' },
  { pattern: /\b(design|safety) factor\b/i, property: 'designFactor', target: 'part', noun: 'design factor' },
  { pattern: /\bdiameter\b/i, property: 'diameter', target: 'part', noun: 'diameter' },
  { pattern: /\b(effective )?length\b/i, property: 'effectiveLength', target: 'part', noun: 'effective length' },
]

const TOOLS: { pattern: RegExp; id: string }[] = [
  { pattern: /\brequirements?\b/i, id: 'requirements' },
  { pattern: /\banalysis\b/i, id: 'analysis' },
  { pattern: /\bgeometry\b/i, id: 'geometry' },
  { pattern: /\bverification\b/i, id: 'verification' },
  { pattern: /\b3d\b|\bmodel viewer\b/i, id: 'model-viewer' },
]

const NOUNS = /\b(rod|housing|motor|actuator assembly|assembly|actuator)\b/i
const OBJECT_ID = /\b[A-Z]{2,4}-\d{3}\b/

function parseValue(text: string): { value: number; unit?: string } | null {
  // Ignore digits that are part of IDs such as ROD-120.
  const match = /(?<![A-Za-z0-9-])(-?\d+(?:\.\d+)?)\s*(kN|kn|MN|N|mm|cm|m|°C|degC)?(?![A-Za-z])/.exec(text)
  return match ? { value: Number(match[1]), unit: match[2] } : null
}

function scenarioFrom(text: string, scenarios: { id: string; name: string }[]) {
  if (/\b(max(imum)?|peak)\b/i.test(text)) return scenarios.find((s) => /max/i.test(s.name))
  if (/\bnominal\b/i.test(text)) return scenarios.find((s) => /nominal/i.test(s.name))
  return undefined
}

function scenarioWord(name: string): string {
  return /max/i.test(name) ? 'maximum' : /nominal/i.test(name) ? 'nominal' : name.toLowerCase()
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
type Data = any

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

  last(name: string): ToolCallResult | undefined {
    return [...this.results].reverse().find((r) => r.name === name)
  }

  /**
   * Resolves the component a request refers to: an explicit ID, a named part
   * ("the rod", via search), or the attached selection.
   */
  component(): { id: string } | { next: AssistantResponse } | { missing: string } {
    const explicit = OBJECT_ID.exec(this.text)?.[0]
    if (explicit) return { id: explicit }
    const noun = NOUNS.exec(this.text)?.[1]?.toLowerCase()
    if (noun) {
      const query = noun.includes('assembly') || noun === 'actuator' ? 'assembly' : noun
      const search = this.results.find((r) => r.name === 'search_objects' && (r.data as Data)?.query === query)
      if (!search) return { next: call('search_objects', { query }) }
      const match = ((search.data as Data)?.matches ?? []).find((m: Data) => m.type === 'part' || m.type === 'assembly')
      return match ? { id: match.id } : { missing: `I couldn't find a component called “${noun}”.` }
    }
    const selected = this.context.selection.find((s) => s.type === 'part' || s.type === 'assembly')
    if (selected) return { id: selected.id }
    if (this.context.attachedSelection && this.context.selection.length) {
      return {
        missing: `The attached selection (${this.context.selection.map((s) => `[[${s.id}]]`).join(', ')}) is not a component.`,
      }
    }
    return {
      missing: this.context.attachedSelection
        ? 'No component was selected when you sent the message.'
        : 'The selection was not attached to your message.',
    }
  }
}

// ---- intents ------------------------------------------------------------------------

function requirementsIntent(turn: Turn): AssistantResponse {
  const target = turn.component()
  if ('next' in target) return target.next
  if ('missing' in target) {
    return final(`${target.missing} Which component do you mean? Select one in the product tree and attach it, or name it.`, {
      clarification: true,
      suggestions: ['What requirements apply to the rod?', 'What requirements apply to the housing?'],
    })
  }
  const result = turn.last('read_requirements')
  if (!result) return call('read_requirements', { objectId: target.id })
  if (!result.ok) return final(`I couldn't read the requirements: ${result.error}`)

  const data = result.data as Data
  if (!data.requirements.length) return final(`No requirements are allocated to [[${target.id}]] or its parent assemblies.`)
  const lines = data.requirements.map((r: Data) => {
    const via = r.appliesVia === 'direct' ? '' : ` (allocated to the parent assembly [[${r.appliesVia.replace('parent ', '')}]])`
    const verified = r.verifiedBy.length ? `; verified by ${r.verifiedBy.map((v: string) => `[[${v}]]`).join(', ')}` : ''
    const methods = Array.isArray(r.verificationMethods) && r.verificationMethods.length ? r.verificationMethods.join(', ') : 'none'
    return `- [[${r.id}]] **${r.name}**${via}: “${r.statement}” Compliance: ${COMPLIANCE[r.compliance] ?? r.compliance}. Methods: ${methods}${verified}.`
  })
  return final(`**${data.requirements.length} requirement${data.requirements.length === 1 ? '' : 's'} apply to [[${target.id}]] ${data.object.name}:**\n${lines.join('\n')}`, {
    suggestions: ['Change the maximum operating load to 12 kN.', 'Run the maximum-load analysis for this component.'],
  })
}

function changeIntent(turn: Turn, field: FieldPattern): AssistantResponse {
  const { context } = turn
  const parsed = parseValue(turn.text)
  if (!parsed) {
    return final(`What should the ${field.noun} be? Please give a value with units.`, { clarification: true })
  }
  if (!parsed.unit && field.property !== 'designFactor') {
    const unit = field.property === 'operatingLoad' ? 'kN' : field.property === 'ambientTemperature' ? '°C' : 'mm'
    return final(`Which unit is ${parsed.value} in? The ${field.noun} is stored in ${unit}.`, {
      clarification: true,
      suggestions: [`${turn.text.replace(/\.$/, '').replace(String(parsed.value), `${parsed.value} ${unit}`)}.`],
    })
  }

  let targetId: string
  if (field.target === 'scenario') {
    const scenario = scenarioFrom(turn.text, context.scenarios)
    if (!scenario) {
      return final(
        `Which load case should change? The ${field.noun} is defined per scenario: ${context.scenarios
          .map((s) => `**${s.name}** ([[${s.id}]])`)
          .join(' or ')}. (The active scenario is ${context.scenarioName}, but I won't assume it for an edit.)`,
        {
          clarification: true,
          suggestions: context.scenarios.map(
            (s) => `Change the ${scenarioWord(s.name)} ${field.noun} to ${parsed.value} ${parsed.unit ?? ''}`.trim() + '.',
          ),
        },
      )
    }
    targetId = scenario.id
  } else {
    const target = turn.component()
    if ('next' in target) return target.next
    if ('missing' in target) {
      return final(`${target.missing} Which part's ${field.noun} should change?`, {
        clarification: true,
        suggestions: [`Change the rod ${field.noun} to ${parsed.value}${parsed.unit ? ` ${parsed.unit}` : ''}.`],
      })
    }
    targetId = target.id
  }

  const read = turn.last('read_object')
  if (!read) return call('read_object', { id: targetId })
  if (!read.ok) return final(`I couldn't read ${targetId}: ${read.error}`)

  const proposal = turn.last('propose_changes')
  if (!proposal) {
    return call('propose_changes', {
      title: `Set ${(read.data as Data).name} ${field.noun}`,
      explanation: `Requested in the conversation: “${turn.text.trim()}”`,
      changes: [{ kind: 'set-property', targetId, property: field.property, value: parsed.value, unit: parsed.unit ?? '-' }],
    })
  }
  if (!proposal.ok) {
    if (proposal.errorCode === 'no-op') return final(`No change needed: ${proposal.error}`)
    if (proposal.errorCode === 'unit') {
      return final(`${proposal.error} Could you restate the value in a supported unit?`, { clarification: true })
    }
    return final(`I can't propose that change: ${proposal.error}`)
  }
  const data = proposal.data as Data
  const affected: string[] = data.affectedOutputs
  return final(
    `I've prepared **${data.proposalId}** for your review: ${data.changes.join('; ')}.\n` +
      (affected.length
        ? `Applying it will mark ${affected.length} saved result${affected.length === 1 ? '' : 's'} that used the old value as potentially stale: ${affected.map((id) => `[[${id}]]`).join(', ')}.\n`
        : '') +
      'Nothing has changed yet. Review the card below and choose **Apply** or **Reject**.',
    { suggestions: ['Which results became stale after that change?', 'Run the maximum-load analysis for this component.'] },
  )
}

function runIntent(turn: Turn): AssistantResponse {
  const target = turn.component()
  if ('next' in target) return target.next
  if ('missing' in target) {
    return final(`${target.missing} Which part should I assess?`, {
      clarification: true,
      suggestions: ['Run the maximum-load analysis for the rod.'],
    })
  }
  const scenario = scenarioFrom(turn.text, turn.context.scenarios) ?? {
    id: turn.context.scenarioId,
    name: turn.context.scenarioName,
  }
  const run = turn.last('run_analysis')
  if (!run) return call('run_analysis', { objectId: target.id, scenarioId: scenario.id })
  if (!run.ok) {
    return final(`I couldn't run the analysis: ${run.error}`, {
      suggestions: ['Run the maximum-load analysis for the rod.'],
    })
  }
  const d = run.data as Data
  const sign = d.margin >= 0 ? '+' : ''
  return final(
    `Saved [[${d.outputId}]]: [[${d.objectId}]] under **${scenario.name}** in ${d.configurationId}, with inputs read at model rev ${d.inputRevision}.\n` +
      `- Operating load ${d.operatingLoad.value} kN\n` +
      `- Allowable load ${d.allowableLoad.value} kN (critical buckling load ${d.criticalLoad.value} kN)\n` +
      `- Margin of safety ${sign}${d.margin.toFixed(2)}, utilisation ${d.utilisationPct} %\n` +
      'This is a demo calculation, not for engineering use. The output has the same provenance as a run from the Analysis tool.',
    { suggestions: ['Which results became stale after that change?'] },
  )
}

function staleIntent(turn: Turn, history: HistoryItem[]): AssistantResponse {
  const result = turn.last('read_outputs')
  if (!result) return call('read_outputs', { staleOnly: true })
  if (!result.ok) return final(`I couldn't read the saved outputs: ${result.error}`)
  const outputs = (result.data as Data).outputs as Data[]
  const lastChange = [...history].reverse().find((h) => h.role === 'event' && h.event === 'applied')
  const intro =
    lastChange && lastChange.role === 'event'
      ? `Since ${lastChange.proposalId} was applied (model rev ${lastChange.revision}), `
      : ''
  if (!outputs.length) return final(`${intro}no saved results in ${turn.context.configurationId} are stale.`)
  const lines = outputs.map(
    (o) =>
      `- [[${o.id}]] ${o.title} (${o.scenarioName ?? 'no scenario'}, inputs at rev ${o.inputRevision}): ${o.staleReasons.join('; ')}`,
  )
  return final(
    `${intro || ''}${outputs.length} saved result${outputs.length === 1 ? ' is' : 's are'} potentially stale in ${turn.context.configurationId}. ` +
      `They are kept as they were, not overwritten:\n${lines.join('\n')}`,
    { suggestions: ['Run the maximum-load analysis for this component.'] },
  )
}

function openIntent(turn: Turn): AssistantResponse {
  const tool = TOOLS.find((t) => t.pattern.test(turn.text))
  const objectPhrase = /\bshow (?:me )?(?:the )?(.+?) requirement/i.exec(turn.text)?.[1]

  let selectId: string | undefined
  if (objectPhrase) {
    const search = turn.last('search_objects')
    if (!search) return call('search_objects', { query: objectPhrase, type: 'requirement' })
    const matches = ((search.data as Data)?.matches ?? []) as Data[]
    if (!matches.length) return final(`I couldn't find a requirement matching “${objectPhrase}”.`)
    const best = matches.filter((m) => m.score === matches[0].score)
    if (best.length > 1) {
      return final(`Several requirements match “${objectPhrase}”: ${best.map((m) => `[[${m.id}]] ${m.name}`).join(', ')}. Which one?`, {
        clarification: true,
        suggestions: best.map((m) => `Open the requirements tool and show ${m.id}.`),
      })
    }
    selectId = best[0].id
  } else {
    selectId = OBJECT_ID.exec(turn.text)?.[0]
  }

  if (tool && !turn.last('open_tool')) return call('open_tool', { toolId: tool.id })
  if (selectId && !turn.last('select_objects')) return call('select_objects', { ids: [selectId] })

  const failed = turn.results.find((r) => !r.ok)
  if (failed) return final(`That didn't work: ${failed.error}`)
  const opened = (turn.last('open_tool')?.data as Data)?.name
  return final(
    [opened ? `Opened **${opened}**` : null, selectId ? `selected [[${selectId}]]` : null].filter(Boolean).join(' and ') +
      '. The selection is shared, so the inspector and other tools show it too.',
  )
}

function undoIntent(turn: Turn, history: HistoryItem[]): AssistantResponse {
  const last = [...history].reverse().find((h) => h.role === 'event' && h.event === 'applied' && !h.undoneBy)
  if (!last || last.role !== 'event') {
    return final('No change has been applied from this conversation yet, so there is nothing to undo here.')
  }
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

function selectIntent(turn: Turn): AssistantResponse {
  const target = turn.component()
  if ('next' in target) return target.next
  if ('missing' in target) return helpReply()
  if (!turn.last('select_objects')) return call('select_objects', { ids: [target.id] })
  return final(`Selected [[${target.id}]].`)
}

function helpReply(): AssistantResponse {
  return final(
    "I'm the **demo assistant**: a deterministic mock that understands a few example requests. I'm not connected to ChatGPT. " +
      'I can read objects, requirements, relationships and saved outputs, prepare change previews for you to apply, run the illustrative analysis, and select objects or open tools.',
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
    // Simulated "thinking" time so execution status is visible.
    await wait(request.turn.toolResults.length ? this.thinkingMs * 0.6 : this.thinkingMs, signal)
    const turn = new Turn(request)
    const text = turn.text
    const history = request.history

    if (/\b(undo|revert|roll ?back)\b/i.test(text)) return undoIntent(turn, history)
    if (/\b(stale|out of date|outdated|invalidated)\b/i.test(text)) return staleIntent(turn, history)
    if (/\b(run|start|execute|perform)\b.*\b(analysis|assessment|calculation)\b/i.test(text)) return runIntent(turn)
    const field = FIELDS.find((f) => f.pattern.test(text))
    if (/\b(change|set|update|increase|decrease|raise|lower|make)\b/i.test(text) && field) return changeIntent(turn, field)
    if (/\brequirements?\b/i.test(text) && /\b(apply|applies|allocated|relevant)\b/i.test(text)) return requirementsIntent(turn)
    if (/\b(open|go to|switch to)\b/i.test(text) && TOOLS.some((t) => t.pattern.test(text))) return openIntent(turn)
    if (/\b(select|find)\b/i.test(text)) return selectIntent(turn)
    return helpReply()
  }
}
