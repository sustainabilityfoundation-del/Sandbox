import type { AliasNode, Chain, CommentNode, ConnectorPart, DefinitionNode, Direction, Expr, ImportNode, Member, MembershipKind, MetadataNode, Multiplicity, PackageNode, ParsedModel, QName, TypeRef, UsageNode, ValuePart, Visibility } from './ast'
import { SyntaxError, tokenize, type Range, type Token } from './lexer'

/**
 * Recursive-descent parser for the supported subset of the SysML v2 textual notation (see
 * docs/modules/sysml/conformance.md). It recovers from errors at member boundaries, so one bad
 * member yields one diagnostic and the rest of the text still parses.
 */

export interface SyntaxDiagnostic {
  ruleId: 'SYSML-SYNTAX' | 'SYSML-SYNTAX-UNSUPPORTED'
  severity: 'error'
  message: string
  range: Range
  /** For unsupported constructs: the construct's keyword. */
  construct?: string
}

export interface ParseResult {
  model: ParsedModel
  diagnostics: SyntaxDiagnostic[]
}

export const DEFINITION_KEYWORDS: Record<string, string> = {
  part: 'PartDefinition',
  attribute: 'AttributeDefinition',
  item: 'ItemDefinition',
  port: 'PortDefinition',
  connection: 'ConnectionDefinition',
  interface: 'InterfaceDefinition',
  flow: 'FlowDefinition',
  action: 'ActionDefinition',
  state: 'StateDefinition',
  constraint: 'ConstraintDefinition',
  requirement: 'RequirementDefinition',
  calc: 'CalculationDefinition',
  allocation: 'AllocationDefinition',
  occurrence: 'OccurrenceDefinition',
  enum: 'EnumerationDefinition',
  metadata: 'MetadataDefinition',
  verification: 'VerificationCaseDefinition',
  analysis: 'AnalysisCaseDefinition',
  concern: 'ConcernDefinition',
  view: 'ViewDefinition',
  viewpoint: 'ViewpointDefinition',
  case: 'CaseDefinition',
  rendering: 'RenderingDefinition',
}

export const USAGE_KEYWORDS: Record<string, string> = {
  part: 'PartUsage',
  attribute: 'AttributeUsage',
  item: 'ItemUsage',
  port: 'PortUsage',
  connection: 'ConnectionUsage',
  interface: 'InterfaceUsage',
  flow: 'FlowUsage',
  action: 'ActionUsage',
  state: 'StateUsage',
  constraint: 'ConstraintUsage',
  requirement: 'RequirementUsage',
  calc: 'CalculationUsage',
  allocation: 'AllocationUsage',
  occurrence: 'OccurrenceUsage',
  enum: 'EnumerationUsage',
  ref: 'ReferenceUsage',
  binding: 'BindingConnectorAsUsage',
  succession: 'SuccessionAsUsage',
  transition: 'TransitionUsage',
  verification: 'VerificationCaseUsage',
  analysis: 'AnalysisCaseUsage',
  concern: 'ConcernUsage',
  view: 'ViewUsage',
  viewpoint: 'ViewpointUsage',
  case: 'CaseUsage',
  rendering: 'RenderingUsage',
}

/** SysML keywords that start constructs this subset does not support yet (reported, never dropped silently). */
export const UNSUPPORTED_KEYWORDS = new Set([
  'send', 'message', 'event', 'snapshot', 'timeslice', 'individual', 'variant', 'filter', 'decide', 'merge', 'fork', 'join',
  'loop', 'while', 'until', 'terminate', 'assign', 'include', 'dependency', 'language', 'rep', 'after', 'at', 'when', 'crosses', 'meta',
])

class Stop extends Error {}

export function parse(text: string): ParseResult {
  const diagnostics: SyntaxDiagnostic[] = []
  let tokens: Token[]
  try {
    tokens = tokenize(text)
  } catch (e) {
    if (e instanceof SyntaxError) return { model: { members: [] }, diagnostics: [{ ruleId: 'SYSML-SYNTAX', severity: 'error', message: e.message, range: e.range }] }
    throw e
  }
  const p = new Parser(tokens, diagnostics)
  let members: Member[] = []
  try {
    members = p.members('eof', 'package')
  } catch (e) {
    if (!(e instanceof Stop)) throw e
  }
  return { model: { members }, diagnostics }
}

/** Parses a standalone expression (for commands such as setValue). */
export function parseExpression(text: string): { expr?: Expr; diagnostics: SyntaxDiagnostic[] } {
  const diagnostics: SyntaxDiagnostic[] = []
  try {
    const p = new Parser(tokenize(text), diagnostics)
    const expr = p.expression()
    p.expectEof()
    return { expr, diagnostics }
  } catch (e) {
    if (e instanceof SyntaxError) return { diagnostics: [{ ruleId: 'SYSML-SYNTAX', severity: 'error', message: e.message, range: e.range }] }
    if (e instanceof Stop) return { diagnostics }
    throw e
  }
}

/** The kind of body being parsed: decides whether bare expressions are allowed and the default membership. */
type Context = 'package' | 'definition' | 'usage' | 'expression-body' | 'enum' | 'metadata'

class Parser {
  private i = 0
  /** `#M` prefixes read among the modifiers; attached to the next definition or usage node. */
  private prefixMeta: QName[] = []
  constructor(
    private readonly t: Token[],
    private readonly diagnostics: SyntaxDiagnostic[],
  ) {}

