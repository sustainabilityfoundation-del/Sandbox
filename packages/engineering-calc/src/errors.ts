/** Structured engine errors. Codes map to the reasoning tool error codes (ai-tools.md §2). */
export type CalcErrorCode =
  | 'grammar' // expression outside ews-expr/1
  | 'limit' // size or enumeration limit exceeded
  | 'unit-error' // unknown unit, offset temperature, currency, dimension mismatch
  | 'model' // inconsistent model definition (undeclared symbol, cyclic assignments, …)
  | 'input' // missing or invalid input value
  | 'domain-error' // non-finite result (division by zero, sqrt of a negative number, …)

export class CalcError extends Error {
  constructor(
    readonly code: CalcErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'CalcError'
  }
}
