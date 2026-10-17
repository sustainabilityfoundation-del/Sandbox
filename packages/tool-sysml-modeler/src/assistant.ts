import { ActionError, argOptionalString, argString, type RequirementSummary, type AssistantActionContext, type AssistantActionDefinition, type AssistantContribution, type ServiceProposal, type ServiceProposalItem } from '@ews/platform-sdk'
import { SysmlClientError, type SysmlClient, type TransactionOutcome } from '@ews/sysml-client'
import { COMMAND_SCHEMAS, CREATABLE_KINDS, RULES, applyTransaction, checkCommandShape, findElements, isKindOf, loadText, validate, relationshipMatrix, requirementCoverage, impact, incomingReferences, isTextEditableNamespace, findManagedRequirementElement, resolveRef, semanticsOf, serialize, serializeElement, summarize, type Command, type Model } from '@ews/sysml-core'
import { actionFlowContext, actionFlowView, stateTransitionContext, stateTransitionView } from './projection/behavior'
import type { Graph } from './projection/graph'
import { existingSession, getClient } from './session'

/**
 * Assistant operations of the SysML Modeler (ADR-0038). Reads return data; changes are service
 * proposals built from a DRY RUN of the same typed-command transaction the UI submits. Nothing is
 * written until the user applies the proposal; Apply commits with assistant provenance, the base
 * commit captured at preparation and validation policy reject-new-errors; Undo reverts the commit.
 */

const MODULE = 'sysml-modeler'

interface Target {
  client: SysmlClient
  projectId: string
  branchId: string
  headCommitId: string
  model: Model
}

/**
 * Headless (C9): the client comes from the host configuration (the tool registration; `PlatformServices.sysml`
 * once SDK 1.8 provides it), and the model is loaded from the repository at the branch head. No view
 * needs to be mounted; when one is open on the same project, its branch is used.
 */
async function target(ctx: AssistantActionContext, projectId?: string): Promise<Target> {
  const client = getClient()
  if (!client) throw new ActionError('not-allowed', 'The SysML Modeler is not configured in this host.')
  const session = existingSession(ctx.captured.projectId)
  try {
    let pid = projectId
    if (!pid) {
      const st = session?.getState()
      pid = st?.project?.id ?? (await client.listProjects(ctx.captured.projectId))[0]?.id
    }
    if (!pid) throw new ActionError('not-found', `There is no SysML project for ${ctx.captured.projectId}. Create one first (the SysML Modeler's Start modelling, or the assistant operation sysml-modeler.create_project).`)
    const project = await client.getProject(pid)
    // C13: the assistant acts only in the platform project of the conversation.
    if (project.platformProjectId !== ctx.captured.projectId) throw new ActionError('not-allowed', `SysML project ${pid} belongs to platform project ${project.platformProjectId}, not ${ctx.captured.projectId}. Switch projects to work on it.`)
    const st = session?.getState()
    const branchId = st?.project?.id === pid && st.branch ? st.branch.id : project.defaultBranchId
    const branch = await client.getBranch(pid, branchId)
    const model = await client.loadModel(pid, branch.headCommitId!)
    return { client, projectId: pid, branchId, headCommitId: branch.headCommitId!, model }
  } catch (e) {
    if (e instanceof ActionError) throw e
    if (e instanceof SysmlClientError) throw new ActionError(e.code === 'forbidden' ? 'not-allowed' : e.code === 'not-found' ? 'not-found' : 'unavailable', e.message)
    throw e
  }
}

function element(model: Model, ref: string) {
  try {
    return resolveRef(model, ref)
  } catch (e) {
    // Suggest elements with the same simple name, and the top-level packages.
    const last = ref.split('::').pop() ?? ref
    const want = last.toLowerCase()
    const rank = (n?: string) => (!n ? 3 : n.toLowerCase() === want ? 0 : n.toLowerCase().includes(want) ? 1 : 2)
    const near = findElements(model, { text: last, limit: 300 })
      .filter((x) => !x.isLibrary && rank(x.name) < 2)
      .sort((x, y) => rank(x.name) - rank(y.name))
      .slice(0, 5)
      .map((x) => x.qualifiedName)
      .filter(Boolean)
    const s = semanticsOf(model)
    const tops = s.ownedMembers(model.rootId).map((m) => s.name(m['@id'])).filter(Boolean)
    throw new ActionError('not-found', `${e instanceof Error ? e.message : String(e)} ${near.length ? `Did you mean: ${near.join(', ')}? ` : ''}Top-level names: ${tops.join(', ') || '(none: the model is empty)'}. Use qualified names (Package::Part::feature) or sysml-modeler.find_elements.`)
  }
}

const projectArg = { projectId: { type: 'string', description: 'SysML project UUID (default: the first project of the current platform project)' } }

function previewItems(model: Model, out: TransactionOutcome): ServiceProposalItem[] {
  const s = semanticsOf(model)
  const items: ServiceProposalItem[] = out.summary.map((i) => ({
    targetId: i.kind === 'created' ? undefined : i.id,
    label: `${i.kind === 'created' ? 'Create' : i.kind === 'deleted' ? 'Delete' : 'Update'} ${i.metaclass}`,
    current: i.kind === 'created' ? undefined : (s.qualifiedName(i.id) ?? i.label),
    proposed: i.kind === 'deleted' ? '(removed)' : i.label,
    basis: 'ai-hypothesis' as const,
  }))
  for (const d of out.diagnostics.introduced.filter((x) => x.severity !== 'error')) items.push({ label: `Validation ${d.severity}`, proposed: d.message, basis: 'evidence' })
  if (!items.length) items.push({ label: 'Change', proposed: out.summaryText, basis: 'ai-hypothesis' })
  return items
}

