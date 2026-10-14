import { XMLSerializer } from '@xmldom/xmldom'
import {
  DATATYPE_KINDS,
  REQIF_NAMESPACE,
  type AttributeDefinition,
  type AttributeValue,
  type Datatype,
  type DatatypeKind,
  type Finding,
  type HierarchyNode,
  type Identifiable,
  type ReqIFDocument,
  type SpecType,
  type SpecTypeCategory,
} from './model'
import { ReqIFParseError, attr, child, children, decodeXml, parseXmlSecurely, path, text, type Element } from './xml'
import { xhtmlValueFrom } from './xhtml'

export interface ReadOptions {
  /** Rewrites XHTML object data references (e.g. to stored attachments); null removes the reference. */
  rewriteObjectData?: (data: string) => string | null
}

export interface ReadResult {
  document: ReqIFDocument
  findings: Finding[]
  /** Counts of elements found but not interpreted. */
  unsupported: { kind: string; count: number; treatment: string }[]
}

function identifiable(el: Element, findings: Finding[], where: string): Identifiable {
  const identifier = attr(el, 'IDENTIFIER')
  const lastChange = attr(el, 'LAST-CHANGE')
  if (!identifier) findings.push({ severity: 'error', code: 'missing-identifier', message: `${el.localName} without IDENTIFIER`, path: where })
  if (!lastChange) findings.push({ severity: 'warning', code: 'missing-last-change', message: `${el.localName} ${identifier ?? ''} without LAST-CHANGE`, path: where })
  else if (Number.isNaN(Date.parse(lastChange))) findings.push({ severity: 'warning', code: 'bad-last-change', message: `${el.localName} ${identifier} has an invalid LAST-CHANGE “${lastChange}”`, path: where })
  const alt = path(el, 'ALTERNATIVE-ID', 'ALTERNATIVE-ID')
  return {
    identifier: identifier ?? '',
    lastChange: lastChange ?? '',
    longName: attr(el, 'LONG-NAME'),
    desc: attr(el, 'DESC'),
    alternativeId: alt ? attr(alt, 'IDENTIFIER') : undefined,
  }
}

const kindOf = (localName: string, prefix: string): DatatypeKind | undefined => {
  const k = localName.slice(prefix.length) as DatatypeKind
  return DATATYPE_KINDS.includes(k) ? k : undefined
}

const num = (s: string | undefined) => (s === undefined || s.trim() === '' ? undefined : Number(s))
const bool = (s: string | undefined) => (s === undefined ? undefined : s === 'true' || s === '1')

function readValues(container: Element | undefined, findings: Finding[], where: string, opts: ReadOptions): AttributeValue[] {
  const out: AttributeValue[] = []
  for (const v of children(container)) {
    const kind = kindOf(v.localName ?? '', 'ATTRIBUTE-VALUE-')
    if (!kind) {
      findings.push({ severity: 'warning', code: 'unknown-value', message: `Unknown attribute value element ${v.localName}`, path: where })
      continue
    }
    const defRef = text(child(child(v, 'DEFINITION'), `ATTRIBUTE-DEFINITION-${kind}-REF`)).trim()
    if (!defRef) findings.push({ severity: 'error', code: 'missing-definition', message: `${v.localName} without DEFINITION`, path: where })
    if (kind === 'XHTML') {
      const theValue = child(v, 'THE-VALUE')
      if (!theValue) {
        findings.push({ severity: 'error', code: 'missing-value', message: 'ATTRIBUTE-VALUE-XHTML without THE-VALUE', path: where })
        continue
      }
      const xhtml = xhtmlValueFrom(theValue, child(v, 'THE-ORIGINAL-VALUE'), bool(attr(v, 'IS-SIMPLIFIED')), opts.rewriteObjectData)
      out.push({ kind, definitionRef: defRef, value: xhtml.plain, xhtml })
    } else if (kind === 'ENUMERATION') {
      out.push({ kind, definitionRef: defRef, value: children(child(v, 'VALUES'), 'ENUM-VALUE-REF').map((r) => text(r).trim()) })
    } else {
      const raw = attr(v, 'THE-VALUE')
      if (raw === undefined) {
        findings.push({ severity: 'error', code: 'missing-value', message: `${v.localName} without THE-VALUE`, path: where })
        continue
      }
      const value = kind === 'BOOLEAN' ? raw === 'true' || raw === '1' : kind === 'INTEGER' || kind === 'REAL' ? Number(raw) : raw
      if (typeof value === 'number' && Number.isNaN(value)) findings.push({ severity: 'error', code: 'bad-number', message: `${v.localName} has a non-numeric THE-VALUE “${raw}”`, path: where })
      out.push({ kind, definitionRef: defRef, value })
    }
  }
  return out
}

