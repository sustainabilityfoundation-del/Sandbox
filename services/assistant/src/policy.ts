import type { SettingDefinition, SettingValue } from '@ews/platform-sdk'

/**
 * The AI access policy (docs/specifications/ai-connection.md §5a), enforced on the server:
 * 1. when the tool list for a model request is built (only allowed operations are sent), and
 * 2. when the model returns tool calls (calls outside the allowed list are refused and never reach the
 *    browser) and when the browser returns tool results (each must answer a call the server issued and
 *    signed for this user, for an operation still allowed).
 * The browser's view of the policy is UX only. Applying a change always needs the person (unchanged
 * proposal-preview policy); the module APIs enforce their own permissions on Apply.
 */

export type AccessLevel = 'off' | 'read' | 'propose'
export type OperationClass = 'read' | 'search' | 'calculate' | 'propose' | 'export' | 'external-generation'

export interface AiModule {
  id: string
  label: string
  description: string
  /** Server-side entitlement the person needs (platform.entitlements); none for platform functions. */
  entitlement?: string
  /** Operation name prefixes (`<toolId>.`) or exact platform operation names. */
  prefixes: string[]
  names?: string[]
}

export const AI_MODULES: AiModule[] = [
  {
    id: 'workspace',
    label: 'Shared model and navigation',
    description: 'Platform operations on the shared digital twin: read and search objects, relationships and saved artifacts, select objects, open tools, and change previews within the tools’ rules.',
    prefixes: [],
    names: ['read_object', 'search_objects', 'read_relationships', 'read_artifacts', 'propose_changes', 'select_objects', 'open_tool'],
  },
  { id: 'requirements', label: 'Requirements', description: 'Requirements Management.', entitlement: 'tool:requirements', prefixes: ['requirements.'] },
  { id: 'conceptualize', label: 'Conceptualize', description: 'Concepts, alternatives, trade studies and decisions.', entitlement: 'tool:conceptualize', prefixes: ['conceptualize.'] },
  { id: 'sysml-modeler', label: 'SysML Modeler', description: 'SysML v2 models (repository-backed).', entitlement: 'tool:sysml', prefixes: ['sysml-modeler.'] },
  { id: 'cad-modeler', label: 'CAD Modeler', description: 'Parametric CAD documents and exports.', entitlement: 'tool:cad', prefixes: ['cad-modeler.'] },
  { id: 'illustrative', label: 'Illustrative tools', description: 'The mock SysML diagram and mock CAD tools.', prefixes: ['sysml.', 'cad.'] },
  // Headless platform modules (SDK 1.8 registerPlatformModule). Their services enforce membership; no entitlement decided yet.
  { id: 'projects', label: 'Project Management', description: 'Projects, members, work items and milestones (headless module).', prefixes: ['projects.'] },
  { id: 'reasoning', label: 'Design reasoning', description: 'Calculations and reasoning runs (headless module).', prefixes: ['reasoning.'] },
  { id: 'help', label: 'Help', description: 'Product documentation (read_help).', prefixes: [], names: ['read_help'] },
]

/** Illustrative tools need the entitlement of their tool (SysML → tool:sysml, CAD → tool:cad). */
const PREFIX_ENTITLEMENT: Record<string, string> = { 'sysml.': 'tool:sysml', 'cad.': 'tool:cad' }

export const OPERATION_CLASSES: { id: OperationClass; label: string; description: string }[] = [
  { id: 'read', label: 'Read objects', description: 'Read objects, relationships, documents and help; select objects and open tools.' },
  { id: 'search', label: 'Search', description: 'Search objects, Concepts and model elements.' },
  { id: 'calculate', label: 'Run calculations', description: 'Analyses that compute without changing anything: quality checks, impact, validation, comparisons and assessments.' },
  { id: 'propose', label: 'Propose changes', description: 'Prepare change previews. Nothing changes until you choose Apply.' },
  { id: 'export', label: 'Export files', description: 'Prepare file exports (for example STEP); the file is produced only after Apply.' },
  { id: 'external-generation', label: 'Request external generation', description: 'Ask another module or service to generate something (for example a CAD realization request).' },
]

/**
 * The class of every known operation. An operation of a known module that is missing here is treated as
 * "propose changes" (the strictest class that can still be useful); a test checks that every assistant
 * action registered by the tool packages is listed. Unknown modules are refused.
 */
