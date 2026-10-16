/** Errors of the visualization API (same body as the other platform services: `{ error: { code, message, details } }`). */
export class VisualizationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'VisualizationError'
  }
}

export const invalid = (message: string, fields?: Record<string, string>, status = 422) => new VisualizationError('invalid', message, status, fields ? { fields } : undefined)
export const notFound = (message: string) => new VisualizationError('not-found', message, 404)
export const forbidden = (message: string) => new VisualizationError('forbidden', message, 403)
export const conflict = (message: string, details?: Record<string, unknown>) => new VisualizationError('conflict', message, 409, details)

const KNOWN = new Set(['invalid', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'unavailable'])

/** Maps any error to a status and body. Internal failures never leak SQL, stacks or credentials. */
export function errorBody(error: unknown, errorId: string): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (error instanceof VisualizationError) return { status: error.status, body: { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } } }
  const e = error as { code?: unknown; status?: unknown; message?: string; details?: unknown; validation?: { instancePath?: string; message?: string; params?: Record<string, unknown> }[]; validationContext?: string; statusCode?: number }
  if (typeof e?.code === 'string' && KNOWN.has(e.code) && typeof e.status === 'number' && e.message) return { status: e.status, body: { error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } } }
  if (e?.validation) {
    const fields: Record<string, string> = {}
    for (const v of e.validation) {
      const path = (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.') || (v.params?.missingProperty as string) || (v.params?.additionalProperty as string) || e.validationContext || 'request'
      fields[path] = `${v.message ?? 'invalid'}${v.params?.additionalProperty ? ` (${v.params.additionalProperty})` : ''}`
    }
    return { status: 400, body: { error: { code: 'invalid', message: `The ${e.validationContext ?? 'request'} is not valid.`, details: { fields } } } }
  }
  if (e?.statusCode && e.statusCode >= 400 && e.statusCode < 500) return { status: e.statusCode, body: { error: { code: e.statusCode === 404 ? 'not-found' : 'invalid', message: e.statusCode === 413 ? 'The request is too large.' : (e.message ?? 'Bad request') } } }
  return { status: 500, body: { error: { code: 'unavailable', message: `Internal error (reference ${errorId}). The request was not completed.`, details: { reason: 'internal-error', errorId } } } }
}
