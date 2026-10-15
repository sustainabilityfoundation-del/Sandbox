/**
 * Lexer for the SysML v2 textual notation (subset). Produces names (basic and 'unrestricted'),
 * keywords, numbers, strings, symbols and regular comments (`/* … *\/`, which become Comment
 * bodies). Notes (`// …` and `//* … *\/`) are skipped, as in the specification.
 */

export interface Position {
  /** 0-based offset. */
  offset: number
  /** 1-based line and column. */
  line: number
  column: number
}

export interface Range {
  start: Position
  end: Position
}

export type TokenKind = 'name' | 'keyword' | 'integer' | 'decimal' | 'string' | 'symbol' | 'comment' | 'eof'

export interface Token {
  kind: TokenKind
  /** Keyword or symbol text; the name (unquoted); the string value; the comment body; the number text. */
  value: string
  range: Range
  /** True for 'unrestricted' names (quoted). */
  quoted?: boolean
}

export const KEYWORDS = new Set(
  (
    'about abstract accept action actor after alias all allocate allocation analysis and as assert assign assume at attribute bind binding by calc case ' +
    'comment concern connect connection constant constraint crosses decide def default defined dependency derived do doc else end entry enum event exhibit ' +
    'exit expose false filter first flow for fork frame from hastype if implies import in include individual inout interface istype item join language ' +
    'library locale loop merge message meta metadata nonunique not null objective occurrence of or ordered out package parallel part perform port private ' +
    'protected public redefines ref references render rendering rep require requirement return satisfy send snapshot specializes stakeholder standard state ' +
    'subject subsets succession terminate then timeslice to transition true until use variant variation verification verify via view viewpoint when while xor'
  ).split(' '),
)

/** Longest first. */
const SYMBOLS = ['::>', ':>>', '===', '!==', '::', ':>', ':=', '..', '**', '==', '!=', '<=', '>=', '->', '{', '}', '(', ')', '[', ']', ';', ',', ':', '=', '.', '~', '<', '>', '+', '-', '*', '/', '%', '^', '@', '#', '?', '&', '|', '$']

export class SyntaxError extends Error {
  constructor(
    message: string,
    readonly range: Range,
  ) {
    super(message)
    this.name = 'SysmlSyntaxError'
  }
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  const pos = (): Position => ({ offset: i, line, column: col })
  const advance = (n: number) => {
    for (let k = 0; k < n; k++) {
      if (text[i] === '\n') {
        line++
        col = 1
      } else col++
      i++
    }
  }
  while (i < text.length) {
    const c = text[i]
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f') {
      advance(1)
      continue
    }
    const start = pos()
    // Notes: `//* … */` multi-line and `// …` single-line, both non-semantic.
    if (text.startsWith('//*', i)) {
      const end = text.indexOf('*/', i + 3)
      if (end < 0) throw new SyntaxError('Unterminated note “//* … */”.', { start, end: start })
      advance(end + 2 - i)
      continue
    }
    if (text.startsWith('//', i)) {
      while (i < text.length && text[i] !== '\n') advance(1)
      continue
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new SyntaxError('Unterminated comment “/* … */”.', { start, end: start })
      const raw = text.slice(i + 2, end)
      advance(end + 2 - i)
      tokens.push({ kind: 'comment', value: commentBody(raw), range: { start, end: pos() } })
      continue
    }
    if (c === "'") {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== "'") {
        if (text[j] === '\\' && j + 1 < text.length) {
          value += unescape(text[j + 1])
          j += 2
        } else {
          if (text[j] === '\n') break
          value += text[j++]
        }
      }
      if (text[j] !== "'") throw new SyntaxError('Unterminated name (missing closing quote).', { start, end: start })
      advance(j + 1 - i)
      tokens.push({ kind: 'name', value, quoted: true, range: { start, end: pos() } })
      continue
    }
    if (c === '"') {
      let j = i + 1
      let value = ''
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) {
          value += unescape(text[j + 1])
          j += 2
        } else value += text[j++]
      }
      if (text[j] !== '"') throw new SyntaxError('Unterminated string literal.', { start, end: start })
      advance(j + 1 - i)
      tokens.push({ kind: 'string', value, range: { start, end: pos() } })
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++
      const word = text.slice(i, j)
      advance(j - i)
      tokens.push({ kind: KEYWORDS.has(word) ? 'keyword' : 'name', value: word, range: { start, end: pos() } })
      continue
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const m = /^(?:[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?|\.[0-9]+([eE][+-]?[0-9]+)?)/.exec(text.slice(i))!
      // "1..5" is a range: do not take "1." as a decimal.
      let lexeme = m[0]
      if (/^[0-9]+\.\./.test(text.slice(i))) lexeme = /^[0-9]+/.exec(text.slice(i))![0]
      advance(lexeme.length)
      tokens.push({ kind: /[.eE]/.test(lexeme) ? 'decimal' : 'integer', value: lexeme, range: { start, end: pos() } })
      continue
    }
    const sym = SYMBOLS.find((s) => text.startsWith(s, i))
    if (sym) {
      advance(sym.length)
      tokens.push({ kind: 'symbol', value: sym, range: { start, end: pos() } })
      continue
    }
    throw new SyntaxError(`Unexpected character “${c}”.`, { start, end: { ...start, offset: start.offset + 1, column: start.column + 1 } })
  }
  const end = pos()
  tokens.push({ kind: 'eof', value: '', range: { start: end, end } })
  return tokens
}

function unescape(c: string): string {
  return c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '\r' : c === 'b' ? '\b' : c === 'f' ? '\f' : c
}

/** Comment body as the specification describes it: without delimiters and leading " * " decoration. */
export function commentBody(raw: string): string {
  const lines = raw.replace(/\r\n/g, '\n').split('\n')
  const cleaned = lines.map((l, k) => (k === 0 ? l : l.replace(/^\s*\*? ?/, '')))
  return cleaned.join('\n').trim()
}
