import { CONNECT_KINDS, CREATABLE_KINDS, METADATA_KINDS } from './commands'

/**
 * JSON Schemas of the typed commands (schema discovery, SYS-FR-CMD-07). Served by the API at
 * `GET /commands`, returned by the assistant's `describe_commands`, and used to validate input.
 */

export interface CommandSchema {
  op: string
  summary: string
  effect: 'create' | 'update' | 'delete' | 'text'
  schema: Record<string, unknown>
}

const ref = { type: 'string', description: 'Element ID (UUID), placeholder of an element created earlier in the transaction ("$name"), or qualified name ("Package::Part::feature")' }
const mult = {
  type: 'object',
  properties: { lower: { type: 'integer', minimum: 0 }, upper: { anyOf: [{ type: 'integer', minimum: 0 }, { const: '*' }] } },
  required: ['upper'],
  additionalProperties: false,
}
const obj = (op: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties: { op: { const: op }, ...properties },
  required: ['op', ...required],
  additionalProperties: false,
})

export const COMMAND_SCHEMAS: CommandSchema[] = [
  {
    op: 'createElement',
    summary: 'Create a package, definition or usage owned by a namespace, with its typing, specializations, multiplicity, value and documentation.',
    effect: 'create',
    schema: obj(
      'createElement',
      {
        ownerId: ref,
        kind: { enum: [...CREATABLE_KINDS] },
        name: { type: 'string', minLength: 1 },
        shortName: { type: 'string', minLength: 1 },
        ref: { type: 'string', pattern: '^\\$?[A-Za-z_][A-Za-z0-9_]*$', description: 'Placeholder for later commands, e.g. "$motor"' },
        typeIds: { type: 'array', items: ref },
        conjugated: { type: 'boolean', description: 'Type a port usage by the conjugated port definition (~T)' },
        specializes: { type: 'array', items: ref, description: 'Definitions only: general definitions (subclassification)' },
        subsets: { type: 'array', items: ref },
        redefines: { type: 'array', items: ref },
        multiplicity: mult,
        value: { type: 'string', description: 'Value expression in textual notation, e.g. "12 [kg]" or "a * b"' },
        direction: { enum: ['in', 'out', 'inout'] },
        isAbstract: { type: 'boolean' },
        isEnd: { type: 'boolean' },
        isReference: { type: 'boolean' },
        doc: { type: 'string' },
      },
      ['ownerId', 'kind'],
    ),
  },
  { op: 'rename', summary: 'Change the declared name and/or short name (null removes).', effect: 'update', schema: obj('rename', { elementId: ref, name: { type: ['string', 'null'] }, shortName: { type: ['string', 'null'] } }, ['elementId']) },
  { op: 'setTyping', summary: 'Replace the types of a usage (feature typing).', effect: 'update', schema: obj('setTyping', { elementId: ref, typeIds: { type: 'array', items: ref }, conjugated: { type: 'boolean' } }, ['elementId', 'typeIds']) },
  { op: 'addSpecialization', summary: 'Add a subclassification (definitions) or a subsetting / redefinition / reference subsetting (usages).', effect: 'update', schema: obj('addSpecialization', { elementId: ref, generalId: ref, kind: { enum: ['subclassification', 'subsetting', 'redefinition', 'reference-subsetting'] } }, ['elementId', 'generalId']) },
  { op: 'removeSpecialization', summary: 'Remove the specializations of an element to a given general.', effect: 'update', schema: obj('removeSpecialization', { elementId: ref, generalId: ref }, ['elementId', 'generalId']) },
  { op: 'setMultiplicity', summary: 'Set (or with null remove) the multiplicity of a usage.', effect: 'update', schema: obj('setMultiplicity', { elementId: ref, multiplicity: { anyOf: [mult, { type: 'null' }] } }, ['elementId', 'multiplicity']) },
  { op: 'setValue', summary: 'Set (or with null remove) the value expression of a usage.', effect: 'update', schema: obj('setValue', { elementId: ref, expression: { type: ['string', 'null'] }, isDefault: { type: 'boolean' }, isInitial: { type: 'boolean' } }, ['elementId', 'expression']) },
  { op: 'setDirection', summary: 'Set the direction (in, out, inout) of a usage, or null.', effect: 'update', schema: obj('setDirection', { elementId: ref, direction: { enum: ['in', 'out', 'inout', null] } }, ['elementId', 'direction']) },
  { op: 'setAbstract', summary: 'Mark a definition or usage abstract or concrete.', effect: 'update', schema: obj('setAbstract', { elementId: ref, isAbstract: { type: 'boolean' } }, ['elementId', 'isAbstract']) },
  { op: 'setDocumentation', summary: 'Set the documentation text (an empty text removes it).', effect: 'update', schema: obj('setDocumentation', { elementId: ref, text: { type: 'string' } }, ['elementId', 'text']) },
  {
    op: 'connect',
    summary: 'Connect two features (feature chains such as "motor.power") by a connection, interface, flow, binding, succession or allocation.',
    effect: 'create',
    schema: obj('connect', { ownerId: ref, kind: { enum: [...CONNECT_KINDS] }, source: { type: 'string' }, target: { type: 'string' }, name: { type: 'string' }, typeId: ref, itemTypeId: ref, ref: { type: 'string' } }, ['ownerId', 'kind', 'source', 'target']),
  },
  { op: 'satisfy', summary: 'State that a feature satisfies a requirement usage (satisfy R by x).', effect: 'create', schema: obj('satisfy', { ownerId: ref, requirementId: ref, by: { type: 'string' }, ref: { type: 'string' } }, ['ownerId', 'requirementId', 'by']) },
  { op: 'move', summary: 'Move a member to another namespace.', effect: 'update', schema: obj('move', { elementId: ref, newOwnerId: ref }, ['elementId', 'newOwnerId']) },
  { op: 'deleteElement', summary: 'Delete an element and everything it owns. Refused while other elements reference it, unless removeReferences.', effect: 'delete', schema: obj('deleteElement', { elementId: ref, removeReferences: { type: 'boolean' } }, ['elementId']) },
  {
    op: 'applyText',
    summary: 'Replace (or append to) the members of the root, a package or a definition with SysML v2 textual notation; matched elements keep their IDs.',
    effect: 'text',
    schema: obj('applyText', { namespaceId: ref, text: { type: 'string' }, mode: { enum: ['replace-members', 'append'] } }, ['namespaceId', 'text']),
  },
  {
    op: 'setMetadata',
    summary: 'Attach (or with null remove) platform metadata: ManagedRequirement {requirementId, revision}, CadRepresentation {cadRef, revision, role}, ConceptLink {conceptId}.',
    effect: 'update',
    schema: obj('setMetadata', { elementId: ref, metadata: { enum: [...METADATA_KINDS] }, values: { anyOf: [{ type: 'object', additionalProperties: { type: ['string', 'number', 'null'] } }, { type: 'null' }] } }, ['elementId', 'metadata', 'values']),
  },
]

/** Minimal structural check of a command against its schema (required keys, unknown keys, enums). */
export function checkCommandShape(cmd: unknown): string | undefined {
  if (!cmd || typeof cmd !== 'object') return 'A command must be an object.'
  const op = (cmd as { op?: unknown }).op
  const def = COMMAND_SCHEMAS.find((c) => c.op === op)
  if (!def) return `Unknown command "${String(op)}". Known: ${COMMAND_SCHEMAS.map((c) => c.op).join(', ')}.`
  const schema = def.schema as { properties: Record<string, { enum?: unknown[] }>; required: string[] }
  for (const k of schema.required) if ((cmd as Record<string, unknown>)[k] === undefined) return `${def.op}: "${k}" is required.`
  for (const k of Object.keys(cmd)) if (!(k in schema.properties)) return `${def.op}: unknown property "${k}".`
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = (cmd as Record<string, unknown>)[k]
    if (v !== undefined && p.enum && !p.enum.includes(v)) return `${def.op}: "${k}" must be one of ${p.enum.map(String).join(', ')}.`
  }
  return undefined
}
