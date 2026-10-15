/** Error codes and HTTP statuses of the SysML API (same conventions as the other platform services). */
export type SysmlErrorCode = 'invalid' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'unavailable' | 'rejected'

export const STATUS_OF: Record<SysmlErrorCode, number> = {
  invalid: 422,
  rejected: 422,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  unavailable: 503,
}

export class SysmlServiceError extends Error {
  readonly status: number
  constructor(
    readonly code: SysmlErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    status?: number,
  ) {
    super(message)
    this.name = 'SysmlServiceError'
    this.status = status ?? STATUS_OF[code]
  }
}

export const invalid = (message: string, details?: Record<string, unknown>, status = 422) => new SysmlServiceError('invalid', message, details, status)
export const notFound = (message: string) => new SysmlServiceError('not-found', message)
export const forbidden = (message: string) => new SysmlServiceError('forbidden', message)
export const conflict = (message: string, details?: Record<string, unknown>) => new SysmlServiceError('conflict', message, details)

const KNOWN = new Set(Object.keys(STATUS_OF))

/** Maps any error to `{ error: { code, message, details } }`. Internal failures never leak SQL or stacks. */
export function errorBody(error: unknown, errorId: string): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (error instanceof SysmlServiceError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } }
  // Errors of the host's identity functions (they carry a known code and an HTTP status).
  const e = error as { code?: unknown; status?: unknown; message?: string; details?: unknown; validation?: { instancePath?: string; message?: string; params?: Record<string, unknown> }[]; validationContext?: string; statusCode?: number }
  if (typeof e?.code === 'string' && KNOWN.has(e.code) && typeof e.status === 'number' && e.message) {
    return { status: e.status, body: { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } } }
  }
  if (e?.validation) {
    const fields: Record<string, string> = {}
    for (const v of e.validation) {
      const path = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.') || (v.params?.missingProperty as string) || (v.params?.additionalProperty as string) || e.validationContext || 'request'
      fields[path] = `${v.message ?? 'invalid'}${v.params?.additionalProperty ? ` (${v.params.additionalProperty})` : ''}`
    }
    return { status: 400, body: { error: { code: 'invalid', message: `The ${e.validationContext ?? 'request'} is not valid.`, details: { fields } } } }
  }
  if (e?.statusCode && e.statusCode >= 400 && e.statusCode < 500) return { status: e.statusCode, body: { error: { code: e.statusCode === 404 ? 'not-found' : 'invalid', message: e.message ?? 'Bad request' } } }
  return { status: 500, body: { error: { code: 'unavailable', message: `Internal error (reference ${errorId}). The request was not completed; a write was rolled back.`, details: { reason: 'internal-error', errorId } } } }
}
