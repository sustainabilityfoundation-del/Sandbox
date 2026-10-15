import type { ConceptAbstraction } from '@ews/platform-sdk'
import type { Quantity, StatementInput, StatementKind } from './types'

/**
 * Deterministic extraction of a Concept draft from natural language (no language model): the name,
 * quantities with units and their bounds, functions ("delivering 500 N of linear force"), questions,
 * assumptions, a requested number of alternatives and classification keywords. The result is a
 * draft the user reviews before it is saved; the original text is always kept verbatim as the
 * description. It recognizes common engineering phrasing, not every possible sentence.
 */

/** Unit symbols the extractor recognizes, with the quantity they usually measure. */
export const UNIT_DIMENSIONS: Record<string, string> = {
  N: 'force', kN: 'force', mN: 'force', MN: 'force', lbf: 'force',
  mm: 'length', cm: 'length', m: 'length', km: 'length', µm: 'length', um: 'length', ft: 'length',
  kg: 'mass', g: 'mass', lb: 'mass',
  s: 'time', ms: 'time', min: 'time', h: 'time',
  W: 'power', kW: 'power', MW: 'power', mW: 'power',
  J: 'energy', kJ: 'energy', Wh: 'energy', kWh: 'energy',
  'N*m': 'torque', 'N·m': 'torque', Nm: 'torque', 'kN*m': 'torque',
  Pa: 'pressure', kPa: 'pressure', MPa: 'pressure', GPa: 'pressure', bar: 'pressure', psi: 'pressure',
  V: 'voltage', kV: 'voltage', mV: 'voltage', A: 'current', mA: 'current', Ah: 'charge',
  Hz: 'frequency', kHz: 'frequency', rpm: 'speed',
  'm/s': 'velocity', 'mm/s': 'velocity', 'km/h': 'velocity', 'm/s^2': 'acceleration', 'm/s²': 'acceleration',
  '°C': 'temperature', K: 'temperature', '%': 'ratio', dB: 'sound level',
  EUR: 'cost', USD: 'cost', '€': 'cost', '$': 'cost',
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 }

const CLASS_WORDS = ['actuator', 'gripper', 'sensor', 'pump', 'motor', 'drive', 'gearbox', 'transmission', 'valve', 'bracket', 'holder', 'mount', 'housing', 'frame', 'controller', 'battery', 'propulsion', 'cooling', 'heat exchanger', 'robot', 'manipulator', 'brake', 'clutch', 'spring', 'joint', 'linkage', 'enclosure']

export interface ExtractedQuantity {
  label: string
  quantity: Quantity
  dimension: string
  phrase: string
  kind: StatementKind
}

export interface ConceptDraft {
  name: string
  summary: string
  description: string
  abstraction: ConceptAbstraction
  classifications: string[]
  statements: StatementInput[]
  quantities: ExtractedQuantity[]
  /** "Develop three alternative concepts …" → 3. */
  requestedAlternatives: number | null
  /** What could not be interpreted (shown to the user as open questions). */
  notes: string[]
}

const unitPattern = Object.keys(UNIT_DIMENSIONS)
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
  .join('|')
// "500 N", "1,5 kN", "0.5 s", "100-mm", "±0.1 mm", "€200", "$ 50"
const QUANTITY = new RegExp(String.raw`(?<![\w.])(±\s*)?(\d+(?:[.,]\d+)?)(?:\s*(?:–|-|to)\s*(\d+(?:[.,]\d+)?))?\s*-?\s*(${unitPattern})(?![\w])`, 'g')
const CURRENCY_FIRST = /([€$])\s*(\d+(?:[.,]\d+)?)/g

const num = (s: string) => Number(s.replace(',', '.'))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function boundOf(before: string): 'min' | 'max' | 'value' {
  const b = before.toLowerCase()
  if (/(at most|maximum|max\.?|up to|no more than|not more than|less than|below|under|within|not exceed(?:ing)?|≤|<)\s*(?:an?\s+|the\s+)?$/.test(b)) return 'max'
  if (/(at least|minimum|min\.?|no less than|more than|greater than|above|exceed(?:ing)?|≥|>)\s*$/.test(b)) return 'min'
  return 'value'
}

const LABEL_BY_DIMENSION: Record<string, string> = {
  force: 'Force',
  length: 'Size',
  mass: 'Mass',
  time: 'Time',
  power: 'Power',
  energy: 'Energy',
  torque: 'Torque',
  pressure: 'Pressure',
  voltage: 'Voltage',
  current: 'Current',
  frequency: 'Frequency',
  speed: 'Speed',
  velocity: 'Velocity',
  acceleration: 'Acceleration',
  temperature: 'Temperature',
  cost: 'Cost',
  ratio: 'Ratio',
}

