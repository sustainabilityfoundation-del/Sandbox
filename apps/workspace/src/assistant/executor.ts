import { formatValue, isQuantity, outputFreshness, propertyLabel, type ActivitySource, type EngineeringObject, type ModelIndex, type ObjectType, type OutputRecord, type PropertyValue } from '@ews/model-service'
import { workspaceHelp } from '../help/workspaceHelp'
import { ActionError, type ActionParameters, type ChangeInput, type EntitlementId, type ServiceProposal } from '@ews/platform-sdk'
import { workspaceServices } from '../platform/services'
import { registerServiceHandlers } from './serviceProposals'
import type { ToolAccess } from '../platform/entitlements'
import { affectedOutputs, buildPreview, buildUndo, describeChange } from './proposals'
import { findToolAction, isPlatformOperation, operationLabel } from './toolSpecs'
import { clientDecision } from './aiPolicy'
import type { CapturedMessageContext, ChangeProposal, PreviewChange, ToolCallRequest, ToolCallResult } from './types'

/** What the assistant may touch in the application. Implemented over existing workspace services. */
export interface AssistantEnvironment {
  getModel: () => ModelIndex
  getOutputs: () => OutputRecord[]
  select: (ids: string[]) => void
  listTools: () => { id: string; name: string }[]
  /** Opens a tool through the platform; refused (with the reason) outside the subscription. */
  openTool: (toolId: string) => ToolAccess
  /** Whether the subscription includes an entitlement right now. */
  isEntitled: (entitlement: EntitlementId) => boolean
  createProposal: (draft: {
    title: string
    explanation: string
    configurationId: string
    changes: PreviewChange[]
    affectedOutputIds: string[]
    requiredEntitlements: EntitlementId[]
    undoOf?: string
    service?: ChangeProposal['service']
  }) => ChangeProposal
  getProposal: (id: string) => ChangeProposal | undefined
}

export interface ExecutionContext {
  captured: CapturedMessageContext
  source: ActivitySource
  env: AssistantEnvironment
}

/** A record of model information the assistant looked at, shown under "Inspected". */
export interface InspectedItem {
  id: string
  detail: string
}

export interface ToolOutcome extends ToolCallResult {
  /** One-line status for the conversation. */
  summary: string
  inspected: InspectedItem[]
  proposalId?: string
}

class ToolError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

// ---- argument validation -------------------------------------------------------

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new ToolError('invalid-arguments', `“${key}” must be a non-empty string.`)
  return value.trim()
}

function optStr(args: Record<string, unknown>, key: string): string | undefined {
  return args[key] === undefined ? undefined : str(args, key)
}

/** Basic schema check for tool-contributed actions: required keys present, no unknown keys. */
function checkArguments(parameters: ActionParameters, args: Record<string, unknown>) {
  for (const key of parameters.required ?? []) {
    if (args[key] === undefined || args[key] === null) throw new ToolError('invalid-arguments', `“${key}” is required.`)
  }
  if (parameters.additionalProperties === false) {
    const unknown = Object.keys(args).filter((k) => !(k in parameters.properties))
    if (unknown.length) throw new ToolError('invalid-arguments', `Unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}.`)
  }
  for (const [key, spec] of Object.entries(parameters.properties)) {
    const allowed = (spec as { enum?: unknown[] }).enum
    if (allowed && args[key] !== undefined && !allowed.includes(args[key])) {
      throw new ToolError('invalid-arguments', `“${key}” must be one of ${allowed.join(', ')}.`)
    }
  }
}

const OBJECT_TYPES: ObjectType[] = ['assembly', 'part', 'requirement', 'sysml-element', 'cad-representation', 'procedure']

function describeProperties(holder: { properties: Record<string, PropertyValue> }) {
  return Object.entries(holder.properties).map(([key, value]) => ({
    key,
    label: propertyLabel(key),
    value: isQuantity(value) ? value.value : value,
    unit: isQuantity(value) ? value.unit : undefined,
    display: formatValue(value),
  }))
}

function objectSummary(o: EngineeringObject) {
  return { id: o.id, name: o.name, type: o.type }
}

function artifactProvenance(o: OutputRecord, model: ModelIndex) {
  const freshness = outputFreshness(o, model)
  return {
    id: o.id,
    title: o.title,
    summary: o.summary,
    producedBy: o.toolId,
    kind: o.kind,
    schemaVersion: o.schemaVersion,
    objectIds: o.objectIds,
    configurationId: o.configurationId,
    inputRevision: o.inputRevision,
    inputs: o.inputs,
    createdAt: o.createdAt,
    reviewStatus: o.reviewStatus,
    stale: freshness.stale,
    staleReasons: freshness.reasons,
  }
}

