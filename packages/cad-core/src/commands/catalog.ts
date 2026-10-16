import { CadError } from '../errors'
import { findPart } from '../model/document'
import type { JsonSchema } from '../model/jsonSchema'
import type { CadDocument } from '../model/types'
import { dependencyGraph, failures, featureTree, geometricEntities, massProperties, parameterTable, referenceRepairs, regenerationSummary, sketchDetails } from '../query/queries'
import type { RegenerationResult } from '../regen/engine'
import type { OperationLogEntry } from './history'
import { COMMANDS } from './registry'

export interface QueryContext {
  doc: CadDocument
  regen?: RegenerationResult
  operations: (limit: number) => OperationLogEntry[]
}

export interface QuerySpec {
  name: string
  summary: string
  input: JsonSchema
  run: (ctx: QueryContext, input: Record<string, unknown>) => unknown
}

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: 'object', properties, required, additionalProperties: false })
const partId: JsonSchema = { type: 'string', minLength: 1, description: 'Part ID (default: the first part)' }

const firstPart = (ctx: QueryContext, input: Record<string, unknown>): string => {
  const id = (input.partId as string | undefined) ?? ctx.doc.parts[0]?.id
  if (!id) throw new CadError('not-found', 'The document has no part yet. Create one with create_part.')
  findPart(ctx.doc, id)
  return id
}

/** Read operations (brief §9.2). Same functions the inspector, sketcher and diagnostics panel use. */
export const QUERIES: QuerySpec[] = [
  { name: 'get_feature_tree', summary: 'Parts, feature history in order, status, errors, warnings and dependencies of each feature.', input: obj({}), run: (ctx) => featureTree(ctx.doc, ctx.regen) },
  { name: 'get_parameters', summary: 'Parameters of a part with expressions, evaluated values, errors and users.', input: obj({ partId }), run: (ctx, i) => parameterTable(ctx.doc, firstPart(ctx, i)) },
  {
    name: 'get_sketch',
    summary: 'Sketch entities (drawn and solved positions), constraints with values, constraint status, degrees of freedom, free points, redundant/conflicting constraints and closed profiles.',
    input: obj({ sketchId: { type: 'string', minLength: 1 } }, ['sketchId']),
    run: (ctx, i) => sketchDetails(ctx.doc, i.sketchId as string, ctx.regen),
  },
  {
    name: 'get_entities',
    summary: 'Faces and edges of the bodies with stable names, surface/curve types, areas, lengths, centres and normals.',
    input: obj({ partId, bodyId: { type: 'string' }, kind: { type: 'string', enum: ['faces', 'edges', 'all'] } }),
    run: (ctx, i) => geometricEntities(ctx.regen, firstPart(ctx, i), { bodyId: i.bodyId as string | undefined, kind: (i.kind as 'faces' | 'edges' | 'all' | undefined) ?? 'all' }),
  },
  { name: 'get_mass_properties', summary: 'Volume, surface area, centre of mass, bounding box and (with a material) mass of each body.', input: obj({ partId }), run: (ctx, i) => massProperties(ctx.doc, ctx.regen, firstPart(ctx, i)) },
  { name: 'get_dependencies', summary: 'Dependency graph: parameter → parameter/feature, sketch → feature, body chain.', input: obj({ partId }), run: (ctx, i) => dependencyGraph(ctx.doc, firstPart(ctx, i)) },
  { name: 'get_failures', summary: 'Regeneration failures, blocked features, warnings and parameter errors.', input: obj({}), run: (ctx) => failures(ctx.regen) },
  { name: 'get_reference_repairs', summary: 'Features with a lost face or edge reference (reference-lost): the lost names and candidate replacements, best name matches first. Candidates are suggestions; repair_reference applies only the replacement a person or an approved proposal names.', input: obj({}), run: (ctx) => referenceRepairs(ctx.doc, ctx.regen) },
  { name: 'get_regeneration_summary', summary: 'Last regeneration: version, duration, kernel, rebuilt and reused features, body validity.', input: obj({}), run: (ctx) => regenerationSummary(ctx.regen) },
  { name: 'get_operation_log', summary: 'Recent committed, rejected, undone and redone transactions with source and affected IDs.', input: obj({ limit: { type: 'integer', minimum: 1, maximum: 500 } }), run: (ctx, i) => ctx.operations((i.limit as number | undefined) ?? 50) },
  { name: 'get_document', summary: 'The complete native document (ews-cad JSON).', input: obj({}), run: (ctx) => ctx.doc },
  { name: 'list_commands', summary: 'The machine-readable command catalogue (names, input schemas, preconditions, errors).', input: obj({ category: { type: 'string' } }), run: (_ctx, i) => commandCatalog().commands.filter((c) => !i.category || c.category === i.category) },
]

/** Machine-readable catalogue of commands and queries (docs/modules/cad/commands.json). */
export function commandCatalog() {
  return {
    catalog: 'ews-cad-commands',
    catalogVersion: '1.4.0',
    format: 'ews-cad 1.x',
    conventions: {
      transaction: 'Commands run in transactions: all commit or none. Optional expectedVersion fails with version-conflict when the document changed.',
      placeholders: 'A create command may define "ref": "$name"; later commands in the same transaction may use "$name" for the created ID (the first string field of its result) or "$name.field[.index]".',
      units: 'Lengths in mm, angles in degrees. Expressions may use parameters, + - * / % ^, functions (sin, cos, tan in degrees, sqrt, abs, min, max, …) and unit suffixes (mm, cm, m, in, ft, deg, rad).',
      errors: 'Errors are { code, message, details? }; codes are listed per command.',
      ids: 'IDs are deterministic within a document (prefix-counter) and never reused. Global references use the document UUID plus the entity ID.',
    },
    commands: COMMANDS.map((c) => ({ name: c.name, category: c.category, summary: c.summary, input: c.input, output: c.output, preconditions: c.preconditions, errors: c.errors, undo: c.undo, effect: 'mutation', transactional: true })),
    queries: QUERIES.map((q) => ({ name: q.name, summary: q.summary, input: q.input, effect: 'query' })),
    sessionOperations: [
      { name: 'undo', summary: 'Restore the state before the last transaction (a new version).', effect: 'mutation' },
      { name: 'redo', summary: 'Re-apply an undone transaction (a new version).', effect: 'mutation' },
      { name: 'regenerate_model', summary: 'Regenerate the whole model; with full: true the cache is cleared first.', effect: 'job' },
      { name: 'dry_run', summary: 'Execute a transaction and regenerate on a copy: predicted statuses and mass properties, nothing committed.', effect: 'query' },
      { name: 'export_step', summary: 'Export the bodies of a part as STEP AP242 (exact B-rep, names, units, colours).', effect: 'export' },
      { name: 'save_document / open_document', summary: 'Serialise or load the native ews-cad JSON file.', effect: 'export' },
    ],
  }
}
