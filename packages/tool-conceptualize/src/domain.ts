import type { Tone } from '@ews/design-system'
import type { IconName } from '@ews/design-system'
import type { ConceptMaturity } from '@ews/platform-sdk'
import type { Basis, RelationshipType, StatementKind } from '@ews/conceptualize-client'

/** Private view state of one Conceptualize view instance. */
export type ConceptPage = 'explorer' | 'alternatives' | 'integration' | 'ai'
export interface ConceptualizeViewState {
  page: ConceptPage
  /** The open Concept (canonical UUID). */
  conceptId: string | null
  explorerMode: 'tree' | 'graph'
  search: string
  maturity: ConceptMaturity | 'all'
  /** Open alternative set in the Alternative Explorer. */
  setId: string | null
  /** Dialogs opened from the toolbar. */
  dialog: null | 'new' | 'child' | 'branch'
  tab: 'intent' | 'structure' | 'knowledge' | 'decisions' | 'implementations' | 'evidence' | 'history'
  /** Explorer record type (design knowledge, CR-C1…C3). Optional: older saved view states have none. */
  records?: RecordsFilter
  /** The open Function, Constraint or Assumption (instead of a Concept). */
  record?: { type: DesignRecordType; id: string } | null
  /** Set from the caller's permissions (UX only; the server enforces): disables authoring in the toolbar. */
  readOnly?: boolean
}

export type DesignRecordType = 'function' | 'constraint' | 'assumption'
export type RecordsFilter = 'concepts' | 'functions' | 'constraints' | 'assumptions'
export const RECORDS: { value: RecordsFilter; label: string; type?: DesignRecordType }[] = [
  { value: 'concepts', label: 'Concepts' },
  { value: 'functions', label: 'Functions', type: 'function' },
  { value: 'constraints', label: 'Constraints', type: 'constraint' },
  { value: 'assumptions', label: 'Assumptions', type: 'assumption' },
]

export const INITIAL_VIEW_STATE: ConceptualizeViewState = { page: 'explorer', conceptId: null, explorerMode: 'tree', search: '', maturity: 'all', setId: null, dialog: null, tab: 'intent', records: 'concepts', record: null }

export const MATURITY: Record<ConceptMaturity, { label: string; tone: Tone; icon: IconName }> = {
  idea: { label: 'Idea', tone: 'neutral', icon: 'draft' },
  exploring: { label: 'Exploring', tone: 'info', icon: 'search' },
  defined: { label: 'Defined', tone: 'info', icon: 'edit' },
  evaluated: { label: 'Evaluated', tone: 'info', icon: 'analysis' },
  selected: { label: 'Selected', tone: 'success', icon: 'approved' },
  'engineering-development': { label: 'Engineering development', tone: 'success', icon: 'tools' },
  implemented: { label: 'Implemented', tone: 'success', icon: 'success' },
  verified: { label: 'Verified', tone: 'success', icon: 'verification' },
  superseded: { label: 'Superseded', tone: 'neutral', icon: 'history' },
  archived: { label: 'Archived', tone: 'neutral', icon: 'archive' },
}
export const MATURITIES = Object.keys(MATURITY) as ConceptMaturity[]

/** How a statement is known. AI hypotheses and estimates are never shown as facts. */
export const BASIS: Record<Basis, { label: string; tone: Tone; icon: IconName; title: string }> = {
  'user-assertion': { label: 'User statement', tone: 'neutral', icon: 'edit', title: 'Stated by a person; not verified' },
  'ai-hypothesis': { label: 'AI hypothesis', tone: 'warning', icon: 'assistant', title: 'Proposed by the assistant; unverified until a person confirms it or evidence supports it' },
  assumption: { label: 'Assumption', tone: 'warning', icon: 'info', title: 'Engineering assumption, to be confirmed' },
  assessment: { label: 'Assessment', tone: 'info', icon: 'review', title: 'Qualitative engineering judgement by a person; not a calculation' },
  estimate: { label: 'Estimate', tone: 'info', icon: 'analysis', title: 'Preliminary estimate with stated assumptions; not validated' },
  calculated: { label: 'Calculated', tone: 'info', icon: 'analysis', title: 'Result of a reproducible calculation (manifest recorded); not independently verified' },
  evidence: { label: 'Verified evidence', tone: 'success', icon: 'verification', title: 'Supported by a verified evidence record' },
  decision: { label: 'Decision', tone: 'success', icon: 'approved', title: 'Established by a recorded design decision' },
}

export const KIND_LABEL: Record<StatementKind, string> = {
  function: 'Function',
  behavior: 'Desired behavior',
  principle: 'Physical principle',
  effect: 'Intended effect',
  input: 'Input',
  output: 'Output',
  constraint: 'Constraint',
  interface: 'Interface',
  mechanism: 'Candidate mechanism',
  problem: 'Problem solved',
  capability: 'Capability',
  performance: 'Expected performance',
  assumption: 'Assumption',
  uncertainty: 'Known uncertainty',
  question: 'Open question',
  rationale: 'Rationale',
  note: 'Note',
}
export const KIND_ORDER: StatementKind[] = ['problem', 'function', 'behavior', 'capability', 'principle', 'mechanism', 'effect', 'input', 'output', 'constraint', 'performance', 'interface', 'assumption', 'uncertainty', 'question', 'rationale', 'note']

export const RELATION_LABEL: Record<RelationshipType, { out: string; in: string }> = {
  contains: { out: 'Contains', in: 'Part of' },
  'depends-on': { out: 'Depends on', in: 'Needed by' },
  'interfaces-with': { out: 'Interfaces with', in: 'Interfaces with' },
  'alternative-to': { out: 'Alternative to', in: 'Alternative to' },
  'derived-from': { out: 'Derived from', in: 'Origin of' },
  refines: { out: 'Refines', in: 'Refined by' },
  implements: { out: 'Implements', in: 'Implemented by' },
  'conflicts-with': { out: 'Conflicts with', in: 'Conflicts with' },
  replaces: { out: 'Replaces', in: 'Replaced by' },
}

export function formatQuantity(q: { value?: number | null; unit: string; min?: number | null; max?: number | null } | null | undefined): string {
  if (!q) return ''
  const u = q.unit && q.unit !== '-' ? ` ${q.unit}` : ''
  const n = (x: number) => Number(x.toPrecision(4)).toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (q.value != null && (q.min != null || q.max != null)) return `${n(q.value)}${u} (${q.min != null ? n(q.min) : '…'}–${q.max != null ? n(q.max) : '…'})`
  if (q.value != null) return `${n(q.value)}${u}`
  if (q.min != null && q.max != null) return `${n(q.min)}–${n(q.max)}${u}`
  if (q.min != null) return `≥ ${n(q.min)}${u}`
  if (q.max != null) return `≤ ${n(q.max)}${u}`
  return u.trim()
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const QUALITATIVE = ['', 'very poor', 'poor', 'fair', 'good', 'very good']
