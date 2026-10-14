/**
 * In-memory model of a ReqIF 1.2 document (OMG formal/16-07-01; namespace
 * http://www.omg.org/spec/ReqIF/20110401/reqif.xsd, shared by ReqIF 1.0.1, 1.1 and 1.2).
 * Element names follow the specification; nothing here interprets requirement semantics.
 */

export const REQIF_NAMESPACE = 'http://www.omg.org/spec/ReqIF/20110401/reqif.xsd'
export const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

export type DatatypeKind = 'BOOLEAN' | 'DATE' | 'ENUMERATION' | 'INTEGER' | 'REAL' | 'STRING' | 'XHTML'
export const DATATYPE_KINDS: DatatypeKind[] = ['BOOLEAN', 'DATE', 'ENUMERATION', 'INTEGER', 'REAL', 'STRING', 'XHTML']

export interface Identifiable {
  identifier: string
  lastChange: string
  longName?: string
  desc?: string
  alternativeId?: string
}

export interface EnumValue extends Identifiable {
  /** EMBEDDED-VALUE KEY (integer) and OTHER-CONTENT. */
  key: number
  otherContent: string
}

export interface Datatype extends Identifiable {
  kind: DatatypeKind
  maxLength?: number
  min?: number
  max?: number
  accuracy?: number
  values?: EnumValue[]
}

export interface XhtmlValue {
  /** Sanitised XHTML (no namespace prefixes), safe to render with an allow-list renderer. */
  sanitized: string
  /** Plain text extracted from the XHTML. */
  plain: string
  /** The exact original XML of THE-VALUE content (kept for lossless re-export and audits). */
  raw: string
  isSimplified?: boolean
  /** THE-ORIGINAL-VALUE, raw. */
  originalRaw?: string
  /** Object references (data attributes) found in the XHTML. */
  objects: { data: string; type?: string; name?: string }[]
  /** What the sanitiser removed. */
  removed: string[]
}

export interface AttributeValue {
  kind: DatatypeKind
  definitionRef: string
  /** BOOLEAN: boolean; INTEGER/REAL: number; DATE/STRING: string; ENUMERATION: enum value IDs; XHTML: plain text. */
  value: boolean | number | string | string[]
  xhtml?: XhtmlValue
}

export interface AttributeDefinition extends Identifiable {
  kind: DatatypeKind
  datatypeRef: string
  isEditable?: boolean
  multiValued?: boolean
  defaultValue?: AttributeValue
}

export type SpecTypeCategory = 'SPEC-OBJECT-TYPE' | 'SPEC-RELATION-TYPE' | 'SPECIFICATION-TYPE' | 'RELATION-GROUP-TYPE'

export interface SpecType extends Identifiable {
  category: SpecTypeCategory
  attributes: AttributeDefinition[]
}

export interface SpecObject extends Identifiable {
  typeRef: string
  values: AttributeValue[]
}

export interface SpecRelation extends Identifiable {
  typeRef: string
  sourceRef: string
  targetRef: string
  values: AttributeValue[]
}

export interface HierarchyNode extends Identifiable {
  objectRef: string
  isTableInternal?: boolean
  isEditable?: boolean
  children: HierarchyNode[]
}

export interface Specification extends Identifiable {
  typeRef: string
  values: AttributeValue[]
  children: HierarchyNode[]
}

export interface RelationGroup extends Identifiable {
  typeRef: string
  sourceSpecificationRef: string
  targetSpecificationRef: string
  relationRefs: string[]
}

export interface Header {
  identifier: string
  comment?: string
  creationTime: string
  repositoryId?: string
  reqifToolId: string
  reqifVersion: string
  sourceToolId: string
  title: string
}

export interface ReqIFDocument {
  header: Header
  lang?: string
  datatypes: Datatype[]
  specTypes: SpecType[]
  specObjects: SpecObject[]
  specRelations: SpecRelation[]
  specifications: Specification[]
  relationGroups: RelationGroup[]
  /** Raw XML of each REQ-IF-TOOL-EXTENSION (preserved, not interpreted). */
  toolExtensions: string[]
}

export interface Finding {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  path?: string
}
