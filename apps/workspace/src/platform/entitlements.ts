import type { EntitlementId } from '@ews/platform-sdk'
import { create } from 'zustand'
import { getTool } from './registry'

/**
 * Subscriptions and entitlements.
 *
 * PROTOTYPE ONLY: this check runs in the browser, so it only shapes the user
 * interface. In production every backend operation and file access must check
 * the caller's entitlements and permissions on the server; the client cannot be
 * trusted to enforce them.
 */

export interface SubscriptionPlan {
  id: string
  name: string
  description: string
  entitlements: EntitlementId[]
}

export const PLANS: SubscriptionPlan[] = [
  { id: 'requirements', name: 'Requirements only', description: 'Requirements Management.', entitlements: ['tool:requirements'] },
  {
    id: 'requirements-sysml',
    name: 'Requirements and System Model',
    description: 'Requirements Management and System Model.',
    entitlements: ['tool:requirements', 'tool:sysml'],
  },
  {
    id: 'all',
    name: 'All tools',
    description: 'Requirements Management, System Model, CAD and Conceptualize.',
    entitlements: ['tool:requirements', 'tool:sysml', 'tool:cad', 'tool:conceptualize'],
  },
]

/** The service the platform asks; a real one would call the account backend. */
export interface EntitlementService {
  readonly plan: SubscriptionPlan
  has: (entitlement: EntitlementId) => boolean
}

const KEY = 'ews.subscription.v1'
const DEFAULT_PLAN = 'all'

function readPlanId(): string {
  try {
    const id = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return id && PLANS.some((p) => p.id === id) ? id : DEFAULT_PLAN
  } catch {
    return DEFAULT_PLAN
  }
}

interface EntitlementState extends EntitlementService {
  /** Demo control: switch the mock subscription (persisted, shared with other windows). */
  setPlan: (id: string) => void
  /** Rereads the plan changed in another window. */
  reload: () => void
}

const listeners = new Set<() => void>()

/** Called after this window changes the plan, so the host can notify its other windows. */
export function onPlanSaved(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const planOf = (id: string) => PLANS.find((p) => p.id === id) ?? PLANS[PLANS.length - 1]

/** Mock entitlement service (zustand store so the UI follows changes). */
export const useEntitlements = create<EntitlementState>()((set, get) => ({
  plan: planOf(readPlanId()),
  has: (entitlement) => get().plan.entitlements.includes(entitlement),
  setPlan: (id) => {
    set({ plan: planOf(id) })
    try {
      localStorage.setItem(KEY, id)
    } catch {
      // ignore: the plan applies to this window only
    }
    listeners.forEach((l) => l())
  },
  reload: () => set({ plan: planOf(readPlanId()) }),
}))

export type ToolAccess = { ok: true } | { ok: false; reason: string; code: 'unknown-tool' | 'not-entitled' }

/** Whether the current subscription can open a tool, with a user-facing explanation if not. */
export function toolAccess(toolId: string | null | undefined): ToolAccess {
  const tool = getTool(toolId)
  if (!tool) return { ok: false, code: 'unknown-tool', reason: `There is no tool “${toolId}” in this workspace.` }
  const { plan, has } = useEntitlements.getState()
  if (has(tool.entitlement)) return { ok: true }
  return {
    ok: false,
    code: 'not-entitled',
    reason: `${tool.name} is not included in your subscription (${plan.name}). Data created with it is kept and still appears in the product tree and inspector; nothing has been deleted.`,
  }
}

export function canOpenTool(toolId: string | null | undefined): boolean {
  return toolAccess(toolId).ok
}