async function propose(ctx: AssistantActionContext, args: Record<string, unknown>, commands: Command[], title: string, explanation: string): Promise<ServiceProposal | { kind: 'data'; summary: string; data: unknown }> {
  const t = await target(ctx, argOptionalString(args, 'projectId'))
  let dry: TransactionOutcome
  try {
    dry = await t.client.transact(t.projectId, t.branchId, { baseCommitId: t.headCommitId, commands, dryRun: true, validationPolicy: 'reject-new-errors' })
  } catch (e) {
    if (e instanceof SysmlClientError) {
      const diags = e.details?.diagnostics?.slice(0, 5).map((d) => `${d.ruleId}: ${d.message}`).join(' | ')
      throw new ActionError(e.code === 'rejected' ? 'invalid-arguments' : e.code === 'not-found' ? 'not-found' : 'invalid-arguments', `${e.message}${diags ? ` (${diags})` : ''} Nothing was proposed; fix the commands and try again.`)
    }
    throw e
  }
  if (!dry.changes.length) return { kind: 'data', summary: 'The model already contains this; nothing to change, so no proposal was made.', data: { changed: false } }
  const assumptions = Array.isArray(args.assumptions) ? (args.assumptions as unknown[]).map(String).slice(0, 20) : []
  let commitId: string | undefined
  return {
    kind: 'service-proposal',
    module: MODULE,
    title,
    explanation,
    preview: previewItems(t.model, dry),
    assumptions: [
      ...assumptions,
      `Prepared against commit ${t.headCommitId.slice(0, 8)}; if the same elements change before you apply, Apply is refused and nothing is written.`,
      'Applying commits with validation policy reject-new-errors and records this conversation as provenance.',
    ],
    inspected: dry.summary.slice(0, 20).map((i) => ({ id: i.id, detail: `${i.kind} ${i.metaclass} ${i.label}` })),
    apply: async (provenance) => {
      const out = await t.client.transact(t.projectId, t.branchId, { baseCommitId: t.headCommitId, commands, validationPolicy: 'reject-new-errors', reason: explanation, source: { kind: 'assistant', conversationId: provenance.conversationId, proposalId: provenance.proposalId, messageId: provenance.messageId } })
      commitId = out.commit?.id
      void existingSession(ctx.captured.projectId)?.refresh()
      return { summary: `Commit #${out.commit?.number}: ${out.summaryText}`, createdIds: Object.values(out.createdIds) }
    },
    undo: async () => {
      if (!commitId) throw new Error('Nothing was applied.')
      const out = await t.client.revert(t.projectId, commitId, t.branchId, { source: { kind: 'assistant' }, reason: `Undo of: ${title}` })
      void existingSession(ctx.captured.projectId)?.refresh()
      return { summary: out.summaryText }
    },
  }
}

const describeCommands: AssistantActionDefinition = {
  name: 'sysml-modeler.describe_commands',
  label: 'Describe SysML commands',
  description: 'Schema discovery: the typed commands (JSON schemas), creatable element kinds, validation rules and how to reference elements. Call this before proposing changes.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  run: () => ({
    kind: 'data',
    summary: `${COMMAND_SCHEMAS.length} commands, ${CREATABLE_KINDS.length} creatable kinds, ${RULES.length} validation rules`,
    data: {
      commands: COMMAND_SCHEMAS,
      creatableKinds: CREATABLE_KINDS,
      validationRules: RULES.map((r) => ({ id: r.id, severity: r.severity, title: r.title })),
      references: 'Element references are UUIDs, qualified names (Package::Part::feature) or placeholders ($name) of elements created earlier in the same proposal.',
      textualNotation: 'propose_text accepts SysML v2 textual notation (supported subset; see help topic sysml-modeler.language).',
    },
  }),
}

const findElementsAction: AssistantActionDefinition = {
  name: 'sysml-modeler.find_elements',
  label: 'Find SysML elements',
  description: 'Find model elements by name text and/or metaclass (e.g. PartDefinition, Usage, RequirementUsage), optionally within an owner. Returns qualified names, types, multiplicities and values.',
  parameters: { type: 'object', properties: { text: { type: 'string' }, metaclass: { type: 'string' }, owner: { type: 'string', description: 'Qualified name or ID of a namespace' }, limit: { type: 'number' }, ...projectArg }, additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const owner = argOptionalString(args, 'owner')
    const found = findElements(t.model, { text: argOptionalString(args, 'text'), metaclass: argOptionalString(args, 'metaclass'), ownerId: owner ? element(t.model, owner)['@id'] : undefined, recursive: true, limit: typeof args.limit === 'number' ? args.limit : 30 })
    return { kind: 'data', summary: `Found ${found.length} element${found.length === 1 ? '' : 's'}`, data: { commitId: t.headCommitId, elements: found }, inspected: found.slice(0, 10).map((f) => ({ id: f.id, detail: `${f.metaclass} ${f.qualifiedName}` })) }
  },
}

