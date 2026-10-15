import { draftConcept, type ConceptDraft, type ExplorationCreate, type StatementInput } from '@ews/conceptualize-client'

/**
 * Scripted alternative generation for the DEMO assistant (no language model is connected).
 * It interprets the request deterministically (draftConcept), picks solution principles from a small
 * library by the kind of function asked for, and computes preliminary estimates from the stated
 * quantities with textbook formulas whose inputs, assumptions and units are recorded. Every generated
 * statement is labelled ai-hypothesis, assumption or estimate; nothing is presented as verified.
 * Unknown kinds of request get honest placeholder alternatives with open questions instead.
 */

export const GENERATOR = 'scripted demo generator (no language model)'

interface Needs {
  forceN: number | null
  envelopeMm: number | null
  torqueNm: number | null
}

interface Template {
  name: string
  summary: string
  principle: string
  children: string[]
  interfaces: { from: number; to: number; name: string; kind: 'mechanical' | 'electrical' | 'fluid' | 'control' }[]
  calc?: (n: Needs) => { evidence: NonNullable<ExplorationCreate['alternatives'][number]['evidence']>[number]; statements: StatementInput[] } | null
  /** Qualitative scores 1–5 (AI hypotheses): cost, controllability, risk. */
  scores: [number, number, number]
  massKg: [number, number]
  uncertainty: string
}

const r3 = (n: number) => Math.round(n * 1000) / 1000
const hyp = (kind: StatementInput['kind'], text: string, extra: Partial<StatementInput> = {}): StatementInput => ({ kind, text, basis: 'ai-hypothesis', source: GENERATOR, ...extra })

