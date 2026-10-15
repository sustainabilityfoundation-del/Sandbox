/**
 * Project Management domain rules: roles and permissions, project lifecycle and record state, work-item and
 * milestone statuses, link rules, keys and built-in templates. Framework-free; enforced by the service on every
 * request and published in the OpenAPI document (x-permissions, x-lifecycle, x-link-rules, x-work-items).
 * Design: docs/modules/projects/architecture.md §7, lifecycle-and-persistence.md, information-model.md §6.
 */
import type { ArtifactCategory } from '@ews/platform-sdk'

export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export const ROLES: Role[] = ['reader', 'editor', 'reviewer', 'administrator']
const RANK: Record<Role, number> = { reader: 0, editor: 1, reviewer: 2, administrator: 3 }

/** 'create-project' needs only authentication (Q4: any authenticated user may create projects). */
export type Permission = 'read' | 'edit' | 'review' | 'administer'

export const PERMISSIONS: Record<Permission, { minimum: Role; label: string }> = {
  read: { minimum: 'reader', label: 'Read the project, its registry, links, work items, milestones, documents and activity' },
  edit: { minimum: 'editor', label: 'Edit project metadata and lifecycle status; create and edit work items, milestones, documents and links' },
  review: { minimum: 'reviewer', label: 'Accept risks, release documents and baselines' },
  administer: { minimum: 'administrator', label: 'Change the key and owner, membership, archive, restore, delete and duplicate the project' },
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

export function roleAllows(role: Role | string | null | undefined, permission: Permission): boolean {
  return isRole(role) && RANK[role] >= RANK[PERMISSIONS[permission].minimum]
}

export function rolesWith(permission: Permission): Role[] {
  return ROLES.filter((r) => roleAllows(r, permission))
}

// ---- project ------------------------------------------------------------------------------------------------

export type ProjectStatus = 'planning' | 'active' | 'on-hold' | 'completed' | 'cancelled'
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'on-hold', 'completed', 'cancelled']

export type ProjectState = 'active' | 'archived' | 'deleted'
export const PROJECT_STATES: ProjectState[] = ['active', 'archived', 'deleted']

export const DISCIPLINES = ['systems', 'mechanical', 'electrical', 'electronics', 'software', 'controls', 'thermal', 'structural', 'manufacturing', 'quality', 'safety', 'other'] as const
export type Discipline = (typeof DISCIPLINES)[number]

/** Display key of a project: upper-case letters, digits and hyphens, 2–20 characters, starting with a letter. */
export const PROJECT_KEY = /^[A-Z][A-Z0-9-]{1,19}$/

/** Default retention of soft-deleted projects (project setting projects.retention.deleted-days). */
export const DEFAULT_RETENTION_DAYS = 30

export type StateTransition = 'archive' | 'restore' | 'delete'

/** Record-state transitions (lifecycle-and-persistence.md §1). Returns why a transition is refused, or null. */
export function stateTransitionProblem(from: ProjectState, transition: StateTransition, purgeAfter?: Date | null, now: Date = new Date()): string | null {
  switch (transition) {
    case 'archive':
      return from === 'active' ? null : `Only an active project can be archived; this one is ${from}.`
    case 'delete':
      return from === 'deleted' ? 'The project is already deleted.' : null
    case 'restore':
      if (from === 'active') return 'The project is already active.'
      if (from === 'deleted' && purgeAfter && now >= purgeAfter) return 'The retention period has ended; the project can no longer be restored.'
      return null
  }
}

// ---- work items and milestones ----------------------------------------------------------------------------------

export type WorkItemKind = 'task' | 'issue' | 'risk'
export const WORK_ITEM_KINDS: WorkItemKind[] = ['task', 'issue', 'risk']

export const WORK_ITEM_STATUSES: Record<WorkItemKind, { statuses: string[]; initial: string; closed: string[] }> = {
  task: { statuses: ['open', 'in-progress', 'blocked', 'done', 'cancelled'], initial: 'open', closed: ['done', 'cancelled'] },
  issue: { statuses: ['open', 'investigating', 'resolved', 'closed', 'rejected'], initial: 'open', closed: ['closed', 'rejected'] },
  risk: { statuses: ['identified', 'assessed', 'mitigating', 'accepted', 'closed'], initial: 'identified', closed: ['accepted', 'closed'] },
}

export const WORK_ITEM_PREFIX: Record<WorkItemKind, string> = { task: 'TSK', issue: 'ISS', risk: 'RSK' }

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type Priority = (typeof PRIORITIES)[number]

export interface RiskDetails {
  likelihood: number
  impact: number
  mitigation: string
  response: 'avoid' | 'mitigate' | 'transfer' | 'accept'
}