  // ---- token helpers ----------------------------------------------------------------------
  private get tok(): Token {
    return this.t[this.i]
  }
  private peek(n = 1): Token {
    return this.t[Math.min(this.i + n, this.t.length - 1)]
  }
  private is(value: string, kind?: Token['kind']): boolean {
    const t = this.tok
    return t.value === value && (kind ? t.kind === kind : t.kind === 'keyword' || t.kind === 'symbol')
  }
  private isAt(n: number, value: string): boolean {
    const t = this.peek(n)
    return t.value === value && (t.kind === 'keyword' || t.kind === 'symbol')
  }
  private accept(value: string): boolean {
    if (this.is(value)) {
      this.i++
      return true
    }
    return false
  }
  private expect(value: string, what?: string): Token {
    if (this.is(value)) return this.t[this.i++]
    this.fail(`Expected ${what ?? `“${value}”`} but found ${this.describe(this.tok)}.`)
  }
  private describe(t: Token): string {
    if (t.kind === 'eof') return 'the end of the text'
    if (t.kind === 'name') return `name “${t.value}”`
    if (t.kind === 'comment') return 'a comment'
    return `“${t.value}”`
  }
  private fail(message: string, range: Range = this.tok.range): never {
    this.diagnostics.push({ ruleId: 'SYSML-SYNTAX', severity: 'error', message, range })
    throw new Stop()
  }
  expectEof() {
    if (this.tok.kind !== 'eof') this.fail(`Unexpected ${this.describe(this.tok)} after the expression.`)
  }
  private range(start: Token): Range {
    const prev = this.t[Math.max(this.i - 1, 0)]
    return { start: start.range.start, end: prev.range.end }
  }

  /** Skips to the end of the current member: past the next `;` at depth 0, or past a balanced `{ … }`. */
  private recover() {
    let depth = 0
    while (this.tok.kind !== 'eof') {
      const v = this.tok.kind === 'symbol' ? this.tok.value : ''
      if (v === '{') depth++
      else if (v === '}') {
        if (depth === 0) return
        depth--
        if (depth === 0) {
          this.i++
          return
        }
      } else if (v === ';' && depth === 0) {
        this.i++
        return
      }
      this.i++
    }
  }

  // ---- names ----------------------------------------------------------------------------------
  private isName(t: Token = this.tok): boolean {
    return t.kind === 'name'
  }
  private name(what = 'a name'): string {
    if (!this.isName()) this.fail(`Expected ${what} but found ${this.describe(this.tok)}.`)
    return this.t[this.i++].value
  }
  qname(): QName {
    const start = this.tok
    const segments = [this.name('a qualified name')]
    while (this.is('::') && this.isName(this.peek())) {
      this.i++
      segments.push(this.name())
    }
    return { segments, range: this.range(start) }
  }
  private chain(): Chain {
    const start = this.tok
    const parts = [this.qname()]
    while (this.is('.') && this.isName(this.peek())) {
      this.i++
      parts.push(this.qname())
    }
    return { parts, range: this.range(start) }
  }
  /** `<'short'> name`, both optional. */
  private identification(): { name?: string; shortName?: string; nameRange?: Range } {
    let shortName: string | undefined
    if (this.is('<') && this.isName(this.peek()) && this.isAt(2, '>')) {
      this.i++
      shortName = this.name()
      this.expect('>')
    }
    let name: string | undefined
    let nameRange: Range | undefined
    if (this.isName()) {
      nameRange = this.tok.range
      name = this.name()
    }
    return { name, shortName, nameRange }
  }

  // ---- members --------------------------------------------------------------------------------
  members(until: '}' | 'eof', context: Context): Member[] {
    const out: Member[] = []
    let prev: Chain | undefined
    while (!(until === 'eof' ? this.tok.kind === 'eof' : this.is('}'))) {
      if (this.tok.kind === 'eof') this.fail('Missing “}”: the body is not closed.')
      const before = this.i
      try {
        for (const m of this.member(context, prev)) {
          out.push(m)
          prev = prevOf(m) ?? prev
        }
      } catch (e) {
        if (!(e instanceof Stop)) throw e
        if (this.i === before) this.i++
        this.recover()
      }
    }
    return out
  }

  private body(context: Context): Member[] {
    if (this.accept(';')) return []
    this.expect('{', '“;” or “{”')
    const members = this.members('}', context)
    this.expect('}')
    return members
  }

  private member(context: Context, prev?: Chain): Member[] {
    const start = this.tok
    let visibility: Visibility | undefined
    if (this.is('public') || this.is('private') || this.is('protected')) visibility = this.t[this.i++].value as Visibility
    const prefixes: QName[] = []
    while (this.is('#')) {
      this.i++
      prefixes.push(this.qname())
    }
    const ms = this.memberBodies(context, start, prev)
    if (visibility && ms[0]) ms[0].visibility = visibility
    if (prefixes.length) {
      const target = ms.find((m) => m.kind === 'usage' || m.kind === 'definition') as UsageNode | DefinitionNode | undefined
      if (!target) this.fail('Prefix metadata (#…) must precede a definition or usage.', prefixes[0].range)
      target.prefixMetadata = [...prefixes, ...(target.prefixMetadata ?? [])]
    }
    this.prefixMeta = []
    return ms
  }