const readElement: AssistantActionDefinition = {
  name: 'sysml-modeler.read_element',
  label: 'Read a SysML element',
  description: 'An element with derived properties, owned members, incoming references and its textual notation.',
  parameters: { type: 'object', properties: { element: { type: 'string', description: 'Qualified name or ID' }, ...projectArg }, required: ['element'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const el = element(t.model, argString(args, 'element'))
    const s = semanticsOf(t.model)
    const sum = summarize(t.model, el['@id'])!
    return {
      kind: 'data',
      summary: `Read ${sum.qualifiedName ?? sum.metaclass}`,
      data: {
        element: sum,
        members: s.ownedMembers(el['@id']).map((m) => summarize(t.model, m['@id'])).filter(Boolean),
        referencedBy: incomingReferences(t.model, el['@id']).map((r) => ({ from: r.fromLabel, via: r.viaMetaclass })),
        text: el['@id'] === t.model.rootId ? serialize(t.model) : serializeElement(t.model, el['@id']),
        commitId: t.headCommitId,
      },
      inspected: [{ id: el['@id'], detail: `${el['@type']} at commit ${t.headCommitId.slice(0, 8)}` }],
    }
  },
}

const validateAction: AssistantActionDefinition = {
  name: 'sysml-modeler.validate',
  label: 'Validate the SysML model',
  description: 'Validation diagnostics of the current model (rule ID, severity, element, message).',
  parameters: { type: 'object', properties: { severity: { type: 'string', enum: ['error', 'warning', 'info'] }, ...projectArg }, additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const report = await t.client.validation(t.projectId, t.headCommitId)
    const sev = argOptionalString(args, 'severity')
    const s = semanticsOf(t.model)
    const list = report.diagnostics.filter((d) => !sev || d.severity === sev).slice(0, 100).map((d) => ({ ...d, element: d.elementId ? s.label(d.elementId) : undefined }))
    return { kind: 'data', summary: `${report.counts.error} errors, ${report.counts.warning} warnings`, data: { counts: report.counts, diagnostics: list, commitId: report.commitId } }
  },
}

const impactAction: AssistantActionDefinition = {
  name: 'sysml-modeler.impact',
  label: 'SysML impact analysis',
  description: 'What depends on an element: direct references and transitive impact (elements that type, specialize, connect or satisfy through it).',
  parameters: { type: 'object', properties: { element: { type: 'string' }, depth: { type: 'number' }, ...projectArg }, required: ['element'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const el = element(t.model, argString(args, 'element'))
    const direct = incomingReferences(t.model, el['@id'])
    const all = impact(t.model, el['@id'], typeof args.depth === 'number' ? Math.min(Math.max(args.depth, 1), 6) : 3)
    return { kind: 'data', summary: `${direct.length} direct references, ${all.length} affected elements`, data: { element: semanticsOf(t.model).label(el['@id']), direct: direct.map((r) => ({ from: r.fromLabel, via: r.viaMetaclass })), affected: all }, inspected: all.slice(0, 10).map((a) => ({ id: a.id, detail: `${a.label} (distance ${a.distance})` })) }
  },
}

const explainCommit: AssistantActionDefinition = {
  name: 'sysml-modeler.explain_commit',
  label: 'Explain a SysML change',
  description: 'What a commit changed, why (its recorded reason), who or what made it (provenance: person or assistant conversation/proposal), and which elements refer to the changed elements. Default: the latest commit.',
  parameters: { type: 'object', properties: { commit: { type: 'string', description: 'Commit number, commit ID, or "latest"' }, ...projectArg }, additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const which = argOptionalString(args, 'commit') ?? 'latest'
    const commits = await t.client.listCommits(t.projectId, { branchId: t.branchId, limit: 200 })
    const c = which === 'latest' ? commits[0] : commits.find((x) => x.id === which || String(x.number) === which.replace(/^#/, ''))
    if (!c) throw new ActionError('not-found', `No commit ${which} on this branch.`)
    const before = c.parentIds[0] ? await t.client.loadModel(t.projectId, c.parentIds[0]) : undefined
    const after = await t.client.loadModel(t.projectId, c.id)
    const changed = before ? [...after.elements()].filter((e) => before.own(e['@id']) !== e).map((e) => e['@id']) : []
    const affected = new Set<string>()
    for (const id of changed.slice(0, 200)) for (const r of incomingReferences(after, id)) if (!changed.includes(r.fromId)) affected.add(r.fromLabel)
    return {
      kind: 'data',
      summary: `Commit #${c.number}: ${c.summary}`,
      data: { number: c.number, what: c.summary, why: c.description, who: c.actor, source: c.source, when: c.created, elementVersions: c.changeCount, affectedElements: [...affected].slice(0, 50) },
      inspected: [{ id: c.id, detail: `commit #${c.number} by ${c.actor} (${c.source.kind})` }],
    }
  },
}

const proposeCommands: AssistantActionDefinition = {
  name: 'sysml-modeler.propose_commands',
  label: 'Propose SysML model changes',
  description: 'Propose a transaction of typed commands (see describe_commands). It is dry-run and validated first; the user reviews and applies it. Use placeholders ($name, set with "ref") to refer to elements created earlier in the same proposal.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' }, explanation: { type: 'string', description: 'Why: recorded as the commit reason' }, commands: { type: 'array', items: { type: 'object' } }, assumptions: { type: 'array', items: { type: 'string' } }, ...projectArg },
    required: ['title', 'explanation', 'commands'],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    if (!Array.isArray(args.commands) || !args.commands.length) throw new ActionError('invalid-arguments', '“commands” must be a non-empty list of typed commands.')
    for (const [k, c] of (args.commands as unknown[]).entries()) {
      const problem = checkCommandShape(c)
      if (problem) throw new ActionError('invalid-arguments', `Command ${k + 1}: ${problem}`)
    }
    return propose(ctx, args, args.commands as Command[], argString(args, 'title'), argString(args, 'explanation'))
  },
}

const proposeText: AssistantActionDefinition = {
  name: 'sysml-modeler.propose_text',
  label: 'Propose SysML textual notation',
  description: 'Propose SysML v2 textual notation for the members of a namespace (root, package or definition): mode "append" adds members, "replace-members" replaces them (matched elements keep their IDs). Dry-run and validated first; the user applies it.',
  parameters: {
    type: 'object',
    properties: { namespace: { type: 'string', description: 'Qualified name or ID; "root" for the model root' }, text: { type: 'string' }, mode: { type: 'string', enum: ['append', 'replace-members'] }, title: { type: 'string' }, explanation: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } }, ...projectArg },
    required: ['namespace', 'text', 'title', 'explanation'],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const ns = argString(args, 'namespace')
    const nsId = ns === 'root' ? t.model.rootId : element(t.model, ns)['@id']
    if (!isTextEditableNamespace(t.model, nsId)) throw new ActionError('invalid-arguments', 'Text can be applied to the model root, packages and definitions.')
    const mode = (argOptionalString(args, 'mode') ?? 'append') as 'append' | 'replace-members'
    return propose(ctx, args, [{ op: 'applyText', namespaceId: nsId, text: argString(args, 'text'), mode }], argString(args, 'title'), argString(args, 'explanation'))
  },
}

// ---- architecture operations (D1 step 4): create a model, link requirements and product elements ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A managed requirement (Requirements Management) by key (REQ-001) or UUID; clear errors when it cannot be used. */
async function managedRequirement(ctx: AssistantActionContext, key: string): Promise<RequirementSummary> {
  const service = ctx.services?.requirements
  if (!service) throw new ActionError('not-allowed', 'The Requirements service is not available (not provided by this host or not in the subscription), so managed requirements cannot be linked.')
  const scope = { projectId: ctx.captured.projectId, configurationId: ctx.captured.configurationId }
  const req = UUID_RE.test(key) ? await service.get(key, scope) : await service.resolve(key, scope)
  if (!req) throw new ActionError('not-found', `No managed requirement ${key} in ${ctx.captured.projectId}. Use requirements.search to find its key or UUID.`)
  return req
}

