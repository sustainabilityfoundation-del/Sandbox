import { Button, ComboBox, Dialog, Notice, Select, TextField } from '@ews/design-system'
import type { TransactionOutcome } from '@ews/sysml-client'
import { CONNECT_KINDS, CREATABLE_KINDS, expectedTypeKinds, isKindOf, semanticsOf, type Command, type Model } from '@ews/sysml-core'
import { useEffect, useMemo, useState } from 'react'
import { connectableEnds } from '../projection/graph'
import { message, type ModelerSession } from '../session'
import { ChangeList } from './common'
import { useViewState } from './hooks'

const KIND_LABEL: Record<string, string> = {
  Package: 'package',
  PartDefinition: 'part def',
  PartUsage: 'part',
  AttributeDefinition: 'attribute def',
  AttributeUsage: 'attribute',
  EnumerationDefinition: 'enum def',
  EnumerationUsage: 'enum literal / usage',
  ItemDefinition: 'item def',
  ItemUsage: 'item',
  PortDefinition: 'port def',
  PortUsage: 'port',
  ConnectionDefinition: 'connection def',
  InterfaceDefinition: 'interface def',
  AllocationDefinition: 'allocation def',
  FlowDefinition: 'flow def',
  ActionDefinition: 'action def',
  ActionUsage: 'action',
  StateDefinition: 'state def',
  StateUsage: 'state',
  ConstraintDefinition: 'constraint def',
  ConstraintUsage: 'constraint',
  RequirementDefinition: 'requirement def',
  RequirementUsage: 'requirement',
  CalculationDefinition: 'calc def',
  CalculationUsage: 'calc',
  OccurrenceDefinition: 'occurrence def',
  OccurrenceUsage: 'occurrence',
  MetadataDefinition: 'metadata def',
  ReferenceUsage: 'ref (reference usage)',
}

/** Kinds that make sense under an owner (usages need a type-capable owner or a package). */
function kindsFor(model: Model, ownerId: string): string[] {
  const owner = model.get(ownerId)
  if (!owner) return []
  const t = owner['@type']
  if (ownerId === model.rootId) return ['Package']
  if (isKindOf(t, 'Package')) return [...CREATABLE_KINDS]
  return CREATABLE_KINDS.filter((k) => k !== 'Package')
}

function useTypeOptions(model: Model, kind: string) {
  return useMemo(() => {
    const kinds = expectedTypeKinds(kind)
    if (!kinds || kind.endsWith('Definition') || kind === 'Package') return []
    const s = semanticsOf(model)
    const out: { id: string; label: string; group: string }[] = []
    const scan = (els: Iterable<{ '@id': string; '@type': string }>, group: string) => {
      for (const el of els) {
        if (!isKindOf(el['@type'], 'Definition') || el['@type'] === 'ConjugatedPortDefinition' || !kinds.some((k) => isKindOf(el['@type'], k))) continue
        const q = s.qualifiedName(el['@id'])
        if (q) out.push({ id: el['@id'], label: q, group })
      }
    }
    scan(model.elements(), 'This model')
    if (model.library) scan(model.library.elements(), 'Library (platform subset)')
    return out.sort((a, b) => (a.group === b.group ? a.label.localeCompare(b.label) : a.group === 'This model' ? -1 : 1))
  }, [model, kind])
}

