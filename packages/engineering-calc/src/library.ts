import type { CalculationModelDefinition } from './model'

/**
 * Library of engineering relations (mathematics.md §9). Each entry is a calculation model definition with
 * validity conditions, source references and reference cases.
 *
 * Status: authored by the design reasoning agent and CHECKED against independent closed-form computations
 * (reference cases, run in tests). They are NOT engineering-reviewed: each definition carries
 * `basis: 'ai-hypothesis'` and `validationStatus: 'unvalidated'`, so results are labelled `estimate` until a
 * person validates the model in Conceptualize (ADR-0043). The citations name standard texts and standards in
 * which these relations are given; they were not consulted in this session and no text is copied from them.
 */
export interface LibrarySource {
  citation: string
  /** What the source is cited for. */
  scope: string
}

export interface ReferenceCase {
  title: string
  inputs: Record<string, { value: number; unit: string }>
  /** Expected outputs from an independent hand computation (stated in `derivation`). */
  expected: Record<string, { value: number; unit: string }>
  /** Expected constraint results by relation ID. */
  checks?: Record<string, boolean>
  relativeTolerance: number
  derivation: string
}

export interface LibraryEntry {
  id: string
  version: string
  title: string
  definition: CalculationModelDefinition
  sources: LibrarySource[]
  assumptions: string[]
  limitations: string[]
  referenceCases: ReferenceCase[]
  review: { status: 'agent-checked'; checkedBy: string; date: string; method: string; engineeringReview: 'required' }
}

const REVIEW = {
  status: 'agent-checked' as const,
  checkedBy: 'design reasoning agent',
  date: '2026-10-15',
  method: 'Dimensional analysis by the engine; reference cases recomputed from independent closed forms in tests (engineering-calc library.test.ts).',
  engineeringReview: 'required' as const,
}

const def = (id: string, name: string, description: string, parameters: CalculationModelDefinition['parameters'], relations: CalculationModelDefinition['relations'], validity: CalculationModelDefinition['validity']): CalculationModelDefinition => ({
  id,
  key: id,
  revision: 1,
  name,
  description,
  grammar: 'ews-expr/1',
  parameters,
  relations,
  validity,
  basis: 'ai-hypothesis',
  validationStatus: 'unvalidated',
})

const SHIGLEY = 'R. G. Budynas, J. K. Nisbett, Shigley’s Mechanical Engineering Design, McGraw-Hill (10th or later edition)'
const ROARK = 'W. C. Young, R. G. Budynas, A. M. Sadegh, Roark’s Formulas for Stress and Strain, 8th ed., McGraw-Hill, 2012'

