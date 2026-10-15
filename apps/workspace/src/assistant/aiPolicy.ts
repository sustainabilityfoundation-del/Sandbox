import { create } from 'zustand'

/**
 * The person's effective AI access policy as last read from the server (GET /api/assistant/v1/policy).
 * The browser uses it only to shape the interface: which operations are offered and a clear refusal
 * before a call. The server enforces the policy whatever the browser does.
 */

export interface PolicyView {
  policy: {
    modules: Record<string, 'off' | 'read' | 'propose'>
    operations: Record<string, boolean>
    sharing: { selection: boolean; openTools: boolean; requirementText: boolean; elementDetails: boolean; historyLength: number }
    limits: { toolCalls: number; outputTokens: number; timeoutSeconds: number }
    storePrompts: boolean
  }
  modules: { id: string; label: string; description: string; prefixes: string[]; names: string[]; entitlement: string | null; entitled: boolean }[]
  operationClasses: { id: string; label: string; description: string }[]
  catalogue: Record<string, string>
}

export const usePolicyView = create<{ view: PolicyView | null }>()(() => ({ view: null }))

/** Client mirror of the server's policy decision (UX only: the server decides). */
export function clientDecision(name: string): { ok: true } | { ok: false; reason: string } {
  const view = usePolicyView.getState().view
  if (!view) return { ok: true }
  const module = view.modules.find((m) => m.names.includes(name) || m.prefixes.some((p) => name.startsWith(p)))
  if (!module) return { ok: false, reason: `“${name}” is not a platform operation.` }
  const level = view.policy.modules[module.id] ?? 'off'
  const cls = view.catalogue[name] ?? 'propose'
  if (level === 'off') return { ok: false, reason: `AI access to ${module.label} is off in Settings → AI and reasoning.` }
  if (level === 'read' && ['propose', 'export', 'external-generation'].includes(cls)) return { ok: false, reason: `AI access to ${module.label} is read only.` }
  if (view.policy.operations[cls] === false) return { ok: false, reason: `The operation class “${view.operationClasses.find((c) => c.id === cls)?.label ?? cls}” is off in Settings → AI and reasoning.` }
  return { ok: true }
}
