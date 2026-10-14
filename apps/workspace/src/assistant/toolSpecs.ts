import type { AssistantActionDefinition } from '@ews/platform-sdk'
import type { AnyToolDefinition } from '@ews/platform-sdk/react'
import { useEntitlements } from '../platform/entitlements'
import { getTools } from '../platform/registry'
import type { AssistantToolSpec } from './types'

/**
 * The assistant's operations. Platform operations work on the shared twin
 * whatever tools are included; tools contribute their own actions. These are
 * what a model provider would receive for tool calling; the application
 * executes and validates every call itself (see executor.ts).
 */
export const PLATFORM_TOOLS: AssistantToolSpec[] = [
  {
    name: 'read_object',
    label: 'Read object',
    description: 'Read one object (component, requirement, SysML element, CAD representation) or scenario by stable ID, with its properties, units, revision and relationships.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'search_objects',
    label: 'Search objects',
    description: 'Search objects by ID, name or requirement statement. Returns IDs, names and types.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string', enum: ['assembly', 'part', 'requirement', 'sysml-element', 'cad-representation'] },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_relationships',
    label: 'Read relationships',
    description: 'All explicit relationships of an object (allocation, represents, references, connections, satisfy).',
    parameters: { type: 'object', properties: { objectId: { type: 'string' } }, required: ['objectId'], additionalProperties: false },
  },
  {
    name: 'read_artifacts',
    label: 'Read saved artifacts',
    description: 'Saved artifacts in the configuration captured with the message, with provenance (tool, input revisions, schema version) and freshness.',
    parameters: {
      type: 'object',
      properties: { objectId: { type: 'string' }, staleOnly: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
  {
    name: 'read_help',
    label: 'Read documentation',
    description:
      'Read the product documentation people see in the Help Centre: a topic by ID, a keyword search, or help for an object or an operation. Results carry module, documentation version and source. Documentation explains; it never makes an operation available.',
    parameters: {
      type: 'object',
      properties: { topicId: { type: 'string' }, query: { type: 'string' }, objectId: { type: 'string' }, operation: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'propose_changes',
    label: 'Prepare change preview',
    description:
      'Propose up to 6 related changes as one transaction, within the rules of the tools in the subscription. Nothing changes until the user applies the preview. Use undoOf to revert an applied proposal.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        explanation: { type: 'string' },
        undoOf: { type: 'string', description: 'ID of an applied proposal to revert' },
        changes: { type: 'array', items: { type: 'object' } },
      },
      required: ['title', 'explanation'],
      additionalProperties: false,
    },
  },
  {
    name: 'select_objects',
    label: 'Select objects',
    description: 'Select objects in the shared workspace context.',
    parameters: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'], additionalProperties: false },
  },
  {
    name: 'open_tool',
    label: 'Open tool',
    description: 'Open a tool in the workspace. Only tools included in the subscription can be opened.',
    parameters: { type: 'object', properties: { toolId: { type: 'string' } }, required: ['toolId'], additionalProperties: false },
  },
]

const PLATFORM_NAMES = new Set(PLATFORM_TOOLS.map((t) => t.name))

export function isPlatformOperation(name: string): boolean {
  return PLATFORM_NAMES.has(name)
}

/** A tool-contributed action and the tool that owns it (whether or not it is currently included). */
export function findToolAction(name: string): { tool: AnyToolDefinition; action: AssistantActionDefinition } | undefined {
  for (const tool of getTools()) {
    const action = tool.assistant?.actions.find((a) => a.name === name)
    if (action) return { tool, action }
  }
  return undefined
}

/** Operations offered with a request: platform operations plus actions of tools the subscription includes. */
export function availableOperations(): AssistantToolSpec[] {
  const { has } = useEntitlements.getState()
  const toolActions = getTools()
    .filter((t) => has(t.entitlement))
    .flatMap((t) => (t.assistant?.actions ?? []).map((a) => ({ name: a.name, label: a.label, description: `[${t.name}] ${a.description}`, parameters: a.parameters })))
  return [...PLATFORM_TOOLS, ...toolActions]
}

/** Short human-readable label for execution status. */
export function operationLabel(name: string): string {
  return PLATFORM_TOOLS.find((t) => t.name === name)?.label ?? findToolAction(name)?.action.label ?? name
}
