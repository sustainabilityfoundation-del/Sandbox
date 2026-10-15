import { ActionError, argOptionalString, argString, type AssistantActionContext, type AssistantActionDefinition, type AssistantContribution, type ServiceProposal, type ServiceProposalItem } from '@ews/platform-sdk'
import { SysmlClientError, type SysmlClient, type TransactionOutcome } from '@ews/sysml-client'
import { COMMAND_SCHEMAS, CREATABLE_KINDS, RULES, checkCommandShape, findElements, relationshipMatrix, requirementCoverage, impact, incomingReferences, isTextEditableNamespace, resolveRef, semanticsOf, serialize, serializeElement, summarize, type Command, type Model } from '@ews/sysml-core'
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
    if (!pid) throw new ActionError('not-found', `There is no SysML project for ${ctx.captured.projectId}. Create one in the SysML Modeler first.`)
    const project = await client.getProject(pid)
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
    throw new ActionError('not-found', e instanceof Error ? e.message : String(e))
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

async function propose(ctx: AssistantActionContext, args: Record<string, unknown>, commands: Command[], title: string, explanation: string): Promise<ServiceProposal> {
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

const linkRequirement: AssistantActionDefinition = {
  name: 'sysml-modeler.link_requirement',
  label: 'Link a SysML requirement to a managed requirement',
  description: 'Propose linking a SysML requirement definition or usage to a requirement managed by Requirements Management (by key such as REQ-001, resolved to its canonical UUID and pinned to its current revision). The requirement text stays in Requirements.',
  parameters: { type: 'object', properties: { element: { type: 'string', description: 'Qualified name or ID of the SysML requirement' }, requirement: { type: 'string', description: 'Requirement key (REQ-001) or UUID' }, ...projectArg }, required: ['element', 'requirement'], additionalProperties: false },
  run: async (args, ctx) => {
    const service = ctx.services?.requirements
    if (!service) throw new ActionError('not-allowed', 'The Requirements service is not available (not provided or not in the subscription).')
    const t = await target(ctx, argOptionalString(args, 'projectId'))
    const el = element(t.model, argString(args, 'element'))
    if (!/Requirement(Definition|Usage)$/.test(el['@type'])) throw new ActionError('invalid-arguments', `${semanticsOf(t.model).label(el['@id'])} is a ${el['@type']}, not a requirement definition or usage.`)
    const key = argString(args, 'requirement')
    const scope = { projectId: ctx.captured.projectId, configurationId: ctx.captured.configurationId }
    const req = /^[0-9a-f-]{36}$/i.test(key) ? await service.get(key, scope) : await service.resolve(key, scope)
    if (!req) throw new ActionError('not-found', `No managed requirement ${key} in ${ctx.captured.projectId}.`)
    const name = semanticsOf(t.model).qualifiedName(el['@id']) ?? el['@id']
    return propose(ctx, args, [{ op: 'setMetadata', elementId: el['@id'], metadata: 'ManagedRequirement', values: { requirementId: req.id, revision: req.revision } }], `Link ${name} to ${req.key}`, `${name} stands for the managed requirement ${req.key} “${req.title}” (revision ${req.revision}); its text stays in Requirements Management.`)
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
    const label = new Map([...m.rows, ...m.cols].map((a) => [a.key, a.label]))
    const cells = m.cells.map((c) => ({ row: label.get(c.row), col: label.get(c.col), relationships: c.relationships.map((r) => r.metaclass) }))
    const emptyRows = m.rows.filter((r) => !m.cells.some((c) => c.row === r.key)).map((r) => r.label)
    return { kind: 'data', summary: `${kind} matrix: ${m.rows.length} × ${m.cols.length}, ${cells.length} filled cells`, data: { kind, rows: m.rows.map((r) => r.label), columns: m.cols.map((c) => c.label), cells, rowsWithoutRelationships: emptyRows, notes: m.notes } }
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
  actions: [describeCommands, findElementsAction, readElement, validateAction, impactAction, explainCommit, matrixAction, coverageAction, behaviourAction, proposeCommands, proposeText, linkRequirement],
  demo: sysmlModelerDemo,
}
