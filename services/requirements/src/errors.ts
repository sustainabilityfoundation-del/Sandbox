import type { RequirementsErrorCode } from '@ews/platform-sdk'

/** HTTP status per error code (contracts §5). 422 is used for semantic validation, 400 for malformed requests. */
export const STATUS_OF: Record<RequirementsErrorCode, number> = {
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

/** A well-understood failure, mapped one-to-one to `{ error: { code, message, details } }` and RequirementsServiceError. */
export class ServiceError extends Error {
  readonly status: number
  constructor(
    readonly code: RequirementsErrorCode,
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
