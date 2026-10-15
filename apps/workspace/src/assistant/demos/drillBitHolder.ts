import type { AssistantRequest, AssistantResponse, ToolCallResult } from '../types'

/**
 * OPTIONAL DEMONSTRATION, NOT A PRODUCT FEATURE (docs/modules/ai-interface/features.md, "Demonstration
 * boundary"): a scripted plan for the drill bit holder example, used only by the demo assistant when no AI
 * account is connected. It calls the general Conceptualize operations (`conceptualize.*`) step by step, so
 * every change is an ordinary preview you apply. No drill-specific entity, command or default data exists
 * anywhere else; the same steps work with a real model from the help tutorial.
 *
 * "Milwaukee" is used only to describe compatibility (M12 / M18 drill/drivers). This example is not
 * affiliated with or endorsed by Milwaukee Tool. Drill dimensions are assumptions, not measurements.
 */

/** The need statement, kept verbatim by Conceptualize. Quantities become constraints; "Assume…" sentences become assumptions. */
export const DRILL_BIT_HOLDER_NEED =
  'Drill bit holder for a Milwaukee-compatible cordless drill/driver (M12 or M18). It must hold six hex-shank driver bits with a 1/4 in hex shank of 6.35 mm, keep every bit retained after a drop from 1 m, and let the user take a bit out with one hand within 3 s. Assume the holder attaches at the belt-clip mount of the drill. Assume the drill body dimensions are not measured yet; any drill dimension used later is an assumption until it is measured.'

export const DRILL_PARTS = ['Retain the bits', 'Attach to the drill', 'Organise the bit capacity', 'Give one-handed access to the bits']

export const DRILL_ALTERNATIVES = [
  'Alternative A: magnetic clip-on bit holder at the belt-clip mount. Bits sit in a row of hex sockets with a magnet behind each socket.',
  'Alternative B: bit holder sleeve on the battery foot. A flexible sleeve with hex pockets slides over the drill foot above the battery.',
  'Alternative C: separate belt holster with a bit strip. The holder is not on the drill; the user carries it on the belt.',
]

const LABEL = '\n\n_Scripted demo plan (no AI model is connected). Interpretations are AI hypotheses; drill dimensions are assumptions. Not affiliated with or endorsed by Milwaukee Tool._'

export const DRILL_PROMPTS = ['Start the drill bit holder example', 'Decompose the drill bit holder', 'Propose alternatives for the drill bit holder', 'Draft requirements for the drill bit holder']

type Stage = 'create' | 'decompose' | 'alternatives' | 'requirements'

function stageOf(text: string): Stage | null {
  if (!/\b(drill[- ]?bit holder|bit holder)\b/i.test(text)) return null
  if (/\b(decompose|break down|functions|sub-?functions)\b/i.test(text)) return 'decompose'
  if (/\b(alternatives?|options|variants|trade study|compare)\b/i.test(text)) return 'alternatives'
  if (/\brequirements?\b/i.test(text)) return 'requirements'
  return 'create'
}

let seq = 0
const call = (name: string, args: Record<string, unknown>): AssistantResponse => ({ type: 'tool_calls', calls: [{ id: `demo-drill-${++seq}`, name, arguments: args }] })
const final = (text: string, suggestions: string[] = []): AssistantResponse => ({ type: 'final', text: text + LABEL, suggestions })

type Data = any // eslint-disable-line @typescript-eslint/no-explicit-any

function proposalIds(results: ToolCallResult[]): string[] {
  return results.map((r) => (r.data as Data)?.proposalId).filter(Boolean)
}

/** Finds the example Concept (created in the first step and applied by the person). */
function holderKey(results: ToolCallResult[]): string | null | undefined {
  const search = results.find((r) => r.name === 'conceptualize.search')
  if (!search) return undefined
  if (!search.ok) return null
  const concepts = ((search.data as Data)?.concepts ?? []) as { key: string; name: string }[]
  return concepts.find((c) => /^drill bit holder/i.test(c.name))?.key ?? null
}

