import type { ConceptsErrorCode } from '@ews/platform-sdk'

/** HTTP status per error code (same conventions as Requirements contracts §5). */
export const STATUS_OF: Record<ConceptsErrorCode, number> = {
  invalid: 422,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  unavailable: 503,
}

export interface ErrorDetails {
  currentRevision?: number
  fields?: Record<string, string>
  [key: string]: unknown
}

/** A well-understood failure, mapped one-to-one to `{ error: { code, message, details } }` and ConceptsServiceError. */
export class ServiceError extends Error {
  readonly status: number
  constructor(
    readonly code: ConceptsErrorCode,
    message: string,
    readonly details?: ErrorDetails,
    status?: number,
  ) {
    super(message)
    this.name = 'ServiceError'
    this.status = status ?? STATUS_OF[code]
  }
}

export const invalid = (message: string, fields?: Record<string, string>, status = 422) => new ServiceError('invalid', message, fields ? { fields } : undefined, status)
export const notFound = (message: string) => new ServiceError('not-found', message)
export const forbidden = (message: string) => new ServiceError('forbidden', message)
export const conflict = (message: string, currentRevision?: number, extra: ErrorDetails = {}) =>
  new ServiceError('conflict', message, { ...extra, ...(currentRevision !== undefined ? { currentRevision } : {}) })
