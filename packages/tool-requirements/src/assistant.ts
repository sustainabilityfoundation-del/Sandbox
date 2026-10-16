import {
  ActionError,
  REQUIREMENT_STATUSES,
  argOptionalString,
  argString,
  isComponent,
  readRequirement,
  requirementsFor,
  type AssistantActionContext,
  type AssistantContribution,
  type AssistantActionResult,
  type DeclarativeProposal,
  type ExpectedRevision,
  type ModuleOperation,
  type RequirementPatch,
  type RequirementsService,
  type ServiceProposal,
  type ChangeInput,
  type EngineeringObject,
  type ModelIndex,
} from '@ews/platform-sdk'
import { sysmlTrace } from './domain'
import { getModuleClient, type Relationship, type RequirementCreate, type RequirementOrigin, type RequirementsModuleClient } from '@ews/requirements-client'
import { allocationRequest, allocationTargetLabel, type AllocationTarget, type AllocationTargetKind } from './allocations'

/**
 * Operations ChatGPT may request for Requirements Management. The platform
 * checks the subscription, validates every proposed change against the rules
 * below and shows a preview before anything is written.
 */
export const requirementsAssistant: AssistantContribution = {
  actions: [
    {
      name: 'requirements.read_for_component',
      label: 'Read requirements',
      description:
        'Requirements that apply to a physical component (allocated directly or to a parent assembly), with statement, rationale, status and SysML references. Accepts a component ID, or a SysML element / CAD representation that represents one.',
      parameters: {
        type: 'object',
        properties: { objectId: { type: 'string' } },
        required: ['objectId'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const { model } = ctx
        const objectId = argString(args, 'objectId')
        const conn = connectionOf(ctx)
        const object = model.get(objectId)
        if (!object) throw new ActionError('not-found', `${objectId} does not exist.`)
        const component = isComponent(object) ? object : model.linkedObjects(objectId, 'represents', 'out').find(isComponent)
        if (!component) throw new ActionError('invalid-arguments', `${objectId} is a ${object.type} that does not represent a component.`)
        if (conn?.client) return readForComponentApi({ ...conn, client: conn.client }, model, component)
        const requirements = requirementsFor(model, component.id).map(({ requirement, via }) => {
          const r = readRequirement(requirement)
          return {
            id: r.id,
            title: r.title,
            statement: r.statement,
            rationale: r.rationale,
            status: r.status,
            appliesVia: via === 'direct' ? 'direct' : `parent ${via}`,
            allocatedTo: model.linked(r.id, 'allocated-to', 'out'),
            sysmlReferences: sysmlTrace(model, r.id).references.map((e) => e.id),
            revision: r.revision,
          }
        })
        return {
          kind: 'data',
          data: { component: { id: component.id, name: component.name }, requirements },
          summary: `Read ${requirements.length} requirement${requirements.length === 1 ? '' : 's'} for ${component.id}`,
          inspected: [
            { id: component.id, detail: 'allocated requirements (direct and via parent assemblies)' },
            ...requirements.map((r) => ({ id: r.id, detail: `statement, rationale, status (rev ${r.revision})` })),
          ],
        }
      },
    },
    {
      name: 'requirements.update',
      label: 'Prepare requirement edit',
      description:
        'Propose edits to one requirement: statement, rationale and/or status (draft, in-review, approved, obsolete). Nothing changes until the user applies the preview.',
      parameters: {
        type: 'object',
        properties: {
          requirementId: { type: 'string' },
          statement: { type: 'string' },
          rationale: { type: 'string' },
          status: { type: 'string', enum: REQUIREMENT_STATUSES.map((s) => s.id) },
        },
        required: ['requirementId'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const { model } = ctx
        const id = argString(args, 'requirementId')
        const conn = connectionOf(ctx)
        if (conn) return proposeApiEdit(conn, id, args)
        const target = model.get(id)
        if (!target || target.type !== 'requirement') throw new ActionError('not-found', `${id} is not a requirement.`)
        const changes: ChangeInput[] = []
        for (const property of ['statement', 'rationale', 'status'] as const) {
          const value = argOptionalString(args, property)
          if (value !== undefined) changes.push({ kind: 'set-property', targetId: id, property, value })
        }
        if (!changes.length) throw new ActionError('invalid-arguments', 'Give a new statement, rationale or status.')
        return {
          kind: 'proposal',
          title: `Edit ${id} ${target.name}`,
          explanation: `Requested in the conversation for ${id}.`,
          changes,
          inspected: [{ id, detail: `requirement rev ${target.revision}` }],
        }
      },
    },
    {
      name: 'requirements.search',
      label: 'Search requirements',
      description:
        'Search the managed requirements in the Requirements service by words in key, title, statement or rationale (an empty-ish word such as "shall" lists many). Returns keys (REQ-001 …), IDs, titles, statements, lifecycle status and revisions. Use this and requirements.get, not read_object, for requirements: they live in the Requirements service, not in the model.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      async run(args, ctx) {
        const conn = requireConnection(ctx)
        const text = argString(args, 'text')
        const page = await conn.service.list({ projectId: conn.projectId, text, limit: 20 })
        return {
          kind: 'data',
          data: { total: page.total, requirements: page.items.map((r) => ({ key: r.key, id: r.id, title: r.title, statement: r.statement, status: r.status, revision: r.revision })) },
          summary: `Found ${page.total ?? page.items.length} requirement(s) for “${text}”`,
          inspected: page.items.map((r) => ({ id: r.key, detail: `rev ${r.revision}` })),
        }
      },
    },
    {
      name: 'requirements.explain_quality',
      label: 'Explain requirement quality',
      description:
        'Explain the quality findings of one requirement (deterministic validation and heuristics) with proposed improvements. Never rewrites or approves; necessity, feasibility, correctness and completeness need engineering judgement.',
      parameters: { type: 'object', properties: { requirementId: { type: 'string' } }, required: ['requirementId'], additionalProperties: false },
      async run(args, ctx) {
        const conn = requireConnection(ctx)
        if (!conn.client) throw new ActionError('not-available', 'Quality checks need the Requirements API; the demo service has none.')
        const r = await resolveApi(conn, argString(args, 'requirementId'))
        const report = await conn.client.quality(r.id)
        const open = report.findings.filter((f) => !f.dismissal)
        return {
          kind: 'data',
          data: { key: r.key, revision: r.revision, statement: r.statement, findings: open.map((f) => ({ class: f.class, issue: f.message, explanation: f.explanation, suggestion: f.suggestion })), disclaimer: report.disclaimer },
          summary: `${open.length} open finding(s) for ${r.key} rev ${r.revision}`,
          inspected: [{ id: r.key, detail: `statement and fields (rev ${r.revision})` }],
        }
      },
    },
    {
      name: 'requirements.get',
      label: 'Read requirement',
      effect: 'read',
      description:
        'Read one managed requirement from the Requirements service by key (REQ-001) or ID: title, statement, rationale, type, origin, status, revision, verification methods, acceptance criteria, and its relationships and allocations. Use this, not read_object, for requirements.',
      parameters: { type: 'object', properties: { requirementId: { type: 'string', description: 'Key such as REQ-001, or the requirement ID' } }, required: ['requirementId'], additionalProperties: false },
      async run(args, ctx) {
        const conn = requireConnection(ctx)
        const r = await resolveApi(conn, argString(args, 'requirementId'))
        const full = conn.client ? await conn.client.getRequirement(r.id) : undefined
        const rels = conn.client ? await conn.client.relationshipsOf(r.id) : []
        const data = {
          id: r.id,
          key: r.key,
          title: r.title,
          statement: r.statement,
          revision: r.revision,
          ...(full
            ? {
                rationale: full.rationale,
                type: full.type,
                origin: full.origin,
                status: full.status,
                archived: full.archived,
                verificationMethods: full.verificationMethods,
                acceptanceCriteria: full.acceptanceCriteria,
                source: full.source,
              }
            : {}),
          relationships: rels
            .filter((x) => !x.deleted)
            .map((x) => ({ type: x.type, direction: x.fromId === r.id ? 'out' : 'in', other: x.fromId === r.id ? (x.toRequirementId ?? x.toTwinId) : x.fromId, ...(x.toTwinId ? { targetKind: x.targetKind } : {}) })),
        }
        return { kind: 'data', data, summary: `Read ${r.key} rev ${r.revision}`, inspected: [{ id: r.key, detail: `rev ${r.revision}` }] }
      },
    },
    {
      name: 'requirements.get_conventions',
      label: 'Read requirement conventions',
      effect: 'read',
      description: "The project's requirement types, allowed verification methods and field limits, so a requirements.create proposal uses valid values.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      async run(_args, ctx) {
        const conn = requireApi(ctx, 'Reading conventions')
        const c = await conn.client.conventions()
        const data = {
          requirementTypes: c.settings.requirementTypes,
          verificationMethods: ['analysis', 'test', 'inspection', 'demonstration'],
          origins: ['stakeholder', 'ai-proposed', 'derived'],
          limits: { title: '1–300 characters', statement: 'at most 20 000 characters', rationale: 'at most 20 000 characters', acceptanceCriteria: 'at most 20 000 characters' },
        }
        return { kind: 'data', data, summary: `Requirement conventions of ${conn.projectId}` }
      },
    },
    {
      name: 'requirements.create',
      label: 'Prepare new requirement',
      description:
        'Propose a new requirement in the Requirements service: title, statement, optional rationale, type, verification methods and acceptance criteria, and its origin: "stakeholder" (a user constraint stated by the person), "ai-proposed" (a choice you propose; the person decides) or "derived" (derived from another requirement, given in derivesFrom by key or ID; a derives-from link is created). The proposal is checked with the Requirements service’s own rules before it is shown; a refusal names the field and the allowed values. Nothing is created until the person applies the preview.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, 1–300 characters' },
          statement: { type: 'string', description: 'Normative text only (one verifiable obligation, with units), at most 20 000 characters' },
          rationale: { type: 'string', description: 'Why it exists, sources and assumptions; at most 20 000 characters' },
          type: {
            type: 'string',
            description:
              "One of the project's requirement types. Default types: functional, performance, interface, environmental, physical, design-constraint, safety, other (a project may change them; requirements.get_conventions lists the project's). Dimensions, mass and size limits are usually 'physical' or 'design-constraint'. Omit to use 'functional'.",
          },
          verificationMethods: { type: 'array', items: { type: 'string', enum: ['inspection', 'analysis', 'demonstration', 'test'] } },
          acceptanceCriteria: { type: 'string', description: 'How verification shows the requirement is met; at most 20 000 characters' },
          origin: { type: 'string', enum: ['stakeholder', 'ai-proposed', 'derived'] },
          derivesFrom: { type: 'string', description: 'Key or ID of the parent requirement (origin "derived")' },
        },
        required: ['title', 'statement', 'origin'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const conn = requireApi(ctx, 'Creating requirements')
        return proposeCreate(conn, args)
      },
    },
    {
      name: 'requirements.allocate',
      label: 'Prepare requirement allocation',
      description:
        'Propose allocating one requirement to product elements (kind "product-element", element ID), shared-twin components (kind "component") or SysML Modeler elements (kind "sysml-model-element", "<sysmlProjectId>/<elementId>"), and/or removing existing allocations (by target ID). The change is applied only if the requirement is still at the previewed revision.',
      parameters: {
        type: 'object',
        properties: {
          requirementId: { type: 'string' },
          add: {
            type: 'array',
            items: {
              type: 'object',
              properties: { kind: { type: 'string', enum: ['product-element', 'component', 'sysml-model-element'] }, id: { type: 'string' } },
              required: ['kind', 'id'],
              additionalProperties: false,
            },
          },
          remove: { type: 'array', items: { type: 'string' }, description: 'Target IDs of allocations to remove' },
          rationale: { type: 'string' },
        },
        required: ['requirementId'],
        additionalProperties: false,
      },
      async run(args, ctx) {
        const conn = requireApi(ctx, 'Allocating requirements')
        return proposeAllocate(conn, args)
      },
    },
  ],
  editableFields: [
    { target: 'requirement', property: 'statement', label: 'Statement', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'rationale', label: 'Rationale', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'status', label: 'Status', type: 'enum', options: REQUIREMENT_STATUSES.map((s) => s.id) },
  ],
  editableRelationships: [{ type: 'allocated-to', from: ['requirement'], to: ['assembly', 'part'] }],
}

