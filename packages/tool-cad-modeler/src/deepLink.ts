/**
 * Workspace deep link into a stored CAD document:
 * `?tool=cad-modeler&document=<documentUuid>[&revision=<n>]`.
 *
 * The workspace activates the tool from `tool=` (with its subscription check) and removes that
 * parameter. The tool captures `document` and `revision` when its module loads, while `tool=` still
 * names this tool, so a `document` parameter meant for another tool is never taken. The view then
 * opens the document from the current project's CAD service and removes both parameters.
 */

export interface CadDeepLink {
  documentId: string
  revision?: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Parses a query string; undefined unless it addresses this tool with a valid document UUID. */
export function parseCadDeepLink(search: string): CadDeepLink | undefined {
  const params = new URLSearchParams(search)
  if (params.get('tool') !== 'cad-modeler') return undefined
  const documentId = params.get('document') ?? ''
  if (!UUID.test(documentId)) return undefined
  const rev = Number(params.get('revision'))
  return Number.isInteger(rev) && rev >= 1 ? { documentId, revision: rev } : { documentId }
}

/** Builds the link (used by artifact descriptors and tests). */
export function cadDeepLinkParams(documentId: string, revision?: number): Record<string, string> {
  return { document: documentId, ...(revision ? { revision: String(revision) } : {}) }
}

let pending: CadDeepLink | undefined = typeof location !== 'undefined' ? parseCadDeepLink(location.search) : undefined

/** The link captured at load, once; removes its parameters from the address bar. */
export function takeCadDeepLink(): CadDeepLink | undefined {
  const link = pending
  pending = undefined
  if (link && typeof location !== 'undefined' && typeof history !== 'undefined') {
    const params = new URLSearchParams(location.search)
    params.delete('document')
    params.delete('revision')
    history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`)
  }
  return link
}

/** For tests. */
export function setPendingCadDeepLink(link: CadDeepLink | undefined) {
  pending = link
}
