/**
 * The tool catalogue. Adding a module = add its package as a dependency of this app and add it to the installed list in
 * installedModules.ts (docs/specifications/module-registration.md); this file registers whatever that list collects.
 * Tools are separate packages; the workspace never imports their internals, only the exported definition.
 */
import { installed } from './installedModules'
import { registerPlatformModule } from './platformModules'
import { registerTool } from './registry'

const collected = installed()

for (const tool of collected.tools) registerTool(tool)
for (const module of collected.platformModules) registerPlatformModule(module)

/** Tools opened as tabs in a fresh session (only those the subscription includes are opened). */
export const DEFAULT_OPEN_TOOLS = collected.defaultOpen
