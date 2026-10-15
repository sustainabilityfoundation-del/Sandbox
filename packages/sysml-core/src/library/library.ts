import { uuidV5 } from '../model/ids'
import { Model, refIds, type Element } from '../model/model'
import { remapElement } from '../model/remap'
import { semanticsOf } from '../semantics/semantics'
import { Builder } from '../syntax/build'
import { parse } from '../syntax/parser'
import { LIBRARY_SOURCES } from './text'

/** RFC 4122 NameSpace_URL, used by KerML §9.1 for top-level library package IDs. */
const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

export interface LibraryLoadResult {
  model: Model
  /** Problems while loading (the library is still usable for what loaded). */
  diagnostics: string[]
}

/**
 * Builds a library model from textual sources and gives every element a name-based UUID (v5), as
 * KerML §9.1 prescribes for library elements: top-level packages from
 * `https://www.omg.org/spec/KerML/<name>` in the URL namespace, nested elements from their path in
 * the package's UUID namespace. Unnamed elements (relationships) use their owner's path plus their
 * position, so IDs are stable as long as the library text is.
 */
export function loadLibrary(sources: { file: string; text: string }[]): LibraryLoadResult {
  const model = new Model({ rootId: uuidV5('ews-sysml-library-root', NAMESPACE_URL) })
  const diagnostics: string[] = []
  const builder = new Builder(model)
  for (const s of sources) {
    const parsed = parse(s.text)
    for (const d of parsed.diagnostics) diagnostics.push(`${s.file}:${d.range.start.line}:${d.range.start.column} ${d.message}`)
    builder.buildMembers(model.rootId, parsed.model.members)
  }
  for (const d of builder.resolve()) diagnostics.push(`${d.message}${d.range ? ` (line ${d.range.start.line})` : ''}`)
  // Name-based IDs.
  const sem = semanticsOf(model)
  const map = new Map<string, string>()
  const assign = (el: Element, pkgId: string, path: string) => {
    for (const [k, rel] of sem.ownedRelationships(el['@id']).entries()) {
      const relPath = `${path}/${k}:${rel['@type']}`
      map.set(rel['@id'], uuidV5(relPath, pkgId))
      for (const [j, childId] of refIds(rel, 'ownedRelatedElement').entries()) {
        const child = model.get(childId)!
        const q = sem.qualifiedName(childId)
        const childPath = q ?? `${relPath}/${j}`
        map.set(childId, uuidV5(childPath, pkgId))
        assign(child, pkgId, childPath)
      }
    }
  }
  for (const pkg of sem.ownedMembers(model.rootId)) {
    const pkgId = uuidV5(`https://www.omg.org/spec/KerML/${sem.name(pkg['@id'])}`, NAMESPACE_URL)
    map.set(pkg['@id'], pkgId)
    assign(pkg, pkgId, sem.qualifiedName(pkg['@id']) ?? '')
  }
  for (const m of sem.memberships(model.rootId)) map.set(m['@id'], uuidV5(`root/${sem.memberName(m)}`, NAMESPACE_URL))
  const remapped = [...model.elements()].map((e) => remapElement(e, map))
  return { model: new Model({ rootId: model.rootId, elements: remapped }), diagnostics }
}

let platform: LibraryLoadResult | undefined

/** The bundled platform library subset (built once per process). */
export function platformLibrary(): Model {
  platform ??= loadLibrary(LIBRARY_SOURCES)
  return platform.model
}

export function platformLibraryDiagnostics(): string[] {
  platformLibrary()
  return platform!.diagnostics
}

/** A new, empty project model on top of the platform library. */
export function emptyModel(library: Model = platformLibrary()): Model {
  return new Model({ library })
}
