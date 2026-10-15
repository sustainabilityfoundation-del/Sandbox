import type { CadEngine, EngineState, Feature, Part } from '@ews/cad-core'
import { AppIcon, Button, IconButton, MenuButton, MenuItem, Select, TextField, cx } from '@ews/design-system'
import { useState } from 'react'
import type { CadModelerViewState, SelectionItem } from '../viewState'
import { CommitField, FeatureStatus, fmtNum, makeRun, regenOf } from './common'

interface Props {
  engine: CadEngine
  state: EngineState
  vs: CadModelerViewState
  update: (u: Partial<CadModelerViewState>) => void
}

const ICON: Record<Feature['type'], 'edit' | 'arrow-right' | 'sync'> = { sketch: 'edit', extrude: 'arrow-right', revolve: 'sync' }

/** Feature tree, bodies and parameters of each part (brief §8: feature tree, dimension editing). */
export function ModelPanel({ engine, state, vs, update }: Props) {
  const run = makeRun(engine)
  const doc = state.doc
  const select = (item: SelectionItem) => update({ selection: [item] })
  const edit = (f: Feature) => {
    if (f.type === 'sketch') update({ editing: { kind: 'sketch', sketchId: f.id }, tab: 'edit', selection: [{ kind: 'feature', id: f.id }] })
    else update({ editing: { kind: f.type, featureId: f.id }, tab: 'edit', selection: [{ kind: 'feature', id: f.id }] })
  }
  return (
    <div className="cadm-panel-body">
      <CommitField label="Document title" value={doc.metadata.title} helpId="cad-modeler.document.title" onCommit={(title) => run([{ command: 'set_document_metadata', input: { title } }], 'Rename document')} />
      {doc.parts.map((part) => (
        <PartSection key={part.id} part={part} state={state} vs={vs} onSelect={select} onEdit={edit} engine={engine} />
      ))}
      <Button size="sm" variant="text" icon="add" onPress={() => run([{ command: 'create_part', input: { name: `Part ${doc.parts.length + 1}` } }], 'Create part')}>
        Add part
      </Button>
    </div>
  )
}

