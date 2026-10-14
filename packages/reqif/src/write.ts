import { REQIF_NAMESPACE, XHTML_NAMESPACE, type AttributeValue, type Datatype, type HierarchyNode, type Identifiable, type ReqIFDocument, type SpecType } from './model'
import { escapeAttr, escapeText, xmlSafe } from './xml'

/**
 * Serialises a ReqIF document. Element order follows the sequences of reqif.xsd (header, core
 * content, tool extensions; datatypes, spec types, objects, relations, specifications, relation
 * groups). XHTML values are written from `xhtml.raw`, which must already be ReqIF XHTML content
 * (one xhtml:div or xhtml:p using the xhtml prefix); use `toReqifXhtml()` to build it.
 */

const a = (name: string, v: string | number | boolean | undefined) => (v === undefined || v === '' ? '' : ` ${name}="${escapeAttr(xmlSafe(String(v)))}"`)
const ident = (x: Identifiable) => `${a('IDENTIFIER', x.identifier)}${a('LAST-CHANGE', x.lastChange)}${a('LONG-NAME', x.longName)}${a('DESC', x.desc)}`
const alt = (x: Identifiable, pad: string) => (x.alternativeId ? `${pad}<ALTERNATIVE-ID><ALTERNATIVE-ID${a('IDENTIFIER', x.alternativeId)}/></ALTERNATIVE-ID>\n` : '')

function values(vals: AttributeValue[], pad: string): string {
  if (!vals.length) return ''
  const items = vals.map((v) => {
    const def = `<DEFINITION><ATTRIBUTE-DEFINITION-${v.kind}-REF>${escapeText(v.definitionRef)}</ATTRIBUTE-DEFINITION-${v.kind}-REF></DEFINITION>`
    switch (v.kind) {
      case 'XHTML':
        return `${pad}  <ATTRIBUTE-VALUE-XHTML${v.xhtml?.isSimplified !== undefined ? a('IS-SIMPLIFIED', v.xhtml.isSimplified) : ''}>${def}<THE-VALUE>${v.xhtml?.raw ?? `<xhtml:div>${escapeText(xmlSafe(String(v.value)))}</xhtml:div>`}</THE-VALUE>${v.xhtml?.originalRaw ? `<THE-ORIGINAL-VALUE>${v.xhtml.originalRaw}</THE-ORIGINAL-VALUE>` : ''}</ATTRIBUTE-VALUE-XHTML>`
      case 'ENUMERATION':
        return `${pad}  <ATTRIBUTE-VALUE-ENUMERATION>${def}<VALUES>${(v.value as string[]).map((r) => `<ENUM-VALUE-REF>${escapeText(r)}</ENUM-VALUE-REF>`).join('')}</VALUES></ATTRIBUTE-VALUE-ENUMERATION>`
      default:
        return `${pad}  <ATTRIBUTE-VALUE-${v.kind}${a('THE-VALUE', typeof v.value === 'boolean' ? String(v.value) : (v.value as string | number))}>${def}</ATTRIBUTE-VALUE-${v.kind}>`
    }
  })
  return `${pad}<VALUES>\n${items.join('\n')}\n${pad}</VALUES>\n`
}

function datatype(d: Datatype): string {
  const extra =
    d.kind === 'STRING'
      ? a('MAX-LENGTH', d.maxLength ?? 32000)
      : d.kind === 'INTEGER'
        ? `${a('MAX', d.max ?? 2147483647)}${a('MIN', d.min ?? -2147483648)}`
        : d.kind === 'REAL'
          ? `${a('ACCURACY', d.accuracy ?? 10)}${a('MAX', d.max ?? 1e308)}${a('MIN', d.min ?? -1e308)}`
          : ''
  const enumValues =
    d.kind === 'ENUMERATION'
      ? `      <SPECIFIED-VALUES>\n${(d.values ?? [])
          .map((v) => `        <ENUM-VALUE${ident(v)}>\n${alt(v, '          ')}          <PROPERTIES><EMBEDDED-VALUE${a('KEY', v.key)}${a('OTHER-CONTENT', v.otherContent || ' ')}/></PROPERTIES>\n        </ENUM-VALUE>`)
          .join('\n')}\n      </SPECIFIED-VALUES>\n`
      : ''
  return `    <DATATYPE-DEFINITION-${d.kind}${ident(d)}${extra}>\n${alt(d, '      ')}${enumValues}    </DATATYPE-DEFINITION-${d.kind}>`
}

function specType(t: SpecType): string {
  const defs = t.attributes
    .map(
      (d) =>
        `        <ATTRIBUTE-DEFINITION-${d.kind}${ident(d)}${d.isEditable !== undefined ? a('IS-EDITABLE', d.isEditable) : ''}${d.kind === 'ENUMERATION' ? a('MULTI-VALUED', !!d.multiValued) : ''}>\n${alt(d, '          ')}${
          d.defaultValue ? `          <DEFAULT-VALUE>${values([d.defaultValue], '').replace(/^<VALUES>\n|\n<\/VALUES>\n$/g, '').trim()}</DEFAULT-VALUE>\n` : ''
        }          <TYPE><DATATYPE-DEFINITION-${d.kind}-REF>${escapeText(d.datatypeRef)}</DATATYPE-DEFINITION-${d.kind}-REF></TYPE>\n        </ATTRIBUTE-DEFINITION-${d.kind}>`,
    )
    .join('\n')
  return `    <${t.category}${ident(t)}>\n${alt(t, '      ')}${defs ? `      <SPEC-ATTRIBUTES>\n${defs}\n      </SPEC-ATTRIBUTES>\n` : ''}    </${t.category}>`
}