/** A product element (Project Management) by UUID, pinned to its revision when Project Management knows it. */
async function productElement(ctx: AssistantActionContext, id: string, revision?: number): Promise<{ id: string; revision?: number; label: string; assumption?: string }> {
  if (!UUID_RE.test(id)) throw new ActionError('invalid-arguments', `productElement must be the product element UUID (got “${id}”; keys such as PE-001 and names are display text). Product elements proposed in this turn get their UUID when the user applies that proposal: link them afterwards with sysml-modeler.link_product_element.`)
  const projects = ctx.services?.projects
  if (!projects) return { id, revision, label: id, assumption: 'Project Management is not available here: the product element could not be checked; the link is stored as given.' }
  const [found] = await projects.resolve(ctx.captured.projectId, [{ module: 'product', kind: 'product-element', id }])
  if (!found) throw new ActionError('not-found', `Project Management does not know product element ${id} in ${ctx.captured.projectId}. If it was proposed in this turn, the user must apply that proposal first.`)
  return { id, revision: revision ?? (typeof found.version.value === 'number' ? found.version.value : undefined), label: `${found.key} ${found.title}` }
}

interface Allocation {
  requirement: string
  satisfiedBy: string[]
}

function allocationsArg(args: Record<string, unknown>): Allocation[] {
  const raw = args.requirements
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ActionError('invalid-arguments', '“requirements” must be a list of { requirement, satisfiedBy }.')
  return raw.map((r, k) => {
    const o = r as { requirement?: unknown; satisfiedBy?: unknown }
    const by = Array.isArray(o.satisfiedBy) ? o.satisfiedBy : [o.satisfiedBy]
    if (typeof o.requirement !== 'string' || !by.length || by.some((x) => typeof x !== 'string' || !x)) throw new ActionError('invalid-arguments', `requirements[${k}] needs requirement (key or UUID) and satisfiedBy (qualified name, or a list of them).`)
    return { requirement: o.requirement, satisfiedBy: by as string[] }
  })
}

function productLinksArg(args: Record<string, unknown>): { element: string; productElement: string; revision?: number }[] {
  const raw = args.productElements
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new ActionError('invalid-arguments', '“productElements” must be a list of { element, productElement }.')
  return raw.map((r, k) => {
    const o = r as { element?: unknown; productElement?: unknown; revision?: unknown }
    if (typeof o.element !== 'string' || typeof o.productElement !== 'string') throw new ActionError('invalid-arguments', `productElements[${k}] needs element (qualified name of a part or item) and productElement (UUID).`)
    return { element: o.element, productElement: o.productElement, ...(typeof o.revision === 'number' ? { revision: o.revision } : {}) }
  })
}

/** Top-level package of an element (where generated requirement text goes). */
function topPackage(model: Model, id: string): string {
  const s = semanticsOf(model)
  let cur = s.get(id)
  let last: string | undefined
  for (let k = 0; cur && k < 50; k++) {
    if (cur['@id'] === model.rootId) break
    if (isKindOf(cur['@type'], 'Package')) last = cur['@id']
    cur = s.owner(cur['@id'])
  }
  return last ?? model.rootId
}

/** Commands linking requirements (text) and product elements (metadata) in a model; resolved and checked now. */
async function linkCommands(ctx: AssistantActionContext, model: Model, allocations: Allocation[], products: { element: string; productElement: string; revision?: number }[]): Promise<{ commands: Command[]; assumptions: string[]; summary: string[] }> {
  const commands: Command[] = []
  const assumptions: string[] = []
  const summary: string[] = []
  for (const a of allocations) {
    const req = await managedRequirement(ctx, a.requirement)
    const targets = a.satisfiedBy.map((x) => element(model, x)['@id'])
    const s = semanticsOf(model)
    for (const t of targets) {
      const ty = s.get(t)!['@type']
      if (!isKindOf(ty, 'Usage') && !isKindOf(ty, 'Definition')) throw new ActionError('invalid-arguments', `${s.label(t)} is a ${ty}; requirements are satisfied by parts (definitions or usages).`)
    }
    // One command for all paths (AUD-5): idempotent by the managed requirement UUID, so allocating again never creates a second element.
    commands.push({ op: 'importRequirement', ownerId: topPackage(model, targets[0]), requirementId: req.id, key: req.key, title: req.title, revision: req.revision, satisfiedBy: targets.map((t) => s.qualifiedName(t) ?? t) })
    summary.push(`${req.key} (rev ${req.revision}) satisfied by ${targets.map((t) => s.qualifiedName(t)).join(', ')}`)
  }
  for (const p of products) {
    const el = element(model, p.element)
    if (!/^(Part|Item)(Definition|Usage)$/.test(el['@type'])) throw new ActionError('invalid-arguments', `${semanticsOf(model).label(el['@id'])} is a ${el['@type']}; only parts and items represent product elements.`)
    const pe = await productElement(ctx, p.productElement, p.revision)
    if (pe.assumption) assumptions.push(pe.assumption)
    commands.push({ op: 'setMetadata', elementId: el['@id'], metadata: 'ProductElement', values: { productElementId: pe.id, ...(pe.revision !== undefined ? { revision: pe.revision } : {}) } })
    summary.push(`${semanticsOf(model).qualifiedName(el['@id'])} represents ${pe.label}`)
  }
  return { commands, assumptions, summary }
}

const ALLOCATION_SCHEMA = { type: 'array', description: 'Managed requirements to allocate: each becomes a SysML requirement linked to the managed requirement (pinned revision) and satisfied by the given parts.', items: { type: 'object', properties: { requirement: { type: 'string', description: 'Requirement key (REQ-001) or UUID' }, satisfiedBy: { type: 'array', items: { type: 'string' }, description: 'Qualified names of the satisfying parts' } }, required: ['requirement', 'satisfiedBy'] } }
const PRODUCT_LINKS_SCHEMA = { type: 'array', description: 'Parts or items that represent existing product elements (UUIDs of applied product elements).', items: { type: 'object', properties: { element: { type: 'string' }, productElement: { type: 'string', description: 'Product element UUID' }, revision: { type: 'number' } }, required: ['element', 'productElement'] } }

