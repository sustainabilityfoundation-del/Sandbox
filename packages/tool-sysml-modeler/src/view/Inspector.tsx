import { AppIcon, Badge, Button, Checkbox, ComboBox, Dialog, IconButton, Notice, Select, TextField, useToasts } from '@ews/design-system'
import { SysmlClientError } from '@ews/sysml-client'
import { expectedTypeKinds, featureValue, formatValue, incomingReferences, isKindOf, refId, semanticsOf, serializeExpression, type Command, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useState } from 'react'
import { interconnectionContext, keywordOf } from '../projection/graph'
import { message, type ModelerSession } from '../session'
import { iconFor } from './Browser'
import { RequirementLink } from './RequirementLink'
import { Represents } from './Represents'
import { useViewState } from './hooks'

/**
 * Property inspector: every edit is a typed command committed through the session (the same
 * commands the assistant proposes). Fields keep their input when a change is refused.
 */

function typeOptions(model: Model, kinds: string[] | undefined) {
  const s = semanticsOf(model)
  const out: { id: string; label: string; description?: string; group?: string }[] = []
  const add = (els: Iterable<{ '@id': string; '@type': string }>, group: string) => {
    for (const el of els) {
      if (!isKindOf(el['@type'], 'Definition') && !(kinds?.includes('Type') && isKindOf(el['@type'], 'Type') && isKindOf(el['@type'], 'Classifier'))) continue
      if (el['@type'] === 'ConjugatedPortDefinition') continue
      if (kinds && !kinds.some((k) => isKindOf(el['@type'], k))) continue
      const q = s.qualifiedName(el['@id'])
      if (q) out.push({ id: el['@id'], label: q, description: keywordOf(el as never), group })
    }
  }
  add(model.elements(), 'This model')
  if (model.library) add(model.library.elements(), 'Library (platform subset)')
  return out.sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === 'This model' ? -1 : 1)).slice(0, 400)
}