/** Creates an owned element through one createElement command (preview, then create). */
export function CreateDialog({ session, model }: { session: ModelerSession; model: Model }) {
  const [vs, update] = useViewState()
  const open = vs.dialog?.kind === 'create'
  const s = semanticsOf(model)
  const fallbackOwner = s.ownedMembers(model.rootId).find((m) => isKindOf(m['@type'], 'Package'))?.['@id'] ?? model.rootId
  const requested = vs.dialog?.kind === 'create' ? vs.dialog.ownerId : null
  const ownerEl = requested ? model.get(requested) : undefined
  const ownerId = ownerEl && isKindOf(ownerEl['@type'], 'Namespace') && !isKindOf(ownerEl['@type'], 'Expression') && !model.isLibrary(requested!) ? requested! : fallbackOwner
  const kinds = kindsFor(model, ownerId)
  const [kind, setKind] = useState<string>('PartDefinition')
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null)
  const [typeLabel, setTypeLabel] = useState('')
  const [mult, setMult] = useState('')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<TransactionOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const types = useTypeOptions(model, kind)
  useEffect(() => {
    if (!open) return
    const ownerType = model.get(ownerId)?.['@type'] ?? ''
    setKind(isKindOf(ownerType, 'Definition') || isKindOf(ownerType, 'Usage') ? (isKindOf(ownerType, 'EnumerationDefinition') ? 'EnumerationUsage' : 'PartUsage') : ownerId === model.rootId ? 'Package' : 'PartDefinition')
    setName('')
    setTypeId(null)
    setTypeLabel('')
    setMult('')
    setValue('')
    setError(null)
    setPreview(null)
  }, [open, ownerId, model])
  const isUsage = !kind.endsWith('Definition') && kind !== 'Package'
  const command = (): Command => {
    const m = mult.trim().match(/^(\d+)(?:\.\.(\d+|\*))?$/)
    return {
      op: 'createElement',
      ownerId,
      ref: '$new',
      kind: kind as (typeof CREATABLE_KINDS)[number],
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(isUsage && typeId ? { typeIds: [typeId] } : {}),
      ...(isUsage && m ? { multiplicity: m[2] ? { lower: Number(m[1]), upper: m[2] === '*' ? '*' : Number(m[2]) } : { upper: Number(m[1]) } } : {}),
      ...(isUsage && value.trim() ? { value: value.trim() } : {}),
    }
  }
  const act = async (dry: boolean) => {
    setBusy(true)
    setError(null)
    try {
      if (dry) setPreview(await session.preview([command()]))
      else {
        const out = await session.run([command()])
        const created = out.createdIds['$new']
        update({ dialog: null, selectedId: created ?? vs.selectedId, expanded: [...new Set([...vs.expanded, ownerId])] })
      }
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={`Add to ${ownerId === model.rootId ? 'the model root' : (s.qualifiedName(ownerId) ?? s.label(ownerId))}`}
      isOpen={open}
      onOpenChange={(o) => !o && update({ dialog: null })}
      footer={(close) => (
        <>
          <Button variant="text" onPress={close}>Cancel</Button>
          <Button icon="search" onPress={() => void act(true)} isDisabled={busy}>Preview</Button>
          <Button variant="filled" icon="add" onPress={() => void act(false)} isPending={busy} data-help-id="sysml-modeler.create.confirm">Create</Button>
        </>
      )}
    >
      <div className="smod-form" data-help-id="sysml-modeler.create">
        <Select label="Kind" value={kind} onChange={(k) => (setKind(k), setPreview(null), setTypeId(null), setTypeLabel(''))} options={kinds.map((k) => ({ id: k, label: KIND_LABEL[k] ?? k }))} />
        <TextField label="Name" value={name} onChange={(v) => (setName(v), setPreview(null))} autoFocus />
        {isUsage && types.length > 0 && (
          <ComboBox label="Defined by (type)" placeholder="Search definitions" options={types} inputValue={typeLabel} onInputChange={setTypeLabel} onSelect={(o) => (setTypeId(o.id), setTypeLabel(o.label), setPreview(null))} />
        )}
        {isUsage && <TextField label="Multiplicity" description="e.g. 1, 0..1, 2..*  (empty: default)" value={mult} onChange={(v) => (setMult(v), setPreview(null))} />}
        {isUsage && kind.startsWith('Attribute') && <TextField label="Value" description="Expression, e.g. 12 [kg]" value={value} onChange={(v) => (setValue(v), setPreview(null))} inputClassName="smod-code" />}
        {error && <Notice tone="danger" title="Not created">{error}</Notice>}
        {preview && <ChangeList outcome={preview} />}
      </div>
    </Dialog>
  )
}