const createProject: AssistantActionDefinition = {
  name: 'sysml-modeler.create_project',
  label: 'Create a SysML project (with its initial architecture)',
  description:
    'Propose creating the SysML project of the current platform project, in ONE proposal: initialText (SysML v2 text: packages, part definitions and usages for the physical decomposition, action definitions/usages for the functional decomposition, "allocate action to part;"), plus optional requirements (managed requirements allocated to parts: each becomes a SysML requirement linked to the managed requirement and satisfied by the parts) and productElements (parts that represent EXISTING product elements, by UUID). Everything is validated now and created in one commit when the user applies it. After Apply the result names the project ID; later operations (propose_text, satisfy_requirement, link_product_element) target it by default, or pass projectId. Product elements proposed in the same turn have no UUID until applied: link them afterwards with link_product_element.',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string' }, initialText: { type: 'string', description: 'SysML v2 text for the model root, e.g. "package Arch { part def Body; part def Holder { part body : Body; } part holder : Holder; }"' }, requirements: ALLOCATION_SCHEMA, productElements: PRODUCT_LINKS_SCHEMA, explanation: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    const client = getClient()
    if (!client) throw new ActionError('not-allowed', 'The SysML Modeler is not configured in this host.')
    const name = argString(args, 'name').trim()
    if (!name) throw new ActionError('invalid-arguments', '“name” must not be empty.')
    let text = argOptionalString(args, 'initialText')?.trim() ?? ''
    const allocations = allocationsArg(args)
    const products = productLinksArg(args)
    if ((allocations.length || products.length) && !text) throw new ActionError('invalid-arguments', 'requirements and productElements refer to elements of initialText; give initialText with those parts.')
    const assumptions: string[] = []
    const linked: string[] = []
    if (text) {
      const loaded = loadText(text)
      const errors = loaded.diagnostics.filter((d) => d.severity === 'error')
      if (errors.length) throw new ActionError('invalid-arguments', `The initial text is not valid SysML (supported subset): ${errors.slice(0, 5).map((d) => `${d.ruleId} ${d.range ? `line ${d.range.start.line}:${d.range.start.column} ` : ''}${d.message}`).join(' | ')}. Nothing was proposed; fix the text (see sysml-modeler.describe_commands and help topic sysml-modeler.language).`)
      if (allocations.length || products.length) {
        const links = await linkCommands(ctx, loaded.model, allocations, products)
        const r = applyTransaction(loaded.model, { commands: links.commands, validationPolicy: 'reject-new-errors' })
        if (!r.ok) throw new ActionError('invalid-arguments', `The links cannot be added: ${r.error.message}${r.error.diagnostics?.length ? ` (${r.error.diagnostics.slice(0, 3).map((d) => `${d.ruleId}: ${d.message}`).join(' | ')})` : ''}. Nothing was proposed.`)
        text = serialize(r.model)
        assumptions.push(...links.assumptions)
        linked.push(...links.summary)
      }
      const problems = validate(loadText(text).model).filter((d) => d.severity === 'error')
      if (problems.length) throw new ActionError('invalid-arguments', `The initial model has validation errors: ${problems.slice(0, 5).map((d) => `${d.ruleId}: ${d.message}`).join(' | ')}. Nothing was proposed.`)
    }
    const existing = await client.listProjects(ctx.captured.projectId).catch((e: unknown) => {
      if (e instanceof SysmlClientError) throw new ActionError(e.code === 'forbidden' ? 'not-allowed' : 'unavailable', e.message)
      throw e
    })
    const explanation = argOptionalString(args, 'explanation') ?? `Start the SysML model of ${ctx.captured.projectId}.`
    const counts = text ? [...loadText(text).model.elements()].filter((e) => typeof e.declaredName === 'string').length : 0
    return {
      kind: 'service-proposal',
      module: MODULE,
      title: `Create SysML project “${name}”`,
      explanation,
      preview: [
        { label: 'Create SysML project', proposed: `${name} (platform project ${ctx.captured.projectId})`, basis: 'ai-hypothesis' },
        ...(text ? [{ label: 'Initial model', proposed: `${counts} named elements:\n${text.slice(0, 1500)}`, basis: 'ai-hypothesis' as const }] : []),
        ...linked.map((l) => ({ label: 'Link', proposed: l, basis: 'ai-hypothesis' as const })),
      ],
      assumptions: [
        ...assumptions,
        ...(existing.length ? [`The platform project already has ${existing.length} SysML project(s): ${existing.map((p) => p.name).join(', ')}. This adds another; pass projectId to later operations.`] : []),
        'A SysML project cannot be deleted from the assistant; its history is kept.',
      ],
      apply: async (provenance) => {
        const p = await client.createProject(
          { name, platformProjectId: ctx.captured.projectId, ...(text ? { initialText: text } : {}), source: { kind: 'assistant', conversationId: provenance.conversationId, proposalId: provenance.proposalId, messageId: provenance.messageId } },
          { idempotencyKey: `sysml-create-project:${provenance.conversationId}:${provenance.proposalId}` },
        )
        void existingSession(ctx.captured.projectId)?.open(ctx.captured.projectId, p.id)
        return { summary: `Created SysML project ${p.name} (projectId ${p.id})${linked.length ? ` with ${linked.length} link(s)` : ''}. Next: propose_text, satisfy_requirement or link_product_element with projectId ${p.id}.`, createdIds: [p.id] }
      },
    }
  },
}

