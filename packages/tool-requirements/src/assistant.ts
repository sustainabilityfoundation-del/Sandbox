import {
  ActionError,
  REQUIREMENT_STATUSES,
  argOptionalString,
  argString,
  isComponent,
  readRequirement,
  requirementsFor,
  type AssistantContribution,
  type AssistantActionResult,
  type ChangeInput,
  type EngineeringObject,
  type ModelIndex,
} from '@ews/platform-sdk'
import { sysmlTrace } from './domain'
import { addProposal, getAssistantConnection, type ProposalChange } from './proposals'

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
      async run(args, { model }) {
        const objectId = argString(args, 'objectId')
        const conn = getAssistantConnection()
        const object = model.get(objectId)
        if (!object) throw new ActionError('not-found', `${objectId} does not exist.`)
        const component = isComponent(object) ? object : model.linkedObjects(objectId, 'represents', 'out').find(isComponent)
        if (!component) throw new ActionError('invalid-arguments', `${objectId} is a ${object.type} that does not represent a component.`)
        if (conn) return readForComponentApi(conn, model, component)
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
      async run(args, { model }) {
        const id = argString(args, 'requirementId')
        const conn = getAssistantConnection()
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
      async run(args) {
        const conn = requireConnection()
        const text = argString(args, 'text')
        const page = await conn.client.list({ text, limit: 20 })
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
      async run(args) {
        const conn = requireConnection()
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
  ],
  editableFields: [
    { target: 'requirement', property: 'statement', label: 'Statement', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'rationale', label: 'Rationale', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'status', label: 'Status', type: 'enum', options: REQUIREMENT_STATUSES.map((s) => s.id) },
  ],
  editableRelationships: [{ type: 'allocated-to', from: ['requirement'], to: ['assembly', 'part'] }],
}

// ---- API mode (Requirements service connected) ------------------------------------------------
// Without a connection (e.g. the workspace before it wires the HTTP adapter) the twin-based
// behaviour above is unchanged.

type Connection = NonNullable<ReturnType<typeof getAssistantConnection>>

function requireConnection(): Connection {
  const c = getAssistantConnection()
  if (!c) throw new ActionError('not-available', 'The Requirements service is not connected here (open Requirements in API mode).')
  return c
}

async function resolveApi(conn: Connection, idOrKey: string) {
  try {
    return /^[0-9a-f-]{36}$/i.test(idOrKey) ? await conn.client.getRequirement(idOrKey) : await conn.client.resolve(idOrKey)
  } catch {
    throw new ActionError('not-found', `${idOrKey} is not a requirement in ${conn.projectId}.`)
  }
}

async function readForComponentApi(conn: Connection, model: ModelIndex, component: EngineeringObject): Promise<AssistantActionResult> {
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

async function proposeApiEdit(conn: Connection, idOrKey: string, args: Record<string, unknown>): Promise<AssistantActionResult> {
  if (args.status !== undefined) {
    throw new ActionError('not-allowed', 'Lifecycle status changes are review decisions and transitions; open the requirement in Requirements to request review, approve or retire it.')
  }
  const r = await resolveApi(conn, idOrKey)
  const changes: ProposalChange[] = []
  for (const field of ['statement', 'rationale'] as const) {
    const proposed = argOptionalString(args, field)
    if (proposed !== undefined && proposed !== r[field]) changes.push({ field, current: r[field], proposed })
  }
  if (!changes.length) throw new ActionError('no-op', 'Give a new statement or rationale that differs from the current text.')
  const p = addProposal({ requirementId: r.id, key: r.key, expectedRevision: r.revision, changes, explanation: 'Requested in the conversation.' })
  return {
    kind: 'data',
    data: { proposalId: p.id, key: r.key, basedOnRevision: r.revision, changes, next: 'Open Requirements to preview the change and choose Apply or Reject. Nothing has changed yet.' },
    summary: `Prepared a proposed edit of ${r.key} (rev ${r.revision}); review it in Requirements`,
    inspected: [{ id: r.key, detail: `rev ${r.revision}` }],
  }
}