const LINEAR: Template[] = [
  {
    name: 'Electromechanical ball-screw actuator',
    summary: 'Electric motor drives a ball screw; the nut pushes the output rod.',
    principle: 'A rolling-element screw converts motor torque into axial force with high efficiency.',
    children: ['Electric motor', 'Ball screw and nut', 'Rod and guide', 'Housing'],
    interfaces: [{ from: 0, to: 1, name: 'Motor–screw coupling', kind: 'mechanical' }, { from: 1, to: 2, name: 'Nut–rod load path', kind: 'mechanical' }],
    calc: ({ forceN }) => {
      if (!forceN) return null
      const lead = 5
      const eta = 0.9
      const t = (forceN * (lead / 1000)) / (2 * Math.PI * eta)
      return {
        statements: [hyp('performance', 'Required motor torque (preliminary)', { quantity: { value: r3(t), unit: 'N*m' }, basis: 'estimate' }), hyp('assumption', `Screw lead ${lead} mm, efficiency ${eta}`, { basis: 'assumption' })],
        evidence: { kind: 'calculation', title: `Motor torque for ${forceN} N`, basis: 'estimate', method: 'T = F·l / (2π·η)', inputs: [{ name: 'F', value: forceN, unit: 'N' }, { name: 'l', value: lead, unit: 'mm' }, { name: 'η', value: eta, unit: '-' }], outputs: [{ name: 'T', value: r3(t), unit: 'N*m' }], assumptions: ['Static load', 'Bearing friction neglected'] },
      }
    },
    scores: [2, 5, 4],
    massKg: [0.6, 0.9],
    uncertainty: 'Motor size within the envelope depends on the duty cycle.',
  },
  {
    name: 'Compact pneumatic cylinder',
    summary: 'Double-acting cylinder supplied with compressed air through a valve.',
    principle: 'Air pressure acting on the piston area produces the axial force.',
    children: ['Cylinder and piston', 'Control valve', 'Air supply connection'],
    interfaces: [{ from: 2, to: 1, name: 'Air supply', kind: 'fluid' }, { from: 1, to: 0, name: 'Working ports', kind: 'fluid' }],
    calc: ({ forceN, envelopeMm }) => {
      if (!forceN) return null
      const bar = 6
      const area = forceN / (bar * 0.1) // mm² (1 bar = 0.1 N/mm²)
      const d = Math.sqrt((4 * area) / Math.PI)
      const fits = envelopeMm ? d + 10 < envelopeMm : null
      return {
        statements: [
          hyp('performance', 'Minimum piston bore (preliminary)', { quantity: { value: Math.round(d * 10) / 10, unit: 'mm' }, basis: 'estimate' }),
          hyp('assumption', `Supply pressure ${bar} bar`, { basis: 'assumption' }),
          ...(fits === null ? [] : [hyp('constraint', fits ? `Bore plus wall fits the ${envelopeMm} mm envelope (estimate)` : `Bore plus wall may exceed the ${envelopeMm} mm envelope (estimate)`, { basis: 'estimate' })]),
        ],
        evidence: { kind: 'calculation', title: `Piston bore for ${forceN} N at ${bar} bar`, basis: 'estimate', method: 'A = F / p, d = √(4A/π)', inputs: [{ name: 'F', value: forceN, unit: 'N' }, { name: 'p', value: bar, unit: 'bar' }], outputs: [{ name: 'A', value: Math.round(area), unit: 'mm^2' }, { name: 'd', value: Math.round(d * 10) / 10, unit: 'mm' }], assumptions: ['Seal friction neglected', 'Choose the next standard bore'] },
      }
    },
    scores: [4, 2, 3],
    massKg: [0.3, 0.5],
    uncertainty: 'Is compressed air available at the installation?',
  },
  {
    name: 'Rack-and-pinion drive',
    summary: 'Motor and gearbox turn a pinion that moves a toothed rack.',
    principle: 'Gear mesh converts pinion torque into rack force.',
    children: ['Motor and gearbox', 'Pinion', 'Rack and guide'],
    interfaces: [{ from: 0, to: 1, name: 'Pinion shaft', kind: 'mechanical' }, { from: 1, to: 2, name: 'Gear mesh', kind: 'mechanical' }],
    calc: ({ forceN }) => {
      if (!forceN) return null
      const r = 10
      const eta = 0.95
      const t = (forceN * (r / 1000)) / eta
      return {
        statements: [hyp('performance', 'Required pinion torque (preliminary)', { quantity: { value: r3(t), unit: 'N*m' }, basis: 'estimate' }), hyp('assumption', `Pinion pitch radius ${r} mm, efficiency ${eta}`, { basis: 'assumption' })],
        evidence: { kind: 'calculation', title: `Pinion torque for ${forceN} N`, basis: 'estimate', method: 'T = F·r / η', inputs: [{ name: 'F', value: forceN, unit: 'N' }, { name: 'r', value: r, unit: 'mm' }, { name: 'η', value: eta, unit: '-' }], outputs: [{ name: 'T', value: r3(t), unit: 'N*m' }], assumptions: ['Static load', 'Single pinion'] },
      }
    },
    scores: [3, 3, 3],
    massKg: [0.7, 1.1],
    uncertainty: 'Backlash may be unacceptable for positioning.',
  },
  {
    name: 'Hydraulic mini cylinder',
    summary: 'Small hydraulic cylinder fed by a compact power unit.',
    principle: 'Fluid pressure on a small piston gives high force density.',
    children: ['Cylinder', 'Power unit', 'Hose and fittings'],
    interfaces: [{ from: 1, to: 0, name: 'Hydraulic line', kind: 'fluid' }],
    calc: ({ forceN }) => {
      if (!forceN) return null
      const bar = 100
      const area = forceN / (bar * 0.1)
      const d = Math.sqrt((4 * area) / Math.PI)
      return {
        statements: [hyp('performance', 'Minimum bore (preliminary)', { quantity: { value: Math.round(d * 10) / 10, unit: 'mm' }, basis: 'estimate' })],
        evidence: { kind: 'calculation', title: `Bore for ${forceN} N at ${bar} bar`, basis: 'estimate', method: 'A = F / p, d = √(4A/π)', inputs: [{ name: 'F', value: forceN, unit: 'N' }, { name: 'p', value: bar, unit: 'bar' }], outputs: [{ name: 'd', value: Math.round(d * 10) / 10, unit: 'mm' }], assumptions: ['Power unit outside the envelope'] },
      }
    },
    scores: [2, 3, 2],
    massKg: [0.4, 0.8],
    uncertainty: 'Oil leakage risk and the power unit size.',
  },
  {
    name: 'Linear voice-coil motor',
    summary: 'Coil moving in a permanent-magnet field produces force directly.',
    principle: 'Lorentz force on a current-carrying coil in a magnetic field (F = B·I·L).',
    children: ['Magnet assembly', 'Moving coil', 'Bearing guide', 'Drive electronics'],
    interfaces: [{ from: 3, to: 1, name: 'Coil current', kind: 'electrical' }],
    calc: ({ forceN }) => {
      if (!forceN) return null
      const k = 25
      const i = forceN / k
      return {
        statements: [hyp('performance', 'Coil current (preliminary)', { quantity: { value: r3(i), unit: 'A' }, basis: 'estimate' }), hyp('uncertainty', 'Continuous force of this size is demanding for a compact voice coil; thermal limits are unknown.')],
        evidence: { kind: 'calculation', title: `Coil current for ${forceN} N`, basis: 'estimate', method: 'I = F / k_F', inputs: [{ name: 'F', value: forceN, unit: 'N' }, { name: 'k_F', value: k, unit: 'N/A' }], outputs: [{ name: 'I', value: r3(i), unit: 'A' }], assumptions: ['Force constant 25 N/A (assumed)'] },
      }
    },
    scores: [2, 5, 2],
    massKg: [0.8, 1.5],
    uncertainty: 'Heat dissipation at continuous force.',
  },
]

