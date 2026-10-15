import { platformLibrary } from '../library/library'
import { Model } from '../model/model'
import type { Diagnostic } from '../validation/diagnostic'
import { Builder } from './build'
import { parse } from './parser'

export interface LoadTextResult {
  model: Model
  diagnostics: Diagnostic[]
  /** Top-level elements created from the text. */
  createdIds: string[]
  /** Every element created (for ranges and change sets). */
  allCreatedIds: string[]
  /** Source ranges by element ID. */
  ranges: Builder['ranges']
}

/**
 * Parses textual notation into a model (a new model on the platform library, or a working copy of
 * the given one), as members of `ownerId` (default: the root namespace). The given model is not
 * modified. Elements are created even when names do not resolve; callers decide (commands refuse).
 */
export function loadText(text: string, options: { model?: Model; ownerId?: string; library?: Model } = {}): LoadTextResult {
  const model = options.model ? options.model.clone() : new Model({ library: options.library ?? platformLibrary() })
  const parsed = parse(text)
  const diagnostics: Diagnostic[] = parsed.diagnostics.map((d) => ({ ruleId: d.ruleId, severity: d.severity, message: d.message, range: d.range, ...(d.construct ? { construct: d.construct } : {}) }))
  const builder = new Builder(model)
  const createdIds = builder.buildMembers(options.ownerId ?? model.rootId, parsed.model.members)
  for (const d of builder.resolve()) diagnostics.push({ ruleId: d.ruleId, severity: d.severity, message: d.message, range: d.range, elementId: d.elementId })
  return { model, diagnostics, createdIds, allCreatedIds: builder.created, ranges: builder.ranges }
}