export const OPERATION_CATALOGUE: Record<string, OperationClass> = {
  read_object: 'read',
  search_objects: 'search',
  read_relationships: 'read',
  read_artifacts: 'read',
  propose_changes: 'propose',
  select_objects: 'read',
  open_tool: 'read',
  read_help: 'read',
  'requirements.read_for_component': 'read',
  'requirements.search': 'search',
  'requirements.explain_quality': 'calculate',
  'requirements.update': 'propose',
  'requirements.create': 'propose',
  'requirements.allocate': 'propose',
  'conceptualize.search': 'search',
  'conceptualize.read': 'read',
  'conceptualize.create': 'propose',
  'conceptualize.develop_alternatives': 'propose',
  'conceptualize.decompose': 'propose',
  'conceptualize.compare': 'calculate',
  'conceptualize.propose_decision': 'propose',
  'conceptualize.link_artifact': 'propose',
  'conceptualize.propose_requirement': 'propose',
  'conceptualize.request_realization': 'external-generation',
  'conceptualize.next_steps': 'calculate',
  // Design knowledge (Conceptualize sprint 2; appended by the Conceptualize agent, COORDINATOR REVIEW)
  'conceptualize.create_function': 'propose',
  'conceptualize.convert_to_function': 'propose',
  'conceptualize.create_constraint': 'propose',
  'conceptualize.promote_constraint': 'propose',
  'conceptualize.record_assumption': 'propose',
  'conceptualize.create_link': 'propose',
  'conceptualize.rationale': 'read',
  'conceptualize.traverse': 'read',
  'conceptualize.search_design': 'search',
  // D1-CON (appended by the Conceptualize agent, COORDINATOR REVIEW)
  'conceptualize.revise_constraint': 'propose',
  'conceptualize.record_evidence': 'propose',
  'conceptualize.review_flags': 'read',
  'sysml-modeler.describe_commands': 'read',
  'sysml-modeler.matrix': 'read',
  'sysml-modeler.coverage': 'read',
  'sysml-modeler.behavior': 'read',
  'sysml-modeler.explain_commit': 'read',
  'sysml-modeler.find_elements': 'search',
  'sysml-modeler.impact': 'calculate',
  'sysml-modeler.link_requirement': 'propose',
  'sysml-modeler.propose_commands': 'propose',
  'sysml-modeler.propose_text': 'propose',
  'sysml-modeler.read_element': 'read',
  'sysml-modeler.validate': 'calculate',
  'sysml-modeler.create_project': 'propose',
  'sysml-modeler.link_product_element': 'propose',
  'cad-modeler.describe_model': 'read',
  'cad-modeler.query': 'read',
  'cad-modeler.run_commands': 'propose',
  'cad-modeler.undo': 'propose',
  'cad-modeler.new_document': 'propose',
  'cad-modeler.open_document': 'propose',
  'cad-modeler.export': 'export',
  'cad-modeler.list_documents': 'read',
  'cad-modeler.save_document': 'propose',
  'cad-modeler.check': 'read',
  'cad-modeler.check_bindings': 'read',
  'sysml.read_model': 'read',
  'sysml.create_part': 'propose',
  'sysml.connect': 'propose',
  'sysml.add_requirement_reference': 'propose',
  'cad.read_representation': 'read',
  'cad.set_dimension': 'propose',
}

export interface Classified {
  module: AiModule
  operationClass: OperationClass
  entitlement?: string
}

export function classify(name: string): Classified | null {
  for (const module of AI_MODULES) {
    if (module.names?.includes(name)) return { module, operationClass: OPERATION_CATALOGUE[name] ?? 'propose', entitlement: module.entitlement }
    const prefix = module.prefixes.find((p) => name.startsWith(p))
    if (prefix && /^[a-z0-9-]+\.[a-z0-9_]+$/.test(name)) return { module, operationClass: OPERATION_CATALOGUE[name] ?? 'propose', entitlement: module.entitlement ?? PREFIX_ENTITLEMENT[prefix] }
  }
  return null
}

// ---- settings definitions of the "AI and reasoning" page -------------------------------------------

export const AI_SETTINGS_PAGE = { id: 'ai', title: 'AI and reasoning' }