function labelFor(after: string, before: string, dimension: string): string {
  // "500 N of linear force" → "Linear force"
  const of = /^\s*(?:of|for)\s+((?:[a-z-]+\s){0,2}[a-z-]+)/i.exec(after)
  if (of) {
    const words: string[] = []
    for (const w of of[1].split(/\s+/)) {
      if (/^(within|in|at|for|with|and|or|of|to|by|from|under|over|the|a|an)$/i.test(w)) break
      words.push(w)
    }
    if (words.length) return cap(words.join(' '))
  }
  // "a 100 mm envelope" / "100 mm stroke"
  const noun = /^\s*(envelope|stroke|diameter|length|width|height|travel|range|payload|load|force|mass|weight|span|bore|radius|depth|thickness|gap|clearance|budget|life|lifetime|cycle time|speed|torque|power|pressure|voltage|current|temperature)\b/i.exec(after)
  if (noun) return cap(noun[1])
  const prev = /\b(envelope|stroke|diameter|length|payload|load|force|mass|weight|speed|torque|power|pressure|voltage|current|temperature|cost|price|time|duration|travel)\s+(?:of|is|=|:)?\s*(?:at most|at least|up to|within|below|under|about|approximately)?\s*$/i.exec(before)
  if (prev) return cap(prev[1])
  return LABEL_BY_DIMENSION[dimension] ?? 'Value'
}

function kindFor(label: string, sentence: string): StatementKind {
  if (/\b(should|expected|target|goal|aim)\b/i.test(sentence) && !/\b(must|shall|within|no more than|at most|at least)\b/i.test(sentence)) return 'performance'
  if (/^(Time|Speed|Velocity|Acceleration|Power)$/.test(label) && !/\b(must|shall|within|at most|at least|no more than)\b/i.test(sentence)) return 'performance'
  return 'constraint'
}

export function extractQuantities(text: string): ExtractedQuantity[] {
  const out: ExtractedQuantity[] = []
  for (const m of text.matchAll(QUANTITY)) {
    const [phrase, plusMinus, a, b, unit] = m
    const before = text.slice(Math.max(0, m.index! - 40), m.index!)
    const after = text.slice(m.index! + phrase.length, m.index! + phrase.length + 40)
    const dimension = UNIT_DIMENSIONS[unit]
    const sentence = sentenceAround(text, m.index!)
    const label = labelFor(after, before, dimension)
    let quantity: Quantity
    if (b !== undefined) quantity = { min: num(a), max: num(b), unit }
    else if (plusMinus) quantity = { min: -num(a), max: num(a), unit }
    else {
      const bound = boundOf(before)
      quantity = bound === 'value' ? { value: num(a), unit } : { [bound]: num(a), unit }
    }
    out.push({ label, quantity, dimension, phrase: clean(phrase), kind: kindFor(label, sentence) })
  }
  for (const m of text.matchAll(CURRENCY_FIRST)) {
    const unit = m[1] === '€' ? 'EUR' : 'USD'
    const before = text.slice(Math.max(0, m.index! - 40), m.index!)
    const bound = boundOf(before)
    out.push({ label: 'Cost', quantity: bound === 'value' ? { value: num(m[2]), unit } : { [bound]: num(m[2]), unit }, dimension: 'cost', phrase: m[0], kind: 'constraint' })
  }
  return out
}

function sentenceAround(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('!', index - 1)) + 1
  const ends = ['.', '?', '!'].map((c) => text.indexOf(c, index)).filter((i) => i >= 0)
  return text.slice(start, ends.length ? Math.min(...ends) + 1 : text.length).trim()
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9“"(])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** The subject of a request: "… concepts for a compact mechanical actuator capable of …" → "Compact mechanical actuator". */
export function extractName(text: string): string {
  const t = clean(text)
  const subject =
    /\b(?:concepts?|options|alternatives|designs?|solutions?|ideas?)\s+(?:for|of)\s+(?:an?\s+|the\s+)?(.+?)(?=\s+(?:that|which|capable|able|to|with|within|for|delivering|providing|able to|in order|so that)\b|[,.;:]|$)/i.exec(t) ??
    /^(?:(?:please\s+)?(?:design|create|develop|make|build|describe|define)\s+)?(?:an?\s+|the\s+)?(.+?)(?=\s+(?:that|which|capable|able|to|with|within|delivering|providing|so that)\b|[,.;:]|$)/i.exec(t)
  const raw = subject?.[1] ?? t
  const words = raw.split(' ').slice(0, 8).join(' ')
  return cap(words.replace(/\b\d+\s*$/, '').trim()).slice(0, 120) || 'New concept'
}

