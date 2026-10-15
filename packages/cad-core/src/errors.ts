/** Structured error codes shared by commands, queries, regeneration and the kernel adapter. */
export const CAD_ERROR_CODES = [
  'invalid-input',
  'unknown-command',
  'not-found',
  'precondition-failed',
  'version-conflict',
  'invalid-expression',
  'cycle',
  'in-use',
  'unsupported',
  'invalid-document',
  'nothing-to-undo',
  'nothing-to-redo',
  'kernel-unavailable',
  'kernel-failure',
  'regeneration-failed',
] as const

export type CadErrorCode = (typeof CAD_ERROR_CODES)[number]

export class CadError extends Error {
  readonly code: CadErrorCode
  readonly details?: Record<string, unknown>
  constructor(code: CadErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CadError'
    this.code = code
    this.details = details
  }

  toJSON(): CadErrorInfo {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) }
  }
}

export interface CadErrorInfo {
  code: CadErrorCode | string
  message: string
  details?: Record<string, unknown>
}

export function toErrorInfo(error: unknown): CadErrorInfo {
  if (error instanceof CadError) return error.toJSON()
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const e = error as { code: unknown; message: unknown; details?: unknown }
    return { code: String(e.code), message: String(e.message), ...(e.details && typeof e.details === 'object' ? { details: e.details as Record<string, unknown> } : {}) }
  }
  return { code: 'kernel-failure', message: error instanceof Error ? error.message : String(error) }
}