export interface IssueDetails {
  severity: 'minor' | 'major' | 'critical'
  detectedIn?: string
  resolution?: string
}

export const riskScore = (r: Pick<RiskDetails, 'likelihood' | 'impact'>) => r.likelihood * r.impact

/**
 * Status change rules (lifecycle-and-persistence.md §4). No mandatory sequence; returns a refusal or null.
 * `rationale` is the note recorded with the change (issue resolution, risk acceptance rationale).
 */
export function workItemStatusProblem(input: { kind: WorkItemKind; to: string; role: Role | string | null; rationale?: string; issueResolution?: string }): { code: 'invalid' | 'forbidden'; message: string } | null {
  const rule = WORK_ITEM_STATUSES[input.kind]
  if (!rule.statuses.includes(input.to)) return { code: 'invalid', message: `A ${input.kind} status is one of ${rule.statuses.join(', ')}; “${input.to}” is not.` }
  if (input.kind === 'risk' && input.to === 'accepted') {
    if (!roleAllows(input.role, 'review')) return { code: 'forbidden', message: 'Accepting a risk needs a reviewer or administrator.' }
    if (!input.rationale?.trim()) return { code: 'invalid', message: 'Accepting a risk needs a rationale (statusNote).' }
  }
  if (input.kind === 'issue' && input.to === 'closed' && !(input.issueResolution ?? input.rationale)?.trim()) return { code: 'invalid', message: 'Closing an issue needs a resolution note.' }
  return null
}

