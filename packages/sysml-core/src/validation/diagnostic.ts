import type { Range } from '../syntax/lexer'

export type Severity = 'error' | 'warning' | 'info'

/** A problem found by parsing, name resolution or validation. */
export interface Diagnostic {
  /** Stable rule ID, e.g. SYSML-SYNTAX, SYSML-RESOLVE, SYSML-TYPING-KIND. */
  ruleId: string
  severity: Severity
  message: string
  /** The element the problem is about (absent for pure syntax errors). */
  elementId?: string
  /** Source range, when the problem comes from text. */
  range?: Range
  /** For unsupported constructs: the keyword. */
  construct?: string
}

/** A stable key for comparing diagnostics before and after a change. */
export function diagnosticKey(d: Diagnostic): string {
  return `${d.ruleId}|${d.elementId ?? ''}|${d.message}`
}