const LEVELS = [
  { value: 'off', label: 'AI off', description: 'The assistant gets no operations of this module.' },
  { value: 'read', label: 'Read only', description: 'Read, search and calculate; no change previews.' },
  { value: 'propose', label: 'Read and propose changes', description: 'Also prepare change previews; applying always needs you.' },
]

interface PairInput {
  id: string
  ceilingId: string
  ceilingDefault: SettingValue
  label: string
  description: string
  group: string
  [key: string]: unknown
}

/** A user setting and the project ceiling (administrator) that bounds it. */
function pair(base: PairInput): SettingDefinition[] {
  const { ceilingId, ceilingDefault, ...rest } = base
  const user = { ...rest, scope: 'user', ceiling: ceilingId } as SettingDefinition
  const ceiling = { ...rest, id: ceilingId, label: `${rest.label} (project limit)`, description: `Upper limit for everyone in the project: ${rest.description}`, scope: 'project', requiresPermission: 'administrator', default: ceilingDefault, group: `Project limits: ${rest.group}` } as SettingDefinition
  return [user, ceiling]
}

/** Definitions registered with the settings service by the API host. `ai.reasoning.*` is reserved. */
export const AI_SETTING_DEFINITIONS: SettingDefinition[] = [
  {
    id: 'ai.connection.active',
    label: 'Connected account',
    description: 'Reference to your connected AI account. The credential itself is held encrypted by the assistant service and never shown.',
    helpId: 'ai.connect',
    scope: 'user',
    type: 'secret-reference',
    owner: 'assistant',
    default: null,
    group: 'Connection',
  },
  ...AI_MODULES.flatMap((m) =>
    pair({ id: `ai.access.${m.id}`, ceilingId: `ai.ceiling.${m.id}`, label: m.label, description: `AI access to ${m.label}: ${m.description}`, helpId: 'ai.policy', type: 'enum', options: LEVELS, default: 'propose', ceilingDefault: 'propose', group: 'Access per module' }),
  ),
  ...OPERATION_CLASSES.flatMap((c) =>
    pair({ id: `ai.operations.${c.id}`, ceilingId: `ai.operation-ceiling.${c.id}`, label: c.label, description: c.description, helpId: 'ai.policy', type: 'boolean', default: c.id !== 'external-generation', ceilingDefault: true, group: 'Operation classes' }),
  ),
  ...pair({ id: 'ai.sharing.selection', ceilingId: 'ai.sharing-ceiling.selection', label: 'Attached selection', description: 'Send the IDs, names and types of the objects you attach to a message.', helpId: 'ai.privacy', type: 'boolean', default: true, ceilingDefault: true, group: 'Data sharing' }),
  ...pair({ id: 'ai.sharing.open-tools', ceilingId: 'ai.sharing-ceiling.open-tools', label: 'Open tools', description: 'Send which tools are open and which one is active.', helpId: 'ai.privacy', type: 'boolean', default: true, ceilingDefault: true, group: 'Data sharing' }),
  ...pair({ id: 'ai.sharing.requirement-text', ceilingId: 'ai.sharing-ceiling.requirement-text', label: 'Requirement text', description: 'Send requirement statements and rationale in operation results. Off: they are replaced by a placeholder.', helpId: 'ai.privacy', type: 'boolean', default: true, ceilingDefault: true, group: 'Data sharing' }),
  ...pair({ id: 'ai.sharing.element-details', ceilingId: 'ai.sharing-ceiling.element-details', label: 'Model element details', description: 'Send property values, attributes and documentation of objects and model elements in operation results. Off: only IDs, names, types and revisions.', helpId: 'ai.privacy', type: 'boolean', default: true, ceilingDefault: true, group: 'Data sharing' }),
  ...pair({ id: 'ai.sharing.history-length', ceilingId: 'ai.sharing-ceiling.history-length', label: 'Conversation history', description: 'How many earlier messages and change events are sent with each request.', helpId: 'ai.privacy', type: 'number', unit: 'messages', min: 0, max: 40, integer: true, default: 12, ceilingDefault: 40, group: 'Data sharing' }),
  ...pair({ id: 'ai.limits.tool-calls', ceilingId: 'ai.limits-ceiling.tool-calls', label: 'Operations per answer', description: 'Maximum operations the model may request while answering one message.', helpId: 'ai.policy', type: 'number', unit: 'operations', min: 1, max: 60, integer: true, default: 24, ceilingDefault: 60, group: 'Limits' }),
  ...pair({ id: 'ai.limits.output-tokens', ceilingId: 'ai.limits-ceiling.output-tokens', label: 'Maximum answer length', description: 'Output token limit per model call (not accepted by ChatGPT plan usage, where the plan’s limits apply).', helpId: 'ai.policy', type: 'number', unit: 'tokens', min: 256, max: 32000, integer: true, default: 4000, ceilingDefault: 32000, group: 'Limits' }),
  ...pair({ id: 'ai.limits.timeout', ceilingId: 'ai.limits-ceiling.timeout', label: 'Request timeout', description: 'How long the server waits for one model call.', helpId: 'ai.policy', type: 'number', unit: 's', min: 10, max: 300, integer: true, default: 90, ceilingDefault: 300, group: 'Limits' }),
  ...pair({ id: 'ai.audit.store-prompts', ceilingId: 'ai.audit-ceiling.store-prompts', label: 'Store prompts for debugging', description: 'Keep the full request sent to the provider in your audit records. Off by default; turn it on only to diagnose a problem.', helpId: 'ai.privacy', type: 'boolean', default: false, ceilingDefault: true, group: 'Audit' }),
]