  /** Members that may expand to several nodes: `then` successions and `first` initial nodes. */
  private memberBodies(context: Context, start: Token, prev?: Chain): Member[] {
    if (this.is('then')) {
      this.i++
      if (!prev) this.fail('“then” needs a preceding action, state or “first” member.', start.range)
      const k = this.tok
      let target: Member | undefined
      let targetChain: Chain
      if (k.kind === 'keyword' && (USAGE_KEYWORDS[k.value] || ['perform', 'exhibit', 'accept'].includes(k.value))) {
        target = this.memberBody(context, this.tok)
        if (!target || target.kind !== 'usage') this.fail('Expected an action or state after “then”.', k.range)
        targetChain = target.name ? { parts: [{ segments: [target.name], range: target.nameRange ?? target.range }], range: target.range } : { parts: [], range: target.range, nodeRef: target }
      } else {
        targetChain = this.chain()
        this.expect(';')
      }
      const succ: UsageNode = { kind: 'usage', ...emptyUsage('SuccessionAsUsage', ''), membership: defaultMembership(context), connector: { ends: [prev!, targetChain] }, range: this.range(start) }
      return target ? [target, succ] : [succ]
    }
    if (this.is('first')) {
      this.i++
      const a = this.chain()
      if (this.accept('then')) {
        const node: UsageNode = { kind: 'usage', ...emptyUsage('SuccessionAsUsage', ''), membership: defaultMembership(context), connector: { ends: [a, this.chain()] }, range: start.range }
        node.members = this.body('usage')
        node.range = this.range(start)
        return [node]
      }
      this.expect(';', '“then” or “;”')
      return [{ kind: 'first', target: a, range: this.range(start) }]
    }
    if (this.is('accept') && prev) {
      const save = this.i
      this.i++
      const tr: NonNullable<UsageNode['transition']> = { source: prev, target: { parts: [], range: this.tok.range } }
      if (this.isName() && this.isAt(1, ':')) {
        tr.acceptName = this.name()
        this.i++
      }
      if (this.isName()) tr.acceptType = this.qname()
      if (this.accept('via')) tr.acceptVia = this.chain()
      if (this.accept('if')) tr.guard = this.expression()
      if (this.accept('then')) {
        tr.target = this.chain()
        const node: UsageNode = { kind: 'usage', ...emptyUsage('TransitionUsage', 'transition'), membership: defaultMembership(context), transition: tr, range: start.range }
        node.members = this.body('usage')
        node.range = this.range(start)
        return [node]
      }
      this.i = save
    }
    const m = this.memberBody(context, start)
    return m ? [m] : []
  }