const satisfyRequirement: AssistantActionDefinition = {
  name: 'sysml-modeler.satisfy_requirement',
  label: 'Allocate managed requirements to SysML parts',
  description:
    'Propose allocating managed requirements (Requirements Management, by key or UUID) to SysML parts: for each, a SysML requirement linked to the managed requirement (pinned revision; its text stays in Requirements) and "satisfy <requirement> by <part>" for each part. Use after the model exists (create_project can do the same in its first proposal). Optionally also productElements: parts that represent existing product elements.',
  parameters: { type: 'object', properties: { requirements: ALLOCATION_SCHEMA, productElements: PRODUCT_LINKS_SCHEMA, explanation: { type: 'string' }, ...projectArg }, required: ['requirements'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const allocations = allocationsArg(args)
    if (!allocations.length) throw new ActionError('invalid-arguments', '“requirements” must list at least one { requirement, satisfiedBy }.')
    const links = await linkCommands(ctx, t.model, allocations, productLinksArg(args))
    return propose(ctx, { ...args, assumptions: links.assumptions }, links.commands, `Allocate ${allocations.map((a) => a.requirement).join(', ')}`, argOptionalString(args, 'explanation') ?? links.summary.join('; '))
  },
}

const linkProductElement: AssistantActionDefinition = {
  name: 'sysml-modeler.link_product_element',
  label: 'Link a SysML element to the product element it represents',
  description: 'Propose that a SysML part or item (definition or usage) represents an EXISTING product element of Project Management (CR-PM-SYS-1), by product element UUID (from projects.list_artifacts, or the result of an applied product-element proposal), pinned to its current revision. Stored as SysML-owned metadata; no product data is copied.',
  parameters: { type: 'object', properties: { element: { type: 'string', description: 'Qualified name or ID of the SysML part or item' }, productElement: { type: 'string', description: 'Product element UUID' }, revision: { type: 'number' }, ...projectArg }, required: ['element', 'productElement'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const links = await linkCommands(ctx, t.model, [], [{ element: argString(args, 'element'), productElement: argString(args, 'productElement'), ...(typeof args.revision === 'number' ? { revision: args.revision } : {}) }])
    return propose(ctx, { ...args, assumptions: links.assumptions }, links.commands, links.summary[0], `${links.summary[0]}.`)
  },
}

const linkRequirement: AssistantActionDefinition = {
  name: 'sysml-modeler.link_requirement',
  label: 'Link a SysML requirement to a managed requirement',
  description: 'Propose linking an EXISTING SysML requirement definition or usage to a requirement managed by Requirements Management (key such as REQ-001, or UUID; pinned to its current revision). To allocate managed requirements to parts when no SysML requirement exists yet, use satisfy_requirement (or the requirements parameter of create_project).',
  parameters: { type: 'object', properties: { element: { type: 'string', description: 'Qualified name or ID of the SysML requirement' }, requirement: { type: 'string', description: 'Requirement key (REQ-001) or UUID' }, ...projectArg }, required: ['element', 'requirement'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const el = element(t.model, argString(args, 'element'))
    if (!/Requirement(Definition|Usage)$/.test(el['@type'])) throw new ActionError('invalid-arguments', `${semanticsOf(t.model).label(el['@id'])} is a ${el['@type']}, not a requirement definition or usage. To allocate a managed requirement to this part, use sysml-modeler.satisfy_requirement.`)
    const req = await managedRequirement(ctx, argString(args, 'requirement'))
    const name = semanticsOf(t.model).qualifiedName(el['@id']) ?? el['@id']
    return propose(ctx, args, [{ op: 'setMetadata', elementId: el['@id'], metadata: 'ManagedRequirement', values: { requirementId: req.id, revision: req.revision } }], `Link ${name} to ${req.key}`, `${name} stands for the managed requirement ${req.key} “${req.title}” (revision ${req.revision}); its text stays in Requirements Management.`)
  },
}

const importRequirementAction: AssistantActionDefinition = {
  name: 'sysml-modeler.import_requirement',
  label: 'Bring a managed requirement into the System Model',
  description:
    'Propose bringing a requirement managed by Requirements Management (key such as REQ-001, or UUID) into the System Model as a SysML requirement usage that carries its UUID, pinned revision, key and title (the text stays in Requirements). Optionally also satisfy links from the given parts (satisfiedBy, qualified names). Idempotent: when the model already has a requirement for that managed requirement it is reused, never duplicated, and only missing satisfy links are added. This is what fills the requirements matrix and coverage for managed requirements; for an existing SysML requirement use link_requirement.',
  parameters: {
    type: 'object',
    properties: {
      requirement: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Managed requirement key (REQ-001) or UUID, or a list of them (all with the same satisfiedBy)' },
      satisfiedBy: { type: 'array', items: { type: 'string' }, description: 'Qualified names of the parts or features that satisfy it' },
      namespace: { type: 'string', description: 'Package that receives a new requirement (default: the package of the first satisfying part, else the first package)' },
      explanation: { type: 'string' },
      ...projectArg,
    },
    required: ['requirement'],
    additionalProperties: false,
  },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const wanted = Array.isArray(args.requirement) ? args.requirement : [args.requirement]
    if (!wanted.length || wanted.some((x) => typeof x !== 'string' || !x.trim())) throw new ActionError('invalid-arguments', '“requirement” must be a key (REQ-001) or UUID, or a list of them.')
    const reqs: RequirementSummary[] = []
    for (const w of wanted as string[]) {
      const r = await managedRequirement(ctx, w.trim())
      if (!reqs.some((x) => x.id === r.id)) reqs.push(r)
    }
    const by = args.satisfiedBy === undefined ? [] : Array.isArray(args.satisfiedBy) && args.satisfiedBy.every((x) => typeof x === 'string' && x) ? (args.satisfiedBy as string[]) : undefined
    if (!by) throw new ActionError('invalid-arguments', '“satisfiedBy” must be a list of qualified names.')
    const targets = by.map((x) => element(t.model, x)['@id'])
    const s = semanticsOf(t.model)
    const ns = argOptionalString(args, 'namespace')
    const first = s.ownedMembers(t.model.rootId).find((m) => isKindOf(m['@type'], 'Package'))
    const ownerId = ns ? element(t.model, ns)['@id'] : targets.length ? topPackage(t.model, targets[0]) : (first?.['@id'] ?? t.model.rootId)
    const commands: Command[] = reqs.map((req) => ({ op: 'importRequirement', ownerId, requirementId: req.id, key: req.key, title: req.title, revision: req.revision, ...(targets.length ? { satisfiedBy: targets.map((x) => s.qualifiedName(x) ?? x) } : {}) }))
    const parts = reqs.map((req) => {
      const existing = findManagedRequirementElement(t.model, req.id)
      return `${req.key} “${req.title}” (revision ${req.revision}) ${existing ? `reuses ${s.qualifiedName(existing['@id']) ?? existing['@id']} (no second element)` : `becomes a requirement in ${s.qualifiedName(ownerId) ?? 'the model root'}`}`
    })
    const keys = reqs.map((r) => r.key).join(', ')
    return propose(ctx, args, commands, `Bring ${keys} into the System Model`, argOptionalString(args, 'explanation') ?? `${parts.join('; ')}${targets.length ? `; satisfied by ${by.join(', ')}` : ''}. Their text stays in Requirements Management.`)
  },
}

const matrixAction: AssistantActionDefinition = {
  name: 'sysml-modeler.matrix',
  label: 'SysML relationship matrix',
  description: 'Relationship matrix (Grid View): satisfy (requirements × satisfying features), allocate (sources × targets) or connect (parts × parts of a part definition, given as scope). Rows include unsatisfied requirements.',
  parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['satisfy', 'allocate', 'connect'] }, scope: { type: 'string', description: 'Namespace (or part definition for connect); default: whole model' }, ...projectArg }, required: ['kind'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const kind = argString(args, 'kind') as 'satisfy' | 'allocate' | 'connect'
    const scopeRef = argOptionalString(args, 'scope')
    const scope = scopeRef ? element(t.model, scopeRef)['@id'] : t.model.rootId
    const m = relationshipMatrix(t.model, kind, scope)
    const label = new Map([...m.rows, ...m.cols].map((a) => [a.key, a.displayId ?? a.label]))
    const cells = m.cells.map((c) => ({ row: label.get(c.row), col: label.get(c.col), relationships: c.relationships.map((r) => r.metaclass) }))
    const emptyRows = m.rows.filter((r) => !m.cells.some((c) => c.row === r.key)).map((r) => r.displayId ?? r.label)
    return { kind: 'data', summary: `${kind} matrix: ${m.rows.length} × ${m.cols.length}, ${cells.length} filled cells`, data: { kind, rows: m.rows.map((r) => r.displayId ?? r.label), columns: m.cols.map((c) => c.label), cells, rowsWithoutRelationships: emptyRows, notes: m.notes } }
  },
}

