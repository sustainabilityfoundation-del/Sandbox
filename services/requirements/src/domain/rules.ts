/**
 * Requirements domain rules: roles and permissions, lifecycle, relationship semantics, field
 * vocabularies. Framework-free; enforced by the service on every request.
 */

export type Role = 'reader' | 'editor' | 'reviewer' | 'administrator'
export const ROLES: Role[] = ['reader', 'editor', 'reviewer', 'administrator']

export type Permission =
  | 'read'
  | 'export'
  | 'save-personal-view'
  | 'author'
  | 'comment'
  | 'request-review'
  | 'decide-review'
  | 'retire'
  | 'create-baseline'
  | 'import'
  | 'dismiss-finding'
  | 'save-shared-view'
  | 'define-attributes'
  | 'edit-conventions'
  | 'renumber'

/** Permissions matrix (documented in OpenAPI `x-permissions` and the progress file). */
export const PERMISSIONS: Record<Permission, { roles: Role[]; label: string }> = {
  read: { roles: ['reader', 'editor', 'reviewer', 'administrator'], label: 'Read requirements, collections, relationships, history, baselines, quality findings' },
  export: { roles: ['reader', 'editor', 'reviewer', 'administrator'], label: 'Export JSON or ReqIF' },
  'save-personal-view': { roles: ['reader', 'editor', 'reviewer', 'administrator'], label: 'Save personal views' },
  author: { roles: ['editor', 'administrator'], label: 'Create, edit, archive and restore requirements; edit relationships, collections and attribute values; bulk operations' },
  comment: { roles: ['editor', 'reviewer', 'administrator'], label: 'Add comments' },
  'request-review': { roles: ['editor', 'administrator'], label: 'Submit a revision for review; withdraw a review' },
  'decide-review': { roles: ['reviewer', 'administrator'], label: 'Approve or reject a review (not for a revision one authored)' },
  retire: { roles: ['reviewer', 'administrator'], label: 'Retire and reinstate requirements' },
  'create-baseline': { roles: ['reviewer', 'administrator'], label: 'Create baselines' },
  import: { roles: ['editor', 'administrator'], label: 'Preview and apply imports' },
  'dismiss-finding': { roles: ['editor', 'reviewer', 'administrator'], label: 'Dismiss quality findings with a reason' },
  'save-shared-view': { roles: ['editor', 'reviewer', 'administrator'], label: 'Share saved views with the project' },
  'define-attributes': { roles: ['administrator'], label: 'Define custom attributes and enumeration values' },
  'edit-conventions': { roles: ['administrator'], label: 'Edit writing conventions for quality checks' },
  renumber: { roles: ['administrator'], label: 'Change human-readable keys' },
}

export function roleAllows(role: Role | null, permission: Permission): boolean {
  return !!role && PERMISSIONS[permission].roles.includes(role)
}

// ---- lifecycle ------------------------------------------------------------------------------------

export type LifecycleStatus = 'draft' | 'in-review' | 'approved' | 'retired'
export const STATUSES: LifecycleStatus[] = ['draft', 'in-review', 'approved', 'retired']

/**
 * Explicit transitions. `in-review` is entered by requesting a review and left by a review decision
 * or withdrawal; `approved` only through an approving review decision. Editing canonical fields of an
 * in-review or approved requirement creates a new draft revision (the approval stays with the
 * revision that was approved).
 */
export const TRANSITIONS: { from: LifecycleStatus; to: LifecycleStatus; via: 'request-review' | 'withdraw' | 'approve' | 'reject' | 'retire' | 'reinstate' | 'reopen'; permission: Permission }[] = [
  { from: 'draft', to: 'in-review', via: 'request-review', permission: 'request-review' },
  { from: 'in-review', to: 'draft', via: 'withdraw', permission: 'request-review' },
  { from: 'in-review', to: 'approved', via: 'approve', permission: 'decide-review' },
  { from: 'in-review', to: 'draft', via: 'reject', permission: 'decide-review' },
  { from: 'approved', to: 'draft', via: 'reopen', permission: 'author' },
  { from: 'draft', to: 'retired', via: 'retire', permission: 'retire' },
  { from: 'approved', to: 'retired', via: 'retire', permission: 'retire' },
  { from: 'retired', to: 'draft', via: 'reinstate', permission: 'retire' },
]

// ---- relationships ----------------------------------------------------------------------------------

export type RelationshipType = 'derives-from' | 'decomposes' | 'depends-on' | 'allocated-to'
export const RELATIONSHIP_TYPES: RelationshipType[] = ['derives-from', 'decomposes', 'depends-on', 'allocated-to']

export interface RelationshipRule {
  /** Endpoint kind of `to`. `from` is always a requirement. */
  to: 'requirement' | 'twin-component'
  /** Whether cycles through this type are refused. */
  acyclic: boolean
  meaning: string
  /** Direction stated as a sentence with {from} and {to}. */
  reads: string
  sysml: string
}

/**
 * Meaning, direction and permitted endpoints. All requirement-to-requirement types point from the
 * lower-level (or dependent) requirement to the higher-level (or depended-on) one. Collection
 * hierarchy never creates any of these.
 */
export const RELATIONSHIP_RULES: Record<RelationshipType, RelationshipRule> = {
  'derives-from': {
    to: 'requirement',
    acyclic: true,
    meaning: 'The from requirement was derived from the to requirement (for example by analysis or design decision); meeting the to requirement relies on meeting the from requirement. Derived requirements may introduce new content.',
    reads: '{from} derives from {to}',
    sysml: 'Derivation connection (RequirementDerivation library): to = originalRequirement, from = one of derivedRequirements',
  },
  decomposes: {
    to: 'requirement',
    acyclic: true,
    meaning: 'The from requirement is one part of the decomposition of the to requirement; together the parts are intended to cover it without adding new scope.',
    reads: '{from} is part of the decomposition of {to}',
    sysml: 'Nested (composite) requirement usage of the to requirement, or a requirement referenced as a required constraint',
  },
  'depends-on': {
    to: 'requirement',
    acyclic: false,
    meaning: 'The from requirement cannot be met or assessed independently of the to requirement (dependency, not derivation).',
    reads: '{from} depends on {to}',
    sysml: 'Dependency (no requirement-specific semantics in SysML v2)',
  },
  'allocated-to': {
    to: 'twin-component',
    acyclic: false,
    meaning: 'The from requirement is allocated to (to be met by) the twin component. Allocation is a design decision, not a claim that the component satisfies the requirement.',
    reads: '{from} is allocated to {to}',
    sysml: 'Allocation usage from the requirement to the part usage representing the component (via the component\'s represents link)',
  },
}

// ---- vocabularies -----------------------------------------------------------------------------------

export const PRIORITIES = ['high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const VERIFICATION_METHODS = ['analysis', 'test', 'inspection', 'demonstration'] as const

export const DEFAULT_REQUIREMENT_TYPES = ['functional', 'performance', 'interface', 'environmental', 'physical', 'design-constraint', 'safety', 'other']

export const KEY_PREFIX = 'REQ'
export const formatKey = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, '0')}`