  private memberBody(context: Context, start: Token): Member | undefined {
    const t = this.tok
    if (t.kind === 'comment') {
      this.i++
      return { kind: 'comment', about: [], body: t.value, range: t.range }
    }
    if (t.kind === 'keyword') {
      switch (t.value) {
        case 'package':
          return this.packageDecl(start, false, false)
        case 'library':
        case 'standard': {
          const isStandard = this.accept('standard')
          this.expect('library')
          this.expect('package')
          this.i--
          return this.packageDecl(start, true, isStandard)
        }
        case 'import':
          return this.importDecl(start)
        case 'alias':
          return this.aliasDecl(start)
        case 'doc':
        case 'comment':
          return this.commentDecl(start)
        case 'metadata':
          if (this.isAt(1, 'def') || (this.isAt(1, 'abstract'))) break
          return this.metadataDecl(start, true)
        case 'connect':
          return this.connectorShorthand(start, 'ConnectionUsage', 'connect', context)
        case 'bind':
          return this.connectorShorthand(start, 'BindingConnectorAsUsage', 'bind', context)
        case 'expose':
          return this.importDecl(start, true)
        case 'use': {
          this.i++
          this.expect('case')
          if (this.accept('def')) return this.definition(start, 'UseCaseDefinition', false, false, context)
          return this.usage(start, context, { metaclass: 'UseCaseUsage', keyword: 'use case' })
        }
        case 'perform':
        case 'exhibit': {
          this.i++
          const metaclass = t.value === 'perform' ? 'PerformActionUsage' : 'ExhibitStateUsage'
          if (this.accept(t.value === 'perform' ? 'action' : 'state')) return this.usage(start, context, { metaclass, keyword: t.value })
          return this.referenceForm(start, context, metaclass, t.value)
        }
        case 'assert': {
          this.i++
          const isNegated = this.accept('not')
          if (this.is('satisfy')) return this.satisfyDecl(start, context, isNegated)
          if (this.accept('constraint')) return this.usage(start, context, { metaclass: 'AssertConstraintUsage', keyword: 'assert', isNegated })
          const node = this.referenceForm(start, context, 'AssertConstraintUsage', 'assert')
          node.isNegated = isNegated
          return node
        }
        case 'not':
          if (this.isAt(1, 'satisfy')) {
            this.i++
            return this.satisfyDecl(start, context, true)
          }
          break
        case 'objective':
          this.i++
          return this.usage(start, context, { metaclass: 'RequirementUsage', keyword: 'objective', membership: 'objective' })
        case 'verify':
        case 'frame':
        case 'render': {
          this.i++
          const spec = ({ verify: ['requirement', 'RequirementUsage'], frame: ['concern', 'ConcernUsage'], render: ['rendering', 'RenderingUsage'] } as Record<string, [string, string]>)[t.value]
          const membership = t.value as 'verify' | 'frame' | 'render'
          if (this.accept(spec[0])) return this.usage(start, context, { metaclass: spec[1], keyword: spec[0], membership })
          return this.referenceForm(start, context, spec[1], t.value, membership)
        }
        case 'actor':
        case 'stakeholder':
          this.i++
          return this.usage(start, context, { metaclass: 'PartUsage', keyword: '', membership: t.value as 'actor' | 'stakeholder' })
        case 'accept':
          return this.acceptDecl(start, context)
        case 'allocate':
          return this.connectorShorthand(start, 'AllocationUsage', 'allocate', context)
        case 'satisfy':
          return this.satisfyDecl(start, context)
        case 'subject':
          this.i++
          return this.usage(start, context, { metaclass: 'ReferenceUsage', keyword: 'subject', membership: 'subject' })
        case 'return':
          this.i++
          return this.usageAfterReturn(start, context)
        case 'require':
        case 'assume': {
          this.i++
          const kind = t.value === 'require' ? 'require' : 'assume'
          if (this.accept('constraint')) return this.usage(start, context, { metaclass: 'ConstraintUsage', keyword: 'constraint', membership: kind })
          return this.referenceForm(start, context, 'ConstraintUsage', t.value, kind)
        }
        case 'entry':
        case 'do':
        case 'exit': {
          this.i++
          const kind = t.value as 'entry' | 'do' | 'exit'
          if (this.accept(';')) return { kind: 'usage', ...emptyUsage('ActionUsage', 'action'), membership: kind, range: this.range(start) } as UsageNode
          this.expect('action', '“action” or “;”')
          return this.usage(start, context, { metaclass: 'ActionUsage', keyword: 'action', membership: kind })
        }
      }
      if (UNSUPPORTED_KEYWORDS.has(t.value)) this.unsupported(t)
    }
    if (this.is('@')) return this.metadataDecl(start, false)
    if (context === 'enum' && this.isName() && (this.isAt(1, ';') || this.isAt(1, '{'))) {
      return this.usage(start, context, { metaclass: 'EnumerationUsage', keyword: '', membership: 'variant' })
    }
    // Prefixes shared by definitions and usages.
    const prefix = { direction: undefined as Direction | undefined, isAbstract: false, isVariation: false, isEnd: false, isDerived: false, isConstant: false, isReference: false }
    for (;;) {
      if (this.is('in') || this.is('out') || this.is('inout')) prefix.direction = this.t[this.i++].value as Direction
      else if (this.accept('abstract')) prefix.isAbstract = true
      else if (this.accept('variation')) prefix.isVariation = true
      else if (this.accept('end')) {
        prefix.isEnd = true
        // SysML 2.0 end multiplicity / named end: `end [0..1] item x`, `end e[0..*] item x` (parsed, not represented).
        const at = this.tok
        if (this.is('[')) {
          this.multiplicity()
          this.notRepresented('end multiplicity', at.range)
        } else if (this.isName() && this.isAt(1, '[')) {
          this.i++
          this.multiplicity()
          this.notRepresented('named end', at.range)
        }
      }
      else if (this.accept('derived')) prefix.isDerived = true
      else if (this.accept('constant')) prefix.isConstant = true
      else if (this.is('#')) {
        this.i++
        this.prefixMeta.push(this.qname())
      } else if (this.is('ref') && this.peek().kind === 'keyword' && USAGE_KEYWORDS[this.peek().value] && this.peek().value !== 'ref') {
        this.i++
        prefix.isReference = true
      } else break
    }
    const k = this.tok
    if (k.kind === 'keyword' && this.isAt(1, 'def') && DEFINITION_KEYWORDS[k.value]) {
      this.i += 2
      return this.definition(start, DEFINITION_KEYWORDS[k.value], prefix.isAbstract, prefix.isVariation, context)
    }
    if (k.kind === 'keyword' && USAGE_KEYWORDS[k.value]) {
      this.i++
      if (context === 'enum' && k.value === 'enum') return this.usage(start, context, { metaclass: 'EnumerationUsage', keyword: 'enum', membership: 'variant', ...prefix })
      return this.usage(start, context, { metaclass: USAGE_KEYWORDS[k.value], keyword: k.value, ...prefix })
    }
    if (k.kind === 'keyword' && UNSUPPORTED_KEYWORDS.has(k.value)) this.unsupported(k)
    // A usage without a kind keyword: `x : T;`, `:>> mass = 10 [kg];`, `ref x : T;`.
    if (this.is('ref')) {
      this.i++
      return this.usage(start, context, { metaclass: 'ReferenceUsage', keyword: 'ref', ...prefix })
    }
    const startsFeature = this.is(':>>') || this.is(':>') || this.is('redefines') || this.is('subsets') || this.is(':') || this.is('<') ||
      (this.isName() && ['::', ':', ':>', ':>>', ';', '{', '[', '=', ':=', 'defined', 'subsets', 'redefines', 'references', 'default', '::>'].some((v) => this.isAt(1, v)) && !(this.isAt(1, '::') && context === 'expression-body'))
    if (startsFeature && !(context === 'expression-body' && this.isName() && this.isAt(1, '::'))) {
      return this.usage(start, context, { metaclass: 'ReferenceUsage', keyword: '', ...prefix })
    }
    if (context === 'expression-body' && !prefix.direction) {
      const expr = this.expression()
      this.accept(';')
      return { kind: 'expression', expr, range: this.range(start) }
    }
    this.fail(`Unexpected ${this.describe(this.tok)}: expected a member declaration.`)
  }

  /** A construct that is parsed but not represented in the model: reported, never dropped silently. */
  private notRepresented(construct: string, range: Range) {
    this.diagnostics.push({ ruleId: 'SYSML-SYNTAX-UNSUPPORTED', severity: 'error', construct, message: `“${construct}” is parsed but not represented by this version of the SysML Modeler (see the conformance list).`, range })
  }

  /** Connector end multiplicity `connect [1] a to [*] b`, `first [0..1] a then [*] b` (parsed, not represented). */
  private endChain(): Chain {
    if (this.is('[')) {
      const at = this.tok
      this.multiplicity()
      this.notRepresented('connector end multiplicity', at.range)
    }
    return this.chain()
  }

