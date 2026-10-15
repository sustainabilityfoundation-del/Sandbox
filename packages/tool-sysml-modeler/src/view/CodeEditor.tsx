import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, type StringStream } from '@codemirror/language'
import { EditorSelection, EditorState, StateEffect, StateField, type Extension, type Range as CmRange } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers, placeholder, type DecorationSet } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { DEFINITION_KEYWORDS, KEYWORDS, USAGE_KEYWORDS, isKindOf, semanticsOf, type Model } from '@ews/sysml-core'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

/**
 * Code editor for SysML v2 textual notation (CodeMirror 6, MIT): syntax highlighting, completion of
 * keywords and model names (qualified after `::`), bracket matching, undo history and diagnostics
 * underlined in place. Tab moves the focus (keyboard users are not trapped); indentation is typed.
 * The editor holds only the draft text; parsing and applying stay in the SysML core and commands.
 */

// ---- highlighting: a line-based tokenizer (robust while typing, e.g. an unterminated comment) ----
interface LexState {
  inComment: boolean
  /** Brace depth, for indentation of new lines. */
  depth: number
}

const OPERATOR_WORDS = new Set(['and', 'or', 'xor', 'not', 'implies', 'istype', 'hastype', 'as', 'meta', 'if', 'else'])
const LITERALS = new Set(['true', 'false', 'null'])

const sysmlLanguage = StreamLanguage.define<LexState>({
  name: 'sysml',
  startState: () => ({ inComment: false, depth: 0 }),
  copyState: (s) => ({ ...s }),
  indent: (state, textAfter, cx) => Math.max(0, state.depth - (/^s*}/.test(textAfter) ? 1 : 0)) * cx.unit,
  token(stream: StringStream, state: LexState): string | null {
    if (state.inComment) {
      if (stream.skipTo('*/')) {
        stream.match('*/')
        state.inComment = false
      } else stream.skipToEnd()
      return 'comment'
    }
    if (stream.eatSpace()) return null
    if (stream.match('//*') || stream.match('/*')) {
      state.inComment = true
      return 'comment'
    }
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) return 'string'
    if (stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'variableName'
    if (stream.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return 'number'
    const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/) as RegExpMatchArray | null
    if (word) {
      const w = word[0]
      if (LITERALS.has(w)) return 'atom'
      if (OPERATOR_WORDS.has(w)) return 'operatorKeyword'
      if (KEYWORDS.has(w)) return 'keyword'
      return /^[A-Z]/.test(w) ? 'typeName' : 'variableName'
    }
    if (stream.match(/^(?:::>|:>>|:>|::|:=|\.\.|->|[#@~])/)) return 'operator'
    const ch = stream.next()
    if (ch === '{') state.depth++
    else if (ch === '}') state.depth = Math.max(0, state.depth - 1)
    return 'punctuation'
  },
  languageData: { indentOnInput: /^s*}$/, commentTokens: { line: '//', block: { open: '/*', close: '*/' } }, closeBrackets: { brackets: ['(', '[', '{', '"'] } },
})

const highlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'smod-tok-keyword' },
  { tag: tags.operatorKeyword, class: 'smod-tok-keyword' },
  { tag: tags.comment, class: 'smod-tok-comment' },
  { tag: tags.string, class: 'smod-tok-string' },
  { tag: tags.number, class: 'smod-tok-number' },
  { tag: tags.atom, class: 'smod-tok-number' },
  { tag: tags.typeName, class: 'smod-tok-type' },
  { tag: tags.operator, class: 'smod-tok-operator' },
])

// ---- diagnostics: underlined ranges ----
export interface EditorMark {
  from: number
  to: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

const setMarks = StateEffect.define<EditorMark[]>()
const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(setMarks)) continue
      const len = tr.state.doc.length
      const ranges: CmRange<Decoration>[] = []
      for (const m of e.value) {
        const from = Math.max(0, Math.min(m.from, len))
        const to = Math.max(from, Math.min(Math.max(m.to, m.from + 1), len))
        if (to > from) ranges.push(Decoration.mark({ class: `smod-mark is-${m.severity}`, attributes: { title: m.message } }).range(from, to))
      }
      deco = Decoration.set(ranges, true)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ---- completion: keywords and names from the model ----
const KIND_KEYWORDS = new Set([...Object.keys(DEFINITION_KEYWORDS), ...Object.keys(USAGE_KEYWORDS)])