// ---- effective policy ------------------------------------------------------------------------------

export interface AiPolicy {
  modules: Record<string, AccessLevel>
  operations: Record<OperationClass, boolean>
  sharing: { selection: boolean; openTools: boolean; requirementText: boolean; elementDetails: boolean; historyLength: number }
  limits: { toolCalls: number; outputTokens: number; timeoutSeconds: number }
  storePrompts: boolean
}

const DEFAULTS = new Map(AI_SETTING_DEFINITIONS.map((d) => [d.id, d.default]))

/** Builds the policy from effective setting values (already clamped to project ceilings). */
export function policyFromSettings(values: Record<string, SettingValue>): AiPolicy {
  const v = (id: string) => (id in values ? values[id] : DEFAULTS.get(id))
  const modules: Record<string, AccessLevel> = {}
  for (const m of AI_MODULES) {
    const level = v(`ai.access.${m.id}`)
    modules[m.id] = level === 'off' || level === 'read' || level === 'propose' ? level : 'off'
  }
  const operations = Object.fromEntries(OPERATION_CLASSES.map((c) => [c.id, v(`ai.operations.${c.id}`) === true])) as Record<OperationClass, boolean>
  const num = (id: string) => Number(v(id))
  return {
    modules,
    operations,
    sharing: {
      selection: v('ai.sharing.selection') === true,
      openTools: v('ai.sharing.open-tools') === true,
      requirementText: v('ai.sharing.requirement-text') === true,
      elementDetails: v('ai.sharing.element-details') === true,
      historyLength: num('ai.sharing.history-length'),
    },
    limits: { toolCalls: num('ai.limits.tool-calls'), outputTokens: num('ai.limits.output-tokens'), timeoutSeconds: num('ai.limits.timeout') },
    storePrompts: v('ai.audit.store-prompts') === true,
  }
}

export type Decision = { ok: true; classified: Classified } | { ok: false; reason: string; code: 'unknown-operation' | 'not-entitled' | 'module-off' | 'read-only' | 'class-off' }

/** Whether the policy and the person's server-side entitlements allow an operation. */
export function decide(name: string, policy: AiPolicy, entitlements: string[]): Decision {
  const classified = classify(name)
  if (!classified) return { ok: false, code: 'unknown-operation', reason: `“${name}” is not an operation of this platform.` }
  const { module, operationClass, entitlement } = classified
  if (entitlement && !entitlements.includes(entitlement)) return { ok: false, code: 'not-entitled', reason: `${module.label} is not included in your subscription (${entitlement}).` }
  const level = policy.modules[module.id] ?? 'off'
  if (level === 'off') return { ok: false, code: 'module-off', reason: `AI access to ${module.label} is off in your AI settings.` }
  const changing = operationClass === 'propose' || operationClass === 'export' || operationClass === 'external-generation'
  if (level === 'read' && changing) return { ok: false, code: 'read-only', reason: `AI access to ${module.label} is read only; “${name}” prepares changes.` }
  if (!policy.operations[operationClass]) return { ok: false, code: 'class-off', reason: `The operation class “${OPERATION_CLASSES.find((c) => c.id === operationClass)?.label ?? operationClass}” is off in your AI settings.` }
  return { ok: true, classified }
}