  private unsupported(t: Token): never {
    this.diagnostics.push({ ruleId: 'SYSML-SYNTAX-UNSUPPORTED', severity: 'error', construct: t.value, message: `“${t.value}” declarations are not supported by this version of the SysML Modeler (see the conformance list).`, range: t.range })
    throw new Stop()
  }

  private packageDecl(start: Token, isLibrary: boolean, isStandard: boolean): PackageNode {
    this.expect('package')
    const id = this.identification()
    const members = this.body('package')
    return { kind: 'package', ...id, isLibrary, isStandard, members, range: this.range(start) }
  }

  private importDecl(start: Token, isExpose = false): ImportNode {
    this.expect(isExpose ? 'expose' : 'import')
    const isImportAll = this.accept('all')
    const target = this.qname()
    let isNamespace = false
    let isRecursive = false
    if (this.is('::') && this.isAt(1, '*')) {
      this.i += 2
      isNamespace = true
      if (this.is('::') && this.isAt(1, '**')) {
        this.i += 2
        isRecursive = true
      }
    } else if (this.is('::') && this.isAt(1, '**')) {
      this.i += 2
      isRecursive = true
    }
    this.expect(';')
    return { kind: 'import', target, isNamespace, isRecursive, isImportAll, ...(isExpose ? { isExpose: true } : {}), range: this.range(start) }
  }

  private aliasDecl(start: Token): AliasNode {
    this.expect('alias')
    const id = this.identification()
    if (!id.name) this.fail('An alias needs a name.')
    this.expect('for')
    const target = this.qname()
    if (this.is('{')) {
      // Relationship body (documentation of the alias): parsed, not represented.
      const at = this.tok
      if (this.body('package').length) this.notRepresented('alias body', at.range)
    } else this.expect(';')
    return { kind: 'alias', name: id.name, shortName: id.shortName, nameRange: id.nameRange, target, range: this.range(start) }
  }

  private commentDecl(start: Token): CommentNode {
    const kw = this.t[this.i++].value as 'doc' | 'comment'
    const id = kw === 'comment' || this.isName() || this.is('<') ? this.identification() : {}
    const about: QName[] = []
    if (kw === 'comment' && this.accept('about')) {
      about.push(this.qname())
      while (this.accept(',')) about.push(this.qname())
    }
    let locale: string | undefined
    if (this.accept('locale')) {
      if (this.tok.kind !== 'string') this.fail('Expected a locale string.')
      locale = this.t[this.i++].value
    }
    if (this.tok.kind !== 'comment') this.fail(`Expected the ${kw === 'doc' ? 'documentation' : 'comment'} text “/* … */”.`)
    const body = this.t[this.i++].value
    return { kind: kw, ...id, about, locale, body, range: this.range(start) }
  }

  /** `@T;`, `@T { a = 1; }`, `metadata m : T about x;` */
  private metadataDecl(start: Token, keyword: boolean): MetadataNode {
    this.i++
    let name: string | undefined
    if (keyword && this.isName() && (this.isAt(1, ':') || this.isAt(1, 'typed'))) {
      name = this.name()
      this.expect(':')
    }
    const type = this.qname()
    const about: QName[] = []
    if (this.accept('about')) {
      about.push(this.qname())
      while (this.accept(',')) about.push(this.qname())
    }
    const members = this.body('metadata')
    // In a metadata body `name = value;` is shorthand for a redefinition of the definition's feature.
    for (const m of members) {
      if (m.kind === 'usage' && m.keyword === '' && m.name && !m.redefines.length && !m.typing.length && !m.subsets.length) {
        m.redefines = [{ segments: [m.name], range: m.nameRange ?? m.range }]
        m.name = undefined
      }
    }
    return { kind: 'metadata', name, type, about, members, range: this.range(start) }
  }

  private definition(start: Token, metaclass: string, isAbstract: boolean, isVariation: boolean, context: Context): DefinitionNode {
    const meta = this.takePrefixMeta()
    const id = this.identification()
    const specializes: QName[] = []
    if (this.accept(':>') || this.accept('specializes')) {
      specializes.push(this.qname())
      while (this.accept(',')) specializes.push(this.qname())
    }
    const bodyContext: Context = metaclass === 'EnumerationDefinition' ? 'enum' : EXPRESSION_BODY_DEFS.has(metaclass) ? 'expression-body' : 'definition'
    const members = this.body(bodyContext)
    return { kind: 'definition', metaclass, ...id, isAbstract, isVariation, specializes, members, membership: defaultMembership(context), ...meta, range: this.range(start) }
  }

  private usageAfterReturn(start: Token, context: Context): UsageNode {
    // `return x : T;` or `return attribute x : T;`
    const k = this.tok
    if (k.kind === 'keyword' && USAGE_KEYWORDS[k.value]) {
      this.i++
      return this.usage(start, context, { metaclass: USAGE_KEYWORDS[k.value], keyword: k.value, membership: 'return' })
    }
    return this.usage(start, context, { metaclass: 'ReferenceUsage', keyword: '', membership: 'return' })
  }

  private takePrefixMeta(): { prefixMetadata?: QName[] } {
    if (!this.prefixMeta.length) return {}
    const out = this.prefixMeta
    this.prefixMeta = []
    return { prefixMetadata: out }
  }