// ---- service mode (headless, C9) -----------------------------------------------------------------
// Operations get the Requirements service from the action context (PlatformServices), never from a
// mounted view, so they work with every tool tab closed. The module client (API mode) is derived from
// that service for the captured project; the demo service has none. Without a service the twin-based
// behaviour above is unchanged.

interface Connection {
  service: RequirementsService
  projectId: string
  /** Full module client (API mode only), bound to the captured project. */
  client?: RequirementsModuleClient
}

function connectionOf(ctx: AssistantActionContext): Connection | null {
  const service = ctx.services?.requirements
  if (!service) return null
  const projectId = ctx.captured.projectId
  return { service, projectId, client: getModuleClient(service, projectId) }
}

function requireConnection(ctx: AssistantActionContext): Connection {
  const c = connectionOf(ctx)
  if (!c) throw new ActionError('not-available', 'The Requirements service is not available here (no service in this host, or not entitled).')
  return c
}

interface Current {
  id: string
  key: string
  title: string
  revision: number
  statement: string
  /** Absent when the service does not provide it (the SDK summary has no rationale). */
  rationale?: string
}

async function resolveApi(conn: Connection, idOrKey: string): Promise<Current> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrKey)
  try {
    if (conn.client) return isUuid ? await conn.client.getRequirement(idOrKey) : await conn.client.resolve(idOrKey)
    const r = isUuid ? await conn.service.get(idOrKey, { projectId: conn.projectId }) : await conn.service.resolve(idOrKey, { projectId: conn.projectId })
    if (r) return r
  } catch {
    /* reported below */
  }
  throw new ActionError('not-found', `${idOrKey} is not a requirement in ${conn.projectId}.`)
}

