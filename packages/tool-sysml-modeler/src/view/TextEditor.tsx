import { Badge, Button, Notice, TextField } from '@ews/design-system'
import { SysmlClientError, type TransactionOutcome } from '@ews/sysml-client'
import { isTextEditableNamespace, parse, semanticsOf, serialize, type Diagnostic, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ModelerSession } from '../session'
import { message } from '../session'
import { ChangeList, DiagnosticList } from './common'

/**
 * Textual editor for the members of a namespace (root, package or definition). Typing shows syntax
 * errors immediately (local parse); Preview runs the `applyText` command as a dry run (names,
 * validation, change set); Apply commits it. Matched elements keep their IDs.
 */
export function TextEditor({ session, model, namespaceId, revision }: { session: ModelerSession; model: Model; namespaceId: string; revision: number }) {
  const s = semanticsOf(model)
  const original = useMemo(() => serialize(model, namespaceId), [model, namespaceId])
  const [draft, setDraft] = useState(original)
  const [base, setBase] = useState(original)
  const [preview, setPreview] = useState<TransactionOutcome | null>(null)
  const [problems, setProblems] = useState<Diagnostic[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const dirty = draft !== base
  // Follow model changes when there is nothing unsaved; otherwise warn that the base changed.
  useEffect(() => {
    if (!dirty) {
      setDraft(original)
      setBase(original)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original])
  useEffect(() => {
    setPreview(null)
    setProblems([])
    setError(null)
  }, [namespaceId])
  const syntax = useMemo(() => parse(draft).diagnostics, [draft])
  const outOfDate = dirty && original !== base
  const editable = isTextEditableNamespace(model, namespaceId)
  const label = namespaceId === model.rootId ? 'the model root' : (s.qualifiedName(namespaceId) ?? s.label(namespaceId))

  const cmd = () => [{ op: 'applyText' as const, namespaceId, text: draft }]
  const fail = (e: unknown) => {
    setPreview(null)
    if (e instanceof SysmlClientError) {
      setProblems(e.details?.diagnostics ?? [])
      setError(e.message)
    } else setError(message(e))
  }
  const doPreview = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await session.preview(cmd())
      setPreview(out)
      setProblems(out.diagnostics.introduced)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }
  const apply = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = await session.run(cmd(), { reason: `Edited ${label} as text` })
      setPreview(out)
      setProblems(out.diagnostics.introduced)
      setBase(draft)
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }
  const goTo = (d: Diagnostic) => {
    const el = ref.current
    if (!el || !d.range) return
    el.focus()
    el.setSelectionRange(d.range.start.offset, Math.max(d.range.end.offset, d.range.start.offset + 1))
  }
  void revision

  if (!editable) {
    return <Notice tone="info" title="Select a package or definition">Text editing works on the model root, packages and definitions. Select one in the browser; usages are edited inside their owner’s text.</Notice>
  }
  return (
    <div className="smod-text" data-help-id="sysml-modeler.text">
      <div className="smod-text-bar">
        <strong>Members of {label}</strong>
        {dirty ? <Badge tone="warning" icon="unsaved">Unsaved</Badge> : <Badge tone="neutral" icon="saved">In sync with commit</Badge>}
        {syntax.length > 0 && <Badge tone="danger" icon="error">{`${syntax.length} syntax error${syntax.length === 1 ? '' : 's'}`}</Badge>}
        <span className="smod-spacer" />
        <Button size="sm" variant="text" icon="reset" isDisabled={!dirty || busy} onPress={() => (setDraft(original), setBase(original), setPreview(null), setProblems([]), setError(null))}>
          Revert text
        </Button>
        <Button size="sm" icon="search" isDisabled={!dirty || busy || syntax.length > 0} onPress={doPreview} data-help-id="sysml-modeler.text.preview">
          Preview
        </Button>
        <Button size="sm" variant="filled" icon="save" isPending={busy} isDisabled={!dirty || syntax.length > 0} onPress={apply} data-help-id="sysml-modeler.text.apply">
          Apply
        </Button>
      </div>
      {outOfDate && <Notice tone="warning" title="The model changed since you started editing">Applying replaces the members with your text; changes made by others to these members would be overwritten. Revert the text to start from the latest version.</Notice>}
      <TextField ref={ref} label="SysML v2 textual notation" multiline rows={22} value={draft} onChange={(v) => (setDraft(v), setPreview(null))} inputClassName="smod-code" />
      <DiagnosticList diagnostics={[...syntax.map((d) => ({ ...d }) as Diagnostic), ...problems]} onSelect={goTo} />
      {error && <Notice tone="danger" title="Not applied">{error}</Notice>}
      {preview && <ChangeList outcome={preview} />}
    </div>
  )
}
