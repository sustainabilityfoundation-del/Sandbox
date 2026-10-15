import type { CadErrorCode } from '../errors'
import type { JsonSchema } from '../model/jsonSchema'
import type { CadDocument } from '../model/types'

export type CommandCategory = 'document' | 'part' | 'parameter' | 'sketch' | 'constraint' | 'feature' | 'semantics' | 'reference'

/** What a command did, by entity ID. */
export interface Affected {
  created: string[]
  modified: string[]
  deleted: string[]
}

export interface CommandContext {
  /** Working copy; commands mutate it in place. The executor commits or discards it. */
  doc: CadDocument
  /** Next deterministic ID with a prefix ("sk" → "sk-12"). */
  newId: (prefix: string) => string
  created: (...ids: string[]) => void
  modified: (...ids: string[]) => void
  deleted: (...ids: string[]) => void
}

export interface CommandSpec<I = Record<string, unknown>> {
  name: string
  category: CommandCategory
  summary: string
  /** JSON Schema of the input (validated before preconditions). */
  input: JsonSchema
  /** What the command returns in `result`. */
  output: string
  /** Checked by the command; violations fail with `precondition-failed`, `not-found` or `in-use`. */
  preconditions: string[]
  errors: CadErrorCode[]
  /** Undo restores the document state before the transaction. */
  undo: string
  apply: (ctx: CommandContext, input: I) => Record<string, unknown>
}

export interface CommandCall {
  command: string
  input: Record<string, unknown>
}

export type CommandSource = 'user' | 'assistant' | 'script' | 'system'

export interface Transaction {
  commands: CommandCall[]
  /** Fails with `version-conflict` when the document version differs. */
  expectedVersion?: number
  label?: string
  source?: CommandSource
}
