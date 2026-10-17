import { RESERVED_NAMES, type CommandCall } from '@ews/cad-core'
import type { AssistantActionContext, ConceptsService } from '@ews/platform-sdk'

/**
 * Concept → CAD handoff (visual concept exploration, concept-visualization-contracts.md §1).
 *
 * CAD reads Conceptualize's revision-pinned handoff package ('conceptualize.cad-handoff/1') and the
 * staleness of a concept revision through `ConceptHandoffPort`, taken from the SDK 1.9 members of
 * `ConceptsService` (getHandoff, revisionStaleness).
 */

export interface HandoffParameter {
  id: string
  symbol: string
  name: string
  value: number | null
  min: number | null
  max: number | null
  unit: string
  basis: string
  componentId: string | null
  constraintId: string | null
}

export interface HandoffPackage {
  schema: 'conceptualize.cad-handoff/1'
  concept: { id: string; key: string; name: string; revision: number }
  intent?: string
  components?: { id: string; name: string; kind: string; basis?: string }[]
  interfaces?: { id: string; name: string; kind?: string; between?: string[]; parameterIds: string[] }[]
  parameters?: HandoffParameter[]
  envelopes?: { componentId: string; shape: string; width: { value: number | null; unit: string; parameterId: string | null; basis: string }; height: { value: number | null; unit: string; parameterId: string | null; basis: string } }[]
  constraints?: { id: string; key: string; revision: number; statement: string }[]
  requirements?: { relation: string; artifact: unknown; coverage?: string; constraintId?: string }[]
  decisions?: { id: string; key: string; title: string; status: string }[]
  unresolved: { kind: string; text: string; ref: string | null }[]
}

export interface ConceptHandoff {
  id: string
  key: string
  projectId: string
  conceptId: string
  conceptRevision: number
  package: HandoffPackage
}

export interface ConceptRevisionStaleness {
  outdated: boolean
  currentConceptRevision: number
  changes: { area: string; id: string; change: string; label: string }[]
}

export interface ConceptHandoffPort {
  getHandoff(id: string, scope: { projectId: string }): Promise<ConceptHandoff | undefined>
  revisionStaleness(conceptId: string, revision: number, scope: { projectId: string; purpose?: 'downstream' | 'handoff' }): Promise<ConceptRevisionStaleness | undefined>
}

/** The SDK 1.9 members of `ConceptsService`, or undefined when the host does not provide them. */
export function handoffPort(services: { concepts?: ConceptsService } | undefined): ConceptHandoffPort | undefined {
  const c = services?.concepts
  if (c?.getHandoff && c.revisionStaleness) {
    return { getHandoff: c.getHandoff.bind(c) as ConceptHandoffPort['getHandoff'], revisionStaleness: c.revisionStaleness.bind(c) as ConceptHandoffPort['revisionStaleness'] }
  }
  return undefined
}
export const portOf = (ctx: AssistantActionContext) => handoffPort(ctx.services)

// ---- mapping -------------------------------------------------------------------------------------------------

export interface HandoffGap {
  kind: string
  text: string
  ref: string | null
  /** 'handoff': listed by Conceptualize; 'mapping': found while mapping the package to CAD. */
  source: 'handoff' | 'mapping'
}

const LENGTH = new Set(['mm', 'cm', 'm', 'in', 'ft'])
const ANGLE = new Set(['deg', 'rad', '°'])
const COUNT = new Set(['', '1', 'count', 'none', '-', 'pcs'])

/** CAD parameter name for a handoff symbol: letters, digits and underscore, starting with a letter. */
export function parameterName(symbol: string, taken: Set<string>): string {
  let n = symbol.normalize('NFKD').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (!/^[A-Za-z]/.test(n)) n = `p_${n}`
  if (RESERVED_NAMES.has(n) || RESERVED_NAMES.has(n.toLowerCase())) n = `${n}_p`
  n = n.slice(0, 60) || 'p'
  let out = n
  for (let i = 2; taken.has(out); i++) out = `${n}_${i}`
  taken.add(out)
  return out
}

export interface HandoffMapping {
  commands: CommandCall[]
  parameters: { handoffId: string; symbol: string; name: string; expression: string; unit: 'mm' | 'deg' | 'none'; constraint?: { id: string; key: string; revision: number }; basis: string }[]
  gaps: HandoffGap[]
  title: string
  partName: string
}

/**
 * Commands that start a part from the handoff: one part, the parameters that have a nominal value in a length,
 * angle or count unit (bound to their constraint at the revision in the package), the source concept and handoff,
 * and a "realizes" reference to the concept. Geometry is not invented: features are left to modelling, and
 * everything that cannot be mapped is a gap.
 */
