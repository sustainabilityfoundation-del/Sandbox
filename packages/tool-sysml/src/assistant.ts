import {
  ActionError,
  argOptionalString,
  argString,
  isComponent,
  readSysmlElement,
  type AssistantContribution,
} from '@ews/platform-sdk'
import { connectionKind, diagramModel, identifier } from './domain'

/** Operations ChatGPT may request for SysML Modeling. Validated and previewed by the platform. */
export const sysmlAssistant: AssistantContribution = {
  actions: [
    {
      name: 'sysml.read_model',
      label: 'Read SysML model',
      description: 'The supported SysML elements (parts, requirement usages), their connections, satisfy links and the components they represent.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run(_args, { model }) {
        const d = diagramModel(model)
        const elements = d.elements.map((e) => ({
          id: e.id,
          name: e.name,
          kind: e.kind,
          owner: e.ownerId ?? null,
          represents: model.linked(e.id, 'represents', 'out')[0] ?? null,
          references: model.linked(e.id, 'references', 'out')[0] ?? null,
        }))
        return {
          kind: 'data',
          data: { elements, connections: d.connections, satisfies: d.satisfies, note: 'Subset of SysML; illustrative notation.' },
          summary: `Read ${elements.length} SysML elements`,
          inspected: elements.map((e) => ({ id: e.id, detail: `${e.kind}${e.represents ? ` → ${e.represents}` : ''}` })),
        }
      },
    },
    {
      name: 'sysml.create_part',
      label: 'Prepare new SysML part',
      description: 'Propose a new part, optionally nested in a part definition and linked to the physical component it represents.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          typeName: { type: 'string' },
          ownerId: { type: 'string', description: 'Part definition to nest the part in' },
          representsId: { type: 'string', description: 'Physical component, e.g. MTR-130' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      run(args, { model }) {
        const name = identifier(argString(args, 'name'))
        const typeName = argOptionalString(args, 'typeName')
        const ownerId = argOptionalString(args, 'ownerId')
        const representsId = argOptionalString(args, 'representsId')
        if (ownerId) {
          const owner = model.get(ownerId)
          if (!owner || owner.type !== 'sysml-element' || readSysmlElement(owner).kind !== 'part' || owner.parentId) {
            throw new ActionError('not-allowed', `${ownerId} is not a part definition; parts can be nested one level only.`)
          }
        }
        if (representsId) {
          const component = model.get(representsId)
          if (!component || !isComponent(component)) throw new ActionError('not-found', `${representsId} is not a physical component.`)
          const existing = model.linkedObjects(representsId, 'represents', 'in').find((o) => o.type === 'sysml-element')
          if (existing) throw new ActionError('no-op', `${representsId} is already represented by ${existing.id} (${existing.name}).`)
        }
        return {
          kind: 'proposal',
          title: `Add SysML part ${name}`,
          explanation: representsId ? `New part representing ${representsId}; no duplicate component is created.` : 'New part.',
          changes: [
            {
              kind: 'create-object',
              ref: '$part',
              type: 'sysml-element',
              name,
              parentId: ownerId,
              properties: { kind: 'part', ...(typeName ? { typeName } : {}) },
            },
            ...(representsId ? [{ kind: 'add-relationship' as const, type: 'represents', from: '$part', to: representsId }] : []),
          ],
        }
      },
    },
    {
      name: 'sysml.add_requirement_reference',
      label: 'Prepare requirement reference',
      description: 'Propose a requirement usage in the SysML model that references an existing requirement.',
      parameters: { type: 'object', properties: { requirementId: { type: 'string' } }, required: ['requirementId'], additionalProperties: false },
      run(args, { model }) {
        const requirementId = argString(args, 'requirementId')
        const requirement = model.get(requirementId)
        if (!requirement || requirement.type !== 'requirement') throw new ActionError('not-found', `${requirementId} is not a requirement.`)
        const existing = model.linkedObjects(requirementId, 'references', 'in').find((o) => o.type === 'sysml-element')
        if (existing) throw new ActionError('no-op', `${requirementId} is already referenced by ${existing.id} (${existing.name}).`)
        return {
          kind: 'proposal',
          title: `Reference ${requirementId} in the SysML model`,
          explanation: `Adds requirement usage ${identifier(requirement.name)} referencing ${requirementId}.`,
          changes: [
            { kind: 'create-object', ref: '$req', type: 'sysml-element', name: identifier(requirement.name), properties: { kind: 'requirement' } },
            { kind: 'add-relationship', type: 'references', from: '$req', to: requirementId },
          ],
        }
      },
    },
    {
      name: 'sysml.connect',
      label: 'Prepare SysML connection',
      description: 'Propose a connection from a part to another part, or a satisfy link from a part to a requirement usage. Components are resolved to their SysML parts.',
      parameters: {
        type: 'object',
        properties: { fromId: { type: 'string' }, toId: { type: 'string' } },
        required: ['fromId', 'toId'],
        additionalProperties: false,
      },
      run(args, { model }) {
        const resolve = (id: string) => {
          const o = model.get(id)
          if (o?.type === 'sysml-element') return o
          if (o && isComponent(o)) return model.linkedObjects(id, 'represents', 'in').find((e) => e.type === 'sysml-element')
          if (o?.type === 'requirement') return model.linkedObjects(id, 'references', 'in').find((e) => e.type === 'sysml-element')
          return undefined
        }
        const fromId = argString(args, 'fromId')
        const toId = argString(args, 'toId')
        const from = resolve(fromId)
        const to = resolve(toId)
        if (!from) throw new ActionError('not-found', `${fromId} has no SysML element.`)
        if (!to) throw new ActionError('not-found', `${toId} has no SysML element.`)
        const kind = connectionKind(readSysmlElement(from), readSysmlElement(to))
        if ('error' in kind) throw new ActionError('not-allowed', kind.error)
        return {
          kind: 'proposal',
          title: `${kind.kind === 'satisfies' ? 'Satisfy' : 'Connect'} ${from.name} → ${to.name}`,
          explanation: `${from.id} ${kind.kind} ${to.id}.`,
          changes: [{ kind: 'add-relationship', type: kind.kind, from: from.id, to: to.id }],
        }
      },
    },
  ],
  editableFields: [{ target: 'sysml-element', property: 'typeName', label: 'Type', type: 'text', maxLength: 60 }],
  editableRelationships: [
    { type: 'represents', from: ['sysml-element'], to: ['assembly', 'part'] },
    { type: 'references', from: ['sysml-element'], to: ['requirement'] },
    { type: 'connects', from: ['sysml-element'], to: ['sysml-element'] },
    { type: 'satisfies', from: ['sysml-element'], to: ['sysml-element'] },
  ],
  creatableObjects: [
    {
      type: 'sysml-element',
      idPrefix: 'SYS',
      properties: { kind: { options: ['part', 'requirement'] }, typeName: { maxLength: 60 } },
      parentTypes: ['sysml-element'],
    },
  ],
}
