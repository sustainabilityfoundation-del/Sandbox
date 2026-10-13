import { outputFreshness } from '../domain/freshness'
import { isComponent, type ModelIndex } from '../domain/modelIndex'
import type { ActivitySource, EngineeringObject, ObjectType, OutputRecord, PropertyValue, Scenario } from '../domain/types'
import { formatValue, isQuantity, propertyLabel } from '../domain/units'
import type { AssessmentResult } from '../tools/analysis/assessment'
import type { CapturedContext, RunRequest } from '../tools/analysis/run'
import { EDITABLE_FIELDS } from './editableFields'
import { affectedOutputs, buildPreview, buildUndo, describeChange } from './proposals'
import { TOOL_LABELS, isAllowedTool } from './toolSpecs'
import type {
  CapturedMessageContext,
  ChangeInput,
  ChangeProposal,
  PreviewChange,
  ToolCallRequest,
  ToolCallResult,
} from './types'

/** What the assistant may touch in the application. Implemented over existing workspace services. */
export interface AssistantEnvironment {
  getModel: () => ModelIndex
  getOutputs: () => OutputRecord[]
  select: (ids: string[]) => void
  listTools: () => { id: string; name: string }[]
  openTool: (toolId: string) => void
  runAnalysis: (
    request: RunRequest,
    source: ActivitySource,
  ) => Promise<{ captured: CapturedContext; result: AssessmentResult; output?: OutputRecord }>
  createProposal: (draft: {
    title: string
    explanation: string
    configurationId: string
    changes: PreviewChange[]
    affectedOutputIds: string[]
    undoOf?: string
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

const OBJECT_TYPES: ObjectType[] = ['assembly', 'part', 'requirement', 'procedure']

// ---- serialisation for the assistant -----------------------------------------------

function describeProperties(holder: { properties: Record<string, PropertyValue> }) {
  return Object.entries(holder.properties).map(([key, value]) => ({
    key,
    label: propertyLabel(key),
    value: isQuantity(value) ? value.value : value,
    unit: isQuantity(value) ? value.unit : undefined,
    display: formatValue(value),
  }))
}

function editableFieldsFor(kind: ObjectType | 'scenario', holder: { properties: Record<string, PropertyValue> }) {
  return EDITABLE_FIELDS.filter((r) => r.target === kind && (kind !== 'part' || r.property in holder.properties)).map(
    (r) => r.property,
  )
}

function objectSummary(o: EngineeringObject) {
  return { id: o.id, name: o.name, type: o.type }
}

function outputProvenance(o: OutputRecord, model: ModelIndex) {
  const freshness = outputFreshness(o, model)
  return {
    id: o.id,
    title: o.title,
    summary: o.summary,
    producedBy: o.toolId,
    objectIds: o.objectIds,
    configurationId: o.configurationId,
    scenarioId: o.scenarioId,
    scenarioName: o.scenarioId ? model.nameOf(o.scenarioId) : null,
    inputRevision: o.inputRevision,
    inputs: o.inputs,
    createdAt: o.createdAt,
    reviewStatus: o.reviewStatus,
    result: o.result,
    stale: freshness.stale,
    staleReasons: freshness.reasons,
  }
}

// ---- tool implementations ------------------------------------------------------------

type Handler = (args: Record<string, unknown>, ctx: ExecutionContext) => Promise<Omit<ToolOutcome, 'callId' | 'name' | 'ok'>>

const handlers: Record<string, Handler> = {
  async read_object(args, { env }) {
    const id = str(args, 'id')
    const model = env.getModel()
    const object = model.get(id)
    const scenario: Scenario | undefined = model.scenario(id)
    const target = object ?? scenario
    if (!target) throw new ToolError('not-found', `${id} does not exist.`)
    const kind = object ? object.type : 'scenario'
    const data = {
      id: target.id,
      kind,
      name: target.name,
      revision: target.revision,
      parentId: object?.parentId,
      properties: describeProperties(target),
      editableFields: editableFieldsFor(kind, target),
    }
    return {
      data,
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
        const score =
          o.id.toLowerCase() === query ? 4 : o.name.toLowerCase() === query ? 3 : o.name.toLowerCase().includes(query) ? 2 : statement.includes(query) ? 1 : 0
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

  async read_requirements(args, { env }) {
    const objectId = str(args, 'objectId')
    const model = env.getModel()
    const object = model.get(objectId)
    if (!object) throw new ToolError('not-found', `${objectId} does not exist.`)
    if (!isComponent(object)) throw new ToolError('invalid-arguments', `${objectId} is a ${object.type}, not a component.`)
    const scopes: { id: string; via: string }[] = [{ id: object.id, via: 'direct' }]
    for (let parent = object.parentId; parent; parent = model.get(parent)?.parentId) scopes.push({ id: parent, via: `parent ${parent}` })

    const seen = new Set<string>()
    const requirements = scopes.flatMap(({ id, via }) =>
      model
        .linkedObjects(id, 'allocated-to', 'in')
        .filter((r) => !seen.has(r.id) && seen.add(r.id))
        .map((r) => ({
          ...objectSummary(r),
          statement: r.properties.statement,
          compliance: r.properties.compliance,
          verificationMethods: r.properties.verificationMethods,
          allocatedTo: model.linked(r.id, 'allocated-to', 'out'),
          appliesVia: via,
          verifiedBy: model.linked(r.id, 'verifies', 'in'),
          revision: r.revision,
        })),
    )
    return {
      data: { object: objectSummary(object), requirements },
      summary: `Read ${requirements.length} requirement${requirements.length === 1 ? '' : 's'} for ${object.id}`,
      inspected: [
        { id: object.id, detail: 'allocated requirements (direct and via parent assemblies)' },
        ...requirements.map((r) => ({ id: r.id, detail: `statement, compliance, verification (rev ${r.revision})` })),
      ],
    }
  },

  async read_relationships(args, { env }) {
    const objectId = str(args, 'objectId')
    const model = env.getModel()
    if (!model.get(objectId)) throw new ToolError('not-found', `${objectId} does not exist.`)
    const relationships = model.relationships
      .filter((r) => r.from === objectId || r.to === objectId)
      .map((r) => ({ id: r.id, type: r.type, from: r.from, to: r.to, fromName: model.nameOf(r.from), toName: model.nameOf(r.to) }))
    return {
      data: { relationships },
      summary: `Read ${relationships.length} relationships of ${objectId}`,
      inspected: [{ id: objectId, detail: `${relationships.length} relationships` }],
    }
  },

  async read_outputs(args, { env, captured }) {
    const objectId = optStr(args, 'objectId')
    const scenarioId = optStr(args, 'scenarioId')
    const dependsOn = optStr(args, 'dependsOn')
    const staleOnly = args.staleOnly === true
    const model = env.getModel()
    const outputs = env
      .getOutputs()
      .filter(
        (o) =>
          o.configurationId === captured.configurationId &&
          (!objectId || o.objectIds.includes(objectId)) &&
          (!scenarioId || o.scenarioId === scenarioId) &&
          (!dependsOn || o.inputs.some((i) => i.id === dependsOn)),
      )
      .map((o) => outputProvenance(o, model))
      .filter((o) => !staleOnly || o.stale)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return {
      data: { configurationId: captured.configurationId, outputs },
      summary: `Read ${outputs.length} saved output${outputs.length === 1 ? '' : 's'} in ${captured.configurationId}${staleOnly ? ' (stale only)' : ''}`,
      inspected: outputs.map((o) => ({
        id: o.id,
        detail: `provenance: ${o.producedBy}, ${o.scenarioId ?? 'no scenario'}, input rev ${o.inputRevision}${o.stale ? ', potentially stale' : ''}`,
      })),
    }
  },

  async propose_changes(args, { env, captured }) {
    const title = str(args, 'title')
    const explanation = str(args, 'explanation')
    const undoOf = optStr(args, 'undoOf')
    const model = env.getModel()

    let preview
    if (undoOf) {
      const original = env.getProposal(undoOf)
      if (!original) throw new ToolError('not-found', `Proposal ${undoOf} does not exist in this conversation.`)
      preview = buildUndo(original, model)
    } else {
      if (!Array.isArray(args.changes)) throw new ToolError('invalid-arguments', '“changes” must be a list.')
      const inputs: ChangeInput[] = args.changes.map((raw) => {
        const c = raw as Record<string, unknown>
        if (c.kind === 'set-property') {
          return { kind: 'set-property', targetId: str(c, 'targetId'), property: str(c, 'property'), value: c.value, unit: typeof c.unit === 'string' ? c.unit : undefined }
        }
        if (c.kind === 'add-relationship' || c.kind === 'remove-relationship') {
          return { kind: c.kind, type: str(c, 'type'), from: str(c, 'from'), to: str(c, 'to') }
        }
        throw new ToolError('not-allowed', `Change kind “${String(c.kind)}” is not supported.`)
      })
      preview = buildPreview(inputs, model)
    }
    if (!preview.ok) throw new ToolError(preview.code, preview.message)

    const affected = affectedOutputs(preview.changes, env.getOutputs())
    const proposal = env.createProposal({
      title,
      explanation,
      configurationId: captured.configurationId,
      changes: preview.changes,
      affectedOutputIds: affected,
      undoOf,
    })
    return {
      data: {
        proposalId: proposal.id,
        status: 'awaiting user review',
        changes: proposal.changes.map(describeChange),
        affectedOutputs: affected,
      },
      summary: `Prepared ${proposal.id} for review (${proposal.changes.length} change${proposal.changes.length === 1 ? '' : 's'})`,
      inspected: preview.changes.flatMap((c) =>
        c.kind === 'set-property'
          ? [{ id: c.targetId, detail: `${c.label}: current ${formatValue(c.current)}, rev ${c.expectedRevision}` }]
          : [{ id: c.from, detail: `${c.type} → ${c.to}` }],
      ),
      proposalId: proposal.id,
    }
  },

  async run_analysis(args, { env, captured, source }) {
    const objectId = str(args, 'objectId')
    const scenarioId = str(args, 'scenarioId')
    const outcome = await env.runAnalysis({ objectId, scenarioId, configurationId: captured.configurationId }, source)
    const { result, output, captured: run } = outcome
    return {
      data: {
        outputId: output?.id,
        objectId: run.objectId,
        scenarioId: run.scenarioId,
        configurationId: run.configurationId,
        inputRevision: run.modelRevision,
        operatingLoad: { value: Number(result.operatingLoadKN.toFixed(2)), unit: 'kN' },
        allowableLoad: { value: Number(result.allowableLoadKN.toFixed(2)), unit: 'kN' },
        criticalLoad: { value: Number(result.criticalLoadKN.toFixed(2)), unit: 'kN' },
        margin: Number(result.margin.toFixed(3)),
        utilisationPct: Number(result.utilisationPct.toFixed(1)),
        note: 'Demo calculation, not for engineering use.',
      },
      summary: `Ran assessment for ${run.objectId} under ${run.scenarioId}${output ? `, saved ${output.id}` : ''}`,
      inspected: run.inputs.map((i) => ({ id: i.id, detail: `analysis input at rev ${i.revision}` })),
    }
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
    if (!tool) {
      throw new ToolError('not-found', `No tool “${toolId}”. Available: ${env.listTools().map((t) => t.id).join(', ')}.`)
    }
    env.openTool(toolId)
    return { data: { opened: toolId, name: tool.name }, summary: `Opened ${tool.name}`, inspected: [] }
  },
}

/** Executes one allowed tool call. Never throws; failures are returned to the assistant. */
export async function executeToolCall(call: ToolCallRequest, ctx: ExecutionContext): Promise<ToolOutcome> {
  if (!isAllowedTool(call.name)) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      error: `Operation “${call.name}” is not allowed.`,
      errorCode: 'not-allowed',
      summary: `Blocked operation “${call.name}”`,
      inspected: [],
    }
  }
  try {
    const outcome = await handlers[call.name](call.arguments ?? {}, ctx)
    return { callId: call.id, name: call.name, ok: true, ...outcome }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      error: message,
      errorCode: error instanceof ToolError ? error.code : 'error',
      summary: `${TOOL_LABELS[call.name]} failed: ${message}`,
      inspected: [],
    }
  }
}
