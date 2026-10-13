/**
 * View instances. A tool can be shown in several places at once (main pane,
 * split pane, detached windows). Each place is a view instance with its own ID,
 * so camera, filters, scroll and pinning stay private to it.
 *
 *   main pane:        "<toolId>"            e.g. "geometry"
 *   split pane:       "split:<toolId>"
 *   detached window:  "<windowId>:<toolId>"  e.g. "w3k9ab:geometry"
 *   inspector:        "inspector" or "<windowId>:inspector"
 */

export function toolIdOfView(viewId: string): string {
  const i = viewId.lastIndexOf(':')
  return i < 0 ? viewId : viewId.slice(i + 1)
}

export const mainViewId = (toolId: string) => toolId
export const splitViewId = (toolId: string) => `split:${toolId}`
export const detachedViewId = (windowId: string, toolId: string) => `${windowId}:${toolId}`

/** A view pinned to particular objects (and the configuration at the time), for comparison. */
export interface ViewPin {
  ids: string[]
  configurationId: string
}

export interface ViewMeta {
  pin: ViewPin | null
}