const coverageAction: AssistantActionDefinition = {
  name: 'sysml-modeler.coverage',
  label: 'SysML requirement coverage',
  description: 'Requirement coverage: for each requirement usage, the features that satisfy it, the verification cases that verify it, its managed-requirement link, and a status (satisfied-and-verified, satisfied, verified, not-covered). gapsOnly lists only incomplete ones.',
  parameters: { type: 'object', properties: { scope: { type: 'string' }, gapsOnly: { type: 'boolean' }, ...projectArg }, additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const scopeRef = argOptionalString(args, 'scope')
    const report = requirementCoverage(t.model, scopeRef ? element(t.model, scopeRef)['@id'] : t.model.rootId)
    const list = report.requirements.filter((r) => args.gapsOnly !== true || r.status !== 'satisfied-and-verified')
    return {
      kind: 'data',
      summary: `${report.counts.total} requirements: ${report.counts['satisfied-and-verified']} satisfied and verified, ${report.counts['not-covered']} not covered`,
      data: { counts: report.counts, requirements: list.map((r) => ({ requirement: r.label, shortName: r.shortName, status: r.status, satisfiedBy: r.satisfiedBy.map((x) => x.label), verifiedBy: r.verifiedBy.map((x) => x.label), managedRequirementId: r.managed?.requirementId, pinnedRevision: r.managed?.revision })), note: 'Satisfaction is a modelled claim and verification a modelled objective; test results are records in Requirements Management.' },
      inspected: list.slice(0, 10).map((r) => ({ id: r.id, detail: `${r.label}: ${r.status}` })),
    }
  },
}

const behaviourAction: AssistantActionDefinition = {
  name: 'sysml-modeler.behavior',
  label: 'SysML behaviour (action flow or state machine)',
  description: 'Reads the Action Flow View (actions, successions, flows, parameters) or State Transition View (states, entry/do/exit actions, transitions with triggers and guards) of an action or state definition/usage. Descriptive only: nothing is executed or simulated.',
  parameters: { type: 'object', properties: { view: { type: 'string', enum: ['action-flow', 'state-transition'] }, element: { type: 'string', description: 'Qualified name or ID of the action/state definition or usage (or an element inside it); default: the first one in the model' }, ...projectArg }, required: ['view'], additionalProperties: false },
  run: async (args, ctx) => {
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const view = argString(args, 'view') as 'action-flow' | 'state-transition'
    const find = view === 'action-flow' ? actionFlowContext : stateTransitionContext
    const ref = argOptionalString(args, 'element')
    let contextId = ref ? find(t.model, element(t.model, ref)['@id']) : undefined
    if (!ref) for (const el of t.model.elements()) if (!t.model.isLibrary(el['@id']) && find(t.model, el['@id']) === el['@id']) { contextId = el['@id']; break }
    if (!contextId) throw new ActionError('not-found', ref ? `${ref} is not inside an ${view === 'action-flow' ? 'action' : 'state'} definition or usage with ${view === 'action-flow' ? 'actions' : 'states'}.` : 'The model has no behaviour of that kind.')
    const g: Graph = view === 'action-flow' ? actionFlowView(t.model, contextId) : stateTransitionView(t.model, contextId)
    const s = semanticsOf(t.model)
    const nodes = g.nodes[0]?.children ?? []
    const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? (id.startsWith('initial:') ? '(initial)' : (g.nodes[0]?.ports.find((p) => p.id === id)?.name ?? nodes.flatMap((n) => n.ports).find((p) => p.id === id)?.name ?? id))
    return {
      kind: 'data',
      summary: (() => {
        const count = (k: string) => g.edges.filter((e) => e.kind === k).length
        const real = nodes.filter((n) => !n.shape)
        if (view === 'state-transition') {
          const initial = g.edges.find((e) => e.source.startsWith('initial:'))
          return `${s.qualifiedName(contextId) ?? s.label(contextId)}: ${real.length} states (${real.map((n) => n.name).join(', ')}), ${count('transition')} transitions${initial ? `, initial state ${name(initial.target)}` : ''}; triggers: ${[...new Set(g.edges.filter((e) => e.kind === 'transition' && e.label).map((e) => e.label!.split(' (')[0]))].join(', ') || 'none'}`
        }
        return `${s.qualifiedName(contextId) ?? s.label(contextId)}: ${real.length} actions (${real.map((n) => n.name).join(', ')}), ${count('succession')} successions, ${count('flow')} flows`
      })(),
      data: {
        view,
        context: s.qualifiedName(contextId),
        parameters: g.nodes[0]?.ports.map((p) => p.name),
        nodes: nodes.filter((n) => n.shape !== 'initial').map((n) => ({ name: n.name, keyword: n.keyword, compartments: n.compartments.map((c) => ({ title: c.title, items: c.items.map((i) => i.text) })), parameters: n.ports.length ? n.ports.map((p) => p.name) : undefined })),
        edges: g.edges.map((e) => ({ kind: e.kind, from: name(e.source), to: name(e.target), label: e.label })),
        notes: g.notes,
      },
    }
  },
}

