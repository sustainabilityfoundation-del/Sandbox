/**
 * Error taxonomy of the calculation engine (mathematics.md §7a). Every failure is a CalcError with one of
 * these codes; callers map them to tool error codes (ai-tools.md §2) through `ERROR_TAXONOMY`.
 */
export type CalcErrorCode =
  | 'grammar' // expression outside ews-expr/1
  | 'model' // inconsistent model definition (undeclared symbol, cyclic or missing assignments …)
  | 'unit-error' // unknown unit, offset temperature, currency, dimension mismatch
  | 'input' // missing, extra or non-finite input value
  | 'domain-error' // non-finite result: division by zero, sqrt or log of a negative range …
  | 'limit' // a static size limit: expression length, AST nodes, ranged inputs, inlined size
  | 'timeout' // evaluation exceeded its time budget (cooperative deadline or worker termination)
  | 'resource-limit' // operation budget or worker memory limit exceeded
  | 'unsupported-version' // manifest or grammar version this engine cannot read
  | 'internal' // a defect in the engine; never caused by the input

export interface CalcErrorDetails {
  where?: string
  relationId?: string
  symbol?: string
  limit?: number
  problems?: { where: string; code: CalcErrorCode; message: string }[]
  [key: string]: unknown
}

export interface ErrorClass {
  meaning: string
  /** Whether repeating the same request can succeed (only for transient resource conditions). */
  retryable: boolean
  /** Who has to act: the model author, the caller supplying inputs, or the operator. */
  fix: 'model-author' | 'caller' | 'operator' | 'engine-maintainer'
  /** Reasoning tool error code (ai-tools.md §2). */
  toolCode: 'invalid-input' | 'unit-error' | 'domain-error' | 'timeout' | 'resource-limit' | 'not-implemented' | 'internal'
}

export const ERROR_TAXONOMY: Record<CalcErrorCode, ErrorClass> = {
  grammar: { meaning: 'The expression uses syntax outside ews-expr/1', retryable: false, fix: 'model-author', toolCode: 'invalid-input' },
  model: { meaning: 'The model definition is inconsistent', retryable: false, fix: 'model-author', toolCode: 'invalid-input' },
  'unit-error': { meaning: 'Units are unknown, unsupported or dimensionally inconsistent', retryable: false, fix: 'model-author', toolCode: 'unit-error' },
  input: { meaning: 'An input value is missing, not allowed or not finite', retryable: false, fix: 'caller', toolCode: 'invalid-input' },
  'domain-error': { meaning: 'The inputs lie outside the mathematical domain of a relation', retryable: false, fix: 'caller', toolCode: 'domain-error' },
  limit: { meaning: 'A static size limit was exceeded', retryable: false, fix: 'model-author', toolCode: 'resource-limit' },
  timeout: { meaning: 'The evaluation did not finish within its time budget', retryable: true, fix: 'operator', toolCode: 'timeout' },
  'resource-limit': { meaning: 'The operation budget or the memory limit was exceeded', retryable: true, fix: 'operator', toolCode: 'resource-limit' },
  'unsupported-version': { meaning: 'The manifest or grammar version is not supported by this engine', retryable: false, fix: 'engine-maintainer', toolCode: 'not-implemented' },
  internal: { meaning: 'A defect in the engine', retryable: false, fix: 'engine-maintainer', toolCode: 'internal' },
}

export class CalcError extends Error {
  constructor(
    readonly code: CalcErrorCode,
    message: string,
    readonly details?: CalcErrorDetails,
  ) {
    super(message)
    this.name = 'CalcError'
  }

  get retryable(): boolean {
    return ERROR_TAXONOMY[this.code].retryable
  }

  /** Plain data for transport (worker messages, HTTP bodies). */
  toJSON(): { code: CalcErrorCode; message: string; details?: CalcErrorDetails; retryable: boolean } {
    return { code: this.code, message: this.message, details: this.details, retryable: this.retryable }
  }

  static fromJSON(data: { code: CalcErrorCode; message: string; details?: CalcErrorDetails }): CalcError {
    return new CalcError(ERROR_TAXONOMY[data.code] ? data.code : 'internal', data.message, data.details)
  }
}

/** Wraps an unexpected exception as an `internal` error, keeping CalcErrors as they are. */
export function asCalcError(e: unknown): CalcError {
  if (e instanceof CalcError) return e
  return new CalcError('internal', `Unexpected engine failure: ${e instanceof Error ? e.message : String(e)}`)
}
