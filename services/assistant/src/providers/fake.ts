import { defaultModelId, loadModelRegistry } from '../models'
import { ProviderError, type AssistantProvider, type ProviderMessage, type RespondInput, type RespondOutput } from './types'
import { loadReplayScripts, replay } from './replay'

/**
 * FAKE PROVIDER for tests and the development browser flow. It is a deterministic script, not a model:
 * registered only when a test does so or the API host sets EWS_ASSISTANT_FAKE_PROVIDER=1 outside
 * production. It proves that a second provider plugs in through the registry without workspace changes.
 *
 * Keys: any string starting with `fake-` and at least 12 characters; `fake-invalid…` is refused.
 * Script (last user message):
 * - "set REQ-003 status to approved" → propose_changes for that requirement (a preview the person applies)
 * - `revise REQ-003 rationale to "…"` → requirements.update for that requirement (a preview the person applies)
 * - "read ROD-120" → read_object, then a final answer quoting the result
 * - "forge <tool name>" → a call to that tool even if it was not offered (tests refusal)
 * - "simulate rate limit" / "simulate outage" / "simulate timeout" → the matching provider error
 * - anything else → a final answer listing the tools it was offered
 */

export const FAKE_PROVIDER_ID = 'fake'

function lastUser(messages: ProviderMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.type === 'message' && m.role === 'user') return m.text
  }
  return ''
}

/** Tool results after the last user message, i.e. of the current turn. */
function turnResults(messages: ProviderMessage[]) {
  const out: Extract<ProviderMessage, { type: 'tool_result' }>[] = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.type === 'message' && m.role === 'user') break
    if (m.type === 'tool_result') out.unshift(m)
  }
  return out
}

let seq = 0