function hierarchy(nodes: HierarchyNode[], pad: string): string {
  if (!nodes.length) return ''
  return `${pad}<CHILDREN>\n${nodes
    .map(
      (n) =>
        `${pad}  <SPEC-HIERARCHY${ident(n)}${n.isTableInternal !== undefined ? a('IS-TABLE-INTERNAL', n.isTableInternal) : ''}${n.isEditable !== undefined ? a('IS-EDITABLE', n.isEditable) : ''}>\n${alt(n, `${pad}    `)}${pad}    <OBJECT><SPEC-OBJECT-REF>${escapeText(n.objectRef)}</SPEC-OBJECT-REF></OBJECT>\n${hierarchy(n.children, `${pad}    `)}${pad}  </SPEC-HIERARCHY>`,
    )
    .join('\n')}\n${pad}</CHILDREN>\n`
}

export function writeReqIF(doc: ReqIFDocument): string {
  const h = doc.header
  const section = (name: string, items: string[]) => (items.length ? `    <${name}>\n${items.join('\n')}\n    </${name}>\n` : '')
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<REQ-IF xmlns="${REQIF_NAMESPACE}" xmlns:xhtml="${XHTML_NAMESPACE}"${doc.lang ? a('xml:lang', doc.lang) : ''}>`,
    '  <THE-HEADER>',
    `    <REQ-IF-HEADER${a('IDENTIFIER', h.identifier)}>`,
    h.comment ? `      <COMMENT>${escapeText(xmlSafe(h.comment))}</COMMENT>` : '',
    `      <CREATION-TIME>${escapeText(h.creationTime)}</CREATION-TIME>`,
    h.repositoryId ? `      <REPOSITORY-ID>${escapeText(xmlSafe(h.repositoryId))}</REPOSITORY-ID>` : '',
    `      <REQ-IF-TOOL-ID>${escapeText(xmlSafe(h.reqifToolId))}</REQ-IF-TOOL-ID>`,
    `      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>`,
    `      <SOURCE-TOOL-ID>${escapeText(xmlSafe(h.sourceToolId))}</SOURCE-TOOL-ID>`,
    `      <TITLE>${escapeText(xmlSafe(h.title))}</TITLE>`,
    '    </REQ-IF-HEADER>',
    '  </THE-HEADER>',
    '  <CORE-CONTENT>',
    '    <REQ-IF-CONTENT>',
    section('DATATYPES', doc.datatypes.map(datatype)).trimEnd(),
    section('SPEC-TYPES', doc.specTypes.map(specType)).trimEnd(),
    section(
      'SPEC-OBJECTS',
      doc.specObjects.map((o) => `    <SPEC-OBJECT${ident(o)}>\n${alt(o, '      ')}${values(o.values, '      ')}      <TYPE><SPEC-OBJECT-TYPE-REF>${escapeText(o.typeRef)}</SPEC-OBJECT-TYPE-REF></TYPE>\n    </SPEC-OBJECT>`),
    ).trimEnd(),
    section(
      'SPEC-RELATIONS',
      doc.specRelations.map(
        (r) =>
          `    <SPEC-RELATION${ident(r)}>\n${alt(r, '      ')}${values(r.values, '      ')}      <SOURCE><SPEC-OBJECT-REF>${escapeText(r.sourceRef)}</SPEC-OBJECT-REF></SOURCE>\n      <TARGET><SPEC-OBJECT-REF>${escapeText(r.targetRef)}</SPEC-OBJECT-REF></TARGET>\n      <TYPE><SPEC-RELATION-TYPE-REF>${escapeText(r.typeRef)}</SPEC-RELATION-TYPE-REF></TYPE>\n    </SPEC-RELATION>`,
      ),
    ).trimEnd(),
    section(
      'SPECIFICATIONS',
      doc.specifications.map((s) => `    <SPECIFICATION${ident(s)}>\n${alt(s, '      ')}${values(s.values, '      ')}${hierarchy(s.children, '      ')}      <TYPE><SPECIFICATION-TYPE-REF>${escapeText(s.typeRef)}</SPECIFICATION-TYPE-REF></TYPE>\n    </SPECIFICATION>`),
    ).trimEnd(),
    section(
      'SPEC-RELATION-GROUPS',
      doc.relationGroups.map(
        (g) =>
          `    <RELATION-GROUP${ident(g)}>\n${alt(g, '      ')}      <SOURCE-SPECIFICATION><SPECIFICATION-REF>${escapeText(g.sourceSpecificationRef)}</SPECIFICATION-REF></SOURCE-SPECIFICATION>\n${
            g.relationRefs.length ? `      <SPEC-RELATIONS>${g.relationRefs.map((r) => `<SPEC-RELATION-REF>${escapeText(r)}</SPEC-RELATION-REF>`).join('')}</SPEC-RELATIONS>\n` : ''
          }      <TARGET-SPECIFICATION><SPECIFICATION-REF>${escapeText(g.targetSpecificationRef)}</SPECIFICATION-REF></TARGET-SPECIFICATION>\n      <TYPE><RELATION-GROUP-TYPE-REF>${escapeText(g.typeRef)}</RELATION-GROUP-TYPE-REF></TYPE>\n    </RELATION-GROUP>`,
      ),
    ).trimEnd(),
    '    </REQ-IF-CONTENT>',
    '  </CORE-CONTENT>',
    doc.toolExtensions.length ? `  <TOOL-EXTENSIONS>\n${doc.toolExtensions.map((e) => `    ${e}`).join('\n')}\n  </TOOL-EXTENSIONS>` : '',
    '</REQ-IF>',
    '',
  ]
  return out.filter((l) => l !== '').join('\n')
}

/** ReqIF IDENTIFIERs are xsd:ID (NCName): letters, digits, '.', '-', '_'; must not start with a digit, '.' or '-'. */
export function toNcName(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._-]/g, '_')
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`
}