function readHierarchy(el: Element | undefined, findings: Finding[], where: string, depth = 0): HierarchyNode[] {
  if (depth > 200) {
    findings.push({ severity: 'error', code: 'too-deep', message: 'SPEC-HIERARCHY nested more than 200 levels', path: where })
    return []
  }
  return children(el, 'SPEC-HIERARCHY').map((h) => ({
    ...identifiable(h, findings, where),
    objectRef: text(path(h, 'OBJECT', 'SPEC-OBJECT-REF')).trim(),
    isTableInternal: bool(attr(h, 'IS-TABLE-INTERNAL')),
    isEditable: bool(attr(h, 'IS-EDITABLE')),
    children: readHierarchy(child(h, 'CHILDREN'), findings, where, depth + 1),
  }))
}

/** Reads a ReqIF XML document (bytes or text). Structural problems become findings, not exceptions. */
export function readReqIF(input: Uint8Array | string, opts: ReadOptions = {}): ReadResult {
  const xml = typeof input === 'string' ? input : decodeXml(input)
  const doc = parseXmlSecurely(xml)
  const root = doc.documentElement!
  if (root.localName !== 'REQ-IF') throw new ReqIFParseError(`The root element is ${root.localName}, not REQ-IF.`, 'not-reqif')
  const findings: Finding[] = []
  const unsupported: ReadResult['unsupported'] = []
  if (root.namespaceURI !== REQIF_NAMESPACE) {
    findings.push({ severity: 'warning', code: 'namespace', message: `Unexpected namespace “${root.namespaceURI ?? '(none)'}”; ReqIF 1.0.1–1.2 use ${REQIF_NAMESPACE}.` })
  }
  const h = path(root, 'THE-HEADER', 'REQ-IF-HEADER')
  if (!h) findings.push({ severity: 'error', code: 'missing-header', message: 'No THE-HEADER/REQ-IF-HEADER' })
  const header = {
    identifier: (h && attr(h, 'IDENTIFIER')) ?? '',
    comment: h ? text(child(h, 'COMMENT')) || undefined : undefined,
    creationTime: text(child(h, 'CREATION-TIME')),
    repositoryId: text(child(h, 'REPOSITORY-ID')) || undefined,
    reqifToolId: text(child(h, 'REQ-IF-TOOL-ID')),
    reqifVersion: text(child(h, 'REQ-IF-VERSION')),
    sourceToolId: text(child(h, 'SOURCE-TOOL-ID')),
    title: text(child(h, 'TITLE')),
  }
  const content = path(root, 'CORE-CONTENT', 'REQ-IF-CONTENT')
  if (!content) findings.push({ severity: 'error', code: 'missing-content', message: 'No CORE-CONTENT/REQ-IF-CONTENT' })

  const datatypes: Datatype[] = children(child(content, 'DATATYPES')).flatMap((d) => {
    const kind = kindOf(d.localName ?? '', 'DATATYPE-DEFINITION-')
    if (!kind) {
      findings.push({ severity: 'warning', code: 'unknown-datatype', message: `Unknown datatype element ${d.localName}` })
      return []
    }
    return [
      {
        ...identifiable(d, findings, 'DATATYPES'),
        kind,
        maxLength: num(attr(d, 'MAX-LENGTH')),
        min: num(attr(d, 'MIN')),
        max: num(attr(d, 'MAX')),
        accuracy: num(attr(d, 'ACCURACY')),
        values:
          kind === 'ENUMERATION'
            ? children(child(d, 'SPECIFIED-VALUES'), 'ENUM-VALUE').map((e) => {
                const ev = path(e, 'PROPERTIES', 'EMBEDDED-VALUE')
                return { ...identifiable(e, findings, 'ENUM-VALUE'), key: Number(ev ? attr(ev, 'KEY') : 0), otherContent: (ev && attr(ev, 'OTHER-CONTENT')) ?? '' }
              })
            : undefined,
      },
    ]
  })

  const specTypes: SpecType[] = children(child(content, 'SPEC-TYPES')).flatMap((t) => {
    const category = t.localName as SpecTypeCategory
    if (!['SPEC-OBJECT-TYPE', 'SPEC-RELATION-TYPE', 'SPECIFICATION-TYPE', 'RELATION-GROUP-TYPE'].includes(category)) {
      findings.push({ severity: 'warning', code: 'unknown-spec-type', message: `Unknown spec type element ${t.localName}` })
      return []
    }
    const attributes: AttributeDefinition[] = children(child(t, 'SPEC-ATTRIBUTES')).flatMap((a) => {
      const kind = kindOf(a.localName ?? '', 'ATTRIBUTE-DEFINITION-')
      if (!kind) return []
      const datatypeRef = text(path(a, 'TYPE', `DATATYPE-DEFINITION-${kind}-REF`)).trim()
      const dv = child(a, 'DEFAULT-VALUE')
      return [
        {
          ...identifiable(a, findings, `${category} ${attr(t, 'IDENTIFIER')}`),
          kind,
          datatypeRef,
          isEditable: bool(attr(a, 'IS-EDITABLE')),
          multiValued: kind === 'ENUMERATION' ? bool(attr(a, 'MULTI-VALUED')) : undefined,
          defaultValue: dv ? readValues(dv, findings, 'DEFAULT-VALUE', opts)[0] : undefined,
        },
      ]
    })
    return [{ ...identifiable(t, findings, 'SPEC-TYPES'), category, attributes }]
  })

  const specObjects = children(child(content, 'SPEC-OBJECTS'), 'SPEC-OBJECT').map((o) => {
    const id = identifiable(o, findings, 'SPEC-OBJECTS')
    return { ...id, typeRef: text(path(o, 'TYPE', 'SPEC-OBJECT-TYPE-REF')).trim(), values: readValues(child(o, 'VALUES'), findings, `SPEC-OBJECT ${id.identifier}`, opts) }
  })
  const specRelations = children(child(content, 'SPEC-RELATIONS'), 'SPEC-RELATION').map((r) => {
    const id = identifiable(r, findings, 'SPEC-RELATIONS')
    return {
      ...id,
      typeRef: text(path(r, 'TYPE', 'SPEC-RELATION-TYPE-REF')).trim(),
      sourceRef: text(path(r, 'SOURCE', 'SPEC-OBJECT-REF')).trim(),
      targetRef: text(path(r, 'TARGET', 'SPEC-OBJECT-REF')).trim(),
      values: readValues(child(r, 'VALUES'), findings, `SPEC-RELATION ${id.identifier}`, opts),
    }
  })
  const specifications = children(child(content, 'SPECIFICATIONS'), 'SPECIFICATION').map((s) => {
    const id = identifiable(s, findings, 'SPECIFICATIONS')
    return {
      ...id,
      typeRef: text(path(s, 'TYPE', 'SPECIFICATION-TYPE-REF')).trim(),
      values: readValues(child(s, 'VALUES'), findings, `SPECIFICATION ${id.identifier}`, opts),
      children: readHierarchy(child(s, 'CHILDREN'), findings, `SPECIFICATION ${id.identifier}`),
    }
  })
  const relationGroups = children(child(content, 'SPEC-RELATION-GROUPS'), 'RELATION-GROUP').map((g) => ({
    ...identifiable(g, findings, 'SPEC-RELATION-GROUPS'),
    typeRef: text(path(g, 'TYPE', 'RELATION-GROUP-TYPE-REF')).trim(),
    sourceSpecificationRef: text(path(g, 'SOURCE-SPECIFICATION', 'SPECIFICATION-REF')).trim(),
    targetSpecificationRef: text(path(g, 'TARGET-SPECIFICATION', 'SPECIFICATION-REF')).trim(),
    relationRefs: children(child(g, 'SPEC-RELATIONS'), 'SPEC-RELATION-REF').map((r) => text(r).trim()),
  }))
  const serializer = new XMLSerializer()
  const toolExtensions = children(child(root, 'TOOL-EXTENSIONS'), 'REQ-IF-TOOL-EXTENSION').map((e) => serializer.serializeToString(e))
  if (toolExtensions.length) unsupported.push({ kind: 'REQ-IF-TOOL-EXTENSION', count: toolExtensions.length, treatment: 'Preserved for re-export to the same source; not interpreted' })
  if (relationGroups.length) unsupported.push({ kind: 'RELATION-GROUP', count: relationGroups.length, treatment: 'Read and preserved for re-export; groups are not a concept of this module' })

  // Reference integrity.
  const ids = new Map<string, string>()
  const register = (kind: string, id: string) => {
    if (!id) return
    if (ids.has(id)) findings.push({ severity: kind === 'spec hierarchy' && ids.get(id) === 'spec hierarchy' ? 'warning' : 'error', code: 'duplicate-identifier', message: `IDENTIFIER “${id}” is used by more than one element (${ids.get(id)} and ${kind})` })
    ids.set(id, kind)
  }
  datatypes.forEach((d) => (register('datatype', d.identifier), d.values?.forEach((v) => register('enum value', v.identifier))))
  specTypes.forEach((t) => (register('spec type', t.identifier), t.attributes.forEach((a) => register('attribute definition', a.identifier))))
  specObjects.forEach((o) => register('spec object', o.identifier))
  specRelations.forEach((r) => register('spec relation', r.identifier))
  specifications.forEach((s) => register('specification', s.identifier))
  const registerNodes = (nodes: HierarchyNode[]) => nodes.forEach((n) => (register('spec hierarchy', n.identifier), registerNodes(n.children)))
  specifications.forEach((s) => registerNodes(s.children))
  relationGroups.forEach((g) => register('relation group', g.identifier))
  const missing = (kind: string, ref: string, where: string) => findings.push({ severity: 'warning', code: 'dangling-reference', message: `${where} refers to ${kind} “${ref}”, which is not in the file; the reference is skipped` })
  const objectIds = new Set(specObjects.map((o) => o.identifier))
  const typeIds = new Set(specTypes.map((t) => t.identifier))
  const defs = new Map(specTypes.flatMap((t) => t.attributes.map((a) => [a.identifier, a] as const)))
  const dtIds = new Set(datatypes.map((d) => d.identifier))
  for (const t of specTypes) for (const a of t.attributes) if (a.datatypeRef && !dtIds.has(a.datatypeRef)) missing('datatype', a.datatypeRef, `Attribute definition ${a.identifier}`)
  const checkValues = (vals: AttributeValue[], where: string) => {
    for (const v of vals) if (v.definitionRef && !defs.has(v.definitionRef)) missing('attribute definition', v.definitionRef, where)
  }
  for (const o of specObjects) {
    if (!typeIds.has(o.typeRef)) missing('spec object type', o.typeRef, `SPEC-OBJECT ${o.identifier}`)
    checkValues(o.values, `SPEC-OBJECT ${o.identifier}`)
  }
  for (const r of specRelations) {
    if (!objectIds.has(r.sourceRef)) missing('spec object', r.sourceRef, `SPEC-RELATION ${r.identifier} SOURCE`)
    if (!objectIds.has(r.targetRef)) missing('spec object', r.targetRef, `SPEC-RELATION ${r.identifier} TARGET`)
    checkValues(r.values, `SPEC-RELATION ${r.identifier}`)
  }
  const walk = (nodes: HierarchyNode[], where: string) => {
    for (const n of nodes) {
      if (!objectIds.has(n.objectRef)) missing('spec object', n.objectRef, `SPEC-HIERARCHY ${n.identifier} in ${where}`)
      walk(n.children, where)
    }
  }
  for (const s of specifications) walk(s.children, s.identifier)
  const removed = new Set(specObjects.flatMap((o) => o.values.flatMap((v) => v.xhtml?.removed ?? [])))
  if (removed.size) findings.push({ severity: 'warning', code: 'xhtml-sanitised', message: `Rich text was sanitised; removed: ${[...removed].slice(0, 8).join('; ')}` })

  return {
    document: { header, lang: attr(root, 'xml:lang'), datatypes, specTypes, specObjects, specRelations, specifications, relationGroups, toolExtensions },
    findings,
    unsupported,
  }
}