type Outcome = Omit<ToolOutcome, 'callId' | 'name' | 'ok'>

/** Validates a proposal against entitled rules and records it for the user to review. */
function propose(
  ctx: ExecutionContext,
  title: string,
  explanation: string,
  changes: ChangeInput[] | null,
  undoOf?: string,
  extraInspected: InspectedItem[] = [],
): Outcome {
  const { env, captured } = ctx
  const model = env.getModel()
  let preview
  if (undoOf) {
    const original = env.getProposal(undoOf)
    if (!original) throw new ToolError('not-found', `Proposal ${undoOf} does not exist in this conversation.`)
    preview = buildUndo(original, model)
  } else {
    preview = buildPreview(changes ?? [], model)
  }
  if (!preview.ok) throw new ToolError(preview.code, preview.message)
  const affected = affectedOutputs(preview.changes, env.getOutputs())
  const proposal = env.createProposal({
    title,
    explanation,
    configurationId: captured.configurationId,
    changes: preview.changes,
    affectedOutputIds: affected,
    requiredEntitlements: preview.requiredEntitlements,
    undoOf,
  })
  return {
    data: { proposalId: proposal.id, status: 'awaiting user review', changes: proposal.changes.map(describeChange), affectedArtifacts: affected },
    summary: `Prepared ${proposal.id} for review (${proposal.changes.length} change${proposal.changes.length === 1 ? '' : 's'})`,
    inspected: [
      ...extraInspected,
      ...preview.changes.flatMap((c) =>
        c.kind === 'set-property'
          ? [{ id: c.targetId, detail: `${c.label}: current ${formatValue(c.current)}, rev ${c.expectedRevision}` }]
          : c.kind === 'create-object'
            ? []
            : [{ id: c.from, detail: `${c.type} → ${c.to}` }],
      ),
    ],
    proposalId: proposal.id,
  }
}

// ---- platform operations ------------------------------------------------------------------

type Handler = (args: Record<string, unknown>, ctx: ExecutionContext) => Promise<Outcome>

