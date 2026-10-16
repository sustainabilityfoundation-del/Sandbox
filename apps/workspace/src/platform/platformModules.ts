import type { EntitlementId, PlatformModuleContribution } from '@ews/platform-sdk'
import { useEntitlements } from './entitlements'
import { getTool } from './registry'

/**
 * Headless platform modules (SDK 1.8, CR-PM-WS-2 / design reasoning CR-A2): modules without a tool view,
 * such as Project Management (`projects.*`) and design reasoning (`reasoning.*`), register their assistant
 * operations, help and settings here. The assistant (`assistantContributions()`), the Help Service and the
 * Settings centre read them exactly like tool contributions; nothing is rendered for them.
 *
 * Subscription checks here are UX only, like tools; the module services and the assistant service enforce
 * entitlements and permissions on the server.
 */

const modules: PlatformModuleContribution[] = []
const listeners = new Set<() => void>()

export function registerPlatformModule(module: PlatformModuleContribution): void {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(module.id)) throw new Error(`Invalid platform module ID "${module.id}".`)
  if (modules.some((m) => m.id === module.id) || getTool(module.id)) throw new Error(`A tool or platform module "${module.id}" is already registered.`)
  const bad = module.assistant?.actions.find((a) => !a.name.startsWith(`${module.id}.`))
  if (bad) throw new Error(`Assistant action "${bad.name}" must be prefixed with "${module.id}."`)
  modules.push(module)
  listeners.forEach((l) => l())
}

export function getPlatformModules(): readonly PlatformModuleContribution[] {
  return modules
}

/** Called when a module registers (registrations normally happen at startup). */
export function onPlatformModulesChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the (demo) subscription includes a module; modules without an entitlement are always included. */
export function platformModuleIncluded(module: PlatformModuleContribution): boolean {
  return !module.entitlement || useEntitlements.getState().has(module.entitlement as EntitlementId)
}

/** Test helper: forget registrations. */
export function resetPlatformModules(): void {
  modules.length = 0
  listeners.forEach((l) => l())
}
