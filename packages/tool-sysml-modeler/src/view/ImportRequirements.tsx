import { Badge, Button, Checkbox, ComboBox, Dialog, Notice } from '@ews/design-system'
import type { RequirementSummary } from '@ews/platform-sdk'
import { usePlatformServices, useSharedContext } from '@ews/platform-sdk/react'
import type { TransactionOutcome } from '@ews/sysml-client'
import { findManagedRequirementElement, isKindOf, semanticsOf, type Command, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useState } from 'react'
import { message, type ModelerSession } from '../session'
import { ChangeList } from './common'
import { useViewState } from './hooks'

/**
 * Bring managed requirements into the System Model (AUD-5): the UI of the `importRequirement` command, the same command
 * the assistant proposes (`sysml-modeler.import_requirement`). Requirement data is read through the SDK requirements
 * service; the model keeps only the UUID, the pinned revision, the key and the title (ADR-0037). Importing again reuses the
 * existing element (identity rule), so the list shows which requirements are already in the model.
 */

/** Managed requirements of the platform project, read through the SDK service (undefined = loading, null = unavailable). */
export function useManagedRequirements(enabled = true): { items: RequirementSummary[] | null | undefined; error: string | null } {
  const { requirements } = usePlatformServices()
  const { projectId, configurationId } = useSharedContext()
  const [items, setItems] = useState<RequirementSummary[] | null | undefined>(requirements ? undefined : null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setError(null)
    if (!requirements) return setItems(null)
    if (!enabled) return
    const load = () =>
      requirements.list({ projectId, configurationId, limit: 200 }).then(
        (page) => alive && setItems(page.items),
        (e) => alive && (setError(message(e)), setItems(null)),
      )
    void load()
    const off = requirements.subscribe(projectId, () => void load())
    return () => {
      alive = false
      off()
    }
  }, [requirements, projectId, configurationId, enabled])
  return { items, error }
}

function topPackageOf(model: Model, id: string | undefined): string {
  const s = semanticsOf(model)
  let cur = id ? s.get(id) : undefined
  let last: string | undefined
  for (let k = 0; cur && k < 50 && cur['@id'] !== model.rootId; k++) {
    if (isKindOf(cur['@type'], 'Package')) last = cur['@id']
    cur = s.owner(cur['@id'])
  }
  return last ?? s.ownedMembers(model.rootId).find((m) => isKindOf(m['@type'], 'Package'))?.['@id'] ?? model.rootId
}

export function ImportRequirementsDialog({ session, model }: { session: ModelerSession; model: Model }) {
  const [vs, update] = useViewState()
  const open = vs.dialog?.kind === 'import-requirements'
  const { items, error: loadError } = useManagedRequirements(open)
  const [picked, setPicked] = useState<string[]>([])
  const [partId, setPartId] = useState<string | null>(null)
  const [partLabel, setPartLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<TransactionOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setPicked([])
    setPartId(null)
    setPartLabel('')
    setError(null)
    setPreview(null)
  }, [open])
  const s = semanticsOf(model)
  const parts = useMemo(
    () =>
      open
        ? [...model.elements()]
            .filter((e) => !model.isLibrary(e['@id']) && /^(Part|Item)(Definition|Usage)$/.test(e['@type']))
            .map((e) => ({ id: e['@id'], label: s.qualifiedName(e['@id']) ?? s.label(e['@id']), description: e['@type'].replace(/([A-Z])/g, ' $1').trim().toLowerCase() }))
            .sort((a, b) => a.label.localeCompare(b.label))
        : [],
    [open, model, s],
  )
  const inModel = (r: RequirementSummary) => !!findManagedRequirementElement(model, r.id)
  const commands = (): Command[] => {
    const ownerId = topPackageOf(model, partId ?? undefined)
    const by = partId ? [s.qualifiedName(partId) ?? partId] : undefined
    return (items ?? [])
      .filter((r) => picked.includes(r.id))
      .map((r) => ({ op: 'importRequirement', ownerId, requirementId: r.id, key: r.key, title: r.title, revision: r.revision, ...(by ? { satisfiedBy: by } : {}) }))
  }
  const act = async (dry: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (dry) setPreview(await session.preview(commands(), 'reject-new-errors'))
      else {
        const trial = await session.preview(commands(), 'reject-new-errors')
        if (!trial.changes.length) {
          setError('Everything selected is already in the model (same requirement, same satisfy links); nothing to change.')
          return
        }
        await session.run(commands(), { reason: `Brought ${picked.length} managed requirement(s) into the System Model` })
        update({ dialog: null, tab: 'matrix', matrix: 'satisfy' })
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  const toggle = (id: string, on: boolean) => (setPicked(on ? [...picked, id] : picked.filter((x) => x !== id)), setPreview(null))
  return (
    <Dialog
      title="Bring managed requirements into the System Model"
      isOpen={open}
      onOpenChange={(o) => !o && update({ dialog: null })}
      footer={(close) => (
        <>
          <Button variant="text" onPress={close}>Cancel</Button>
          <Button icon="search" onPress={() => void act(true)} isDisabled={busy || !picked.length}>Preview</Button>
          <Button variant="filled" icon="add" onPress={() => void act(false)} isPending={busy} isDisabled={!picked.length} data-help-id="sysml-modeler.import-requirements.confirm">Bring into the model</Button>
        </>
      )}
    >
      <div className="smod-form" data-help-id="sysml-modeler.import-requirements">
        <p className="smod-muted">Each selected requirement becomes one requirement in the model that carries its ID, pinned revision and title. The text stays in Requirements Management. A requirement that is already in the model is reused, never duplicated.</p>
        {items === undefined && <span className="smod-muted">Loading managed requirements…</span>}
        {items === null && <Notice tone="info">{loadError ?? 'The Requirements service is not available here (not provided by this host, or not in your subscription), so managed requirements cannot be listed.'}</Notice>}
        {items && items.length === 0 && <Notice tone="info">This project has no managed requirements yet. Create them in Requirements Management first.</Notice>}
        {items && items.length > 0 && (
          <ul className="smod-import-list" aria-label="Managed requirements">
            {items.map((r) => (
              <li key={r.id}>
                <Checkbox isSelected={picked.includes(r.id)} onChange={(on) => toggle(r.id, on)}>
                  <span className="smod-mono">{r.key}</span> {r.title}
                </Checkbox>
                <Badge tone="neutral">{`rev ${r.revision}`}</Badge>
                {inModel(r) && <Badge tone="success">in the model</Badge>}
              </li>
            ))}
          </ul>
        )}
        {items && items.length > 0 && (
          <ComboBox
            label="Satisfied by (optional)"
            placeholder="Search parts"
            options={parts}
            inputValue={partLabel}
            onInputChange={(v) => (setPartLabel(v), v === '' && setPartId(null))}
            onSelect={(o) => (setPartId(o.id), setPartLabel(o.label), setPreview(null))}
          />
        )}
        {error && <Notice tone="danger" title="Not brought in">{error}</Notice>}
        {preview && <ChangeList outcome={preview} />}
      </div>
    </Dialog>
  )
}