export function extractFunctions(text: string): string[] {
  const out: string[] = []
  // "capable of delivering 500 N of linear force", "that holds parts", "to transmit power"
  for (const m of clean(text).matchAll(/\b(?:capable of|able to|that|which|to)\s+(deliver(?:ing)?|provid(?:e|ing)|generat(?:e|ing)|transmit(?:ting)?|convert(?:ing)?|hold(?:ing|s)?|mov(?:e|ing|es)|lift(?:ing|s)?|carr(?:y|ying|ies)|protect(?:ing|s)?|cool(?:ing|s)?|heat(?:ing|s)?|measur(?:e|ing|es)|control(?:ling|s)?|position(?:ing|s)?|store?s?|storing|support(?:ing|s)?|guid(?:e|ing|es)|grip(?:ping|s)?|clamp(?:ing|s)?|seal(?:ing|s)?|pump(?:ing|s)?|rotat(?:e|ing|es)|push(?:ing|es)?|pull(?:ing|s)?)\s+([^,.;]+)/gi)) {
    const verb = m[1].toLowerCase().replace(/(ing|es|s)$/, '').replace(/^(deliver|provid|generat|convert|mov|measur|position|guid|rotat|stor)$/, (v) => ({ deliver: 'deliver', provid: 'provide', generat: 'generate', convert: 'convert', mov: 'move', measur: 'measure', position: 'position', guid: 'guide', rotat: 'rotate', stor: 'store' })[v] ?? v)
    const object = m[2].replace(QUANTITY, '').replace(/\b(of|within|in)\b\s*$/i, '').replace(/\s+/g, ' ').replace(/^\s*(of\s+)/i, '').trim()
    const phrase = clean(`${verb} ${object}`).replace(/\s+(within|in|with|for|at)\s*(an?|the)?\s*(envelope|space)?$/i, '')
    if (phrase.split(' ').length >= 2) out.push(cap(phrase))
  }
  return [...new Set(out)].slice(0, 6)
}

export function extractRequestedCount(text: string): number | null {
  const m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s+(?:\w+\s+){0,2}(?:alternatives?|concepts?|options|designs?|solutions?|variants?)\b/i.exec(text)
  if (!m) return null
  const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])
  return Number.isInteger(n) && n >= 1 && n <= 20 ? n : null
}

function abstractionFor(text: string): ConceptAbstraction {
  const t = text.toLowerCase()
  if (/\b(system|aircraft|vehicle|plant|machine|robot)\b/.test(t)) return 'system'
  if (/\b(subsystem|module|unit|assembly)\b/.test(t)) return /\bassembly\b/.test(t) ? 'assembly' : 'subsystem'
  if (/\b(actuator|gripper|pump|motor|gearbox|drive|valve|sensor)\b/.test(t)) return 'subsystem'
  if (/\b(bracket|holder|mount|housing|part|component|spring|shaft)\b/.test(t)) return 'component'
  if (/^\s*(provide|transmit|convert|protect|generate|store|control|measure)\b/.test(t)) return 'function'
  return 'abstract'
}

/**
 * Builds a Concept draft from a natural-language description. `basis` is the basis given to the
 * interpreted statements: 'user-assertion' when a person reviews and saves the draft, 'ai-hypothesis'
 * when the assistant proposes it.
 */
export function draftConcept(text: string, basis: 'user-assertion' | 'ai-hypothesis' = 'user-assertion'): ConceptDraft {
  const description = text.trim()
  const quantities = extractQuantities(description)
  const functions = extractFunctions(description)
  const statements: StatementInput[] = []
  const source = 'Extracted from the description'
  for (const f of functions) statements.push({ kind: 'function', text: f, basis, source })
  for (const q of quantities) statements.push({ kind: q.kind, text: q.label, quantity: q.quantity, basis, source: `${source}: “${q.phrase}”` })
  for (const s of sentences(description)) {
    if (s.endsWith('?')) statements.push({ kind: 'question', text: s, basis, state: 'open', source })
    else if (/^(assume|assuming|we assume|assumption)\b/i.test(s)) statements.push({ kind: 'assumption', text: s.replace(/^assumption:\s*/i, ''), basis: 'assumption', source })
    else if (/\b(because|so that|in order to)\b/i.test(s) && !quantities.some((q) => s.includes(q.phrase))) statements.push({ kind: 'rationale', text: s, basis, source })
  }
  const lower = description.toLowerCase()
  const classifications = CLASS_WORDS.filter((w) => new RegExp(`\\b${w}s?\\b`).test(lower))
  const notes: string[] = []
  if (!functions.length) notes.push('No function was recognized; state what the Concept must do.')
  if (!quantities.length) notes.push('No quantity with a unit was recognized; add constraints such as force, size or mass with units.')
  const firstSentence = sentences(description)[0] ?? description
  return {
    name: extractName(description),
    summary: firstSentence.length > 240 ? `${firstSentence.slice(0, 237)}…` : firstSentence,
    description,
    abstraction: abstractionFor(description),
    classifications,
    statements,
    quantities,
    requestedAlternatives: extractRequestedCount(description),
    notes,
  }
}