const TRANSMISSION: Template[] = [
  { name: 'Gear train', summary: 'Spur or helical gear stages.', principle: 'Meshing teeth transmit torque at a fixed ratio.', children: ['Input gear', 'Output gear', 'Bearings'], interfaces: [{ from: 0, to: 1, name: 'Gear mesh', kind: 'mechanical' }], scores: [3, 4, 4], massKg: [0.5, 1], uncertainty: 'Noise and backlash.' },
  { name: 'Toothed belt drive', summary: 'Synchronous belt and pulleys.', principle: 'Belt teeth engage pulley teeth; belt tension carries torque.', children: ['Pulleys', 'Belt', 'Tensioner'], interfaces: [{ from: 1, to: 0, name: 'Belt engagement', kind: 'mechanical' }], scores: [4, 3, 3], massKg: [0.3, 0.6], uncertainty: 'Belt life and stretch.' },
  { name: 'Chain drive', summary: 'Roller chain and sprockets.', principle: 'Chain links engage sprocket teeth.', children: ['Sprockets', 'Chain'], interfaces: [{ from: 1, to: 0, name: 'Chain engagement', kind: 'mechanical' }], scores: [4, 2, 2], massKg: [0.6, 1.2], uncertainty: 'Lubrication and elongation.' },
  { name: 'Direct drive', summary: 'Motor coupled directly to the load.', principle: 'No transmission stage; the motor provides torque at load speed.', children: ['Motor', 'Coupling'], interfaces: [{ from: 0, to: 1, name: 'Shaft coupling', kind: 'mechanical' }], scores: [2, 5, 3], massKg: [1, 2], uncertainty: 'Motor size at low speed and high torque.' },
]

function needsOf(d: ConceptDraft): Needs {
  const find = (dim: string) => d.quantities.find((q) => q.dimension === dim)
  const force = find('force')
  const length = d.quantities.find((q) => q.dimension === 'length' && /envelope|size|width|diameter|length/i.test(q.label))
  const toN = (q: typeof force) => (q ? (q.quantity.value ?? q.quantity.min ?? q.quantity.max ?? 0) * ({ N: 1, kN: 1000, mN: 0.001, MN: 1e6, lbf: 4.448 }[q.quantity.unit] ?? 1) : null)
  const toMm = (q: typeof length) => (q ? (q.quantity.max ?? q.quantity.value ?? 0) * ({ mm: 1, cm: 10, m: 1000 }[q.quantity.unit] ?? 1) : null)
  const torque = find('torque')
  return { forceN: toN(force), envelopeMm: toMm(length), torqueNm: torque ? (torque.quantity.value ?? null) : null }
}

function libraryFor(text: string): { templates: Template[]; family: string } | null {
  const t = text.toLowerCase()
  if (/\b(linear|actuator|push|pull|stroke|lift|press)\b/.test(t) || /\b\d+\s*k?N\b/.test(text)) return { templates: LINEAR, family: 'linear actuation' }
  if (/\b(transmission|gear|belt|chain|torque|rotary|power transmission)\b/.test(t)) return { templates: TRANSMISSION, family: 'mechanical power transmission' }
  return null
}

