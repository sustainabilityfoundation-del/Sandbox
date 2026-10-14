import type { RequirementsEvent, RequirementsService } from '@ews/platform-sdk'
import type { MyPermissions, RequirementsModuleClient } from '@ews/requirements-client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Data access for the Requirements tool in API mode: the module client, the caller's
 * permissions (UX gating only; the server enforces), and a version counter bumped by
 * committed-change events so views reread authoritative records.
 */
export interface ModuleData {
  client: RequirementsModuleClient
  service: RequirementsService
  projectId: string
  permissions: MyPermissions | null
  permissionsError: string | null
  /** Increments whenever a committed-change event arrives (or after this view's own writes). */
  version: number
  lastEvent: RequirementsEvent | null
  invalidate: () => void
  can: (permission: string) => boolean
}

const Ctx = createContext<ModuleData | null>(null)

export function ModuleDataProvider({ client, service, projectId, children }: { client: RequirementsModuleClient; service: RequirementsService; projectId: string; children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const [lastEvent, setLastEvent] = useState<RequirementsEvent | null>(null)
  const [permissions, setPermissions] = useState<MyPermissions | null>(null)
  const [permissionsError, setPermissionsError] = useState<string | null>(null)
  const invalidate = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    client.permissions().then(
      (p) => alive && (setPermissions(p), setPermissionsError(null)),
      (e) => alive && setPermissionsError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      alive = false
    }
  }, [client, version === 0])

  useEffect(() => {
    // Events are deduplicated by the adapter; each one makes visible data reload from the API.
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = service.subscribe(projectId, (e) => {
      setLastEvent(e)
      clearTimeout(timer)
      timer = setTimeout(() => setVersion((v) => v + 1), 120)
    })
    return () => {
      clearTimeout(timer)
      off()
    }
  }, [service, projectId])

  const value = useMemo<ModuleData>(
    () => ({ client, service, projectId, permissions, permissionsError, version, lastEvent, invalidate, can: (p) => !!permissions?.permissions.includes(p) }),
    [client, service, projectId, permissions, permissionsError, version, lastEvent, invalidate],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useModuleData(): ModuleData {
  const v = useContext(Ctx)
  if (!v) throw new Error('useModuleData outside ModuleDataProvider')
  return v
}

export interface Resource<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
}

/**
 * Loads data and reloads it when `deps` change or a committed-change event arrives. Previous data
 * stays visible while reloading; an error is shown, never replaced by other data.
 */
export function useResource<T>(load: (() => Promise<T>) | null, deps: unknown[]): Resource<T> {
  const { version } = useModuleData()
  const [state, setState] = useState<{ data: T | undefined; error: string | null; loading: boolean }>({ data: undefined, error: null, loading: !!load })
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const fn = loadRef.current
    if (!fn) {
      setState({ data: undefined, error: null, loading: false })
      return
    }
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e) => alive && setState((s) => ({ data: s.data, error: e instanceof Error ? e.message : String(e), loading: false })),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, nonce])
  return { ...state, reload: useCallback(() => setNonce((n) => n + 1), []) }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Details of an API error (code, current revision, field problems), if any. */
export function errorInfo(e: unknown): { code?: string; currentRevision?: number; fields?: Record<string, string>; message: string } {
  const err = e as { code?: string; details?: { currentRevision?: number; fields?: Record<string, string> }; message?: string }
  return { code: err?.code, currentRevision: err?.details?.currentRevision, fields: err?.details?.fields, message: errorMessage(e) }
}
