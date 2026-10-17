import type { SketchFeature } from '../model/types'
import { solveSketch, type SketchSolution, type SolveOptions } from './solver'

/**
 * The replaceable sketch solver (ADR-0025, ADR-0076). Regeneration solves sketches through this
 * interface, so another solver can be put in without changing commands, the model or the UI.
 *
 * Contract: pure and deterministic for the same input; units are mm and degrees; `values` carry the
 * evaluated dimensions; the solution reports status, remaining degrees of freedom, free points,
 * redundant and conflicting constraints and measured driven dimensions (see SketchSolution).
 *
 * The built-in solver is `builtInSketchSolver` (damped Gauss–Newton, pure TypeScript, no dependency).
 * planegcs (FreeCAD's solver, LGPL-2.0-or-later) is used only in tests as an independent oracle
 * (`planegcsOracle.test.ts`); it is a development dependency and is not shipped.
 */
export interface SketchSolver {
  /** Stable identifier recorded in diagnostics, e.g. "ews-gauss-newton". */
  readonly id: string
  solve(sketch: Pick<SketchFeature, 'entities' | 'constraints'>, options: SolveOptions): SketchSolution
}

export const builtInSketchSolver: SketchSolver = {
  id: 'ews-gauss-newton',
  solve: (sketch, options) => solveSketch(sketch, options),
}