/** Builds an exploration from a request such as the owner's 500 N actuator example. */
export function generateExploration(text: string, count?: number): { exploration: ExplorationCreate; draft: ConceptDraft; family: string | null; assumptions: string[] } {
  const draft = draftConcept(text, 'ai-hypothesis')
  const n = Math.min(Math.max(count ?? draft.requestedAlternatives ?? 3, 1), 8)
  const needs = needsOf(draft)
  const lib = libraryFor(text)
  const assumptions = [
    'Interpretation of the request (name, constraints and units) is an AI hypothesis; check it.',
    'Solution principles come from a small scripted library, not from research; other principles may fit better.',
    'Preliminary estimates use textbook formulas with the stated assumptions; they are not validated analyses.',
    'Trade-study scores are AI hypotheses for discussion, not measurements.',
  ]
  const parent: ExplorationCreate['parent'] = {
    name: draft.name,
    summary: draft.summary,
    description: draft.description,
    abstraction: draft.abstraction === 'abstract' ? 'subsystem' : draft.abstraction,
    classifications: draft.classifications,
    statements: [...draft.statements, ...draft.notes.map((note) => hyp('question', note)), hyp('question', 'What are the required stroke, speed and duty cycle?')],
  }
  if (!lib) {
    return {
      draft,
      family: null,
      assumptions: [...assumptions, 'The scripted demo has no principle library for this kind of request: the alternatives are placeholders to elaborate.'],
      exploration: {
        objective: text,
        parent,
        setName: `Alternatives for ${draft.name}`,
        question: text,
        alternatives: Array.from({ length: n }, (_, i) => ({
          name: `${draft.name}: alternative ${String.fromCharCode(65 + i)}`,
          summary: 'Placeholder alternative proposed by the scripted demo; describe its principle.',
          abstraction: 'abstract' as const,
          statements: [hyp('question', 'Which physical principle does this alternative use?'), hyp('question', 'How does it satisfy the stated constraints?')],
        })),
        generator: GENERATOR,
      },
    }
  }
  const chosen = lib.templates.slice(0, n)
  const alternatives: ExplorationCreate['alternatives'] = chosen.map((t) => {
    const calc = t.calc?.(needs) ?? null
    return {
      name: t.name,
      summary: t.summary,
      abstraction: 'subsystem' as const,
      classifications: [lib.family],
      statements: [hyp('principle', t.principle), hyp('mechanism', t.summary), ...(calc?.statements ?? []), hyp('uncertainty', t.uncertainty)],
      children: t.children.map((c) => ({ name: c, abstraction: 'function' as const, statements: [hyp('function', `${c} of ${t.name.toLowerCase()}`)] })),
      interfaces: t.interfaces.filter((i) => i.from < t.children.length && i.to < t.children.length).map((i) => ({ from: i.from, to: i.to, definition: { name: i.name, kind: i.kind } })),
      evidence: calc ? [calc.evidence] : [],
    }
  })
  const exploration: ExplorationCreate = {
    objective: text,
    parent,
    setName: `Alternatives for ${draft.name}`,
    question: text,
    alternatives,
    tradeStudy: {
      title: `Comparison: ${draft.name}`,
      criteria: [
        { name: 'Mass (estimate)', category: 'mass', weight: 1, direction: 'minimize', scale: 'quantity', unit: 'kg' },
        { name: 'Cost', category: 'cost', weight: 1, direction: 'maximize', scale: 'qualitative', description: '5 = cheapest' },
        { name: 'Controllability', category: 'performance', weight: 2, direction: 'maximize', scale: 'qualitative' },
        { name: 'Risk', category: 'risk', weight: 1, direction: 'maximize', scale: 'qualitative', description: '5 = lowest risk' },
      ],
      scores: chosen.flatMap((t, i) => [
        { criterion: 0, alternative: i, low: t.massKg[0], high: t.massKg[1], basis: 'estimate' as const, rationale: 'Assumed range for comparable products (AI hypothesis)' },
        { criterion: 1, alternative: i, qualitative: t.scores[0], basis: 'ai-hypothesis' as const },
        { criterion: 2, alternative: i, qualitative: t.scores[1], basis: 'ai-hypothesis' as const },
        { criterion: 3, alternative: i, qualitative: t.scores[2], basis: 'ai-hypothesis' as const },
      ]),
    },
    generator: GENERATOR,
  }
  return { exploration, draft, family: lib.family, assumptions }
}
