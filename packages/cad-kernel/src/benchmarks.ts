import type { CommandCall } from '@ews/cad-core'

/**
 * Benchmark model library (brief §11–12): parametric models of increasing complexity built only
 * with public commands, so they double as regression models. Sizes are feature counts.
 */
export interface BenchmarkModel {
  name: string
  description: string
  commands: CommandCall[]
  /** Exact expected volume (mm³), for numeric validation. */
  expectedVolume: number
  /** Parameter changed for the "edit upstream" measurement and the feature edited for "edit downstream". */
  upstreamParameter: { name: string; value: string }
  downstreamEdit: (ids: { lastSketch: string; lastCircle: string }) => CommandCall
}

/** A plate with an n × m grid of through holes, each its own sketch and cut feature (2 + 2·n·m features). */
export function perforatedPlate(n: number, m: number): BenchmarkModel {
  const pitch = 20
  const w = (n + 1) * pitch
  const d = (m + 1) * pitch
  const t = 8
  const r = 4
  const commands: CommandCall[] = [
    { command: 'create_part', input: { name: `Perforated plate ${n}x${m}`, ref: '$p' } },
    { command: 'create_parameter', input: { partId: '$p', name: 'thickness', expression: String(t) } },
    { command: 'create_parameter', input: { partId: '$p', name: 'hole_r', expression: String(r) } },
    { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: '$s' } },
    { command: 'add_rectangle', input: { sketchId: '$s', width: w, height: d } },
    { command: 'extrude_profile', input: { sketchId: '$s', distance: 'thickness' } },
  ]
  let k = 0
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      k++
      commands.push(
        { command: 'create_sketch', input: { partId: '$p', plane: 'XY', ref: `$h${k}` } },
        { command: 'add_circle', input: { sketchId: `$h${k}`, center: [i * pitch, j * pitch], radius: r, ref: `$c${k}` } },
        { command: 'apply_constraint', input: { sketchId: `$h${k}`, type: 'radius', entities: [`$c${k}`], value: 'hole_r' } },
        { command: 'apply_constraint', input: { sketchId: `$h${k}`, type: 'fixed', entities: [`$c${k}.center`] } },
        { command: 'extrude_profile', input: { sketchId: `$h${k}`, distance: 'thickness', operation: 'cut' } },
      )
    }
  return {
    name: `perforated-plate-${n}x${m}`,
    description: `Plate ${w} × ${d} × ${t} mm with ${n * m} through holes (r ${r}), ${2 + 2 * n * m} features`,
    commands,
    expectedVolume: w * d * t - n * m * Math.PI * r * r * t,
    upstreamParameter: { name: 'thickness', value: '10' },
    downstreamEdit: ({ lastSketch, lastCircle }) => ({ command: 'apply_constraint', input: { sketchId: lastSketch, type: 'diameter', entities: [lastCircle], driving: false } }),
  }
}

export const BENCHMARK_MODELS = [perforatedPlate(1, 1), perforatedPlate(3, 3), perforatedPlate(5, 5)]
