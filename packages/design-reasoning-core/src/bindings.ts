import { isQuantity } from '@ews/platform-sdk'
import type { Basis, InputValue } from '@ews/engineering-calc'
import type { CalculationModelRecord, ConceptualizeKnowledgeApi, Quantity, RequestContext } from './contract/conceptualize'
import { isDesignRef, refKey } from './refs'
import type { ContextManifestItem } from './runs'
import { twinObject, type TwinSnapshot } from './sources'

/**
 * Resolves a calculation model's input bindings (mathematics.md §2, `defaultBinding`) to engine inputs:
 * assumption quantities, constraint bounds, concept attributes and twin properties (client-attested).
 * `overrides` replaces the value of a bound record (by refKey) for hypothetical changes; nothing is written.
 */
export interface ResolvedInputs {
  inputs: Record<string, InputValue>
  items: ContextManifestItem[]
  warnings: string[]
}

export class BindingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BindingError'
  }
}

export async function resolveInputs(
  model: CalculationModelRecord,
  deps: { knowledge: ConceptualizeKnowledgeApi; ctx: RequestContext; twin?: TwinSnapshot },
  options: { overrides?: Map<string, Quantity>; symbols?: Record<string, InputValue> } = {},
): Promise<ResolvedInputs> {
  const inputs: Record<string, InputValue> = {}
  const items: ContextManifestItem[] = []
  const warnings: string[] = []
  const adapter = deps.knowledge.mode === 'test-adapter' ? ('test-adapter' as const) : undefined

  for (const p of model.parameters) {
    if (p.role !== 'input' && p.role !== 'design-variable') continue
    const direct = options.symbols?.[p.symbol]
    if (direct) {
      inputs[p.symbol] = direct
      continue
    }
    const binding = p.defaultBinding
    if (!binding) throw new BindingError(`Input ${p.symbol} (${p.name}) has no binding and no value was given.`)
    const ref = binding.ref
    const override = options.overrides?.get(refKey(ref))
    let quantity: Quantity | undefined
    let basis: Basis = 'user-assertion'
    let revision: number | undefined
    let via: string | undefined

    if (isDesignRef(ref)) {
      if (ref.type === 'assumption') {
        const a = await deps.knowledge.get('assumption', ref.id, deps.ctx)
        if (!a) throw new BindingError(`Assumption ${ref.id} bound to ${p.symbol} does not exist.`)
        if (a.validationStatus === 'invalidated') warnings.push(`${a.key} is invalidated but still bound to ${p.symbol}.`)
        quantity = a.quantity
        basis = a.basis
        revision = a.revision
      } else if (ref.type === 'constraint') {
        const c = await deps.knowledge.get('constraint', ref.id, deps.ctx)
        if (!c) throw new BindingError(`Constraint ${ref.id} bound to ${p.symbol} does not exist.`)
        quantity = c.bound?.quantity
        basis = c.source.kind === 'stated' ? c.source.basis : 'user-assertion'
        revision = c.revision
      } else if (ref.type === 'concept') {
        const c = await deps.knowledge.get('concept', ref.id, deps.ctx)
        const attr = c?.attributes[binding.property]
        if (!attr) throw new BindingError(`Concept ${ref.id} has no attribute ${binding.property} for ${p.symbol}.`)
        quantity = attr
        basis = attr.basis
        revision = c!.revision
      } else {
        throw new BindingError(`Bindings to ${ref.type} records are not supported.`)
      }
      items.push({ ref: { ...ref, revision }, revision: revision ?? null, via: 'graph', adapter, fields: [binding.property] })
    } else if (ref.module === 'twin' || ref.module === 'cad' || ref.module === 'sysml') {
      const o = twinObject(deps.twin, ref.id)
      if (!o) throw new BindingError(`${ref.module}:${ref.id} is not in the client-attested twin snapshot.`)
      const value = o.properties[binding.property]
      if (!isQuantity(value)) throw new BindingError(`${ref.id}.${binding.property} is not a quantity.`)
      quantity = { value: value.value, unit: value.unit }
      revision = o.revision
      via = 'client-attested'
      if (ref.revision !== undefined && ref.revision !== o.revision) warnings.push(`${ref.id} is bound at revision ${ref.revision}; the current revision ${o.revision} is used.`)
      items.push({ ref: { ...ref, revision: o.revision }, revision: o.revision, via: 'client-attested', fields: [binding.property] })
    } else {
      throw new BindingError(`Bindings to ${ref.module} artifacts are not supported.`)
    }

    if (override) {
      quantity = override
      warnings.push(`${p.symbol}: hypothetical value ${override.value ?? `${override.min}–${override.max}`} ${override.unit} (not written).`)
    }
    if (!quantity) throw new BindingError(`The record bound to ${p.symbol} has no quantity.`)
    inputs[p.symbol] = {
      value: quantity.value,
      min: quantity.min,
      max: quantity.max,
      unit: quantity.unit,
      source: { kind: 'binding', ref: { module: ref.module, type: isDesignRef(ref) ? ref.type : ref.kind, id: ref.id, revision }, property: binding.property, revision, via, basis },
    }
  }
  return { inputs, items, warnings }
}