/**
 * The write the Requirements editor makes (ui/Editor.tsx: the module client in API mode, the SDK
 * service in demo mode), so the assistant path and the UI path are refused by the same rules.
 */
export async function saveRequirementEdit(conn: Connection, id: string, patch: RequirementPatch, opts: { expectedRevision: number; reason?: string }): Promise<{ revision: number }> {
  if (conn.client) return conn.client.update(id, patch, opts)
  return conn.service.update(id, patch, { ...opts, projectId: conn.projectId })
}

async function readForComponentApi(conn: Connection & { client: RequirementsModuleClient }, model: ModelIndex, component: EngineeringObject): Promise<AssistantActionResult> {
  const scope = [component.id, ...model.childrenOf(component.id).map((c) => c.id)]
  const parents: string[] = []
  for (let p = component.parentId; p; p = model.get(p)?.parentId) parents.push(p)
  const page = await conn.client.list({ allocatedTo: [...scope, ...parents].join(','), limit: 200 })
  const requirements = page.items.map((r) => {
    const twin = model.get(r.id) ?? r.legacyIds.map((l) => model.get(l)).find(Boolean)
    return {
      id: r.legacyIds[0] ?? r.key,
      key: r.key,
      uuid: r.id,
      title: r.title,
      statement: r.statement,
      rationale: r.rationale,
      status: r.status,
      appliesVia: 'direct',
      sysmlReferences: twin ? sysmlTrace(model, twin.id).references.map((e) => e.id) : [],
      revision: r.revision,
    }
  })
  return {
    kind: 'data',
    data: { component: { id: component.id, name: component.name }, requirements },
    summary: `Read ${requirements.length} requirement${requirements.length === 1 ? '' : 's'} for ${component.id} from the Requirements service`,
    inspected: [
      { id: component.id, detail: 'allocations in the Requirements service (component, sub-components, parent assemblies)' },
      ...requirements.map((r) => ({ id: r.key, detail: `rev ${r.revision}` })),
    ],
  }
}

