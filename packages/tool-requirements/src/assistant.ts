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
  type RequirementPatch,
  type RequirementsService,
  type ServiceProposal,
  type ChangeInput,
  type EngineeringObject,
  type ModelIndex,
} from '@ews/platform-sdk'
import { sysmlTrace } from './domain'
import { getModuleClient, newIdempotencyKey, type RequirementCreate, type RequirementOrigin, type RequirementsModuleClient } from '@ews/requirements-client'
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
        'Search the canonical requirements in the Requirements service (API mode) by words in key, title, statement or rationale. Returns keys, titles, statements, lifecycle status and revisions.',
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
      name: 'requirements.create',
      label: 'Prepare new requirement',
      description:
        'Propose a new requirement in the Requirements service: title, statement, optional rationale, type, verification methods and acceptance criteria, and its origin: "stakeholder" (a user constraint stated by the person), "ai-proposed" (a choice you propose; the person decides) or "derived" (derived from another requirement, given in derivesFrom by key or ID; a derives-from link is created). Nothing is created until the person applies the preview.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          statement: { type: 'string' },
          rationale: { type: 'string' },
          type: { type: 'string', description: "Requirement type from the project's conventions, e.g. functional, performance" },
          verificationMethods: { type: 'array', items: { type: 'string', enum: ['inspection', 'analysis', 'demonstration', 'test'] } },
          acceptanceCriteria: { type: 'string' },
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