/** The scripted plan; null when the request is not about the example. */
export function drillBitHolderDemo(request: AssistantRequest): AssistantResponse | null {
  const stage = stageOf(request.turn.text)
  if (!stage) return null
  const offered = (name: string) => request.tools.some((t) => t.name === name)
  const results = request.turn.toolResults
  const failed = results.find((r) => !r.ok)
  if (failed) return final(`The step “${failed.name}” did not work: ${failed.error ?? 'unknown error'} Nothing was changed.`)
  const needed = { create: ['conceptualize.create'], decompose: ['conceptualize.search', 'conceptualize.decompose'], alternatives: ['conceptualize.search', 'conceptualize.create'], requirements: ['conceptualize.search', 'conceptualize.propose_requirement'] }[stage]
  const missing = needed.filter((n) => !offered(n))
  if (missing.length) return final(`This step needs ${missing.join(', ')}, which your subscription or AI access settings (Settings → AI and reasoning) do not offer right now. Nothing was changed.`)

  if (stage === 'create') {
    if (!results.length) return call('conceptualize.create', { text: DRILL_BIT_HOLDER_NEED })
    const [id] = proposalIds(results)
    return final(
      `I prepared **${id}**: a new Concept for the drill bit holder from this need statement (kept verbatim):\n\n> ${DRILL_BIT_HOLDER_NEED}\n\n` +
        'The preview shows the basis of every statement: your words are **stated**; the size, drop and time constraints I read from them are **AI hypotheses**; the two “Assume…” sentences are **assumptions**. No drill dimension is used as a fact.\n\n' +
        'Choose **Apply** on the card to create it, then continue with the decomposition.',
      ['Decompose the drill bit holder'],
    )
  }

  const key = holderKey(results)
  if (key === undefined) return call('conceptualize.search', { text: 'Drill bit holder' })
  if (key === null) return final('I could not find the drill bit holder Concept. Start with “Start the drill bit holder example” and choose Apply on its card first.', ['Start the drill bit holder example'])
  const done = results.filter((r) => r.name !== 'conceptualize.search')

  if (stage === 'decompose') {
    if (!done.length) return call('conceptualize.decompose', { conceptId: key, children: DRILL_PARTS })
    return final(`I prepared **${proposalIds(done)[0]}**: ${DRILL_PARTS.length} functions of ${key}: ${DRILL_PARTS.join('; ')}. They are AI hypotheses for you to confirm or rename. Apply it, then ask for alternatives.`, ['Propose alternatives for the drill bit holder'])
  }

  if (stage === 'alternatives') {
    if (done.length < DRILL_ALTERNATIVES.length) return call('conceptualize.create', { text: DRILL_ALTERNATIVES[done.length], parentId: key })
    return final(
      `I prepared three alternatives as Concepts under ${key}: ${proposalIds(done).map((p) => `**${p}**`).join(', ')}.\n\n` +
        '**Small trade study (AI hypothesis, scores 1–5, higher is better):**\n\n' +
        '| Criterion (weight) | A: magnetic clip at belt-clip mount | B: sleeve on battery foot | C: belt holster |\n| --- | --- | --- | --- |\n' +
        '| Retention after a 1 m drop (3) | 4 | 4 | 4 |\n| One-handed access (2) | 5 | 4 | 2 |\n| Fit without measured drill dimensions (2) | 3 | 2 | 5 |\n| Added mass on the drill (1) | 3 | 3 | 5 |\n| **Weighted total** | **31** | **27** | **31** |\n\n' +
        '**Proposed decision (for you or a reviewer to record):** pursue **A** for on-tool, one-handed access and keep **C** as the fallback. A and C tie at 31; C scores well only because it does not depend on the drill’s dimensions, so measure the belt-clip mount before committing to A.\n\n' +
        'Limitation: the Conceptualize operations available to the assistant cannot yet record named alternatives in an alternative set with this trade study, so the alternatives are child Concepts and the table is shown here, not stored (change request CR-AI-1 in the AI connection progress file).',
      ['Draft requirements for the drill bit holder'],
    )
  }

  if (!done.length) return call('conceptualize.propose_requirement', { conceptId: key })
  return final(
    `I prepared **${proposalIds(done)[0]}**: draft requirements in Requirements from the quantified constraints of ${key} (hex shank size, drop height, one-handed removal time), linked to the Concept with “proposes”. They are drafts; review and approval happen in Requirements. The wording is generated from the Concept’s statements, so edit it before review (for example “shall retain all six bits after a 1 m drop onto concrete”).`,
  )
}