// ---- proposals as data (SDK 1.8 DeclarativeProposal, CR-AI-8) ------------------------------------------
// In API mode every write the assistant prepares is a list of Requirements API calls with the revisions the
// preview was based on. The platform stores the proposal (it reopens after a reload or restart), checks the
// expected revisions again and executes the calls through this module's API as the person, with
// idempotency keys and the proposal recorded as provenance (header x-ews-proposal → audit trail). The calls
// are the same the Requirements UI makes, so the server refuses the same input identically (C9).

const MODULE = 'requirements'
const projectPath = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`
const etag = (revision: number) => `"${revision}"`

/** The requirement revision the preview was based on, re-read with getRequirement at Apply. */
export function requirementExpected(projectId: string, r: { id: string; key: string; title: string; revision: number }): ExpectedRevision {
  return { module: MODULE, kind: 'requirement', id: r.id, label: `${r.key} ${r.title}`, revision: r.revision, read: { operationId: 'getRequirement', path: `${projectPath(projectId)}/requirements/${r.id}`, field: 'revision' } }
}

/** The editor's save (PATCH with If-Match). */
export function updateOperation(projectId: string, id: string, patch: RequirementPatch, expectedRevision: number): ModuleOperation {
  return { module: MODULE, operationId: 'updateRequirement', method: 'PATCH', path: `${projectPath(projectId)}/requirements/${id}`, body: patch, ifMatch: etag(expectedRevision) }
}

/** The editor's create (the platform supplies the idempotency key). */
export function createOperation(projectId: string, input: RequirementCreate): ModuleOperation {
  return { module: MODULE, operationId: 'createRequirement', method: 'POST', path: `${projectPath(projectId)}/requirements`, body: input }
}

/** The Trace tab's allocation (same request builder as the UI). */
export function allocateOperation(projectId: string, r: { id: string; revision: number }, target: AllocationTarget, extra: { rationale?: string } = {}): ModuleOperation {
  return { module: MODULE, operationId: 'createRelationship', method: 'POST', path: `${projectPath(projectId)}/relationships`, body: allocationRequest(r, target, extra) }
}

/** The Trace tab's removal (DELETE with the relationship revision). */
export function deallocateOperation(projectId: string, rel: Pick<Relationship, 'id' | 'revision'>): ModuleOperation {
  return { module: MODULE, operationId: 'deleteRelationship', method: 'DELETE', path: `${projectPath(projectId)}/relationships/${rel.id}`, ifMatch: etag(rel.revision) }
}

async function proposeApiEdit(conn: Connection, idOrKey: string, args: Record<string, unknown>): Promise<DeclarativeProposal | ServiceProposal> {
  if (args.status !== undefined) {
    throw new ActionError('not-allowed', 'Lifecycle status changes are review decisions and transitions; open the requirement in Requirements to request review, approve or retire it.')
  }
  const r = await resolveApi(conn, idOrKey)
  const patch: RequirementPatch = {}
  const preview: ServiceProposal['preview'] = []
  for (const [field, label] of [
    ['statement', 'Statement'],
    ['rationale', 'Rationale'],
  ] as const) {
    // Passed to the service as given (no assistant-only rules): the server validates it exactly as it
    // validates the editor's save (validation parity, C9), when the person applies the proposal.
    const raw = args[field]
    if (raw === undefined || raw === null) continue
    if (typeof raw !== 'string') throw new ActionError('invalid-arguments', `“${field}” must be a string.`)
    if (raw === r[field]) continue
    patch[field] = raw
    preview.push({ targetId: r.id, label: `${r.key} ${label}`, ...(r[field] !== undefined ? { current: r[field] } : {}), proposed: raw, basis: 'user-statement' })
  }
  if (!preview.length) throw new ActionError('no-op', 'Give a new statement or rationale that differs from the current text.')
  const common = {
    module: MODULE,
    title: `Edit ${r.key} ${r.title}`,
    explanation: `Creates revision ${r.revision + 1} of ${r.key} if it is still at revision ${r.revision} when you apply; otherwise nothing changes and the conflict is explained.`,
    preview,
    inspected: [{ id: r.key, detail: `rev ${r.revision}` }],
  }
  if (conn.client) {
    return { kind: 'declarative-proposal', ...common, projectId: conn.projectId, operations: [updateOperation(conn.projectId, r.id, patch, r.revision)], expected: [requirementExpected(conn.projectId, r)] }
  }
  // Demo service (in the browser, no module API): the labelled closure fallback, applicable in this window only.
  let applied: number | undefined
  return {
    kind: 'service-proposal',
    ...common,
    async apply({ proposalId }) {
      const saved = await saveRequirementEdit(conn, r.id, patch, { expectedRevision: r.revision, reason: `Assistant proposal ${proposalId}` })
      applied = saved.revision
      return { summary: `Saved ${r.key} revision ${saved.revision} (was ${r.revision})` }
    },
    async undo() {
      if (applied === undefined) throw new Error('Nothing to undo.')
      const restore: RequirementPatch = {}
      if (patch.statement !== undefined) restore.statement = r.statement
      if (patch.rationale !== undefined && r.rationale !== undefined) restore.rationale = r.rationale
      const saved = await saveRequirementEdit(conn, r.id, restore, { expectedRevision: applied, reason: 'Undo assistant proposal' })
      return { summary: `Restored the earlier text of ${r.key} as revision ${saved.revision}` }
    },
  }
}

// ---- create and allocate (D1, API mode) ---------------------------------------------------------------

const ORIGIN_LABEL: Record<RequirementOrigin, string> = { stakeholder: 'User constraint', 'ai-proposed': 'AI-proposed choice', derived: 'Derived' }
const ORIGINS = Object.keys(ORIGIN_LABEL) as RequirementOrigin[]

function requireApi(ctx: AssistantActionContext, what: string): Connection & { client: RequirementsModuleClient } {
  const conn = requireConnection(ctx)
  if (!conn.client) throw new ActionError('not-available', `${what} needs the Requirements API; the demo service cannot record origin and relationships.`)
  return { ...conn, client: conn.client }
}

const optionalText = (args: Record<string, unknown>, key: string): string | undefined => {
  const v = args[key]
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new ActionError('invalid-arguments', `“${key}” must be a string.`)
  return v
}

/** Who wrote the content: the person, or the assistant (hypothesis until the person applies it). */
const basisOf = (origin: RequirementOrigin): 'user-statement' | 'ai-hypothesis' => (origin === 'stakeholder' ? 'user-statement' : 'ai-hypothesis')

async function proposeCreate(conn: Connection & { client: RequirementsModuleClient }, args: Record<string, unknown>): Promise<DeclarativeProposal> {
  const origin = args.origin as RequirementOrigin
  if (!ORIGINS.includes(origin)) throw new ActionError('invalid-arguments', `“origin” must be one of ${ORIGINS.join(', ')}.`)
  const title = optionalText(args, 'title') ?? ''
  const statement = optionalText(args, 'statement') ?? ''
  const rationale = optionalText(args, 'rationale')
  const type = optionalText(args, 'type')
  const acceptanceCriteria = optionalText(args, 'acceptanceCriteria')
  const methods = args.verificationMethods
  if (methods !== undefined && (!Array.isArray(methods) || methods.some((m) => typeof m !== 'string'))) throw new ActionError('invalid-arguments', '“verificationMethods” must be a list of strings.')
  const parentRef = optionalText(args, 'derivesFrom')
  const parent = parentRef ? await resolveApi(conn, parentRef) : undefined
  const input: RequirementCreate = {
    title,
    statement,
    origin,
    ...(rationale !== undefined ? { rationale } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(methods !== undefined ? { verificationMethods: methods as string[] } : {}),
    ...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
    ...(parent ? { derivesFrom: parent.id } : {}),
  }
  await checked(conn, 'createRequirement', () => conn.client.validateCreate(input))
  const basis = basisOf(origin)
  return {
    kind: 'declarative-proposal',
    module: MODULE,
    projectId: conn.projectId,
    title: `New requirement: ${title || '(no title)'}`,
    explanation: `Creates a draft requirement in ${conn.projectId} with origin “${ORIGIN_LABEL[origin]}”${parent ? ` and a derives-from link to ${parent.key}` : ''}. The server applies the same validation as the Requirements editor.`,
    preview: [
      { label: 'New requirement: title', proposed: title, basis },
      { label: 'Statement', proposed: statement, basis },
      ...(rationale !== undefined ? [{ label: 'Rationale', proposed: rationale, basis }] : []),
      ...(type !== undefined ? [{ label: 'Type', proposed: type, basis }] : []),
      ...(methods !== undefined ? [{ label: 'Verification methods', proposed: (methods as string[]).join(', ') || 'none', basis }] : []),
      ...(acceptanceCriteria !== undefined ? [{ label: 'Acceptance criteria', proposed: acceptanceCriteria, basis }] : []),
      { label: 'Origin', proposed: ORIGIN_LABEL[origin], basis },
      ...(parent ? [{ targetId: parent.id, label: 'Derives from', current: `${parent.key} ${parent.title} (rev ${parent.revision})`, proposed: `derives-from link to ${parent.key}`, basis }] : []),
    ],
    ...(origin !== 'stakeholder' ? { assumptions: ['The content was drafted by the assistant; check it before applying.'] } : {}),
    inspected: parent ? [{ id: parent.key, detail: `rev ${parent.revision}` }] : [],
    operations: [createOperation(conn.projectId, input)],
  }
}

const KINDS: AllocationTargetKind[] = ['product-element', 'component', 'sysml-model-element']

async function proposeAllocate(conn: Connection & { client: RequirementsModuleClient }, args: Record<string, unknown>): Promise<DeclarativeProposal> {
  const r = await resolveApi(conn, argString(args, 'requirementId'))
  const add = (Array.isArray(args.add) ? args.add : args.add === undefined ? [] : null) as AllocationTarget[] | null
  if (!add || add.some((t) => !t || typeof t !== 'object' || !KINDS.includes(t.kind) || typeof t.id !== 'string' || !t.id.trim())) {
    throw new ActionError('invalid-arguments', `“add” must be a list of { kind: ${KINDS.join(' | ')}, id }.`)
  }
  const remove = (Array.isArray(args.remove) ? args.remove : args.remove === undefined ? [] : null) as string[] | null
  if (!remove || remove.some((x) => typeof x !== 'string')) throw new ActionError('invalid-arguments', '“remove” must be a list of target IDs.')
  if (!add.length && !remove.length) throw new ActionError('no-op', 'Give allocations to add or remove.')
  const rationale = optionalText(args, 'rationale')
  const current = (await conn.client.relationshipsOf(r.id)).filter((x) => x.type === 'allocated-to' && x.fromId === r.id && !x.deleted)
  const removals = remove.map((id) => {
    const rel = current.find((x) => x.toTwinId === id)
    if (!rel) throw new ActionError('not-found', `${r.key} is not allocated to ${id}.`)
    return rel
  })
  const additions = add.filter((t) => !current.some((x) => x.toTwinId === t.id.trim()))
  if (!additions.length && !removals.length) throw new ActionError('no-op', `${r.key} already has these allocations.`)
  for (const t of additions) await checked(conn, 'createRelationship', () => conn.client.validateRelationship(allocationRequest(r, t, { rationale })))
  const label = (t: AllocationTarget) => (t.kind === 'sysml-model-element' ? `SysML ${t.id}` : t.kind === 'product-element' ? `product element ${t.id}` : `component ${t.id}`)
  return {
    kind: 'declarative-proposal',
    module: MODULE,
    projectId: conn.projectId,
    title: `Allocations of ${r.key} ${r.title}`,
    explanation: `Changes the allocations of ${r.key} if it is still at revision ${r.revision}; targets are checked by the server (product structure, shared twin, SysML Modeler). Operations run in order; a refusal stops the rest, and applying again resumes.`,
    preview: [
      ...removals.map((rel) => ({ targetId: r.id, label: `${r.key} allocation removed`, current: allocationTargetLabel(rel), proposed: '(none)' })),
      ...additions.map((t) => ({ targetId: r.id, label: `${r.key} allocated to`, proposed: label(t) })),
    ],
    inspected: [{ id: r.key, detail: `rev ${r.revision}, ${current.length} allocation(s)` }],
    operations: [
      ...removals.map((rel) => deallocateOperation(conn.projectId, rel)),
      ...additions.map((t) => allocateOperation(conn.projectId, r, t, { rationale })),
    ],
    expected: [requirementExpected(conn.projectId, r)],
  }
}

/**
 * Checks a proposed write with the Requirements service's own rules (validate endpoints: the same code as the
 * write, rolled back) before the proposal is shown, so an invalid proposal is never offered for Apply. The
 * refusal carries the service's message, which names the field and the allowed values.
 */
async function checked(conn: Connection, operation: string, validate: () => Promise<unknown>): Promise<void> {
  try {
    await validate()
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = err.code === 'forbidden' || err.code === 'unauthenticated' ? 'not-allowed' : err.code === 'conflict' ? 'conflict' : err.code === 'not-found' ? 'not-found' : err.code === 'invalid' ? 'invalid-arguments' : undefined
    if (!code) throw e
    throw new ActionError(code, `Not proposed (${operation} in ${conn.projectId} would be refused): ${err.message ?? 'refused'}`)
  }
}
