/** Small dense linear algebra for the sketch solver (row-major number[][]). */

export type Matrix = number[][]

/** Solves A x = b with Gaussian elimination and partial pivoting. Returns null if singular. */
export function solveLinear(A: Matrix, b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
    if (Math.abs(M[pivot][col]) < 1e-300) return null
    if (pivot !== col) [M[pivot], M[col]] = [M[col], M[pivot]]
    const p = M[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

export interface RankAnalysis {
  rank: number
  /** Rows (equations) that are linear combinations of earlier rows. */
  dependentRows: number[]
  /** Variables (columns) not determined by the equations (non-zero in some null-space vector). */
  freeVariables: number[]
}

/**
 * Rank, dependent rows (processed in order) and undetermined variables of J (m × n), with a
 * tolerance relative to the largest entry.
 */
export function analyzeRank(J: Matrix, n: number, relTol = 1e-8): RankAnalysis {
  const scale = Math.max(1e-12, ...J.flat().map(Math.abs))
  const tol = relTol * scale
  // Incremental row echelon basis: dependent rows reduce to (near) zero.
  const basis: { row: number[]; pivot: number }[] = []
  const dependentRows: number[] = []
  J.forEach((original, i) => {
    const row = [...original]
    for (const b of basis) {
      const f = row[b.pivot] / b.row[b.pivot]
      if (f !== 0) for (let c = 0; c < n; c++) row[c] -= f * b.row[c]
    }
    let pivot = -1
    let best = tol
    for (let c = 0; c < n; c++) {
      if (Math.abs(row[c]) > best) {
        best = Math.abs(row[c])
        pivot = c
      }
    }
    if (pivot < 0) dependentRows.push(i)
    else basis.push({ row, pivot })
  })
  const rank = basis.length
  // Reduced row echelon form of the basis gives the null space.
  const R = basis.map((b) => [...b.row])
  const pivots = basis.map((b) => b.pivot)
  for (let i = 0; i < R.length; i++) {
    const p = pivots[i]
    const pv = R[i][p]
    for (let c = 0; c < n; c++) R[i][c] /= pv
    for (let k = 0; k < R.length; k++) {
      if (k === i) continue
      const f = R[k][p]
      if (f !== 0) for (let c = 0; c < n; c++) R[k][c] -= f * R[i][c]
    }
  }
  const pivotSet = new Set(pivots)
  const freeCols = [...Array(n).keys()].filter((c) => !pivotSet.has(c))
  const undetermined = new Set<number>(freeCols)
  for (const f of freeCols) {
    for (let i = 0; i < R.length; i++) if (Math.abs(R[i][f]) > 1e-9) undetermined.add(pivots[i])
  }
  return { rank, dependentRows, freeVariables: [...undetermined].sort((a, b) => a - b) }
}