export function createFakeProvider(options: { id?: string; delayMs?: number; /** Directory of replay scripts (default: EWS_ASSISTANT_FAKE_SCRIPTS). */ scriptsDir?: string } = {}): AssistantProvider & { calls: RespondInput[] } {
  const calls: RespondInput[] = []
  const check = (key: string) => {
    if (!key.startsWith('fake-') || key.length < 12 || key.startsWith('fake-invalid')) throw new ProviderError('invalid-credential', 'The fake provider did not accept this key (use fake- followed by at least 7 characters).', 401)
  }
  const models = loadModelRegistry('fake').models.map((m) => ({ id: m.id, label: m.label }))
  return {
    id: options.id ?? FAKE_PROVIDER_ID,
    displayName: 'Fake provider (tests)',
    description: 'Deterministic scripted provider for tests and development. Not a language model.',
    defaultModel: defaultModelId('fake'),
    capabilities: { streaming: false, tools: true, structuredOutput: false, imageInput: false, reasoningEffort: false, promptCaching: false, modelDiscovery: true },
    methods: [{ id: 'api-key', kind: 'api-key', label: 'Fake key', keyLabel: 'Fake provider key', help: 'Any value starting with fake- (development only).', keyPattern: /^fake-.{7,}$/ }],
    calls,
    async listModels(credential) {
      check(credential.kind === 'api-key' ? credential.apiKey : credential.accessToken)
      return models
    },
    async validateCredential(credential) {
      check(credential.kind === 'api-key' ? credential.apiKey : credential.accessToken)
      return { models }
    },
    async respond(input): Promise<RespondOutput> {
      calls.push(input)
      check(input.credential.kind === 'api-key' ? input.credential.apiKey : input.credential.accessToken)
      const text = lastUser(input.messages)
      const results = turnResults(input.messages)
      const usage = { inputTokens: JSON.stringify(input.messages).length >> 2, outputTokens: 20, reported: 'estimated' as const }
      if (/simulate timeout/i.test(text)) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 600_000)
          input.signal.addEventListener('abort', () => {
            clearTimeout(t)
            reject(new ProviderError('timeout', 'The model did not answer within the time limit (Settings → AI and reasoning → Limits).'))
          })
        })
      }
      if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs))
      if (/simulate rate limit/i.test(text)) throw new ProviderError('rate-limit', 'The provider is rate-limiting requests. Wait a moment and try again.', 429)
      if (/simulate outage/i.test(text)) throw new ProviderError('unavailable', 'The provider is not responding correctly right now. Try again shortly.', 503)
      const offered = new Set(input.tools.map((t) => t.name))
      const call = (name: string, args: Record<string, unknown>): RespondOutput => ({ type: 'tool_calls', calls: [{ callId: `fake_call_${++seq}`, name, arguments: args }], usage, model: input.model })
      const final = (t: string): RespondOutput => ({ type: 'final', text: t, usage, model: input.model })

      // Recorded tool-call scripts (test fixtures), replayed step by step.
      const replayed = replay(loadReplayScripts(options.scriptsDir ?? process.env.EWS_ASSISTANT_FAKE_SCRIPTS), text, input.messages, input.model)
      if (replayed) return { ...replayed, usage }

      const forge = /forge\s+([\w.-]+)/i.exec(text)
      if (forge) return results.length ? final(`Forged call result: ${results[0].output.slice(0, 300)}`) : call(forge[1], {})

      const quantity = /set\s+([A-Z]{2,4}-\d{3})\s+([a-zA-Z]+)\s+to\s+(\d+(?:\.\d+)?)\s*(mm|cm|m|N|kN)\b/i.exec(text)
      if (quantity) {
        const [, id, property, value, unit] = quantity
        if (!results.length) {
          if (!offered.has('propose_changes')) return final('I may not propose changes with your current AI access settings.')
          return call('propose_changes', { title: `Set ${id} ${property} to ${value} ${unit}`, explanation: 'Requested in the conversation (fake provider).', changes: [{ kind: 'set-property', targetId: id.toUpperCase(), property, value: Number(value), unit }] })
        }
        const r = JSON.parse(results[0].output || '{}')
        return r.ok ? final(`I prepared **${r.data?.proposalId}** to set the ${property} of [[${id.toUpperCase()}]] to ${value} ${unit}. Nothing changes until you choose **Apply**. (Fake provider.)`) : final(`The change could not be prepared: ${r.error}`)
      }

      // A Requirements module operation (a service write the person applies); the twin has no editable field left once the
      // illustrative tools are retired (ADR-0077), so the browser flows use this for "model tool call, preview, Apply".
      const revise = /revise\s+(REQ-\d{3})\s+rationale\s+to\s+"([^"]{1,200})"/i.exec(text)
      if (revise) {
        if (!results.length) {
          if (!offered.has('requirements.update')) return final('I may not propose changes with your current AI access settings.')
          return call('requirements.update', { requirementId: revise[1].toUpperCase(), rationale: revise[2] })
        }
        const r = JSON.parse(results[0].output || '{}')
        return r.ok ? final(`I prepared **${r.data?.proposalId}** to revise the rationale of [[${revise[1].toUpperCase()}]]. Nothing changes until you choose **Apply**. (Fake provider.)`) : final(`The change could not be prepared: ${r.error}`)
      }

      const status = /set\s+(REQ-\d{3})\s+status\s+to\s+(\w+)/i.exec(text)
      if (status) {
        if (!results.length) {
          if (!offered.has('propose_changes')) return final('I may not propose changes with your current AI access settings.')
          return call('propose_changes', { title: `Set ${status[1]} status to ${status[2]}`, explanation: 'Requested in the conversation (fake provider).', changes: [{ kind: 'set-property', targetId: status[1], property: 'status', value: status[2].toLowerCase() }] })
        }
        const r = JSON.parse(results[0].output || '{}')
        return r.ok ? final(`I prepared **${r.data?.proposalId}** to set [[${status[1]}]] to ${status[2]}. Nothing changes until you choose **Apply**. (Fake provider.)`) : final(`The change could not be prepared: ${r.error}`)
      }

      const read = /read\s+([A-Z]{2,4}-\d{3})/i.exec(text)
      if (read) {
        if (!results.length) return offered.has('read_object') ? call('read_object', { id: read[1].toUpperCase() }) : final('I may not read objects with your current AI access settings.')
        const r = JSON.parse(results[0].output || '{}')
        return final(r.ok ? `[[${r.data?.id}]] is “${r.data?.name}” (revision ${r.data?.revision}). (Fake provider.)` : `Reading failed: ${r.error}`)
      }

      return final(`Fake provider: I received your message and ${input.tools.length} operations (${[...offered].slice(0, 6).join(', ')}${offered.size > 6 ? ', …' : ''}).`)
    },
  }
}
