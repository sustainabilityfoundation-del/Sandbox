import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderMessage, RespondOutput } from './types'

/**
 * Replay of recorded tool-call scripts by the FAKE provider (tests and plumbing flows only; never a model).
 * A script is a list of turns; a turn whose `user` pattern matches the person's message is replayed step by step:
 * each step is either operation calls or a final answer. Arguments may refer to results of earlier calls of the same
 * turn with `${<operation>.<path>}`, e.g. `${conceptualize.search.data.concepts.0.key}`.
 *
 * Scripts are data in test fixtures (for example tests/e2e/fixtures/fake-scripts/*.json), loaded from the directory
 * named by EWS_ASSISTANT_FAKE_SCRIPTS. The format matches a transcript exported from the assistant panel, so a
 * recorded live run can be replayed.
 */
export interface ReplayScript {
  id: string
  description?: string
  turns: ReplayTurn[]
}

export interface ReplayTurn {
  /** Regular expression (case-insensitive) matching the person's message. */
  user: string
  steps: ({ calls: { name: string; arguments: Record<string, unknown> }[] } | { final: string })[]
}

export function loadReplayScripts(dir: string | undefined): ReplayScript[] {
  if (!dir || !existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ReplayScript)
}

const get = (value: unknown, path: string): unknown => path.split('.').filter(Boolean).reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value)

/** Results of this turn's tool calls, newest first, parsed from the tool_result messages. */
function turnResults(messages: ProviderMessage[]): { name: string; output: unknown }[] {
  const out: { name: string; output: unknown }[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.type === 'message' && m.role === 'user' && !m.text.startsWith('[')) break
    if (m.type === 'tool_result') {
      let output: unknown
      try {
        output = JSON.parse(m.output)
      } catch {
        output = m.output
      }
      out.push({ name: m.name, output })
    }
  }
  return out
}

function fill(value: unknown, results: { name: string; output: unknown }[]): unknown {
  if (typeof value === 'string') {
    const whole = /^\$\{([^}]+)\}$/.exec(value)
    const resolve = (ref: string) => {
      const r = results.find((x) => ref.startsWith(`${x.name}.`))
      return r ? get(r.output, ref.slice(r.name.length + 1)) : undefined
    }
    if (whole) return resolve(whole[1]) ?? value
    return value.replace(/\$\{([^}]+)\}/g, (m, ref) => String(resolve(ref) ?? m))
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, results))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, results)]))
  return value
}

let seq = 0

/** The next replayed response for this request, or null when no script turn matches. */
export function replay(scripts: ReplayScript[], userText: string, messages: ProviderMessage[], model: string): RespondOutput | null {
  const turn = scripts.flatMap((s) => s.turns).find((t) => new RegExp(t.user, 'i').test(userText))
  if (!turn) return null
  const results = turnResults(messages)
  let consumed = 0
  for (const step of turn.steps) {
    if ('final' in step) return { type: 'final', text: String(fill(step.final, results)), model }
    if (consumed + step.calls.length <= results.length) {
      consumed += step.calls.length
      continue
    }
    return { type: 'tool_calls', calls: step.calls.map((c) => ({ callId: `replay_${++seq}`, name: c.name, arguments: fill(c.arguments, results) as Record<string, unknown> })), model }
  }
  return { type: 'final', text: 'Replay script finished.', model }
}
