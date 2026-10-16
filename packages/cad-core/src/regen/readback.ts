import type { GeometryKernel, ShapeAnalysis, Vec3 } from '../kernel'

/**
 * STEP read-back (demonstration D1): the exported file is imported again with the same kernel, and
 * its solid count, bounding box and volume are compared with the native model's bodies. This checks
 * that the exchange file carries the geometry. STEP holds geometry only; the native ews-cad model
 * keeps the feature history.
 */

export interface StepReadBack {
  ok: boolean
  tolerance: { length: number; volumeRelative: number }
  native: GeometrySummary
  imported: GeometrySummary
  differences: string[]
  kernel: { name: string; version: string }
}

export interface GeometrySummary {
  solids: number
  valid: boolean
  volume: number
  boundingBox: { min: Vec3; max: Vec3; size: Vec3 }
}

export const READBACK_TOLERANCE = { length: 1e-3, volumeRelative: 1e-6 }

export function summarise(analyses: ShapeAnalysis[]): GeometrySummary {
  const min: Vec3 = [0, 1, 2].map((k) => Math.min(...analyses.map((a) => a.boundingBox.min[k]))) as Vec3
  const max: Vec3 = [0, 1, 2].map((k) => Math.max(...analyses.map((a) => a.boundingBox.max[k]))) as Vec3
  return {
    solids: analyses.reduce((n, a) => n + a.counts.solids, 0),
    valid: analyses.every((a) => a.valid),
    volume: analyses.reduce((v, a) => v + a.volume, 0),
    boundingBox: { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] },
  }
}

/** Imports `text` and compares it with the native analyses; imported shapes are released afterwards. */
export async function readBackStep(kernel: GeometryKernel, text: string, nativeAnalyses: ShapeAnalysis[], tolerance = READBACK_TOLERANCE): Promise<StepReadBack> {
  const native = summarise(nativeAnalyses)
  const result = await kernel.importStep(text)
  try {
    const imported = result.analyses.length ? summarise(result.analyses) : { solids: 0, valid: false, volume: 0, boundingBox: { min: [0, 0, 0] as Vec3, max: [0, 0, 0] as Vec3, size: [0, 0, 0] as Vec3 } }
    const differences: string[] = []
    if (imported.solids !== native.solids) differences.push(`solid count ${imported.solids} instead of ${native.solids}`)
    if (!imported.valid) differences.push('the imported solid is not valid')
    const rel = Math.abs(imported.volume - native.volume) / Math.max(1e-12, Math.abs(native.volume))
    if (rel > tolerance.volumeRelative) differences.push(`volume ${imported.volume} mm³ instead of ${native.volume} mm³ (relative difference ${rel.toExponential(2)})`)
    for (const [k, axis] of ['x', 'y', 'z'].entries()) {
      for (const side of ['min', 'max'] as const) {
        const d = Math.abs(imported.boundingBox[side][k] - native.boundingBox[side][k])
        if (d > tolerance.length) differences.push(`bounding box ${side} ${axis} differs by ${d.toExponential(2)} mm`)
      }
    }
    return { ok: differences.length === 0, tolerance, native, imported, differences, kernel: { name: kernel.info.name, version: kernel.info.version } }
  } finally {
    await kernel.release(result.shapes).catch(() => undefined)
  }
}
