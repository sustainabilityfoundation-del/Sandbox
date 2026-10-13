import { createContext, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { PlatformHost } from '../contract/host'

const HostContext = createContext<PlatformHost | null>(null)

/** Provided once by the platform (workspace or harness) around everything that renders tools. */
export function PlatformHostProvider({ host, children }: { host: PlatformHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>
}

export function usePlatformHost(): PlatformHost {
  const host = useContext(HostContext)
  if (!host) throw new Error('No platform host. Render tools inside <PlatformHostProvider>.')
  return host
}

interface ToolScopeValue {
  toolId: string
  /** View instance: main pane, split pane, detached window or harness. */
  viewId: string
  /** Whether this view is visible (tools kept mounted in the background are not). */
  active: boolean
}

const ToolScopeContext = createContext<ToolScopeValue | null>(null)

/** Provided by the host around each tool view; binds the SDK hooks to that view instance. */
export function ToolScope({ toolId, viewId = toolId, active, children }: { toolId: string; viewId?: string; active: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ toolId, viewId, active }), [toolId, viewId, active])
  return <ToolScopeContext.Provider value={value}>{children}</ToolScopeContext.Provider>
}

export function useToolScope(): ToolScopeValue {
  const scope = useContext(ToolScopeContext)
  if (!scope) throw new Error('SDK hooks must be used inside a tool view.')
  return scope
}

/** The view instance, if rendered inside a tool view. */
export function useOptionalToolScope(): ToolScopeValue | null {
  return useContext(ToolScopeContext)
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  return (
    ka.length === kb.length &&
    ka.every((k) => {
      const va = (a as Record<string, unknown>)[k]
      const vb = (b as Record<string, unknown>)[k]
      return Object.is(va, vb) || (Array.isArray(va) && Array.isArray(vb) && shallowEqual(va, vb))
    })
  )
}

/**
 * Subscribes to a value derived from the host. The previous result is reused
 * while it is equal, so derived objects don't cause extra renders.
 */
export function useHostValue<T>(select: (host: PlatformHost) => T, isEqual: (a: T, b: T) => boolean = Object.is): T {
  const host = usePlatformHost()
  const cache = useRef<{ value: T } | null>(null)
  const getSnapshot = () => {
    const next = select(host)
    if (cache.current && isEqual(cache.current.value, next)) return cache.current.value
    cache.current = { value: next }
    return next
  }
  return useSyncExternalStore(host.subscribe, getSnapshot, getSnapshot)
}
