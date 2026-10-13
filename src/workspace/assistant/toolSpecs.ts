import type { AssistantToolName, AssistantToolSpec } from './types'

/**
 * The assistant's tool interface. These definitions are what a model provider
 * would receive for tool calling; the application executes every call itself
 * and validates it (see executor.ts), so the assistant cannot bypass rules.
 */
export const ASSISTANT_TOOLS: AssistantToolSpec[] = [
  {
    name: 'read_object',
    description: 'Read one engineering object or scenario (load case) by stable ID, with its properties, units and revision.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Stable ID, e.g. ROD-120 or SCN-MAX' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_objects',
    description: 'Search objects by ID, name or requirement statement. Returns IDs, names and types.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string', enum: ['assembly', 'part', 'requirement', 'procedure'] },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_requirements',
    description:
      'Requirements that apply to a component: allocated directly or to its parent assembly, with compliance, verification methods and verifying procedures.',
    parameters: {
      type: 'object',
      properties: { objectId: { type: 'string' } },
      required: ['objectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_relationships',
    description: 'All relationships of an object (allocation, verification, tests, evidence).',
    parameters: {
      type: 'object',
      properties: { objectId: { type: 'string' } },
      required: ['objectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_outputs',
    description:
      'Saved outputs in the configuration captured with the message, with provenance (tool, scenario, input revisions) and freshness.',
    parameters: {
      type: 'object',
      properties: {
        objectId: { type: 'string' },
        scenarioId: { type: 'string' },
        dependsOn: { type: 'string', description: 'Only outputs that used this object or scenario as an input' },
        staleOnly: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'propose_changes',
    description:
      'Propose up to 5 related property or relationship changes as one transaction. Nothing is changed until the user applies the preview. Use undoOf to revert a previously applied proposal.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        explanation: { type: 'string' },
        undoOf: { type: 'string', description: 'ID of an applied proposal to revert' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['set-property', 'add-relationship', 'remove-relationship'] },
              targetId: { type: 'string' },
              property: { type: 'string' },
              value: {},
              unit: { type: 'string' },
              type: { type: 'string', enum: ['allocated-to', 'verifies'] },
              from: { type: 'string' },
              to: { type: 'string' },
            },
            required: ['kind'],
          },
        },
      },
      required: ['title', 'explanation'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_analysis',
    description:
      'Run the illustrative structural assessment for a part under a scenario. The result is saved as an output with the same provenance as a manual run.',
    parameters: {
      type: 'object',
      properties: { objectId: { type: 'string' }, scenarioId: { type: 'string' } },
      required: ['objectId', 'scenarioId'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_objects',
    description: 'Select objects in the shared workspace context.',
    parameters: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' } } },
      required: ['ids'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_tool',
    description: 'Open a registered engineering tool by ID.',
    parameters: {
      type: 'object',
      properties: { toolId: { type: 'string' } },
      required: ['toolId'],
      additionalProperties: false,
    },
  },
]

const ALLOWED = new Set<string>(ASSISTANT_TOOLS.map((t) => t.name))

export function isAllowedTool(name: string): name is AssistantToolName {
  return ALLOWED.has(name)
}

/** Short human-readable label for execution status. */
export const TOOL_LABELS: Record<AssistantToolName, string> = {
  read_object: 'Read object',
  search_objects: 'Search objects',
  read_requirements: 'Read requirements',
  read_relationships: 'Read relationships',
  read_outputs: 'Read saved outputs',
  propose_changes: 'Prepare change preview',
  run_analysis: 'Run analysis',
  select_objects: 'Select objects',
  open_tool: 'Open tool',
}