export const MILESTONE_STATUSES = ['planned', 'in-progress', 'achieved', 'missed', 'cancelled'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

// ---- documents ------------------------------------------------------------------------------------------------

export const DOCUMENT_KINDS = ['specification', 'report', 'drawing', 'datasheet', 'standard', 'minutes', 'image', 'model-file', 'other'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]
export const DOCUMENT_LIFECYCLES = ['working', 'in-review', 'released', 'superseded', 'retired'] as const
export type DocumentLifecycle = (typeof DOCUMENT_LIFECYCLES)[number]

/** Document lifecycle changes: releasing needs a reviewer; a retired document stays retired. */
export function documentLifecycleProblem(from: DocumentLifecycle, to: DocumentLifecycle, role: Role | string | null, versions: number): { code: 'invalid' | 'forbidden'; message: string } | null {
  if (from === to) return { code: 'invalid', message: `The document is already ${to}.` }
  if (from === 'retired') return { code: 'invalid', message: 'A retired document cannot change its lifecycle.' }
  if (to === 'released' && !roleAllows(role, 'review')) return { code: 'forbidden', message: 'Releasing a document needs a reviewer or administrator.' }
  if ((to === 'released' || to === 'in-review') && versions === 0) return { code: 'invalid', message: 'Upload a version before the document goes to review or release.' }
  return null
}

/** Upload limit per document version (bytes). Configurable by the host. */
export const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024

// ---- links ----------------------------------------------------------------------------------------------------

export type LinkType = 'represents' | 'subject-of' | 'affects' | 'mitigated-by' | 'blocks' | 'delivers' | 'describes' | 'evidence-for' | 'depends-on' | 'relates-to'

interface LinkRule {
  from: ArtifactCategory[] | 'any'
  to: ArtifactCategory[] | 'any'
  /** From-end kinds additionally allowed or required (e.g. risk only). */
  fromKinds?: string[]
  impact: boolean
  meaning: string
  /** Module whose native relationship takes precedence (documented; enforced once the module offers it). */
  nativeAlternative?: string
}

const WORK: ArtifactCategory[] = ['work-item']

/** Link types owned by Project Management (information-model.md §6.3). */
export const LINK_RULES: Record<LinkType, LinkRule> = {
  represents: { from: ['geometry', 'model'], to: ['product-element'], impact: true, meaning: 'the artifact represents the product element', nativeAlternative: 'twin represents; CAD Modeler and SysML Modeler mappings once available (CR-PM-CAD-1, CR-PM-SYS-1)' },
  'subject-of': { from: ['work-item', 'document', 'milestone'], to: 'any', impact: false, meaning: 'the work item, document or milestone concerns the artifact' },
  affects: { from: WORK, fromKinds: ['issue', 'risk'], to: 'any', impact: true, meaning: 'the issue or risk affects the artifact' },
  'mitigated-by': { from: WORK, fromKinds: ['risk'], to: WORK, impact: false, meaning: 'the risk is mitigated by the work item' },
  blocks: { from: WORK, to: WORK, impact: false, meaning: 'the work item blocks the other one' },
  delivers: { from: ['milestone'], to: 'any', impact: false, meaning: 'the milestone requires the artifact' },
  describes: { from: ['document'], to: 'any', impact: false, meaning: 'the document describes the artifact' },
  'evidence-for': { from: ['document'], to: ['requirement', 'design-knowledge', 'verification'], impact: true, meaning: 'the document is evidence for the artifact', nativeAlternative: 'Requirements verification records; Conceptualize evidence' },
  'depends-on': { from: 'any', to: 'any', impact: true, meaning: 'engineering dependency stated by a person' },
  'relates-to': { from: 'any', to: 'any', impact: false, meaning: 'weak, explanatory association (excluded from impact analysis)' },
}

export const LINK_TYPES = Object.keys(LINK_RULES) as LinkType[]

/** Relationship meanings owned by another module: refused in Project Management with the operation to use instead. */
export const MODULE_OWNED_LINKS: Record<string, string> = {
  'allocated-to': 'Requirements owns allocation: allocate the requirement in the Requirements module.',
  implements: 'Conceptualize owns implementations: link the Concept to the artifact with a Concept implementation.',
  satisfies: 'SysML owns satisfy relationships: create them in the SysML Modeler.',
  verifies: 'Requirements owns verification records: record verification in the Requirements module.',
}

export function linkProblem(type: string, from: { category: string; kind: string }, to: { category: string; kind: string }): string | null {
  if (MODULE_OWNED_LINKS[type]) return MODULE_OWNED_LINKS[type]
  const rule = LINK_RULES[type as LinkType]
  if (!rule) return `Unknown link type “${type}”. Project Management link types: ${LINK_TYPES.join(', ')}.`
  const fits = (allowed: ArtifactCategory[] | 'any', category: string) => allowed === 'any' || (allowed as string[]).includes(category)
  if (!fits(rule.from, from.category) || (rule.fromKinds && !rule.fromKinds.includes(from.kind))) {
    return `A “${type}” link starts at ${rule.fromKinds ? rule.fromKinds.join('/') : rule.from === 'any' ? 'any artifact' : rule.from.join('/')}, not at a ${from.kind}.`
  }
  if (!fits(rule.to, to.category)) return `A “${type}” link ends at ${rule.to === 'any' ? 'any artifact' : rule.to.join('/')}, not at a ${to.kind}.`
  return null
}

// ---- templates ----------------------------------------------------------------------------------------------

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  /** v1 templates carry configuration and planning items only, never engineering artifacts. */
  content: 'blank'
  disciplines: Discipline[]
  /** Requested project settings (written through the settings service when it is available). */
  settings: Record<string, boolean | number | string | null>
  milestones: { name: string; offsetDays?: number }[]
  workItems: { kind: 'task'; title: string }[]
  builtIn: true
  version: number
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: 'blank',
    name: 'Blank project',
    description: 'An empty project: no engineering artifacts, no planning items. Every module starts empty.',
    content: 'blank',
    disciplines: [],
    settings: {},
    milestones: [],
    workItems: [],
    builtIn: true,
    version: 1,
  },
  {
    id: 'mechanical-product',
    name: 'Mechanical product development',
    description: 'Mechanical disciplines, SI units in millimetres, and the usual review milestones. Starts with no engineering artifacts.',
    content: 'blank',
    disciplines: ['mechanical', 'systems'],
    settings: { 'projects.units.system': 'si', 'projects.units.length': 'mm', 'projects.conventions.drawing-projection': 'first-angle' },
    milestones: [
      { name: 'Concept review', offsetDays: 30 },
      { name: 'Preliminary design review', offsetDays: 90 },
      { name: 'Critical design review', offsetDays: 180 },
    ],
    workItems: [
      { kind: 'task', title: 'Capture stakeholder needs' },
      { kind: 'task', title: 'Define the product breakdown' },
    ],
    builtIn: true,
    version: 1,
  },
  {
    id: 'systems-engineering',
    name: 'Systems engineering (mechatronic)',
    description: 'Systems, mechanical, electrical and software disciplines with requirements-led milestones. Starts with no engineering artifacts.',
    content: 'blank',
    disciplines: ['systems', 'mechanical', 'electrical', 'software', 'controls'],
    settings: { 'projects.units.system': 'si', 'projects.units.length': 'mm' },
    milestones: [
      { name: 'System requirements review', offsetDays: 45 },
      { name: 'Architecture review', offsetDays: 120 },
    ],
    workItems: [{ kind: 'task', title: 'Agree the system boundary and interfaces' }],
    builtIn: true,
    version: 1,
  },
]

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id)
