import { CadError } from '../errors'

/**
 * Safe expression language for parameters and dimensions (no `eval`).
 *
 *   expr     := sum
 *   sum      := product (("+" | "-") product)*
 *   product  := power (("*" | "/" | "%") power)*
 *   power    := unary ("^" power)?
 *   unary    := ("-" | "+") unary | postfix
 *   postfix  := primary unit?
 *   primary  := number | name | name "(" args ")" | "(" expr ")"
 *
 * Lengths are millimetres and angles degrees. Unit suffixes convert into those units:
 * mm, cm, m, in, ft (length) and deg, rad (angle). Trigonometric functions take and return degrees.
 * Dimensional consistency is not checked in format 1.0 (documented limitation).
 */

export const UNIT_FACTORS: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
  deg: 1,
  rad: 180 / Math.PI,
}

const RAD = Math.PI / 180

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  sin: { arity: [1, 1], fn: (a) => Math.sin(a * RAD) },
  cos: { arity: [1, 1], fn: (a) => Math.cos(a * RAD) },
  tan: { arity: [1, 1], fn: (a) => Math.tan(a * RAD) },
  asin: { arity: [1, 1], fn: (a) => Math.asin(a) / RAD },
  acos: { arity: [1, 1], fn: (a) => Math.acos(a) / RAD },
  atan: { arity: [1, 1], fn: (a) => Math.atan(a) / RAD },
  atan2: { arity: [2, 2], fn: (y, x) => Math.atan2(y, x) / RAD },
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  abs: { arity: [1, 1], fn: Math.abs },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  round: { arity: [1, 1], fn: Math.round },
  min: { arity: [1, 16], fn: Math.min },
  max: { arity: [1, 16], fn: Math.max },
  hypot: { arity: [1, 16], fn: Math.hypot },
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

export const RESERVED_NAMES = new Set([...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), ...Object.keys(UNIT_FACTORS)])

export type ExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'name'; name: string }
  | { kind: 'unary'; op: '-' | '+'; arg: ExprNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '%' | '^'; left: ExprNode; right: ExprNode }
  | { kind: 'call'; name: string; args: ExprNode[] }
  | { kind: 'unit'; unit: string; arg: ExprNode }

type Token = { t: 'num'; v: number; at: number } | { t: 'id'; v: string; at: number } | { t: 'op'; v: string; at: number }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))
    if (num) {
      tokens.push({ t: 'num', v: Number(num[0]), at: i })
      i += num[0].length
      continue
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))
    if (id) {
      tokens.push({ t: 'id', v: id[0], at: i })
      i += id[0].length
      continue
    }
    if ('+-*/%^(),'.includes(c)) {
      tokens.push({ t: 'op', v: c, at: i })
      i++
      continue
    }
    throw new CadError('invalid-expression', `Unexpected character “${c}” at position ${i + 1} in “${src}”.`)
  }
  return tokens
}