/** Connects two ends inside a part definition (Interconnection View). */
export function ConnectDialog({ session, model }: { session: ModelerSession; model: Model }) {
  const [vs, update] = useViewState()
  const open = vs.dialog?.kind === 'connect'
  const contextId = vs.dialog?.kind === 'connect' ? vs.dialog.contextId : ''
  const ends = useMemo(() => (open ? connectableEnds(model, contextId) : []), [open, model, contextId])
  const [kind, setKind] = useState<(typeof CONNECT_KINDS)[number]>('connection')
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [itemType, setItemType] = useState<string | null>(null)
  const [itemLabel, setItemLabel] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const items = useTypeOptions(model, 'ItemUsage')
  useEffect(() => {
    setSource(ends[0]?.chain ?? '')
    setTarget(ends[1]?.chain ?? '')
    setError(null)
  }, [ends])
  const s = semanticsOf(model)
  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await session.run([{ op: 'connect', ownerId: contextId, kind, source, target, ...(name.trim() ? { name: name.trim() } : {}), ...(kind === 'flow' && itemType ? { itemTypeId: itemType } : {}) }])
      update({ dialog: null })
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      title={`Connect inside ${s.label(contextId)}`}
      isOpen={open}
      onOpenChange={(o) => !o && update({ dialog: null })}
      footer={(close) => (
        <>
          <Button variant="text" onPress={close}>Cancel</Button>
          <Button variant="filled" icon="connect" onPress={() => void submit()} isPending={busy} isDisabled={!source || !target || source === target}>Connect</Button>
        </>
      )}
    >
      <div className="smod-form" data-help-id="sysml-modeler.connect">
        {ends.length < 2 && <Notice tone="warning">This definition needs at least two parts or ports to connect.</Notice>}
        <Select label="Kind" value={kind} onChange={(k) => setKind(k as typeof kind)} options={CONNECT_KINDS.map((k) => ({ id: k, label: k }))} />
        <Select label="From" value={source} onChange={setSource} options={ends.map((e) => ({ id: e.chain, label: e.label }))} />
        <Select label="To" value={target} onChange={setTarget} options={ends.map((e) => ({ id: e.chain, label: e.label }))} />
        {kind === 'flow' && <ComboBox label="Item flowing (optional)" placeholder="Search item definitions" options={items} inputValue={itemLabel} onInputChange={setItemLabel} onSelect={(o) => (setItemType(o.id), setItemLabel(o.label))} />}
        <TextField label="Name (optional)" value={name} onChange={setName} />
        {error && <Notice tone="danger" title="Not connected">{error}</Notice>}
      </div>
    </Dialog>
  )
}

/** Creates a SysML project for the platform project (empty or with the example). */
export function ProjectDialog({ session }: { session: ModelerSession }) {
  const [vs, update] = useViewState()
  const [name, setName] = useState('System model')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog
      title="New SysML project"
      isOpen={vs.dialog?.kind === 'project'}
      onOpenChange={(o) => !o && update({ dialog: null })}
      footer={(close) => (
        <>
          <Button variant="text" onPress={close}>Cancel</Button>
          <Button
            variant="filled"
            icon="add"
            isPending={busy}
            isDisabled={!name.trim()}
            onPress={async () => {
              setBusy(true)
              try {
                await session.createProject(name.trim(), `package ${/^[A-Za-z_]\w*$/.test(name.trim().replace(/\s+/g, '')) ? name.trim().replace(/\s+/g, '') : 'SystemModel'};`)
                update({ dialog: null })
              } catch (e) {
                setError(message(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Create
          </Button>
        </>
      )}
    >
      <TextField label="Name" value={name} onChange={setName} />
      {error && <Notice tone="danger">{error}</Notice>}
    </Dialog>
  )
}