function completionType(metaclass: string): string {
  if (isKindOf(metaclass, 'Package')) return 'namespace'
  if (isKindOf(metaclass, 'Definition') || isKindOf(metaclass, 'Classifier')) return 'class'
  if (isKindOf(metaclass, 'EnumerationUsage')) return 'enum'
  return 'property'
}

export function sysmlCompletions(model: Model | undefined) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const qualified = ctx.matchBefore(/(?:[A-Za-z_][A-Za-z0-9_]*::)+[A-Za-z_0-9]*/)
    if (qualified && model) {
      const parts = qualified.text.split('::')
      const prefixLength = qualified.text.length - parts[parts.length - 1].length
      const s = semanticsOf(model)
      const hit = s.resolveQualified(model.rootId, parts.slice(0, -1))
      if (!hit) return null
      const options: Completion[] = s
        .publicMemberships(hit.element['@id'])
        .map((m) => ({ name: s.memberName(m), el: s.memberElement(m) }))
        .filter((x): x is { name: string; el: NonNullable<typeof x.el> } => !!x.name && !!x.el)
        .map((x) => ({ label: x.name, type: completionType(x.el['@type']), detail: x.el['@type'] }))
      return { from: qualified.from + prefixLength, options, validFor: /^[A-Za-z_0-9]*$/ }
    }
    const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/)
    if (!word && !ctx.explicit) return null
    const from = word ? word.from : ctx.pos
    const options: Completion[] = [...KEYWORDS].map((k) => ({ label: k, type: 'keyword', boost: KIND_KEYWORDS.has(k) ? 1 : 0 }))
    if (model) {
      const s = semanticsOf(model)
      const seen = new Set<string>()
      const add = (id: string, lib: boolean) => {
        const el = s.get(id)
        const name = typeof el?.declaredName === 'string' ? el.declaredName : undefined
        if (!el || !name || seen.has(name) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return
        seen.add(name)
        options.push({ label: name, type: completionType(el['@type']), detail: lib ? `library · ${el['@type']}` : (s.qualifiedName(id) ?? el['@type']), boost: lib ? -1 : 2 })
      }
      for (const el of model.elements()) add(el['@id'], false)
      if (model.library) for (const el of model.library.elements()) if (isKindOf(el['@type'], 'Package') || isKindOf(el['@type'], 'Definition')) add(el['@id'], true)
    }
    return { from, options, validFor: /^[A-Za-z_0-9]*$/ }
  }
}

// ---- component ----
export interface CodeEditorHandle {
  focusRange: (from: number, to: number) => void
}

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  /** Accessible name (also shown as the visible label). */
  label: string
  model?: Model
  marks?: EditorMark[]
  readOnly?: boolean
  helpId?: string
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor({ value, onChange, label, model, marks, readOnly, helpId }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const latest = useRef({ onChange, model })
  latest.current = { onChange, model }
  const labelId = useRef(`smod-code-${Math.random().toString(36).slice(2, 9)}`).current

  useEffect(() => {
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      bracketMatching(),
      indentOnInput(),
      closeBrackets(),
      indentUnit.of('    '),
      EditorState.tabSize.of(4),
      sysmlLanguage,
      syntaxHighlighting(highlight),
      autocompletion({ override: [(ctx) => sysmlCompletions(latest.current.model)(ctx)], icons: false }),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
      marksField,
      placeholder('SysML v2 text, for example: part def Battery { attribute capacity : ElectricChargeValue; }'),
      EditorView.contentAttributes.of({ 'aria-labelledby': labelId, 'aria-multiline': 'true', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) latest.current.onChange(u.state.doc.toString())
      }),
    ]
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // The editor is created once; value and marks are synchronised below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly])

  // External value changes (revert, model change) replace the document.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of(marks ?? []) })
  }, [marks])

  useImperativeHandle(ref, () => ({
    focusRange(from, to) {
      const v = view.current
      if (!v) return
      const len = v.state.doc.length
      const a = Math.min(from, len)
      const b = Math.min(Math.max(to, a), len)
      v.dispatch({ selection: EditorSelection.single(a, b), scrollIntoView: true })
      v.focus()
    },
  }))

  return (
    <div className="smod-code-editor" data-help-id={helpId}>
      <span id={labelId} className="smod-code-label">{label}</span>
      <div ref={host} className="smod-code-host" />
    </div>
  )
})
