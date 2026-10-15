import { create, parseDependencies, type MathNode } from 'mathjs'
import { CalcError } from './errors'

/**
 * Expression language `ews-expr/1` (docs/modules/design-reasoning/mathematics.md §3): a whitelisted
 * subset of the mathjs syntax. mathjs only parses; the engine converts the parse tree into this
 * canonical AST and evaluates the AST itself. No user expression ever reaches mathjs evaluation, and
 * this mathjs instance is created with the parser alone (no evaluate, import or createUnit).
 */
export const GRAMMAR = 'ews-expr/1' as const

export type BinaryOp = '+' | '-' | '*' | '/' | '^'
export type ComparisonOp = '<=' | '<' | '=' | '>=' | '>'

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'sym'; n: string }
  | { k: 'const'; n: 'pi' | 'e' }
  | { k: 'neg'; a: Expr }
  | { k: 'op'; op: BinaryOp; a: Expr; b: Expr }
  | { k: 'fn'; f: FunctionName; args: Expr[] }

export const FUNCTIONS = ['sqrt', 'abs', 'min', 'max', 'exp', 'log', 'log10', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2'] as const
export type FunctionName = (typeof FUNCTIONS)[number]
const ARITY: Record<FunctionName, [number, number]> = {
  sqrt: [1, 1], abs: [1, 1], min: [2, 8], max: [2, 8], exp: [1, 1], log: [1, 1], log10: [1, 1],
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1], atan2: [2, 2],
}

/** The parsed form of one relation text. */
export type ParsedRelation =
  | { form: 'assignment'; target: string; expr: Expr }
  | { form: 'comparison'; lhs: Expr; op: ComparisonOp; rhs: Expr }
  | { form: 'expression'; expr: Expr }

export const LIMITS = { maxExpressionLength: 2000, maxNodes: 500 } as const

const math = create({ parseDependencies })

const BINARY: Record<string, BinaryOp> = { add: '+', subtract: '-', multiply: '*', divide: '/', pow: '^' }
const COMPARE: Record<string, ComparisonOp> = { smallerEq: '<=', smaller: '<', equal: '=', largerEq: '>=', larger: '>' }
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

function convert(node: MathNode, counter: { n: number }): Expr {
  if (++counter.n > LIMITS.maxNodes) throw new CalcError('limit', `The expression has more than ${LIMITS.maxNodes} nodes.`)
  const n = node as MathNode & Record<string, unknown>
  switch (node.type) {
    case 'ParenthesisNode':
      return convert(n.content as MathNode, counter)
    case 'ConstantNode': {
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) throw new CalcError('grammar', 'Only finite numeric constants are allowed (no strings, booleans or units).')
      return { k: 'num', v: n.value }
    }
    case 'SymbolNode': {
      const name = n.name as string
      if (name === 'pi' || name === 'e') return { k: 'const', n: name }
      if (!IDENTIFIER.test(name)) throw new CalcError('grammar', `“${name}” is not a valid symbol.`)
      return { k: 'sym', n: name }
    }
    case 'OperatorNode': {
      if (n.implicit) throw new CalcError('grammar', 'Implicit multiplication is not allowed; write “*” explicitly.')
      const args = n.args as MathNode[]
      const fn = n.fn as string
      if (fn === 'unaryMinus' && args.length === 1) return { k: 'neg', a: convert(args[0], counter) }
      if (fn === 'unaryPlus' && args.length === 1) return convert(args[0], counter)
      const op = BINARY[fn]
      if (op && args.length === 2) return { k: 'op', op, a: convert(args[0], counter), b: convert(args[1], counter) }
      throw new CalcError('grammar', `The operator “${n.op as string}” is not allowed.`)
    }
    case 'FunctionNode': {
      const fnNode = n.fn as MathNode & { name?: string }
      const name = fnNode.type === 'SymbolNode' ? fnNode.name : undefined
      if (!name || !(FUNCTIONS as readonly string[]).includes(name)) throw new CalcError('grammar', `The function “${name ?? '?'}” is not allowed. Allowed: ${FUNCTIONS.join(', ')}.`)
      const f = name as FunctionName
      const args = (n.args as MathNode[]).map((a) => convert(a, counter))
      const [lo, hi] = ARITY[f]
      if (args.length < lo || args.length > hi) throw new CalcError('grammar', `${f} takes ${lo === hi ? lo : `${lo}–${hi}`} argument${hi === 1 ? '' : 's'}.`)
      return { k: 'fn', f, args }
    }
    default:
      throw new CalcError('grammar', `${node.type.replace(/Node$/, '')} expressions are not allowed in ${GRAMMAR}.`)
  }
}

/** Parses one relation: `y = expr`, `lhs <op> rhs`, or a plain expression (objective). */
export function parseRelation(text: string): ParsedRelation {
  if (typeof text !== 'string' || !text.trim()) throw new CalcError('grammar', 'The expression is empty.')
  if (text.length > LIMITS.maxExpressionLength) throw new CalcError('limit', `The expression is longer than ${LIMITS.maxExpressionLength} characters.`)
  // mathjs reads "a = b" as an assignment and "a == b" as equality; we accept "=" only as assignment.
  let node: MathNode
  try {
    node = math.parse(text)
  } catch (e) {
    throw new CalcError('grammar', `Cannot parse “${text}”: ${(e as Error).message}`)
  }
  const counter = { n: 0 }
  const n = node as MathNode & Record<string, unknown>
  if (node.type === 'AssignmentNode') {
    const object = n.object as MathNode & { name?: string }
    if (object.type !== 'SymbolNode' || !object.name || !IDENTIFIER.test(object.name)) throw new CalcError('grammar', 'The left side of an assignment must be one output symbol.')
    if (n.index) throw new CalcError('grammar', 'Indexed assignment is not allowed.')
    return { form: 'assignment', target: object.name, expr: convert(n.value as MathNode, counter) }
  }
  if (node.type === 'OperatorNode' && COMPARE[n.fn as string]) {
    const [a, b] = n.args as MathNode[]
    return { form: 'comparison', lhs: convert(a, counter), op: COMPARE[n.fn as string], rhs: convert(b, counter) }
  }
  if (node.type === 'RelationalNode') throw new CalcError('grammar', 'Chained comparisons are not allowed; write one comparison per constraint.')
  return { form: 'expression', expr: convert(node, counter) }
}

/** Symbols used by an expression, in first-use order. */
export function symbolsOf(expr: Expr, out: string[] = []): string[] {
  switch (expr.k) {
    case 'sym':
      if (!out.includes(expr.n)) out.push(expr.n)
      break
    case 'neg':
      symbolsOf(expr.a, out)
      break
    case 'op':
      symbolsOf(expr.a, out)
      symbolsOf(expr.b, out)
      break
    case 'fn':
      expr.args.forEach((a) => symbolsOf(a, out))
      break
  }
  return out
}

/** Readable text of an AST (used in messages and previews; not used for evaluation). */
export function formatExpr(expr: Expr): string {
  switch (expr.k) {
    case 'num':
      return String(expr.v)
    case 'sym':
    case 'const':
      return expr.n
    case 'neg':
      return `-(${formatExpr(expr.a)})`
    case 'op':
      return `(${formatExpr(expr.a)} ${expr.op} ${formatExpr(expr.b)})`
    case 'fn':
      return `${expr.f}(${expr.args.map(formatExpr).join(', ')})`
  }
}
