import { Button, Dialog, Notice, TextField } from '@ews/design-system'
import { useToolViewState } from '@ews/platform-sdk/react'
import { draftConcept, type Concept } from '@ews/conceptualize-client'
import { useMemo, useState } from 'react'
import { useModuleData } from '../data'
import { KIND_LABEL, formatQuantity, type ConceptualizeViewState } from '../domain'
import { ApiErrorNotice, BasisBadge } from './common'

/** New Concept from natural language: a deterministic draft the user reviews before saving. */
export function NewConceptDialog({ parent }: { parent?: Concept }) {
  const { client, invalidate } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const [text, setText] = useState('')
  const [name, setName] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const draft = useMemo(() => (text.trim() ? draftConcept(text) : null), [text])
  const close = () => setState({ dialog: null })
  const create = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      const c = await client.createConcept({ name: (name ?? draft.name).trim() || draft.name, summary: draft.summary, description: draft.description, abstraction: parent ? 'function' : draft.abstraction, classifications: draft.classifications, statements: draft.statements, maturity: 'idea', parentId: parent?.id, reason: 'Created from a natural-language description' })
      invalidate()
      setState({ dialog: null, conceptId: c.id, page: 'explorer', tab: 'intent' })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={parent ? `Add a child Concept to ${parent.key} ${parent.name}` : 'New Concept from a description'}
      isOpen
      size="lg"
      onOpenChange={(o) => !o && close()}
      footer={
        <>
          <Button variant="text" onPress={close}>
            Cancel
          </Button>
          <Button variant="filled" icon="add" isPending={busy} isDisabled={!draft} onPress={() => void create()} data-help-id="conceptualize.concept.create">
            Create Concept
          </Button>
        </>
      }
    >
      <div className="con-form" data-help-id="conceptualize.concept.describe">
        <TextField label="Describe the idea in your own words" multiline rows={4} autoFocus placeholder="A compact mechanical actuator capable of delivering 500 N of linear force within a 100 mm envelope." value={text} onChange={setText} />
        {draft && (
          <>
            <TextField label="Name" value={name ?? draft.name} onChange={setName} />
            <Notice tone="info" title="Interpreted from your description (check before creating)">
              Recognized deterministically, without a language model. The text is kept verbatim as the description; the statements below are saved as your statements and can be edited later.
            </Notice>
            <ul className="con-statements">
              {draft.statements.map((s, i) => (
                <li key={i}>
                  <span className="con-muted">{KIND_LABEL[s.kind]}:</span> {s.text} {s.quantity && <strong>{formatQuantity(s.quantity)}</strong>} {s.basis && <BasisBadge basis={s.basis} />}
                </li>
              ))}
              {draft.notes.map((n) => (
                <li key={n} className="con-muted">
                  {n}
                </li>
              ))}
            </ul>
          </>
        )}
        {error ? <ApiErrorNotice error={error} /> : null}
      </div>
    </Dialog>
  )
}

export function BranchDialog({ concept }: { concept: Concept }) {
  const { client, invalidate } = useModuleData()
  const [, setState] = useToolViewState<ConceptualizeViewState>()
  const [name, setName] = useState(`${concept.name} (alternative)`)
  const [error, setError] = useState<unknown>(null)
  const close = () => setState({ dialog: null })
  const branch = async () => {
    setError(null)
    try {
      const sets = await client.alternativeSets(concept.id)
      const memberOf = sets.find((s) => s.members.some((m) => m.conceptId === concept.id))
      const c = await client.branch(concept.id, { name, alternativeSetId: memberOf?.id, reason: `Branched from ${concept.key}` })
      invalidate()
      setState({ dialog: null, conceptId: c.id })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      title={`Branch ${concept.key}`}
      isOpen
      onOpenChange={(o) => !o && close()}
      footer={
        <>
          <Button variant="text" onPress={close}>
            Cancel
          </Button>
          <Button variant="filled" icon="split" onPress={() => void branch()}>
            Branch
          </Button>
        </>
      }
    >
      <div className="con-form">
        <p>The branch is a new Concept with its own identity and history, linked “derived from” {concept.key}. The original is not changed. If {concept.key} is an alternative in a set, the branch joins the same set.</p>
        <TextField label="Name of the branch" value={name} onChange={setName} />
        {error ? <ApiErrorNotice error={error} /> : null}
      </div>
    </Dialog>
  )
}
