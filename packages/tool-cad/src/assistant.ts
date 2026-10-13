import {
  ActionError,
  argString,
  componentOf,
  readCadRepresentation,
  representationsOf,
  type AssistantContribution,
  type ChangeInput,
  type FieldRule,
} from '@ews/platform-sdk'
import { DIMENSIONS, mappedProperty } from './domain'

const quantity = (target: FieldRule['target'], property: string, label: string, min: number, max: number): FieldRule => ({
  target,
  property,
  label,
  type: 'quantity',
  unit: 'mm',
  min,
  max,
})

/** Operations ChatGPT may request for CAD. Validated and previewed by the platform. */
export const cadAssistant: AssistantContribution = {
  actions: [
    {
      name: 'cad.read_representation',
      label: 'Read CAD representation',
      description: 'The mock CAD representation of a component: its demonstration dimensions and which component properties they map to.',
      parameters: { type: 'object', properties: { objectId: { type: 'string' } }, required: ['objectId'], additionalProperties: false },
      run(args, { model }) {
        const id = argString(args, 'objectId')
        const component = componentOf(model, id)
        const rep = model.get(id)?.type === 'cad-representation' ? model.get(id) : component && representationsOf(model, component.id, 'cad')[0]
        if (!rep) throw new ActionError('not-found', `${id} has no CAD representation.`)
        const r = readCadRepresentation(rep)
        const dimensions = Object.entries(r.parameters).map(([key, q]) => ({
          parameter: key,
          value: q.value,
          unit: q.unit,
          mapsTo: component ? (mappedProperty(component, key) ? `${component.id}.${mappedProperty(component, key)}` : null) : null,
        }))
        return {
          kind: 'data',
          data: { representation: r.id, component: component?.id ?? null, dimensions, note: 'Mock geometry, not a CAD kernel.' },
          summary: `Read ${r.id} (${dimensions.length} dimensions)`,
          inspected: [{ id: r.id, detail: `mock geometry, rev ${r.revision}` }],
        }
      },
    },
    {
      name: 'cad.set_dimension',
      label: 'Prepare dimension change',
      description:
        'Propose a new value for a demonstration dimension (diameter, outerDiameter, length) of a component’s CAD representation. The mapped component property changes in the same transaction.',
      parameters: {
        type: 'object',
        properties: {
          objectId: { type: 'string', description: 'Component (e.g. ROD-120) or its CAD representation' },
          parameter: { type: 'string', enum: Object.keys(DIMENSIONS) },
          value: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['objectId', 'parameter', 'value'],
        additionalProperties: false,
      },
      run(args, { model }) {
        const id = argString(args, 'objectId')
        const parameter = argString(args, 'parameter')
        const component = componentOf(model, id)
        const repObject = model.get(id)?.type === 'cad-representation' ? model.get(id) : component && representationsOf(model, component.id, 'cad')[0]
        if (!repObject) throw new ActionError('not-found', `${id} has no CAD representation.`)
        const rep = readCadRepresentation(repObject)
        if (!(parameter in rep.parameters)) {
          throw new ActionError('not-allowed', `${rep.id} has no “${parameter}” dimension. It has ${Object.keys(rep.parameters).join(', ')}.`)
        }
        const unit = typeof args.unit === 'string' ? args.unit : undefined
        const changes: ChangeInput[] = [{ kind: 'set-property', targetId: rep.id, property: parameter, value: args.value, unit }]
        const property = mappedProperty(component, parameter)
        if (component && property) changes.push({ kind: 'set-property', targetId: component.id, property, value: args.value, unit })
        return {
          kind: 'proposal',
          title: `Set ${rep.name} ${DIMENSIONS[parameter]?.label.toLowerCase() ?? parameter}`,
          explanation: property
            ? `Updates ${rep.id} and, through the explicit mapping, ${component!.id} ${property}.`
            : `Updates ${rep.id} only; no component property is mapped to ${parameter}.`,
          changes,
          inspected: [{ id: rep.id, detail: `${parameter} ${rep.parameters[parameter].value} mm, rev ${rep.revision}` }],
        }
      },
    },
  ],
  editableFields: [
    quantity('cad-representation', 'diameter', 'Diameter', DIMENSIONS.diameter.min, DIMENSIONS.diameter.max),
    quantity('cad-representation', 'outerDiameter', 'Outer diameter', DIMENSIONS.outerDiameter.min, DIMENSIONS.outerDiameter.max),
    quantity('cad-representation', 'length', 'Length', DIMENSIONS.length.min, DIMENSIONS.length.max),
    // Mapped component properties (see PARAMETER_TO_PROPERTY).
    quantity('part', 'diameter', 'Diameter', DIMENSIONS.diameter.min, DIMENSIONS.diameter.max),
    quantity('part', 'outerDiameter', 'Outer diameter', DIMENSIONS.outerDiameter.min, DIMENSIONS.outerDiameter.max),
    quantity('part', 'effectiveLength', 'Effective length', DIMENSIONS.length.min, DIMENSIONS.length.max),
    quantity('part', 'length', 'Length', DIMENSIONS.length.min, DIMENSIONS.length.max),
  ],
}