async function proposeApiEdit(conn: Connection, idOrKey: string, args: Record<string, unknown>): Promise<ServiceProposal> {
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
    const proposed = raw
    if (proposed === r[field]) continue
    patch[field] = proposed
    preview.push({ targetId: r.id, label: `${r.key} ${label}`, ...(r[field] !== undefined ? { current: r[field] } : {}), proposed, basis: 'user-statement' })
  }
  if (!preview.length) throw new ActionError('no-op', 'Give a new statement or rationale that differs from the current text.')
  let applied: number | undefined
  return {
    kind: 'service-proposal',
    module: 'requirements',
    title: `Edit ${r.key} ${r.title}`,
    explanation: `Creates revision ${r.revision + 1} of ${r.key} if it is still at revision ${r.revision} when you apply; otherwise nothing changes and the conflict is explained.`,
    preview,
    inspected: [{ id: r.key, detail: `rev ${r.revision}` }],
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

const provenanceReason = (p: { conversationId: string; proposalId: string }) => `Assistant proposal ${p.proposalId} (conversation ${p.conversationId})`

/**
 * The request the editor sends for a new requirement (ui/Editor.tsx: `client.create`), so both paths are
 * validated by the same server rules. Text is passed as given.
 */
export function createRequest(input: Omit<RequirementCreate, 'reason'>, reason: string): RequirementCreate {
  return { ...input, reason }
}

async function proposeCreate(conn: Connection & { client: RequirementsModuleClient }, args: Record<string, unknown>): Promise<ServiceProposal> {
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
  const input: Omit<RequirementCreate, 'reason'> = {
    title,
    statement,
    origin,
    ...(rationale !== undefined ? { rationale } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(methods !== undefined ? { verificationMethods: methods as string[] } : {}),
    ...(acceptanceCriteria !== undefined ? { acceptanceCriteria } : {}),
    ...(parent ? { derivesFrom: parent.id } : {}),
  }
  const basis = basisOf(origin)
  const preview: ServiceProposal['preview'] = [
    { label: 'New requirement: title', proposed: title, basis },
    { label: 'Statement', proposed: statement, basis },
    ...(rationale !== undefined ? [{ label: 'Rationale', proposed: rationale, basis }] : []),
    ...(type !== undefined ? [{ label: 'Type', proposed: type, basis }] : []),
    ...(methods !== undefined ? [{ label: 'Verification methods', proposed: (methods as string[]).join(', ') || 'none', basis }] : []),
    ...(acceptanceCriteria !== undefined ? [{ label: 'Acceptance criteria', proposed: acceptanceCriteria, basis }] : []),
    { label: 'Origin', proposed: ORIGIN_LABEL[origin], basis: origin === 'stakeholder' ? ('user-statement' as const) : ('ai-hypothesis' as const) },
    ...(parent ? [{ targetId: parent.id, label: 'Derives from', current: `${parent.key} ${parent.title} (rev ${parent.revision})`, proposed: `derives-from link to ${parent.key}`, basis }] : []),
  ]
  // One idempotency key per proposal: applying twice (or retrying after a lost response) creates one requirement.
  const idempotencyKey = newIdempotencyKey()
  let created: { id: string; key: string; revision: number } | undefined
  return {
    kind: 'service-proposal',
    module: 'requirements',
    title: `New requirement: ${title || '(no title)'}`,
    explanation: `Creates a draft requirement in ${conn.projectId} with origin “${ORIGIN_LABEL[origin]}”${parent ? ` and a derives-from link to ${parent.key}` : ''}. The server applies the same validation as the Requirements editor.`,
    preview,
    ...(origin !== 'stakeholder' ? { assumptions: ['The content was drafted by the assistant; check it before applying.'] } : {}),
    inspected: parent ? [{ id: parent.key, detail: `rev ${parent.revision}` }] : [],
    async apply(p) {
      const r = await conn.client.create(createRequest(input, provenanceReason(p)), idempotencyKey)
      created = r
      return { summary: `Created ${r.key} (${ORIGIN_LABEL[origin]})${parent ? `, derived from ${parent.key}` : ''}`, createdIds: [r.id] }
    },
    async undo() {
      if (!created) throw new Error('Nothing to undo.')
      const r = await conn.client.archive(created.id, { expectedRevision: created.revision, reason: 'Undo assistant proposal' })
      return { summary: `Archived ${r.key}` }
    },
  }
}

const KINDS: AllocationTargetKind[] = ['product-element', 'component', 'sysml-model-element']

async function proposeAllocate(conn: Connection & { client: RequirementsModuleClient }, args: Record<string, unknown>): Promise<ServiceProposal> {
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
  const label = (t: AllocationTarget) => (t.kind === 'sysml-model-element' ? `SysML ${t.id}` : t.kind === 'product-element' ? `product element ${t.id}` : `component ${t.id}`)
  const preview: ServiceProposal['preview'] = [
    ...additions.map((t) => ({ targetId: r.id, label: `${r.key} allocated to`, proposed: label(t) })),
    ...removals.map((rel) => ({ targetId: r.id, label: `${r.key} allocation removed`, current: allocationTargetLabel(rel), proposed: '(none)' })),
  ]
  const keys = additions.map(() => newIdempotencyKey())
  const createdRels: { id: string; revision: number }[] = []
  const removedTargets: AllocationTarget[] = []
  return {
    kind: 'service-proposal',
    module: 'requirements',
    title: `Allocations of ${r.key} ${r.title}`,
    explanation: `Changes the allocations of ${r.key} if it is still at revision ${r.revision}; targets are checked by the server (product structure, shared twin, SysML Modeler).`,
    preview,
    inspected: [{ id: r.key, detail: `rev ${r.revision}, ${current.length} allocation(s)` }],
    async apply(p) {
      const reason = provenanceReason(p)
      for (const rel of removals) {
        await conn.client.deleteRelationship(rel.id, rel.revision, reason)
        removedTargets.push({ kind: rel.targetKind === 'sysml-model-element' ? 'sysml-model-element' : 'component', id: rel.toTwinId! })
      }
      for (const [i, t] of additions.entries()) {
        const rel = await conn.client.createRelationship(allocationRequest(r, t, { rationale, reason }), keys[i])
        createdRels.push({ id: rel.id, revision: rel.revision })
      }
      return { summary: `${r.key}: ${additions.length} allocation(s) added, ${removals.length} removed`, createdIds: createdRels.map((x) => x.id) }
    },
    async undo() {
      for (const rel of createdRels) await conn.client.deleteRelationship(rel.id, rel.revision, 'Undo assistant proposal')
      const latest = await resolveApi(conn, r.id)
      for (const t of removedTargets) await conn.client.createRelationship(allocationRequest(latest, t, { reason: 'Undo assistant proposal' }))
      return { summary: `Restored the allocations of ${r.key}` }
    },
  }
}