  private usage(start: Token, context: Context, opts: Partial<UsageNode> & { metaclass: string; keyword: string }): UsageNode {
    const node: UsageNode = { kind: 'usage', ...emptyUsage(opts.metaclass, opts.keyword), ...opts, ...this.takePrefixMeta(), membership: opts.membership ?? (opts.isEnd ? 'end' : defaultMembership(context)), range: start.range }
    if (node.isEnd) node.membership = 'end'
    const kw = opts.keyword
    // Connector-shaped usages may be declared before their `connect … to …` part.
    if (kw === 'connection' || kw === 'interface' || kw === 'allocation' || kw === 'binding' || kw === 'succession' || kw === 'flow' || kw === 'transition') {
      if (kw === 'transition') return this.transitionRest(start, node)
      this.declaration(node, kw !== 'flow' ? undefined : 'flow')
      if (kw === 'flow') {
        node.connector = this.flowPart()
      } else if (this.is('connect') || this.is('allocate') || this.is('bind') || this.is('first')) {
        node.connector = this.connectorPart()
      }
      node.members = this.body(context === 'expression-body' ? 'usage' : 'usage')
      node.range = this.range(start)
      return node
    }
    this.declaration(node)
    const exprBody = EXPRESSION_BODY_USAGES.has(node.metaclass)
    if (exprBody && this.is('{')) {
      node.members = this.body('expression-body')
      const last = node.members.at(-1)
      if (last?.kind === 'expression' && !REQUIREMENT_LIKE.has(node.metaclass)) {
        node.members.pop()
        node.result = last.expr
      }
    } else node.members = this.body(node.metaclass === 'EnumerationUsage' ? 'usage' : 'usage')
    node.range = this.range(start)
    return node
  }

  /** identification, specializations, multiplicity, value. */
  private declaration(node: UsageNode, stopAt?: 'flow') {
    const id = this.identification()
    if (stopAt === 'flow' && id.name && (this.is('from') || this.is('of'))) {
      // `flow name of T from …` or `flow name from …`
    }
    Object.assign(node, id)
    this.specializationLoop(node)
    node.value = this.valuePart()
  }

  /** Typing, subsetting, redefinition, reference subsetting (names or feature chains), multiplicity, ordering. */
  private specializationLoop(node: UsageNode) {
    const target = (kind: 'subsets' | 'redefines' | 'references') => {
      const c = this.chain()
      if (c.parts.length === 1) {
        if (kind === 'subsets') node.subsets.push(c.parts[0])
        else if (kind === 'redefines') node.redefines.push(c.parts[0])
        else node.references = c.parts[0]
      } else (node.chainSpecializations ??= []).push({ kind, chain: c })
    }
    for (;;) {
      if (this.accept(':') || (this.is('defined') && this.isAt(1, 'by') && (this.i += 2) > 0)) {
        node.typing.push(this.typeRef())
        while (this.accept(',')) node.typing.push(this.typeRef())
      } else if (this.accept(':>') || this.accept('subsets')) {
        target('subsets')
        while (this.accept(',')) target('subsets')
      } else if (this.accept(':>>') || this.accept('redefines')) {
        target('redefines')
        while (this.accept(',')) target('redefines')
      } else if (this.accept('::>') || this.accept('references')) {
        target('references')
      } else if (this.is('[') && !node.multiplicity) {
        node.multiplicity = this.multiplicity()
      } else if (this.accept('ordered')) node.isOrdered = true
      else if (this.accept('nonunique')) node.isNonunique = true
      else break
    }
  }

  private typeRef(): TypeRef {
    const conjugated = this.accept('~')
    return { name: this.qname(), conjugated: conjugated || undefined }
  }

  private multiplicity(): Multiplicity {
    const start = this.expect('[')
    const bound = (): Expr => {
      if (this.is('*')) {
        const t = this.t[this.i++]
        return { kind: 'literal', type: 'infinity', value: null, range: t.range }
      }
      return this.additive()
    }
    let lower: Expr | undefined
    let upper = bound()
    if (this.accept('..')) {
      lower = upper
      upper = bound()
    }
    this.expect(']')
    return { lower, upper, range: this.range(start) }
  }

  private valuePart(): ValuePart | undefined {
    if (this.accept('default')) {
      const isInitial = this.accept(':=')
      if (!isInitial) this.accept('=')
      return { expr: this.expression(), isDefault: true, isInitial }
    }
    if (this.accept('=')) return { expr: this.expression(), isDefault: false, isInitial: false }
    if (this.accept(':=')) return { expr: this.expression(), isDefault: false, isInitial: true }
    return undefined
  }

  private connectorPart(): ConnectorPart {
    if (this.accept('connect') || this.accept('allocate')) {
      const a = this.endChain()
      this.expect('to')
      return { ends: [a, this.endChain()] }
    }
    if (this.accept('bind')) {
      const a = this.chain()
      this.expect('=')
      return { ends: [a, this.chain()] }
    }
    this.expect('first')
    const a = this.endChain()
    this.expect('then')
    return { ends: [a, this.endChain()] }
  }

  private flowPart(): ConnectorPart | undefined {
    let itemType: QName | undefined
    if (this.accept('of')) itemType = this.qname()
    if (this.accept('from')) {
      const a = this.chain()
      this.expect('to')
      return { ends: [a, this.chain()], itemType }
    }
    if (this.isName()) {
      // `flow a.x to b.y`
      const a = this.chain()
      this.expect('to')
      return { ends: [a, this.chain()], itemType }
    }
    return itemType ? { ends: [], itemType } : undefined
  }

  private connectorShorthand(start: Token, metaclass: string, keyword: string, context: Context): UsageNode {
    const node: UsageNode = { kind: 'usage', ...emptyUsage(metaclass, ''), membership: defaultMembership(context), range: start.range }
    node.connector = this.connectorPart()
    void keyword
    node.members = this.body('usage')
    node.range = this.range(start)
    return node
  }