const handlers: Record<string, Handler> = {
  async read_object(args, { env }) {
    const id = str(args, 'id')
    const model = env.getModel()
    const object = model.get(id)
    const target = object ?? model.scenario(id)
    if (!target) throw new ToolError('not-found', `${id} does not exist.`)
    const kind = object ? object.type : 'scenario'
    const relationships = object ? model.relationshipsOf(id).map((r) => ({ type: r.type, from: r.from, to: r.to })) : []
    return {
      data: { id: target.id, kind, name: target.name, revision: target.revision, parentId: object?.parentId, properties: describeProperties(target), relationships },
      summary: `Read ${target.id} ${target.name} (rev ${target.revision})`,
      inspected: [{ id: target.id, detail: `${kind}, rev ${target.revision}: ${Object.keys(target.properties).length} properties` }],
    }
  },

  async search_objects(args, { env }) {
    const query = str(args, 'query').toLowerCase()
    const type = optStr(args, 'type') as ObjectType | undefined
    if (type && !OBJECT_TYPES.includes(type)) throw new ToolError('invalid-arguments', `Unknown type “${type}”.`)
    const model = env.getModel()
    const scored = model.objects
      .filter((o) => !type || o.type === type)
      .map((o) => {
        const statement = typeof o.properties.statement === 'string' ? o.properties.statement.toLowerCase() : ''
        const name = o.name.toLowerCase()
        const score = o.id.toLowerCase() === query ? 4 : name === query ? 3 : name.includes(query) ? 2 : statement.includes(query) ? 1 : 0
        return { o, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return {
      data: { query, matches: scored.map((x) => ({ ...objectSummary(x.o), score: x.score })) },
      summary: `Found ${scored.length} match${scored.length === 1 ? '' : 'es'} for “${query}”`,
      inspected: scored.map((x) => ({ id: x.o.id, detail: `search match (${x.o.type})` })),
    }
  },

  async read_relationships(args, { env }) {
    const objectId = str(args, 'objectId')
    const model = env.getModel()
    if (!model.get(objectId)) throw new ToolError('not-found', `${objectId} does not exist.`)
    const relationships = model
      .relationshipsOf(objectId)
      .map((r) => ({ id: r.id, type: r.type, from: r.from, to: r.to, fromName: model.nameOf(r.from), toName: model.nameOf(r.to) }))
    return {
      data: { relationships },
      summary: `Read ${relationships.length} relationships of ${objectId}`,
      inspected: [{ id: objectId, detail: `${relationships.length} relationships` }],
    }
  },

  async read_artifacts(args, { env, captured }) {
    const objectId = optStr(args, 'objectId')
    const staleOnly = args.staleOnly === true
    const model = env.getModel()
    const artifacts = env
      .getOutputs()
      .filter((o) => o.configurationId === captured.configurationId && (!objectId || o.objectIds.includes(objectId)))
      .map((o) => artifactProvenance(o, model))
      .filter((o) => !staleOnly || o.stale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      data: { configurationId: captured.configurationId, artifacts },
      summary: `Read ${artifacts.length} saved artifact${artifacts.length === 1 ? '' : 's'} in ${captured.configurationId}${staleOnly ? ' (stale only)' : ''}`,
      inspected: artifacts.map((o) => ({ id: o.id, detail: `${o.producedBy}, input rev ${o.inputRevision}${o.stale ? ', potentially stale' : ''}` })),
    }
  },

  /**
   * Documentation from the Help Service: the same pages people read, filtered by the modules the
   * user may use. Prose explains; executable behaviour comes only from the operation registry.
   */
  async read_help(args, { env }) {
    const topicId = optStr(args, 'topicId')
    const query = optStr(args, 'query')
    const objectId = optStr(args, 'objectId')
    const operation = optStr(args, 'operation')
    if (!topicId && !query && !objectId && !operation) throw new ToolError('invalid-arguments', 'Give a topicId, query, objectId or operation.')
    const describe = (r: NonNullable<ReturnType<typeof workspaceHelp.topic>>) => ({
      id: r.topic.id, module: r.moduleId, docsVersion: r.docsVersion, title: r.topic.title, kind: r.topic.kind,
      summary: r.topic.summary, body: r.topic.body, related: r.topic.related ?? [], operations: r.topic.operations ?? [], source: r.topic.source,
    })
    const note = 'Documentation explains behaviour; only registered operations can be executed.'
    if (topicId) {
      const r = workspaceHelp.topic(topicId)
      if (!r) throw new ToolError('not-found', `Help topic ${topicId} is not available (unknown, or outside the user's subscription).`)
      return { data: { topic: describe(r), note }, summary: `Read help: ${r.topic.title}`, inspected: [{ id: r.topic.id, detail: `help topic (${r.moduleId} docs ${r.docsVersion})` }] }
    }
    if (objectId || operation) {
      const object = objectId ? env.getModel().get(objectId) : undefined
      if (objectId && !object) throw new ToolError('not-found', `${objectId} does not exist.`)
      const topics = workspaceHelp.contextual({ objectType: object?.type, operation }).slice(0, 3)
      return { data: { topics: topics.map(describe), note }, summary: `Read help for ${objectId ?? operation}`, inspected: topics.map((t) => ({ id: t.topic.id, detail: 'help topic' })) }
    }
    const hits = workspaceHelp.search(query!, { limit: 5 })
    return {
      data: { query, results: hits.map((h) => ({ id: h.id, module: h.moduleId, docsVersion: h.docsVersion, title: h.title, kind: h.kind, summary: h.summary, snippet: h.snippet, source: h.source })), note },
      summary: `Searched help for “${query}”: ${hits.length} topic${hits.length === 1 ? '' : 's'}`,
      inspected: hits.map((h) => ({ id: h.id, detail: `help topic, score ${h.score}` })),
    }
  },

  async propose_changes(args, ctx) {
    const title = str(args, 'title')
    const explanation = str(args, 'explanation')
    const undoOf = optStr(args, 'undoOf')
    if (!undoOf && !Array.isArray(args.changes)) throw new ToolError('invalid-arguments', '“changes” must be a list.')
    return propose(ctx, title, explanation, undoOf ? null : (args.changes as ChangeInput[]), undoOf)
  },

  async select_objects(args, { env }) {
    if (!Array.isArray(args.ids) || args.ids.some((i) => typeof i !== 'string')) {
      throw new ToolError('invalid-arguments', '“ids” must be a list of object IDs.')
    }
    const model = env.getModel()
    const ids = args.ids as string[]
    const missing = ids.filter((id) => !model.get(id))
    if (missing.length) throw new ToolError('not-found', `Unknown objects: ${missing.join(', ')}.`)
    env.select(ids)
    return { data: { selected: ids }, summary: `Selected ${ids.join(', ') || 'nothing'}`, inspected: [] }
  },

  async open_tool(args, { env }) {
    const toolId = str(args, 'toolId')
    const tool = env.listTools().find((t) => t.id === toolId)
    if (!tool) throw new ToolError('not-found', `No tool “${toolId}”. Available: ${env.listTools().map((t) => t.id).join(', ')}.`)
    const access = env.openTool(toolId)
    if (!access.ok) throw new ToolError(access.code === 'not-entitled' ? 'not-entitled' : 'not-found', access.reason)
    return { data: { opened: toolId, name: tool.name }, summary: `Opened ${tool.name}`, inspected: [] }
  },
}

// ---- tool-contributed actions -------------------------------------------------------------

async function runToolAction(call: ToolCallRequest, ctx: ExecutionContext): Promise<Outcome> {
  const found = findToolAction(call.name)
  if (!found) throw new ToolError('not-allowed', `Operation “${call.name}” is not allowed.`)
  const { tool, action } = found
  // Checked at execution time, against the subscription now; never redirected to another tool.
  if (!ctx.env.isEntitled(tool.entitlement)) {
    throw new ToolError('not-entitled', `${action.label} needs ${tool.name}, which is not included in your subscription. Nothing was changed.`)
  }
  const args = call.arguments ?? {}
  checkArguments(action.parameters, args)
  const model = ctx.env.getModel()
  const artifacts = ctx.env.getOutputs().filter((o) => o.configurationId === ctx.captured.configurationId)
  let result
  try {
    result = await action.run(args, {
      model,
      artifacts,
      captured: {
        projectId: ctx.captured.projectId,
        configurationId: ctx.captured.configurationId,
        scenarioId: ctx.captured.scenarioId,
        modelRevision: ctx.captured.modelRevision,
        selectionIds: ctx.captured.selection.map((s) => s.id),
      },
      services: workspaceServices,
    })
  } catch (error) {
    if (error instanceof ActionError) throw new ToolError(error.code, error.message)
    throw error
  }
  if (result.kind === 'data') return { data: result.data, summary: result.summary, inspected: result.inspected ?? [] }
  if (result.kind === 'service-proposal') return proposeService(ctx, tool.entitlement, result)
  // Proposals go through the same validation as any other change.
  return propose(ctx, result.title, result.explanation, result.changes, undefined, result.inspected)
}

/**
 * A change to a service-backed module (SDK 1.5). Nothing is written now: the platform shows the
 * preview and calls the module's API only when the user applies it.
 */
function proposeService(ctx: ExecutionContext, entitlement: EntitlementId, result: ServiceProposal): Outcome {
  if (!result.preview.length) throw new ToolError('invalid-arguments', 'A service proposal needs at least one previewed item.')
  const proposal = ctx.env.createProposal({
    title: result.title,
    explanation: result.explanation,
    configurationId: ctx.captured.configurationId,
    changes: [],
    affectedOutputIds: [],
    requiredEntitlements: [entitlement],
    service: { module: result.module, items: result.preview, assumptions: result.assumptions ?? [] },
  })
  registerServiceHandlers(proposal.id, result)
  return {
    proposalId: proposal.id,
    data: {
      proposalId: proposal.id,
      status: 'awaiting user review',
      changes: result.preview.map((p) => `${p.label}: ${p.proposed}`),
      affectedArtifacts: [],
    },
    summary: `Prepared ${proposal.id}: ${result.title}`,
    inspected: result.inspected ?? [],
  }
}

/** Executes one call. Never throws; failures are returned to the assistant. */
export async function executeToolCall(call: ToolCallRequest, ctx: ExecutionContext): Promise<ToolOutcome> {
  const label = operationLabel(call.name)
  try {
    // The AI access settings, checked again at execution (the server already refused disallowed calls).
    const allowed = clientDecision(call.name)
    if (!allowed.ok) throw new ToolError('not-allowed', `${allowed.reason} Nothing was run.`)
    const outcome = isPlatformOperation(call.name) ? await handlers[call.name](call.arguments ?? {}, ctx) : await runToolAction(call, ctx)
    return { callId: call.id, name: call.name, ok: true, ...outcome }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      error: message,
      errorCode: error instanceof ToolError ? error.code : 'error',
      summary: `${label} failed: ${message}`,
      inspected: [],
    }
  }
}
