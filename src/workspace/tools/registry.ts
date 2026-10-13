import type { ToolDefinition } from '../sdk'

const tools: ToolDefinition<unknown>[] = []

/** Adds a tool to the workspace. IDs must be unique and stable. */
export function registerTool<VS>(tool: ToolDefinition<VS>): void {
  if (tools.some((t) => t.id === tool.id)) throw new Error(`Tool "${tool.id}" is already registered.`)
  tools.push(tool as unknown as ToolDefinition<unknown>)
}

export function getTools(): readonly ToolDefinition<unknown>[] {
  return tools
}

export function getTool(id: string | null | undefined): ToolDefinition<unknown> | undefined {
  return tools.find((t) => t.id === id)
}
