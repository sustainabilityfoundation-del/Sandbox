import type { AssistantRequest, AssistantResponse, ToolCallResult } from './types'

/**
 * Scripted demonstration plans for the DEMO assistant (no AI model connected). Generic engine only: the plans
 * themselves are data in isolated fixtures (apps/workspace/fixtures/demo-plans/*.json), so no example-specific
 * text, number or ID is part of product logic, and the application runs unchanged with no fixture present.
 *
 * A plan answers prompts matching its trigger, in stages (the stage whose `match` fits the prompt, else the first
 * stage without `match`). A stage may first find an object through a search operation, then run its calls one per
 * step through the normal executor (so validation, subscription checks and previews are unchanged), and finally
 * answers with its reply. Every reply carries the plan's label, which says it is a scripted demo.
 */

export interface ScriptedCall {
  name: string
  /** String values may contain `${var}` placeholders (variables found by `find`). */
  arguments: Record<string, unknown>
}

export interface ScriptedStage {
  /** Regular expression (case-insensitive) selecting this stage; omitted for the default stage. */
  match?: string
  /** Operations the stage needs; when one is not offered the plan explains instead of acting. */
  requires: string[]
  /** Finds an object first, e.g. a record created by an earlier stage and applied by the person. */
  find?: {
    call: ScriptedCall
    /** Dot path to the list in the operation result's data. */
    list: string
    /** Field and case-insensitive prefix identifying the object. */
    field: string
    startsWith: string
    /** Field to keep, stored as variable `as`. */
    pick: string
    as: string
    notFound: string
    notFoundSuggestions?: string[]
  }
  calls: ScriptedCall[]
  /** Reply after the calls; `${proposals}` lists the prepared proposals, `${var}` inserts found variables. */
  reply: string
  suggestions?: string[]
}

export interface ScriptedPlan {
  id: string
  title: string
  /** Regular expression (case-insensitive) that routes a prompt to this plan. */
  trigger: string
  /** Appended to every reply: says it is a scripted demo and states the example's disclaimers. */
  label: string
  /** Prompt offered as an example in the panel. */
  examplePrompt?: string
  stages: ScriptedStage[]
}

const plans: ScriptedPlan[] = []

export function registerScriptedPlan(plan: ScriptedPlan): void {
  if (plans.some((p) => p.id === plan.id)) return
  plans.push(plan)
}

export function scriptedPlans(): readonly ScriptedPlan[] {
  return plans
}

/** Plans shipped as fixtures, if any (none is required). */
const fixtures = import.meta.glob('../../fixtures/demo-plans/*.json', { eager: true, import: 'default' }) as Record<string, ScriptedPlan>
for (const plan of Object.values(fixtures)) registerScriptedPlan(plan)

type Data = any // eslint-disable-line @typescript-eslint/no-explicit-any

const get = (value: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value)

function fill(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') return value.replace(/\$\{(\w+)\}/g, (m, k) => vars[k] ?? m)
  if (Array.isArray(value)) return value.map((v) => fill(v, vars))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, vars)]))
  return value
}

let seq = 0

/** The next response of the plan matching this request, or null when no plan applies. */
export function runScriptedPlan(request: AssistantRequest, available: readonly ScriptedPlan[] = plans): AssistantResponse | null {
  const text = request.turn.text
  const plan = available.find((p) => new RegExp(p.trigger, 'i').test(text))
  if (!plan) return null
  const stage = plan.stages.find((s) => s.match && new RegExp(s.match, 'i').test(text)) ?? plan.stages.find((s) => !s.match)
  if (!stage) return null
  const call = (c: ScriptedCall, vars: Record<string, string>): AssistantResponse => ({ type: 'tool_calls', calls: [{ id: `plan-${plan.id}-${++seq}`, name: c.name, arguments: fill(c.arguments, vars) as Record<string, unknown> }] })
  const final = (t: string, suggestions: string[] = []): AssistantResponse => ({ type: 'final', text: `${t}\n\n${plan.label}`, suggestions })
  const results: ToolCallResult[] = request.turn.toolResults
  const failed = results.find((r) => !r.ok)
  if (failed) return final(`The step “${failed.name}” did not work: ${failed.error ?? 'unknown error'} Nothing was changed.`)
  const missing = stage.requires.filter((n) => !request.tools.some((t) => t.name === n))
  if (missing.length) return final(`This step needs ${missing.join(', ')}, which your subscription or AI access settings (Settings → AI and reasoning) do not offer right now. Nothing was changed.`)

  const vars: Record<string, string> = {}
  let done = results
  if (stage.find) {
    const f = stage.find
    const found = results.find((r) => r.name === f.call.name)
    if (!found) return call(f.call, vars)
    const list = (get(found.data, f.list) ?? []) as Data[]
    const hit = list.find((x) => String(get(x, f.field) ?? '').toLowerCase().startsWith(f.startsWith.toLowerCase()))
    if (!hit) return final(f.notFound, f.notFoundSuggestions ?? [])
    vars[f.as] = String(get(hit, f.pick))
    done = results.filter((r) => r !== found)
  }
  if (done.length < stage.calls.length) return call(stage.calls[done.length], vars)
  const prepared = done.map((r) => (r.data as Data)?.proposalId).filter(Boolean) as string[]
  vars.proposals = prepared.map((p) => `**${p}**`).join(', ')
  return final(fill(stage.reply, vars) as string, stage.suggestions ?? [])
}
