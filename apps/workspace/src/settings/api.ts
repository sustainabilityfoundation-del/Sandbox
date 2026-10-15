import { serviceSettings } from '../platform/services'

/**
 * Calls to the application backend for settings and the AI connection. The browser talks only to our
 * backend (proxied at /api) with the development identity; it never holds a provider credential: an API
 * key typed into the Connect form is sent once to /api/assistant/v1 and never stored or shown here.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Whether the backend is in use (Requirements service mode "API"); demo mode never contacts it. */
export const backendInUse = () => serviceSettings.requirementsMode === 'api'

export async function api<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<{ body: T; headers: Headers }> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: { 'X-Dev-User': serviceSettings.devUser, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ApiError(0, 'unreachable', 'The application backend is not reachable. Start it with npm run dev (or npm run dev:api).')
  }
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }
  if (!response.ok) {
    const err = (parsed as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined)?.error
    throw new ApiError(response.status, err?.code ?? `http-${response.status}`, err?.message ?? `The backend answered with HTTP ${response.status}.`, err?.details)
  }
  return { body: parsed as T, headers: response.headers }
}

export const SETTINGS_API = '/api/settings/v1'
export const ASSISTANT_API = '/api/assistant/v1'