export function Inspector({ session, model }: { session: ModelerSession; model: Model }) {
  const [vs, update] = useViewState()
  const s = semanticsOf(model)
  const id = vs.selectedId
  const el = id ? s.get(id) : undefined
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<null | { refused?: string }>(null)
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [value, setValue] = useState('')
  const [doc, setDoc] = useState('')
  const [lower, setLower] = useState('')
  const [upper, setUpper] = useState('')
  const typeKinds = el ? expectedTypeKinds(el['@type']) : undefined
  const options = useMemo(() => (el && isKindOf(el['@type'], 'Feature') ? typeOptions(model, typeKinds) : el && isKindOf(el['@type'], 'Definition') ? typeOptions(model, ['Definition']).filter((o) => isKindOf(el['@type'], model.get(o.id)!['@type'])) : []), [model, el, typeKinds])
  const docEl = id ? s.ownedMembers(id).find((m) => m['@type'] === 'Documentation') : undefined
  const fv = id ? s.ownedRelationships(id).find((r) => r['@type'] === 'FeatureValue') : undefined
  const range = id ? s.ownedMembers(id).find((m) => m['@type'] === 'MultiplicityRange') : undefined
  const bounds = range ? s.ownedMembers(range['@id']).map((b) => (b['@type'] === 'LiteralInfinity' ? '*' : String(b.value))) : []
  const exprText = useMemo(() => {
    if (!fv) return ''
    return id ? exprSource(model, id) : ''
  }, [model, fv, id, session])

  useEffect(() => {
    if (!el) return
    setName(typeof el.declaredName === 'string' ? el.declaredName : '')
    setShortName(typeof el.declaredShortName === 'string' ? el.declaredShortName : '')
    setDoc(docEl ? String(docEl.body ?? '') : '')
    setValue(exprText)
    setLower(bounds.length === 2 ? bounds[0] : '')
    setUpper(bounds.length ? bounds[bounds.length - 1] : '')
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, model])

  if (!el || !id) {
    return (
      <div className="smod-inspector" data-help-id="sysml-modeler.properties">
        <p className="smod-muted">Select an element in the browser or a diagram to see and edit its properties.</p>
      </div>
    )
  }

  const readOnly = model.isLibrary(id)
  const run = async (commands: Command[], done?: string) => {
    setBusy(true)
    setError(null)
    try {
      const out = await session.run(commands)
      useToasts.getState().push({ tone: 'success', title: done ?? out.summaryText })
      return out
    } catch (e) {
      setError(e instanceof SysmlClientError && e.details?.diagnostics?.length ? `${e.message}` : message(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  const isFeature = isKindOf(el['@type'], 'Feature')
  const isDefinition = isKindOf(el['@type'], 'Definition')
  const types = isFeature ? s.featureTypes(id) : []
  const ownTypings = s.ownedRelationships(id).filter((r) => isKindOf(r['@type'], 'FeatureTyping'))
  const generals = isDefinition ? s.ownedRelationships(id).filter((r) => r['@type'] === 'Subclassification').map((r) => refId(r, 'superclassifier')!).filter(Boolean) : []
  const refs = incomingReferences(model, id)
  const evaluated = fv ? featureValue(model, id) : undefined
  const ictx = interconnectionContext(model, id)
  const isNamespace = isKindOf(el['@type'], 'Namespace') && !isKindOf(el['@type'], 'Expression')

  return (
    <div className="smod-inspector" data-help-id="sysml-modeler.properties">
      <header className="smod-inspector-head">
        <AppIcon name={iconFor(el['@type'])} size={20} />
        <div>
          <div className="smod-muted">{keywordOf(el)} · {el['@type']}</div>
          <strong className="smod-inspector-title">{s.name(id) ?? '(unnamed)'}</strong>
          <div className="smod-mono smod-muted smod-wrap">{s.qualifiedName(id) ?? s.label(id)}</div>
        </div>
      </header>
      {readOnly && <Notice tone="info">This element belongs to the model library (platform subset) and is read-only.</Notice>}
      {error && <Notice tone="danger" title="Not changed">{error}</Notice>}
      <div className="smod-actions">
        {isNamespace && !readOnly && (
          <Button size="sm" icon="add" onPress={() => update({ dialog: { kind: 'create', ownerId: id } })}>
            Add member
          </Button>
        )}
        {(isKindOf(el['@type'], 'Package') || isDefinition) && (
          <Button size="sm" icon="sysml-block" onPress={() => update({ rootId: id, tab: 'diagram', view: 'general', pane: 'view' })}>
            General View
          </Button>
        )}
        {ictx && (
          <Button size="sm" icon="relationship" onPress={() => update({ rootId: ictx, tab: 'diagram', view: 'interconnection', pane: 'view' })}>
            Interconnection
          </Button>
        )}
        {(isKindOf(el['@type'], 'Package') || isDefinition) && (
          <Button size="sm" icon="text" onPress={() => update({ rootId: id, tab: 'text', pane: 'view' })}>
            Edit as text
          </Button>
        )}
      </div>
      {!readOnly && (
        <form className="smod-form" onSubmit={(e) => (e.preventDefault(), void run([{ op: 'rename', elementId: id, name: name.trim() || null, shortName: shortName.trim() || null }]))}>
          <TextField label="Name" value={name} onChange={setName} />
          <TextField label="Short name" description="Optional identifier, e.g. a requirement ID such as R-FORCE" value={shortName} onChange={setShortName} />
          <Button size="sm" type="submit" icon="save" isPending={busy} isDisabled={name === (el.declaredName ?? '') && shortName === (el.declaredShortName ?? '')} data-help-id="sysml-modeler.properties.rename">
            Save name
          </Button>
        </form>
      )}
      {isFeature && (
        <section className="smod-field" aria-label="Typing">
          <strong>Defined by</strong>
          <div className="smod-chips">
            {types.length ? types.map((t) => (
              <Badge key={t} tone="neutral">{s.qualifiedName(t) ?? s.label(t)}</Badge>
            )) : <span className="smod-muted">No type</span>}
            {ownTypings.length > 0 && !readOnly && <IconButton label="Remove the types" icon="unlink" size="sm" onPress={() => void run([{ op: 'setTyping', elementId: id, typeIds: [] }])} />}
          </div>
          {!readOnly && <ComboBox ariaLabel="Set the type" placeholder={`Type: ${typeKinds?.join(' or ') ?? 'definition'}`} options={options} onSelect={(o) => void run([{ op: 'setTyping', elementId: id, typeIds: [o.id] }])} />}
        </section>
      )}
      {isDefinition && (
        <section className="smod-field" aria-label="Specialization">
          <strong>Specializes</strong>
          <div className="smod-chips">
            {generals.length ? generals.map((g) => (
              <span key={g} className="smod-chip">
                <Badge tone="neutral">{s.qualifiedName(g) ?? s.label(g)}</Badge>
                {!readOnly && <IconButton label={`Remove specialization of ${s.label(g)}`} icon="close" size="sm" onPress={() => void run([{ op: 'removeSpecialization', elementId: id, generalId: g }])} />}
              </span>
            )) : <span className="smod-muted">Nothing</span>}
          </div>
          {!readOnly && <ComboBox ariaLabel="Add a general definition" placeholder="Specialize a definition" options={options.filter((o) => o.id !== id)} onSelect={(o) => void run([{ op: 'addSpecialization', elementId: id, generalId: o.id, kind: 'subclassification' }])} />}
        </section>
      )}
      {isFeature && !readOnly && (
        <>
          <form className="smod-form smod-row" onSubmit={(e) => (e.preventDefault(), void run([{ op: 'setMultiplicity', elementId: id, multiplicity: upper.trim() ? { ...(lower.trim() ? { lower: Number(lower) } : {}), upper: upper.trim() === '*' ? '*' : Number(upper) } : null }]))}>
            <TextField label="Lower" value={lower} onChange={setLower} className="smod-narrow" />
            <TextField label="Upper (* = many)" value={upper} onChange={setUpper} className="smod-narrow" />
            <Button size="sm" type="submit" icon="save" isDisabled={busy}>Set multiplicity</Button>
          </form>
          <form className="smod-form" onSubmit={(e) => (e.preventDefault(), void run([{ op: 'setValue', elementId: id, expression: value.trim() || null }]))}>
            <TextField label="Value" description={evaluated && evaluated.kind !== 'unknown' ? `Evaluates to ${formatValue(evaluated)}` : 'Expression, e.g. 12 [kg], 2 * rpm, rod.stroke'} value={value} onChange={setValue} inputClassName="smod-code" />
            <Button size="sm" type="submit" icon="save" isDisabled={busy || value === exprText} data-help-id="sysml-modeler.properties.value">Save value</Button>
          </form>
          <Select label="Direction" value={typeof el.direction === 'string' ? el.direction : 'none'} options={[{ id: 'none', label: 'None' }, { id: 'in', label: 'in' }, { id: 'out', label: 'out' }, { id: 'inout', label: 'inout' }]} onChange={(v) => void run([{ op: 'setDirection', elementId: id, direction: v === 'none' ? null : (v as 'in') }])} />
        </>
      )}
      {(isKindOf(el['@type'], 'RequirementDefinition') || isKindOf(el['@type'], 'RequirementUsage')) && el['@type'] !== 'SatisfyRequirementUsage' && <RequirementLink session={session} model={model} elementId={id} readOnly={readOnly} />}
      {(isKindOf(el['@type'], 'PartDefinition') || isKindOf(el['@type'], 'PartUsage') || isKindOf(el['@type'], 'ItemDefinition') || isKindOf(el['@type'], 'ItemUsage')) && !isKindOf(el['@type'], 'ConnectionUsage') && !isKindOf(el['@type'], 'MetadataDefinition') && <Represents session={session} model={model} elementId={id} readOnly={readOnly} revision={model.version} />}
      {isKindOf(el['@type'], 'Type') && !readOnly && (
        <Checkbox isSelected={el.isAbstract === true} onChange={(v) => void run([{ op: 'setAbstract', elementId: id, isAbstract: v }])}>
          Abstract
        </Checkbox>
      )}
      {!readOnly && (
        <form className="smod-form" onSubmit={(e) => (e.preventDefault(), void run([{ op: 'setDocumentation', elementId: id, text: doc }]))}>
          <TextField label="Documentation" multiline rows={3} value={doc} onChange={setDoc} />
          <Button size="sm" type="submit" icon="save" isDisabled={busy || doc === (docEl ? String(docEl.body ?? '') : '')}>Save documentation</Button>
        </form>
      )}
      <section className="smod-field" aria-label="Referenced by">
        <strong>Referenced by ({refs.length})</strong>
        {refs.length === 0 && <span className="smod-muted">No other element refers to this one.</span>}
        <ul className="smod-links">
          {refs.slice(0, 30).map((r) => (
            <li key={r.viaId}>
              <Button size="sm" variant="text" onPress={() => update({ selectedId: r.fromId })}>
                {r.fromLabel}
              </Button>
              <span className="smod-muted">{r.viaMetaclass}</span>
            </li>
          ))}
        </ul>
      </section>
      {!readOnly && (
        <Button variant="danger" size="sm" icon="minus" onPress={() => setConfirmDelete({})} data-help-id="sysml-modeler.properties.delete">
          Delete…
        </Button>
      )}
      <Dialog
        title={`Delete ${s.name(id) ?? 'element'}?`}
        isOpen={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        footer={(close) => (
          <>
            <Button variant="text" onPress={close}>Cancel</Button>
            {confirmDelete?.refused && (
              <Button variant="danger" onPress={async () => (await run([{ op: 'deleteElement', elementId: id, removeReferences: true }]), close(), update({ selectedId: null }))}>
                Delete and remove references
              </Button>
            )}
            {!confirmDelete?.refused && (
              <Button
                variant="danger"
                onPress={async () => {
                  setBusy(true)
                  try {
                    await session.run([{ op: 'deleteElement', elementId: id }])
                    close()
                    update({ selectedId: null })
                  } catch (e) {
                    setConfirmDelete({ refused: message(e) })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Delete
              </Button>
            )}
          </>
        )}
      >
        <p>The element and everything it owns are removed in a new commit. You can undo it from History.</p>
        {confirmDelete?.refused && <Notice tone="warning" title="Still referenced">{confirmDelete.refused}</Notice>}
      </Dialog>
    </div>
  )
}

/** The value expression as text (for editing). */
function exprSource(model: Model, featureId: string): string {
  const s = semanticsOf(model)
  const fv = s.ownedRelationships(featureId).find((r) => r['@type'] === 'FeatureValue')
  const e = fv && refId(fv, 'ownedRelatedElement')
  if (!e) return ''
  // Printed relative to the feature's scope, so it parses back to the same references.
  return serializeExpression(model, e, featureId)
}