export function mapHandoff(h: ConceptHandoff, options: { title?: string; partName?: string } = {}): HandoffMapping {
  const pkg = h.package
  const gaps: HandoffGap[] = pkg.unresolved.map((u) => ({ ...u, source: 'handoff' as const }))
  const constraints = new Map((pkg.constraints ?? []).map((c) => [c.id, c]))
  const taken = new Set<string>()
  const title = options.title ?? `${pkg.concept.key} ${pkg.concept.name}`
  const partName = options.partName ?? (pkg.components?.find((c) => c.kind === 'part')?.name ?? pkg.concept.name)
  const commands: CommandCall[] = [
    { command: 'create_part', input: { name: partName, ref: '$part' } },
    { command: 'set_document_source', input: { conceptId: h.conceptId, revision: h.conceptRevision, label: `${pkg.concept.key} ${pkg.concept.name}`, handoff: { id: h.id, revision: 1 } } },
    { command: 'add_reference', input: { subject: '$part', role: 'realizes', target: { module: 'conceptualize', kind: 'concept', id: h.conceptId, revision: h.conceptRevision, label: `${pkg.concept.key} ${pkg.concept.name}` } } },
  ]
  const parameters: HandoffMapping['parameters'] = []
  for (const p of pkg.parameters ?? []) {
    const unit = (p.unit ?? '').trim()
    const kind: 'mm' | 'deg' | 'none' | undefined = LENGTH.has(unit) ? 'mm' : ANGLE.has(unit) ? 'deg' : COUNT.has(unit) ? 'none' : undefined
    if (p.value === null || p.value === undefined) {
      // Conceptualize lists ranges without a nominal value already; add it only when it did not.
      if (!gaps.some((g) => g.ref === p.id)) gaps.push({ kind: 'parameter-range', text: `${p.symbol} (${p.name}) has no nominal value (${p.min ?? '…'}–${p.max ?? '…'} ${unit}); it was not created.`, ref: p.id, source: 'mapping' })
      continue
    }
    if (!kind) {
      gaps.push({ kind: 'unsupported-unit', text: `${p.symbol} (${p.name}) is ${p.value} ${unit}; CAD parameters are lengths, angles or counts, so it was not created. Use it in a check or as a material property instead.`, ref: p.id, source: 'mapping' })
      continue
    }
    const name = parameterName(p.symbol || p.name, taken)
    const expression = kind === 'none' ? String(p.value) : unit === 'mm' || unit === 'deg' ? String(p.value) : `${p.value} ${unit === '°' ? 'deg' : unit}`
    const entry: HandoffMapping['parameters'][number] = { handoffId: p.id, symbol: p.symbol, name, expression, unit: kind, basis: p.basis }
    commands.push({ command: 'create_parameter', input: { partId: '$part', name, expression, unit: kind, description: `${p.name} (from ${h.key}; basis ${p.basis})` } })
    if (p.constraintId) {
      const c = constraints.get(p.constraintId)
      if (c) {
        entry.constraint = { id: c.id, key: c.key, revision: c.revision }
        commands.push({ command: 'bind_parameter', input: { partId: '$part', name, ref: { module: 'conceptualize', kind: 'constraint', id: c.id, revision: c.revision }, quantity: p.name } })
      } else gaps.push({ kind: 'unbound-constraint', text: `${p.symbol} refers to constraint ${p.constraintId}, which is not in the handoff; the parameter is not bound.`, ref: p.id, source: 'mapping' })
    }
    parameters.push(entry)
  }
  if (!(pkg.parameters ?? []).length && !gaps.some((g) => g.kind === 'missing-definition')) gaps.push({ kind: 'missing-definition', text: 'The handoff has no parameters.', ref: null, source: 'mapping' })
  for (const f of pkg.interfaces ?? []) gaps.push({ kind: 'interface-to-model', text: `Interface ${f.id} ${f.name}${f.parameterIds.length ? ` (parameters ${f.parameterIds.map((id) => parameters.find((x) => x.handoffId === id)?.name ?? id).join(', ')})` : ''} has no geometry yet: model it and mark the face as a named interface.`, ref: f.id, source: 'mapping' })
  if (!(pkg.components ?? []).length) gaps.push({ kind: 'missing-definition', text: 'No components are defined.', ref: null, source: 'mapping' })
  else if ((pkg.components ?? []).length > 1) gaps.push({ kind: 'multiple-components', text: `The concept has ${pkg.components!.length} components; this document models ${partName}. Start other parts separately (assemblies are not available).`, ref: null, source: 'mapping' })
  return { commands, parameters, gaps, title, partName }
}