export function parseExpression(src: string): ExprNode {
  if (typeof src !== 'string' || !src.trim()) throw new CadError('invalid-expression', 'The expression is empty.')
  if (src.length > 500) throw new CadError('invalid-expression', 'The expression is longer than 500 characters.')
  const tokens = tokenize(src)
  let pos = 0
  const peek = () => tokens[pos]
  const fail = (msg: string): never => {
    throw new CadError('invalid-expression', `${msg} in “${src}”.`)
  }
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  const expect = (v: string) => {
    if (!isOp(v)) fail(`Expected “${v}”`)
    pos++
  }

  function sum(): ExprNode {
    let left = product()
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v as '+' | '-'
      left = { kind: 'binary', op, left, right: product() }
    }
    return left
  }
  function product(): ExprNode {
    let left = power()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v as '*' | '/' | '%'
      left = { kind: 'binary', op, left, right: power() }
    }
    return left
  }
  function power(): ExprNode {
    const base = unary()
    if (isOp('^')) {
      pos++
      return { kind: 'binary', op: '^', left: base, right: power() }
    }
    return base
  }
  function unary(): ExprNode {
    if (isOp('-') || isOp('+')) {
      const op = tokens[pos++].v as '-' | '+'
      return { kind: 'unary', op, arg: unary() }
    }
    return postfix()
  }
  function postfix(): ExprNode {
    const node = primary()
    const next = peek()
    if (next?.t === 'id' && next.v in UNIT_FACTORS) {
      pos++
      return { kind: 'unit', unit: next.v, arg: node }
    }
    return node
  }
  function primary(): ExprNode {
    const tok = peek()
    if (!tok) return fail('Unexpected end of expression')
    if (tok.t === 'num') {
      pos++
      return { kind: 'num', value: tok.v }
    }
    if (tok.t === 'id') {
      pos++
      if (isOp('(')) {
        pos++
        const args: ExprNode[] = []
        if (!isOp(')')) {
          args.push(sum())
          while (isOp(',')) {
            pos++
            args.push(sum())
          }
        }
        expect(')')
        const f = FUNCTIONS[tok.v]
        if (!f) fail(`Unknown function “${tok.v}”`)
        if (args.length < f.arity[0] || args.length > f.arity[1]) fail(`${tok.v}() takes ${f.arity[0] === f.arity[1] ? f.arity[0] : `${f.arity[0]}–${f.arity[1]}`} argument(s)`)
        return { kind: 'call', name: tok.v, args }
      }
      if (tok.v in UNIT_FACTORS) fail(`Unit “${tok.v}” needs a value before it`)
      return { kind: 'name', name: tok.v }
    }
    if (tok.v === '(') {
      pos++
      const inner = sum()
      expect(')')
      return inner
    }
    return fail(`Unexpected “${tok.v}”`)
  }

  const node = sum()
  if (pos < tokens.length) fail(`Unexpected “${tokens[pos].v}”`)
  return node
}

/** Parameter names an expression refers to (excluding constants). */
export function referencedNames(node: ExprNode, out = new Set<string>()): Set<string> {
  switch (node.kind) {
    case 'name':
      if (!(node.name in CONSTANTS)) out.add(node.name)
      break
    case 'unary':
    case 'unit':
      referencedNames(node.arg, out)
      break
    case 'binary':
      referencedNames(node.left, out)
      referencedNames(node.right, out)
      break
    case 'call':
      node.args.forEach((a) => referencedNames(a, out))
      break
  }
  return out
}

export function evaluateNode(node: ExprNode, scope: (name: string) => number | undefined): number {
  switch (node.kind) {
    case 'num':
      return node.value
    case 'name': {
      if (node.name in CONSTANTS) return CONSTANTS[node.name]
      const v = scope(node.name)
      if (v === undefined) throw new CadError('invalid-expression', `Unknown parameter “${node.name}”.`, { name: node.name })
      return v
    }
    case 'unit':
      return evaluateNode(node.arg, scope) * UNIT_FACTORS[node.unit]
    case 'unary':
      return node.op === '-' ? -evaluateNode(node.arg, scope) : evaluateNode(node.arg, scope)
    case 'call':
      return FUNCTIONS[node.name].fn(...node.args.map((a) => evaluateNode(a, scope)))
    case 'binary': {
      const a = evaluateNode(node.left, scope)
      const b = evaluateNode(node.right, scope)
      switch (node.op) {
        case '+':
          return a + b
        case '-':
          return a - b
        case '*':
          return a * b
        case '/':
          if (b === 0) throw new CadError('invalid-expression', 'Division by zero.')
          return a / b
        case '%':
          return a % b
        case '^':
          return a ** b
      }
    }
  }
}

/** Evaluates an expression string or a literal number. */
export function evaluate(expr: number | string, scope: (name: string) => number | undefined = () => undefined): number {
  if (typeof expr === 'number') {
    if (!Number.isFinite(expr)) throw new CadError('invalid-expression', 'The value is not a finite number.')
    return expr
  }
  const v = evaluateNode(parseExpression(expr), scope)
  if (!Number.isFinite(v)) throw new CadError('invalid-expression', `“${expr}” does not evaluate to a finite number.`)
  return v
}

export const PARAMETER_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