  private satisfyDecl(start: Token, context: Context, isNegated = false): UsageNode {
    this.expect('satisfy')
    this.accept('requirement')
    const node: UsageNode = { kind: 'usage', ...emptyUsage('SatisfyRequirementUsage', 'satisfy'), membership: defaultMembership(context), range: start.range, ...(isNegated ? { isNegated } : {}) }
    const requirement = this.qname()
    let by: Chain | undefined
    if (this.accept('by')) by = this.chain()
    node.satisfy = { requirement, by }
    node.members = this.body('usage')
    node.range = this.range(start)
    return node
  }

  /** `perform x.y;`, `assert c;`, `require c;`, `verify r;`, `frame c;`, `render r;`: an unnamed usage referencing a feature. */
  private referenceForm(start: Token, context: Context, metaclass: string, keyword: string, membership?: MembershipKind): UsageNode {
    const node: UsageNode = { kind: 'usage', ...emptyUsage(metaclass, keyword), membership: membership ?? defaultMembership(context), range: start.range }
    node.performs = this.chain()
    this.specializationLoop(node)
    node.members = this.body('usage')
    node.range = this.range(start)
    return node
  }

  /** `accept [name :] T [via port];` */
  private acceptDecl(start: Token, context: Context): UsageNode {
    this.expect('accept')
    const node: UsageNode = { kind: 'usage', ...emptyUsage('AcceptActionUsage', 'accept'), membership: defaultMembership(context), range: start.range }
    const acc: NonNullable<UsageNode['accept']> = {}
    if (this.isName() && this.isAt(1, ':')) {
      acc.payloadName = this.name()
      this.i++
    }
    if (this.isName()) acc.payloadType = this.qname()
    if (this.accept('via')) acc.via = this.chain()
    node.accept = acc
    node.members = this.body('usage')
    node.range = this.range(start)
    return node
  }

  private transitionRest(start: Token, node: UsageNode): UsageNode {
    if (!this.is('first') && !this.is('accept') && !this.is('then')) Object.assign(node, this.identification())
    const tr: NonNullable<UsageNode['transition']> = { target: { parts: [], range: this.tok.range } }
    if (this.accept('first')) tr.source = this.chain()
    if (this.accept('accept')) {
      if (this.isName() && this.isAt(1, ':')) {
        tr.acceptName = this.name()
        this.i++
      }
      tr.acceptType = this.qname()
      if (this.accept('via')) tr.acceptVia = this.chain()
    }
    if (this.accept('if')) tr.guard = this.expression()
    this.expect('then')
    tr.target = this.chain()
    node.transition = tr
    node.members = this.body('usage')
    node.range = this.range(start)
    return node
  }

  // ---- expressions ----------------------------------------------------------------------------
  expression(): Expr {
    if (this.is('if')) {
      const start = this.t[this.i++]
      const cond = this.expression()
      this.expect('?')
      const a = this.expression()
      this.expect('else')
      const b = this.expression()
      return { kind: 'op', operator: 'if', args: [cond, a, b], range: this.range(start) }
    }
    return this.binary(0)
  }

  private static LEVELS: string[][] = [['implies'], ['or', '|'], ['xor'], ['and', '&'], ['==', '!=', '===', '!=='], ['<', '>', '<=', '>=']]