export const ENGINEERING_LIBRARY: LibraryEntry[] = [
  {
    id: 'lib.column.euler-round',
    version: '1.0.0',
    title: 'Euler buckling of a solid round column',
    definition: def(
      'lib.column.euler-round',
      'Euler buckling of a solid round column',
      'Critical load P_cr = π² E I / (K L)² with I = π d⁴/64; required P_cr ≥ n F. Valid above the Euler–Johnson transition slenderness.',
      [
        { symbol: 'F', name: 'Axial compressive load', role: 'input', unit: 'kN' },
        { symbol: 'E', name: 'Elastic modulus', role: 'input', unit: 'GPa' },
        { symbol: 'Sy', name: 'Yield strength', role: 'input', unit: 'MPa' },
        { symbol: 'd', name: 'Diameter', role: 'input', unit: 'mm' },
        { symbol: 'L', name: 'Column length', role: 'input', unit: 'mm' },
        { symbol: 'K', name: 'Effective-length factor', role: 'input', unit: '-' },
        { symbol: 'n', name: 'Design factor', role: 'input', unit: '-' },
        { symbol: 'I', name: 'Second moment of area', role: 'output', unit: 'mm^4' },
        { symbol: 'P_cr', name: 'Critical load', role: 'output', unit: 'kN' },
        { symbol: 'lambda', name: 'Slenderness K L / k (k = d/4)', role: 'output', unit: '-' },
        { symbol: 'lambda_1', name: 'Transition slenderness', role: 'output', unit: '-' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'I = pi * d^4 / 64' },
        { id: 'r2', kind: 'assignment', expression: 'P_cr = pi^2 * E * I / (K * L)^2' },
        { id: 'r3', kind: 'assignment', expression: 'lambda = 4 * K * L / d' },
        { id: 'r4', kind: 'assignment', expression: 'lambda_1 = pi * sqrt(2 * E / Sy)' },
        { id: 'c1', kind: 'constraint', expression: 'P_cr >= n * F', description: 'Buckling capacity with the design factor' },
      ],
      { text: 'Euler formula above the transition slenderness (Johnson parabola below, not included)', conditions: ['lambda >= lambda_1'] },
    ),
    sources: [
      { citation: 'S. P. Timoshenko, J. M. Gere, Theory of Elastic Stability, 2nd ed., McGraw-Hill, 1961', scope: 'Euler critical load of an ideal column' },
      { citation: SHIGLEY, scope: 'Columns with central loading: effective length, Euler–Johnson transition slenderness √(2π²E/Sy)' },
    ],
    assumptions: ['Straight, prismatic, homogeneous linear-elastic column', 'Central (concentric) load', 'K expresses the end conditions (pinned–pinned K = 1)'],
    limitations: ['No eccentricity or initial crookedness', 'Intermediate columns (λ < λ₁) need the Johnson formula, not included', 'No safety against local yielding beyond the design factor'],
    referenceCases: [
      {
        title: 'ACT-100 rod: Ø25 mm, 600 mm, steel, pinned–pinned',
        inputs: { F: { value: 12, unit: 'kN' }, E: { value: 210, unit: 'GPa' }, Sy: { value: 600, unit: 'MPa' }, d: { value: 25, unit: 'mm' }, L: { value: 600, unit: 'mm' }, K: { value: 1, unit: '-' }, n: { value: 2, unit: '-' } },
        expected: { I: { value: 19174.759848570517, unit: 'mm^4' }, P_cr: { value: 110.39425494491515, unit: 'kN' }, lambda: { value: 96, unit: '-' }, lambda_1: { value: 83.1187288206608, unit: '-' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'I = π·0.025⁴/64 m⁴; P = π²·210e9·I/0.6² N; λ = 4·600/25; λ₁ = π·√(2·210000/600)',
      },
    ],
    review: REVIEW,
  },
  {
    id: 'lib.beam.cantilever-end-load-rect',
    version: '1.0.0',
    title: 'Cantilever beam with an end load, rectangular section',
    definition: def(
      'lib.beam.cantilever-end-load-rect',
      'Cantilever, end load, rectangular section',
      'Tip deflection δ = F L³/(3 E I), root bending stress σ = 6 F L/(b h²), I = b h³/12.',
      [
        { symbol: 'F', name: 'End load', role: 'input', unit: 'N' },
        { symbol: 'L', name: 'Length', role: 'input', unit: 'mm' },
        { symbol: 'E', name: 'Elastic modulus', role: 'input', unit: 'GPa' },
        { symbol: 'b', name: 'Section width', role: 'input', unit: 'mm' },
        { symbol: 'h', name: 'Section height (in the load direction)', role: 'input', unit: 'mm' },
        { symbol: 'sigma_allow', name: 'Allowable stress', role: 'input', unit: 'MPa' },
        { symbol: 'I', name: 'Second moment of area', role: 'output', unit: 'mm^4' },
        { symbol: 'delta', name: 'Tip deflection', role: 'output', unit: 'mm' },
        { symbol: 'sigma', name: 'Maximum bending stress', role: 'output', unit: 'MPa' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'I = b * h^3 / 12' },
        { id: 'r2', kind: 'assignment', expression: 'delta = F * L^3 / (3 * E * I)' },
        { id: 'r3', kind: 'assignment', expression: 'sigma = 6 * F * L / (b * h^2)' },
        { id: 'c1', kind: 'constraint', expression: 'sigma <= sigma_allow', description: 'Bending stress within the allowable stress' },
      ],
      { text: 'Euler–Bernoulli beam: slender, small deflection, linear elastic', conditions: ['L >= 10 * h', 'delta <= 0.1 * L'] },
    ),
    sources: [
      { citation: ROARK, scope: 'Beam formulas: cantilever with a concentrated end load' },
      { citation: 'J. M. Gere, B. J. Goodno, Mechanics of Materials, Cengage (8th or later edition)', scope: 'Flexure formula σ = M c / I; deflection of a cantilever' },
    ],
    assumptions: ['Rigid fixed support', 'Load at the free end, in the plane of h', 'Linear-elastic, homogeneous material'],
    limitations: ['Shear deflection neglected (short beams)', 'No stress concentration at the support', 'Small deflections only'],
    referenceCases: [
      {
        title: '1 kN on a 1 m steel cantilever, 50 × 100 mm',
        inputs: { F: { value: 1000, unit: 'N' }, L: { value: 1000, unit: 'mm' }, E: { value: 200, unit: 'GPa' }, b: { value: 50, unit: 'mm' }, h: { value: 100, unit: 'mm' }, sigma_allow: { value: 100, unit: 'MPa' } },
        expected: { I: { value: 4166666.6666666665, unit: 'mm^4' }, delta: { value: 0.4, unit: 'mm' }, sigma: { value: 12, unit: 'MPa' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'I = 0.05·0.1³/12 m⁴; δ = 1000·1³/(3·200e9·I) m; σ = 6·1000·1/(0.05·0.1²) Pa',
      },
    ],
    review: REVIEW,
  },
  {
    id: 'lib.beam.simply-supported-center-load-rect',
    version: '1.0.0',
    title: 'Simply supported beam with a central load, rectangular section',
    definition: def(
      'lib.beam.simply-supported-center-load-rect',
      'Simply supported beam, central load, rectangular section',
      'Mid-span deflection δ = F L³/(48 E I), maximum bending stress σ = 3 F L/(2 b h²), I = b h³/12.',
      [
        { symbol: 'F', name: 'Central load', role: 'input', unit: 'N' },
        { symbol: 'L', name: 'Span', role: 'input', unit: 'mm' },
        { symbol: 'E', name: 'Elastic modulus', role: 'input', unit: 'GPa' },
        { symbol: 'b', name: 'Section width', role: 'input', unit: 'mm' },
        { symbol: 'h', name: 'Section height', role: 'input', unit: 'mm' },
        { symbol: 'delta_allow', name: 'Allowable deflection', role: 'input', unit: 'mm' },
        { symbol: 'I', name: 'Second moment of area', role: 'output', unit: 'mm^4' },
        { symbol: 'delta', name: 'Mid-span deflection', role: 'output', unit: 'mm' },
        { symbol: 'sigma', name: 'Maximum bending stress', role: 'output', unit: 'MPa' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'I = b * h^3 / 12' },
        { id: 'r2', kind: 'assignment', expression: 'delta = F * L^3 / (48 * E * I)' },
        { id: 'r3', kind: 'assignment', expression: 'sigma = 3 * F * L / (2 * b * h^2)' },
        { id: 'c1', kind: 'constraint', expression: 'delta <= delta_allow', description: 'Stiffness requirement' },
      ],
      { text: 'Euler–Bernoulli beam: slender, small deflection, linear elastic', conditions: ['L >= 10 * h', 'delta <= 0.1 * L'] },
    ),
    sources: [
      { citation: ROARK, scope: 'Beam formulas: simply supported span with a concentrated central load' },
      { citation: 'J. M. Gere, B. J. Goodno, Mechanics of Materials, Cengage (8th or later edition)', scope: 'Flexure formula; deflection of simply supported beams' },
    ],
    assumptions: ['Pinned supports at both ends', 'Load at mid-span', 'Linear-elastic, homogeneous material'],
    limitations: ['Shear deflection neglected', 'Bearing stresses at load and supports not checked'],
    referenceCases: [
      {
        title: '1 kN at mid-span of a 2 m steel beam, 50 × 100 mm',
        inputs: { F: { value: 1000, unit: 'N' }, L: { value: 2000, unit: 'mm' }, E: { value: 200, unit: 'GPa' }, b: { value: 50, unit: 'mm' }, h: { value: 100, unit: 'mm' }, delta_allow: { value: 1, unit: 'mm' } },
        expected: { delta: { value: 0.2, unit: 'mm' }, sigma: { value: 6, unit: 'MPa' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'δ = 1000·2³/(48·200e9·0.05·0.1³/12) m; σ = 3·1000·2/(2·0.05·0.1²) Pa',
      },
    ],
    review: REVIEW,
  },
  {
    id: 'lib.fastener.bolt-preload-torque',
    version: '1.0.0',
    title: 'Bolt preload from tightening torque (nut-factor method)',
    definition: def(
      'lib.fastener.bolt-preload-torque',
      'Bolt preload from tightening torque',
      'Preload F_i = T/(K d); tensile stress area A_t = π/4 (d − 0.9382 P)² for ISO metric threads; preload stress σ_i = F_i/A_t ≤ proof strength.',
      [
        { symbol: 'T', name: 'Tightening torque', role: 'input', unit: 'N*m' },
        { symbol: 'K', name: 'Nut (torque) factor', role: 'input', unit: '-' },
        { symbol: 'd', name: 'Nominal diameter', role: 'input', unit: 'mm' },
        { symbol: 'P', name: 'Thread pitch', role: 'input', unit: 'mm' },
        { symbol: 'Sp', name: 'Proof strength', role: 'input', unit: 'MPa' },
        { symbol: 'F_i', name: 'Preload', role: 'output', unit: 'kN' },
        { symbol: 'A_t', name: 'Tensile stress area', role: 'output', unit: 'mm^2' },
        { symbol: 'sigma_i', name: 'Preload stress', role: 'output', unit: 'MPa' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'F_i = T / (K * d)' },
        { id: 'r2', kind: 'assignment', expression: 'A_t = pi / 4 * (d - 0.9382 * P)^2' },
        { id: 'r3', kind: 'assignment', expression: 'sigma_i = F_i / A_t' },
        { id: 'c1', kind: 'constraint', expression: 'sigma_i <= Sp', description: 'Preload stress does not exceed the proof strength' },
      ],
      { text: 'Nut-factor method within its usual range of K; ISO metric coarse or fine threads', conditions: ['K >= 0.1', 'K <= 0.35', 'P <= 0.2 * d'] },
    ),
    sources: [
      { citation: SHIGLEY, scope: 'Torque–preload relation T = K F_i d and typical nut factors' },
      { citation: 'ISO 898-1:2013, Mechanical properties of fasteners made of carbon steel and alloy steel, Part 1', scope: 'Proof stress by property class; tensile stress area of ISO metric threads' },
      { citation: 'VDI 2230 Part 1:2015, Systematic calculation of highly stressed bolted joints', scope: 'The detailed method this simplified relation does not replace' },
    ],
    assumptions: ['Nut factor K covers friction in the thread and under the head (scatter typically ±25 % or more)', 'Steel bolt in the elastic range'],
    limitations: ['Preload scatter of the torque method is large; the result is a nominal value', 'No joint stiffness, embedding, temperature or external load (VDI 2230 scope)'],
    referenceCases: [
      {
        title: 'M10 × 1.5, 50 N·m, K = 0.2, property class 8.8 proof strength 580 MPa',
        inputs: { T: { value: 50, unit: 'N*m' }, K: { value: 0.2, unit: '-' }, d: { value: 10, unit: 'mm' }, P: { value: 1.5, unit: 'mm' }, Sp: { value: 580, unit: 'MPa' } },
        expected: { F_i: { value: 25, unit: 'kN' }, A_t: { value: 57.98947542534723, unit: 'mm^2' }, sigma_i: { value: 431.11271168824004, unit: 'MPa' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'F = 50/(0.2·0.010) N; A = π/4·(10 − 0.9382·1.5)² mm² (close to the commonly tabulated 58.0 mm² for M10; not checked against the standard here); σ = F/A',
      },
    ],
    review: REVIEW,
  },
  {
    id: 'lib.drive.motor-torque-power',
    version: '1.0.0',
    title: 'Motor torque, speed and power',
    definition: def(
      'lib.drive.motor-torque-power',
      'Motor torque, speed and power',
      'Angular speed ω = 2π n; mechanical power P = T ω; electrical input P_in = P/η; P ≤ rated power.',
      [
        { symbol: 'T', name: 'Shaft torque', role: 'input', unit: 'N*m' },
        { symbol: 'n', name: 'Rotational speed', role: 'input', unit: 'rpm' },
        { symbol: 'eta', name: 'Motor efficiency', role: 'input', unit: '-' },
        { symbol: 'P_rated', name: 'Rated mechanical power', role: 'input', unit: 'W' },
        { symbol: 'omega', name: 'Angular speed', role: 'output', unit: 'rad/s' },
        { symbol: 'P', name: 'Mechanical power', role: 'output', unit: 'W' },
        { symbol: 'P_in', name: 'Input power', role: 'output', unit: 'W' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'omega = 2 * pi * n' },
        { id: 'r2', kind: 'assignment', expression: 'P = T * omega' },
        { id: 'r3', kind: 'assignment', expression: 'P_in = P / eta' },
        { id: 'c1', kind: 'constraint', expression: 'P <= P_rated', description: 'Mechanical power within the motor rating' },
      ],
      { text: 'Steady operation; efficiency between 0 and 1', conditions: ['eta > 0', 'eta <= 1'] },
    ),
    sources: [
      { citation: 'R. C. Hibbeler, Engineering Mechanics: Dynamics, Pearson (14th or later edition)', scope: 'Power of a torque P = T ω' },
      { citation: 'IEC 60034-1, Rotating electrical machines, Part 1: Rating and performance', scope: 'Meaning of rated output (context only; no rating rules are implemented)' },
    ],
    assumptions: ['Steady state (no acceleration torque)', 'Efficiency at the operating point'],
    limitations: ['Thermal limits, duty cycle and peak torque are not checked'],
    referenceCases: [
      {
        title: '1.1 N·m at 3000 rpm, η = 0.85, 350 W rating (ACT-100 motor)',
        inputs: { T: { value: 1.1, unit: 'N*m' }, n: { value: 3000, unit: 'rpm' }, eta: { value: 0.85, unit: '-' }, P_rated: { value: 350, unit: 'W' } },
        expected: { omega: { value: 314.1592653589793, unit: 'rad/s' }, P: { value: 345.57519189487726, unit: 'W' }, P_in: { value: 406.55904928809093, unit: 'W' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'ω = 2π·3000/60 rad/s; P = 1.1·ω W; P_in = P/0.85',
      },
    ],
    review: REVIEW,
  },
  {
    id: 'lib.drive.screw-lead-speed-force',
    version: '1.0.0',
    title: 'Screw drive: lead to linear speed and force',
    definition: def(
      'lib.drive.screw-lead-speed-force',
      'Screw drive: linear speed and thrust',
      'Linear speed v = n l; thrust F = 2π η T / l for a screw of lead l driven with torque T at efficiency η.',
      [
        { symbol: 'n', name: 'Screw speed', role: 'input', unit: 'rpm' },
        { symbol: 'l', name: 'Lead (advance per revolution)', role: 'input', unit: 'mm' },
        { symbol: 'T', name: 'Drive torque at the screw', role: 'input', unit: 'N*m' },
        { symbol: 'eta', name: 'Screw efficiency (driving)', role: 'input', unit: '-' },
        { symbol: 'F_req', name: 'Required thrust', role: 'input', unit: 'N' },
        { symbol: 'v', name: 'Linear speed', role: 'output', unit: 'mm/s' },
        { symbol: 'F', name: 'Thrust', role: 'output', unit: 'N' },
      ],
      [
        { id: 'r1', kind: 'assignment', expression: 'v = n * l' },
        { id: 'r2', kind: 'assignment', expression: 'F = 2 * pi * eta * T / l' },
        { id: 'c1', kind: 'constraint', expression: 'F >= F_req', description: 'Thrust covers the required force' },
      ],
      { text: 'Steady driving (not back-driving); efficiency between 0 and 1', conditions: ['eta > 0', 'eta <= 1'] },
    ),
    sources: [
      { citation: SHIGLEY, scope: 'Power screws: torque, lead and efficiency' },
      { citation: 'ISO 3408-1, Ball screws, Part 1: Vocabulary and designation', scope: 'Definition of lead (context for ball screws)' },
    ],
    assumptions: ['Efficiency η includes thread friction for the driving direction', 'Rigid screw (no wind-up)'],
    limitations: ['Back-driving, critical speed, buckling of the screw and bearing life are separate checks'],
    referenceCases: [
      {
        title: '5 mm lead at 3000 rpm with 1.1 N·m, η = 0.9',
        inputs: { n: { value: 3000, unit: 'rpm' }, l: { value: 5, unit: 'mm' }, T: { value: 1.1, unit: 'N*m' }, eta: { value: 0.9, unit: '-' }, F_req: { value: 500, unit: 'N' } },
        expected: { v: { value: 250, unit: 'mm/s' }, F: { value: 1244.0706908215582, unit: 'N' } },
        checks: { c1: true },
        relativeTolerance: 1e-9,
        derivation: 'v = 3000/60·5 mm/s; F = 2π·0.9·1.1/0.005 N',
      },
    ],
    review: REVIEW,
  },
]

/** A copy of a library model definition, optionally re-identified for storage in Conceptualize. */
export function libraryModel(id: string, as?: { id?: string; revision?: number }): CalculationModelDefinition {
  const entry = ENGINEERING_LIBRARY.find((e) => e.id === id)
  if (!entry) throw new Error(`No library model “${id}”. Available: ${ENGINEERING_LIBRARY.map((e) => e.id).join(', ')}.`)
  return { ...structuredClone(entry.definition), ...(as?.id ? { id: as.id } : {}), ...(as?.revision ? { revision: as.revision } : {}) }
}
