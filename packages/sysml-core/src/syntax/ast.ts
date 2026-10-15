import type { Range } from './lexer'

/**
 * Syntax tree of the supported textual-notation subset. The builder (build.ts) maps it to
 * abstract-syntax elements; names stay unresolved here.
 */

export interface QName {
  segments: string[]
  range: Range
  /** Already resolved (commands that name elements by ID): the builder uses it without name lookup. */
  resolvedId?: string
}

/** A feature chain `a.b.c` (each part may be qualified: `P::a.b`). */
export interface Chain {
  parts: QName[]
  range: Range
  /** A reference to a member declared earlier in the same body (e.g. an unnamed entry action before `then`). */
  nodeRef?: Member
}

export interface TypeRef {
  name: QName
  /** `~T`: typed by the conjugated port definition of T. */
  conjugated?: boolean
}

export type Visibility = 'public' | 'private' | 'protected'
export type Direction = 'in' | 'out' | 'inout'

export type Expr =
  | { kind: 'literal'; type: 'integer' | 'rational' | 'string' | 'boolean' | 'infinity' | 'null'; value: number | string | boolean | null; range: Range }
  | { kind: 'ref'; chain: Chain; range: Range }
  | { kind: 'op'; operator: string; args: Expr[]; range: Range }
  | { kind: 'invoke'; target: QName; args: Expr[]; range: Range }

export interface Multiplicity {
  lower?: Expr
  upper: Expr
  range: Range
}

export interface ValuePart {
  expr: Expr
  isDefault: boolean
  isInitial: boolean
}

/** How a member is owned by its namespace (selects the membership metaclass). */
export type MembershipKind = 'owning' | 'feature' | 'end' | 'parameter' | 'return' | 'subject' | 'variant' | 'require' | 'assume' | 'result' | 'entry' | 'do' | 'exit' | 'objective' | 'verify' | 'actor' | 'stakeholder' | 'frame' | 'render'

interface BaseMember {
  visibility?: Visibility
  range: Range
  /** Range of the declared name, for diagnostics. */
  nameRange?: Range
}

export interface PackageNode extends BaseMember {
  kind: 'package'
  name?: string
  shortName?: string
  isLibrary: boolean
  isStandard: boolean
  members: Member[]
}

export interface ImportNode extends BaseMember {
  kind: 'import'
  target: QName
  /** `::*` */
  isNamespace: boolean
  /** `::**` */
  isRecursive: boolean
  isImportAll: boolean
  /** `expose` (views): an import that also selects what the view shows. */
  isExpose?: boolean
}

export interface AliasNode extends BaseMember {
  kind: 'alias'
  name: string
  shortName?: string
  target: QName
}

export interface CommentNode extends BaseMember {
  kind: 'comment' | 'doc'
  name?: string
  shortName?: string
  about: QName[]
  locale?: string
  body: string
}

export interface MetadataNode extends BaseMember {
  kind: 'metadata'
  name?: string
  type: QName
  about: QName[]
  members: Member[]
}

/** The metaclass a definition or usage keyword stands for. */
export interface DefinitionNode extends BaseMember {
  kind: 'definition'
  prefixMetadata?: QName[]
  metaclass: string
  name?: string
  shortName?: string
  isAbstract: boolean
  isVariation: boolean
  specializes: QName[]
  members: Member[]
  membership: MembershipKind
}

export interface ConnectorPart {
  /** Connection/interface/allocation/binding/succession/flow ends (feature chains). */
  ends: Chain[]
  /** Flow payload type (`flow of T`). */
  itemType?: QName
}

export interface TransitionPart {
  source?: Chain
  target: Chain
  /** `accept [name :] T` */
  acceptType?: QName
  acceptName?: string
  acceptVia?: Chain
  guard?: Expr
}

export interface UsageNode extends BaseMember {
  kind: 'usage'
  metaclass: string
  /** Keyword used ('' for a usage written without a kind keyword). */
  keyword: string
  name?: string
  shortName?: string
  direction?: Direction
  isAbstract: boolean
  isVariation: boolean
  isEnd: boolean
  isDerived: boolean
  isConstant: boolean
  /** `ref` prefix on a composite kind (part, item …): not composite. */
  isReference: boolean
  isOrdered: boolean
  isNonunique: boolean
  typing: TypeRef[]
  subsets: QName[]
  redefines: QName[]
  references?: QName
  /** Subsetting, redefinition or reference subsetting of a feature chain (`:> a.b`). */
  chainSpecializations?: { kind: 'subsets' | 'redefines' | 'references'; chain: Chain }[]
  multiplicity?: Multiplicity
  value?: ValuePart
  members: Member[]
  membership: MembershipKind
  connector?: ConnectorPart
  transition?: TransitionPart
  /** `satisfy R by x` */
  satisfy?: { requirement: QName; by?: Chain }
  /** Result expression of a constraint/calc body written as `{ expr }`. */
  result?: Expr
  /** `#M` prefix metadata applied to this declaration. */
  prefixMetadata?: QName[]
  /** `assert not`, `not satisfy` */
  isNegated?: boolean
  /** Reference forms (`perform x.y;`, `assert c;`, `require c;`, `verify r;`, …): the referenced feature. */
  performs?: Chain
  /** Accept action: `accept [name :] T [via port]`. */
  accept?: { payloadName?: string; payloadType?: QName; via?: Chain }
}

/** `first x;` (initial node of an action body): a non-owning membership referencing x. */
export interface FirstNode extends BaseMember {
  kind: 'first'
  target: Chain
}

/** A bare expression in a constraint or calculation body (its result). */
export interface ExpressionNode extends BaseMember {
  kind: 'expression'
  expr: Expr
}

export type Member = PackageNode | ImportNode | AliasNode | CommentNode | MetadataNode | DefinitionNode | UsageNode | ExpressionNode | FirstNode

export interface ParsedModel {
  members: Member[]
}