// ---- scripted demo planning (DEMO ONLY; no model provider) -----------------------------------
const THERMAL = `package Thermal {
    doc /* Demo elaboration: thermal management of the motor (heat sink and temperature monitoring). */
    private import ISQ::*;
    private import SI::*;
    part def HeatSink {
        attribute thermalResistance : ScalarValues::Real = 1.2;
        attribute mass : MassValue = 0.15 [kg];
    }
    part def TemperatureSensor {
        attribute maxTemperature : ThermodynamicTemperatureValue = 423 [K];
    }
    part def CoolingSubsystem {
        part sink : HeatSink;
        part sensor : TemperatureSensor;
    }
}`

const KIND_WORDS: Record<string, string> = { part: 'PartDefinition', port: 'PortDefinition', item: 'ItemDefinition', attribute: 'AttributeDefinition', requirement: 'RequirementDefinition', action: 'ActionDefinition', state: 'StateDefinition', package: 'Package' }

export const sysmlModelerDemo: AssistantContribution['demo'] = (text) => {
  const t = text.trim()
  let m: RegExpExecArray | null
  if (/sysml/i.test(t) && /(commands|what can you do|schema)/i.test(t)) return { reply: 'These are the typed SysML Modeler commands I can use (the same ones the editor uses).', calls: [{ name: 'sysml-modeler.describe_commands', arguments: {} }] }
  if (/(validate|check) (the )?(sysml )?model/i.test(t)) return { reply: 'I validated the SysML model with the module’s rules.', calls: [{ name: 'sysml-modeler.validate', arguments: {} }] }
  if ((m = /(?:what|which elements?) (?:uses|use|references?|depends? on|is affected by changing) ([\w:']+)/i.exec(t))) return { reply: `Here is what depends on ${m[1]} in the SysML model.`, calls: [{ name: 'sysml-modeler.impact', arguments: { element: m[1] } }] }
  if (/(explain|what was) (the )?(last|latest) (sysml )?change|what changed in the (sysml )?model/i.test(t)) return { reply: 'This is the latest commit with its reason and provenance.', calls: [{ name: 'sysml-modeler.explain_commit', arguments: { commit: 'latest' } }] }
  if ((m = /add an? (part|port|item|attribute|requirement|action|state)(?: def(?:inition)?)? (?:named|called) (\w+) (?:to|in|into) ([\w:]+)/i.exec(t))) {
    const kind = KIND_WORDS[m[1].toLowerCase()]
    return {
      reply: `I prepared a proposal to add ${m[1]} definition ${m[2]} to ${m[3]}. Review it and choose Apply.`,
      calls: [{ name: 'sysml-modeler.propose_commands', arguments: { title: `Add ${m[1]} def ${m[2]}`, explanation: `Requested in the conversation: add a ${m[1]} definition named ${m[2]} to ${m[3]}.`, commands: [{ op: 'createElement', ownerId: m[3], kind, name: m[2] }] } }],
    }
  }
  if (/(add|elaborate|design) (a )?(cooling|thermal)/i.test(t)) {
    return {
      reply: 'I drafted a thermal management package (heat sink, temperature sensor, cooling subsystem) in SysML v2 text. It is a demo elaboration with assumed values; review the preview before applying.',
      calls: [{ name: 'sysml-modeler.propose_text', arguments: { namespace: 'ActuatorSystem', mode: 'append', title: 'Add a cooling subsystem (demo elaboration)', explanation: 'Elaborates thermal management for the motor as a new package; values are assumptions to be refined.', text: THERMAL, assumptions: ['Thermal resistance 1.2 K/W, heat sink mass 0.15 kg and a 423 K (150 °C) sensor limit are assumed placeholder values.'] } }],
    }
  }
  if ((m = /link (?:the )?(?:sysml )?(?:requirement )?([\w:]+) (?:to|with) (REQ-\d+)/i.exec(t))) return { reply: `I prepared a proposal to link ${m[1]} to the managed requirement ${m[2]}.`, calls: [{ name: 'sysml-modeler.link_requirement', arguments: { element: m[1], requirement: m[2] } }] }
  if (/(requirement )?coverage|requirements? (?:are|is) not (?:satisfied|covered|verified)|unsatisfied requirements/i.test(t)) return { reply: 'This is the requirement coverage of the SysML model (modelled satisfaction and verification).', calls: [{ name: 'sysml-modeler.coverage', arguments: { gapsOnly: /not|gap|unsatisfied/i.test(t) } }] }
  if ((m = /(satisfy|satisfaction|allocation|allocate|connection|connect) matrix/i.exec(t))) {
    const kind = /^satisf/i.test(m[1]) ? 'satisfy' : /^alloc/i.test(m[1]) ? 'allocate' : 'connect'
    return { reply: `Here is the ${kind} matrix.`, calls: [{ name: 'sysml-modeler.matrix', arguments: kind === 'connect' ? { kind, scope: 'LinearActuator' } : { kind } }] }
  }
  if (/state machine|state transition|states of|transitions/i.test(t)) return { reply: 'This is the state machine as modelled (descriptive, not simulated).', calls: [{ name: 'sysml-modeler.behavior', arguments: { view: 'state-transition' } }] }
  if (/action flow|control loop|actions of/i.test(t)) return { reply: 'This is the action flow as modelled (descriptive, not executed).', calls: [{ name: 'sysml-modeler.behavior', arguments: { view: 'action-flow' } }] }
  if ((m = /find (?:the )?(?:sysml )?(?:element|part|definition)s? (?:named |called )?([\w']+)/i.exec(t))) return { reply: `Elements matching “${m[1]}”:`, calls: [{ name: 'sysml-modeler.find_elements', arguments: { text: m[1] } }] }
  return null
}

export const sysmlModelerAssistant: AssistantContribution = {
  actions: [describeCommands, findElementsAction, readElement, validateAction, impactAction, explainCommit, matrixAction, coverageAction, behaviourAction, createProject, proposeCommands, proposeText, satisfyRequirement, importRequirementAction, linkRequirement, linkProductElement],
  demo: sysmlModelerDemo,
}
