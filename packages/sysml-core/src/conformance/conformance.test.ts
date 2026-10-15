import { describe, expect, it } from 'vitest'
import { fromJson, modelToJson } from '../model/json'
import { Model } from '../model/model'
import { platformLibrary } from '../library/library'
import { serialize } from '../syntax/serializer'
import { loadText } from '../syntax/text'
import { validate } from '../validation/validate'
import { canonicalForm } from './canonical'
import { CONFORMANCE_CASES } from './cases'
import { ACTUATOR_EXAMPLE } from '../examples/actuator'

/** Conformance of the supported subset: every case parses, resolves, validates, and round-trips. */

const metaclasses = (m: Model) => new Set([...m.elements()].map((e) => e['@type']))

describe('conformance corpus (supported subset)', () => {
  for (const c of CONFORMANCE_CASES.filter((x) => x.supported)) {
    it(`${c.id}: ${c.construct}`, () => {
      const r = loadText(c.text)
      expect(r.diagnostics).toEqual([])
      const types = metaclasses(r.model)
      for (const p of c.produces ?? []) expect({ case: c.id, missing: p, present: types.has(p) }).toEqual({ case: c.id, missing: p, present: true })
      expect(validate(r.model).filter((d) => d.severity === 'error')).toEqual([])
      // Text round trip: semantically equal, and serialization is a fixed point.
      const text = serialize(r.model)
      const again = loadText(text)
      expect(again.diagnostics).toEqual([])
      expect(canonicalForm(again.model)).toEqual(canonicalForm(r.model))
      expect(serialize(again.model)).toBe(text)
      // JSON round trip.
      const json = modelToJson(r.model)
      const back = new Model({ library: platformLibrary(), rootId: r.model.rootId, elements: json.map(fromJson) })
      expect(canonicalForm(back)).toEqual(canonicalForm(r.model))
    })
  }
})

describe('conformance corpus (unsupported constructs are reported, never dropped silently)', () => {
  for (const c of CONFORMANCE_CASES.filter((x) => !x.supported)) {
    it(`${c.id}: ${c.construct}`, () => {
      const r = loadText(c.text)
      expect(r.diagnostics.some((d) => d.ruleId === 'SYSML-SYNTAX-UNSUPPORTED' && d.severity === 'error')).toBe(true)
    })
  }
})

describe('multidisciplinary example', () => {
  it('parses, resolves and validates without errors, and round-trips (text and JSON)', () => {
    const r = loadText(ACTUATOR_EXAMPLE)
    expect(r.diagnostics).toEqual([])
    expect(validate(r.model).filter((d) => d.severity !== 'info')).toEqual([])
    const text = serialize(r.model)
    const again = loadText(text)
    expect(canonicalForm(again.model)).toEqual(canonicalForm(r.model))
    const back = new Model({ library: platformLibrary(), rootId: r.model.rootId, elements: modelToJson(r.model).map(fromJson) })
    expect(serialize(back)).toBe(text)
    expect(r.model.size).toBeGreaterThan(500)
  })
})
