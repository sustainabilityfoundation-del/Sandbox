import {
  ActionError,
  REQUIREMENT_STATUSES,
  argOptionalString,
  argString,
  isComponent,
  readRequirement,
  requirementsFor,
  type AssistantContribution,
  type ChangeInput,
} from '@ews/platform-sdk'
import { sysmlTrace } from './domain'

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
      run(args, { model }) {
        const objectId = argString(args, 'objectId')
        const object = model.get(objectId)
        if (!object) throw new ActionError('not-found', `${objectId} does not exist.`)
        const component = isComponent(object) ? object : model.linkedObjects(objectId, 'represents', 'out').find(isComponent)
        if (!component) throw new ActionError('invalid-arguments', `${objectId} is a ${object.type} that does not represent a component.`)
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
      run(args, { model }) {
        const id = argString(args, 'requirementId')
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
  ],
  editableFields: [
    { target: 'requirement', property: 'statement', label: 'Statement', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'rationale', label: 'Rationale', type: 'text', maxLength: 600 },
    { target: 'requirement', property: 'status', label: 'Status', type: 'enum', options: REQUIREMENT_STATUSES.map((s) => s.id) },
  ],
  editableRelationships: [{ type: 'allocated-to', from: ['requirement'], to: ['assembly', 'part'] }],
}