  private binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.classification()
    const start = this.tok
    let left = this.binary(level + 1)
    while (Parser.LEVELS[level].some((op) => this.is(op))) {
      const op = this.t[this.i++].value
      const right = this.binary(level + 1)
      left = { kind: 'op', operator: op, args: [left, right], range: this.range(start) }
    }
    return left
  }

  /** Classification and cast: `x istype T`, `x hastype T`, `x @ T`, `x as T`, `x meta T` (KerML §7.4.9). */
  private classification(): Expr {
    const start = this.tok
    let left = this.rangeExpr()
    while (Parser.CLASSIFICATION.some((op) => this.is(op))) {
      const op = this.t[this.i++].value
      const q = this.qname()
      const chain = { parts: [q], range: q.range }
      left = { kind: 'op', operator: op, args: [left, { kind: 'ref', chain, range: q.range }], range: this.range(start) }
    }
    return left
  }

  private static CLASSIFICATION = ['istype', 'hastype', '@', 'as', 'meta']

  /** Range `a..b` (a sequence of integers). Multiplicity bounds are parsed separately. */
  private rangeExpr(): Expr {
    const start = this.tok
    const left = this.additive()
    if (this.accept('..')) return { kind: 'op', operator: '..', args: [left, this.additive()], range: this.range(start) }
    return left
  }

  private additive(): Expr {
    const start = this.tok
    let left = this.multiplicative()
    while (this.is('+') || this.is('-')) {
      const op = this.t[this.i++].value
      left = { kind: 'op', operator: op, args: [left, this.multiplicative()], range: this.range(start) }
    }
    return left
  }

  private multiplicative(): Expr {
    const start = this.tok
    let left = this.exponent()
    while (this.is('*') || this.is('/') || this.is('%')) {
      const op = this.t[this.i++].value
      left = { kind: 'op', operator: op, args: [left, this.exponent()], range: this.range(start) }
    }
    return left
  }

  private exponent(): Expr {
    const start = this.tok
    const base = this.unary()
    if (this.is('**') || this.is('^')) {
      const op = this.t[this.i++].value
      return { kind: 'op', operator: op, args: [base, this.exponent()], range: this.range(start) }
    }
    return base
  }

  private unary(): Expr {
    const start = this.tok
    if (this.is('-') || this.is('+') || this.is('~') || this.is('not')) {
      const op = this.t[this.i++].value
      return { kind: 'op', operator: op, args: [this.unary()], range: this.range(start) }
    }
    return this.postfix()
  }

  private postfix(): Expr {
    const start = this.tok
    let e = this.primary()
    for (;;) {
      if (this.is('[')) {
        this.i++
        const unit = this.expression()
        this.expect(']')
        e = { kind: 'op', operator: '[', args: [e, unit], range: this.range(start) }
      } else if (this.is('#') && this.isAt(1, '(')) {
        // Indexing `seq#(i)` (KerML IndexExpression).
        this.i += 2
        const index = this.expression()
        this.expect(')')
        e = { kind: 'op', operator: '#', args: [e, index], range: this.range(start) }
      } else if (this.is('->') && this.isName(this.peek())) {
        // Arrow invocation `x->f(a)` is the invocation `f(x, a)`.
        this.i++
        const target = this.qname()
        const args: Expr[] = [e]
        if (this.is('{')) {
          // Expression body argument (`->forAll { in x; … }`): parsed, not represented.
          const at = this.tok
          this.body('expression-body')
          this.notRepresented('expression body argument', at.range)
        } else {
          this.expect('(')
          if (!this.is(')')) {
            args.push(this.expression())
            while (this.accept(',')) args.push(this.expression())
          }
          this.expect(')')
        }
        e = { kind: 'invoke', target, args, range: this.range(start) }
      } else break
    }
    return e
  }

  private primary(): Expr {
    const t = this.tok
    if (t.kind === 'integer') {
      this.i++
      return { kind: 'literal', type: 'integer', value: Number(t.value), range: t.range }
    }
    if (t.kind === 'decimal') {
      this.i++
      return { kind: 'literal', type: 'rational', value: Number(t.value), range: t.range }
    }
    if (t.kind === 'string') {
      this.i++
      return { kind: 'literal', type: 'string', value: t.value, range: t.range }
    }
    if (this.is('true') || this.is('false')) {
      this.i++
      return { kind: 'literal', type: 'boolean', value: t.value === 'true', range: t.range }
    }
    if (this.is('null')) {
      this.i++
      return { kind: 'literal', type: 'null', value: null, range: t.range }
    }
    if (this.is('*')) {
      this.i++
      return { kind: 'literal', type: 'infinity', value: null, range: t.range }
    }
    if (this.accept('(')) {
      if (this.accept(')')) return { kind: 'literal', type: 'null', value: null, range: this.range(t) }
      const e = this.expression()
      if (this.is(',')) {
        const items = [e]
        while (this.accept(',')) items.push(this.expression())
        this.expect(')')
        return { kind: 'op', operator: ',', args: items, range: this.range(t) }
      }
      this.expect(')')
      return e
    }
    if (this.isName()) {
      const q = this.qname()
      if (this.is('(')) {
        this.i++
        const args: Expr[] = []
        if (!this.is(')')) {
          args.push(this.expression())
          while (this.accept(',')) args.push(this.expression())
        }
        this.expect(')')
        return { kind: 'invoke', target: q, args, range: this.range(t) }
      }
      const parts = [q]
      while (this.is('.') && this.isName(this.peek())) {
        this.i++
        parts.push(this.qname())
      }
      const chain = { parts, range: this.range(t) }
      return { kind: 'ref', chain, range: chain.range }
    }
    this.fail(`Expected an expression but found ${this.describe(t)}.`)
  }
}

const EXPRESSION_BODY_DEFS = new Set(['ConstraintDefinition', 'CalculationDefinition', 'RequirementDefinition', 'CaseDefinition', 'UseCaseDefinition', 'VerificationCaseDefinition', 'AnalysisCaseDefinition', 'ConcernDefinition', 'ViewpointDefinition'])
const EXPRESSION_BODY_USAGES = new Set(['ConstraintUsage', 'CalculationUsage', 'RequirementUsage', 'AssertConstraintUsage', 'CaseUsage', 'UseCaseUsage', 'VerificationCaseUsage', 'AnalysisCaseUsage', 'ConcernUsage', 'ViewpointUsage'])
const REQUIREMENT_LIKE = new Set(['RequirementUsage', 'ConcernUsage', 'ViewpointUsage'])

/** The feature a following `then` continues from. */
function prevOf(m: Member): Chain | undefined {
  if (m.kind === 'first') return m.target
  if (m.kind !== 'usage') return undefined
  if (m.metaclass === 'SuccessionAsUsage' && m.connector?.ends.length === 2) return m.connector.ends[1]
  if (m.connector || m.satisfy || m.metaclass === 'TransitionUsage') return undefined
  if (m.name) return { parts: [{ segments: [m.name], range: m.nameRange ?? m.range }], range: m.range }
  if (m.performs) return m.performs
  return { parts: [], range: m.range, nodeRef: m }
}

function emptyUsage(metaclass: string, keyword: string): Omit<UsageNode, 'kind' | 'range' | 'membership'> {
  return {
    metaclass,
    keyword,
    isAbstract: false,
    isVariation: false,
    isEnd: false,
    isDerived: false,
    isConstant: false,
    isReference: false,
    isOrdered: false,
    isNonunique: false,
    typing: [],
    subsets: [],
    redefines: [],
    members: [],
  }
}

function defaultMembership(context: Context): MembershipKind {
  return context === 'package' ? 'owning' : 'feature'
}
