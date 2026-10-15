import { describe, expect, it } from 'vitest'
import { ENGINEERING_LIBRARY, evaluateModel, libraryModel, validateModel, verifyManifest } from './index'

/** Independent recomputation of each library relation in SI, written separately from the definitions. */
const INDEPENDENT: Record<string, (i: Record<string, number>) => Record<string, number>> = {
  'lib.column.euler-round': ({ E, d, L, K, Sy }) => {
    const I = (Math.PI * d ** 4) / 64
    return { I, P_cr: (Math.PI ** 2 * E * I) / (K * L) ** 2, lambda: (K * L) / (d / 4), lambda_1: Math.sqrt((2 * Math.PI ** 2 * E) / Sy) }
  },
  'lib.beam.cantilever-end-load-rect': ({ F, L, E, b, h }) => {
    const I = (b * h ** 3) / 12
    return { I, delta: (F * L ** 3) / (3 * E * I), sigma: (F * L * (h / 2)) / I }
  },
  'lib.beam.simply-supported-center-load-rect': ({ F, L, E, b, h }) => {
    const I = (b * h ** 3) / 12
    return { I, delta: (F * L ** 3) / (48 * E * I), sigma: (((F * L) / 4) * (h / 2)) / I }
  },
  'lib.fastener.bolt-preload-torque': ({ T, K, d, P }) => {
    const F_i = T / (K * d)
    const d2d3 = d - 0.9382 * P
    const A_t = (Math.PI * d2d3 * d2d3) / 4
    return { F_i, A_t, sigma_i: F_i / A_t }
  },
  'lib.drive.motor-torque-power': ({ T, n, eta }) => {
    const omega = n * 2 * Math.PI // n in rev/s
    return { omega, P: T * omega, P_in: (T * omega) / eta }
  },
  'lib.drive.screw-lead-speed-force': ({ n, l, T, eta }) => ({ v: n * l, F: (eta * T * 2 * Math.PI) / l }),
}

const SI: Record<string, number> = { kN: 1e3, N: 1, GPa: 1e9, MPa: 1e6, mm: 1e-3, '-': 1, 'N*m': 1, rpm: 1 / 60, W: 1, 'mm^4': 1e-12, 'mm^2': 1e-6, 'rad/s': 1, 'mm/s': 1e-3 }

describe('engineering relations library', () => {
  it('has the requested relations', () => {
    expect(ENGINEERING_LIBRARY.map((e) => e.id)).toEqual([
      'lib.column.euler-round',
      'lib.beam.cantilever-end-load-rect',
      'lib.beam.simply-supported-center-load-rect',
      'lib.fastener.bolt-preload-torque',
      'lib.drive.motor-torque-power',
      'lib.drive.screw-lead-speed-force',
    ])
  })

  for (const entry of ENGINEERING_LIBRARY) {
    describe(entry.title, () => {
      it('is dimensionally consistent, has validity conditions, sources and an honest review status', () => {
        expect(validateModel(entry.definition)).toEqual([])
        expect(entry.definition.validity?.conditions.length).toBeGreaterThan(0)
        expect(entry.sources.length).toBeGreaterThan(0)
        expect(entry.review).toMatchObject({ status: 'agent-checked', engineeringReview: 'required' })
        expect(entry.definition).toMatchObject({ basis: 'ai-hypothesis', validationStatus: 'unvalidated' })
      })

      for (const c of entry.referenceCases) {
        it(`reference case: ${c.title}`, () => {
          const r = evaluateModel(entry.definition, c.inputs)
          for (const [s, e] of Object.entries(c.expected)) {
            expect(r.outputs[s].unit).toBe(e.unit)
            expect(Math.abs(r.outputs[s].value - e.value) / Math.abs(e.value)).toBeLessThan(c.relativeTolerance)
          }
          for (const [id, ok] of Object.entries(c.checks ?? {})) expect(r.checks.find((x) => x.relationId === id)!.satisfied).toBe(ok)
          expect(r.validity.satisfied).toBe(true)
          // Agent-authored and not engineering-reviewed: results are estimates (ADR-0043).
          expect(r.basis).toBe('estimate')
          expect(verifyManifest(entry.definition, r.manifest).ok).toBe(true)
        })

        it(`independent recomputation agrees: ${c.title}`, () => {
          const si = Object.fromEntries(Object.entries(c.inputs).map(([k, q]) => [k, q.value * SI[q.unit]]))
          const independent = INDEPENDENT[entry.id](si)
          const r = evaluateModel(entry.definition, c.inputs)
          for (const [s, v] of Object.entries(independent)) {
            const out = r.outputs[s]
            expect(Math.abs(out.value * SI[out.unit] - v) / Math.abs(v)).toBeLessThan(1e-12)
          }
        })
      }
    })
  }

  it('gives calculated results once a person has validated the model', () => {
    const entry = ENGINEERING_LIBRARY[0]
    const validated = { ...libraryModel(entry.id, { id: 'calc-1' }), basis: 'user-assertion' as const, validationStatus: 'validated' as const }
    const inputs = Object.fromEntries(Object.entries(entry.referenceCases[0].inputs).map(([k, q]) => [k, { ...q, source: { kind: 'literal' as const, basis: 'assumption' as const } }]))
    expect(evaluateModel(validated, inputs).basis).toBe('calculated')
  })

  it('returns independent copies', () => {
    const a = libraryModel('lib.drive.motor-torque-power')
    a.relations[0].expression = 'omega = n'
    expect(libraryModel('lib.drive.motor-torque-power').relations[0].expression).toBe('omega = 2 * pi * n')
    expect(() => libraryModel('lib.nope')).toThrow(/Available/)
  })
})