function PartSection({ part, state, vs, onSelect, onEdit, engine }: { part: Part; state: EngineState; vs: CadModelerViewState; onSelect: (s: SelectionItem) => void; onEdit: (f: Feature) => void; engine: CadEngine }) {
  const run = makeRun(engine)
  const pr = regenOf(state, part.id)
  const isSelected = (id: string) => vs.selection.some((s) => s.id === id)
  return (
    <section className="cadm-section" aria-label={`Part ${part.name}`}>
      <h3 className="cadm-section-title">
        <AppIcon name="component" size="sm" /> {part.name} <span className="cadm-muted cadm-mono">{part.id}</span>
      </h3>

      <h4 className="cadm-subtitle">Feature history</h4>
      {part.features.length === 0 ? (
        <p className="cadm-muted">No features yet. Choose Sketch in the toolbar to start.</p>
      ) : (
        <ol className="cadm-tree" data-help-id="cad-modeler.feature-tree">
          {part.features.map((f, i) => {
            const r = pr?.features.find((x) => x.featureId === f.id)
            return (
              <li key={f.id} className={cx('cadm-tree-item', isSelected(f.id) && 'is-selected', f.suppressed && 'is-suppressed')}>
                <Button variant="quiet" size="sm" className="cadm-tree-button justify-start!" onPress={() => onSelect({ kind: 'feature', id: f.id })} aria-label={`${i + 1}. ${f.name} (${f.type}, ${r?.status ?? 'pending'})`}>
                  <AppIcon name={ICON[f.type]} size="sm" />
                  <span className="cadm-tree-name">{f.name}</span>
                  <span className="cadm-muted cadm-mono">{f.id}</span>
                </Button>
                <FeatureStatus result={r} />
                <MenuButton label={`Actions for ${f.name}`} icon="more-vertical" onAction={(key) => {
                  if (key === 'edit') onEdit(f)
                  if (key === 'suppress') run([{ command: 'set_suppressed', input: { featureId: f.id, suppressed: !f.suppressed } }], f.suppressed ? `Unsuppress ${f.name}` : `Suppress ${f.name}`)
                  if (key === 'delete') run([{ command: 'delete_feature', input: { featureId: f.id } }], `Delete ${f.name}`)
                }}>
                  <MenuItem id="edit" icon="edit">Edit</MenuItem>
                  <MenuItem id="suppress" icon={f.suppressed ? 'visibility' : 'hidden'}>{f.suppressed ? 'Unsuppress' : 'Suppress'}</MenuItem>
                  <MenuItem id="delete" icon="close" tone="danger">Delete</MenuItem>
                </MenuButton>
                {r?.error && <p className="cadm-error">{r.error.message}</p>}
              </li>
            )
          })}
        </ol>
      )}

      {!!pr?.bodies.length && (
        <>
          <h4 className="cadm-subtitle">Bodies</h4>
          <ul className="cadm-list">
            {pr.bodies.map((b) => (
              <li key={b.bodyId}>
                <Button variant="quiet" size="sm" className={cx("cadm-tree-button justify-start!", isSelected(b.bodyId) && "is-selected")} onPress={() => onSelect({ kind: 'body', id: b.bodyId })}>
                  <AppIcon name="cad-representation" size="sm" />
                  <span className="cadm-tree-name">{b.name}</span>
                  <span className="cadm-muted">{fmtNum(b.analysis.volume, 1)} mm³</span>
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Parameters part={part} engine={engine} state={state} />
    </section>
  )
}

function Parameters({ part, engine, state }: { part: Part; engine: CadEngine; state: EngineState }) {
  const run = makeRun(engine)
  const evaluated = regenOf(state, part.id)?.parameters ?? []
  const [name, setName] = useState('')
  const [expression, setExpression] = useState('')
  const [unit, setUnit] = useState('mm')
  const add = async () => {
    const r = await run([{ command: 'create_parameter', input: { partId: part.id, name: name.trim(), expression: expression.trim(), unit } }], `Create parameter ${name}`)
    if (r?.ok) {
      setName('')
      setExpression('')
    }
  }
  return (
    <div className="cadm-params" data-help-id="cad-modeler.parameters">
      <h4 className="cadm-subtitle">Parameters</h4>
      {part.parameters.length === 0 && <p className="cadm-muted">No parameters. Dimensions and features can use parameter names in expressions.</p>}
      {part.parameters.map((p) => {
        const ev = evaluated.find((x) => x.id === p.id)
        return (
          <div key={p.id} className="cadm-param-row">
            <span className="cadm-param-name cadm-mono" title={p.description}>{p.name}</span>
            <CommitField ariaLabel={`Expression of ${p.name}`} value={p.expression} className="cadm-param-expr" errorMessage={ev?.error?.message} onCommit={(v) => run([{ command: 'set_parameter', input: { partId: part.id, name: p.name, expression: v } }], `Set ${p.name}`)} />
            <span className="cadm-param-value">{ev?.value !== undefined ? `= ${fmtNum(ev.value, 4)}` : '—'} {p.unit === 'none' ? '' : p.unit}</span>
            <IconButton label={`Delete parameter ${p.name}`} icon="close" size="sm" onPress={() => run([{ command: 'delete_parameter', input: { partId: part.id, name: p.name } }], `Delete ${p.name}`)} />
          </div>
        )
      })}
      <div className="cadm-param-add">
        <TextField label="Name" value={name} onChange={setName} placeholder="width" />
        <TextField label="Expression" value={expression} onChange={setExpression} placeholder="80 or depth * 2" onKeyDown={(e) => e.key === 'Enter' && name && expression && add()} />
        <Select label="Unit" size="sm" value={unit} onChange={setUnit} options={[{ id: 'mm', label: 'mm' }, { id: 'deg', label: 'deg' }, { id: 'none', label: 'none' }]} />
        <Button size="sm" icon="add" isDisabled={!name.trim() || !expression.trim()} onPress={add}>
          Add
        </Button>
      </div>
      <p className="cadm-hint">Enter a number (mm or degrees) or an expression such as “width / 2” or “1 in”.</p>
    </div>
  )
}

