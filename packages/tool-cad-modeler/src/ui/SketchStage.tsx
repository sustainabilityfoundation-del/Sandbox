import type { CadEngine, SketchFeature, SketchResult } from '@ews/cad-core'
import { Badge, Button, Checkbox, SegmentedControl, TextField, useToasts } from '@ews/design-system'
import { useState } from 'react'
import type { CadModelerViewState } from '../viewState'
import { SKETCH_STATUS, makeRun } from './common'
import { Sketcher } from './Sketcher'
import { DEFAULT_DRAW_OPTIONS, DRAW_TOOLS, commandsFor, hint, type DrawOptions, type DrawTool, type SnapTarget } from './sketchDraw'

interface Props {
  engine: CadEngine
  sketch: SketchFeature
  result?: SketchResult
  vs: CadModelerViewState
  update: (u: Partial<CadModelerViewState>) => void
}

type Mode = 'select' | DrawTool

/**
 * The sketch stage: the drawing bar (tool, options, hint, degrees of freedom) and the sketch view. Clicks
 * and taps place points; two points make a shape through the same typed commands as the forms in the
 * Edit tab (which stay the keyboard path for exact values). Lines chain: each segment starts where the
 * last one ended, and clicking the first point closes the shape.
 */
export function SketchStage({ engine, sketch, result, vs, update }: Props) {
  const run = makeRun(engine)
  const [mode, setMode] = useState<Mode>('select')
  const [options, setOptions] = useState<DrawOptions>(DEFAULT_DRAW_OPTIONS)
  const [sidesText, setSidesText] = useState(String(DEFAULT_DRAW_OPTIONS.sides))
  const [pending, setPending] = useState<SnapTarget | null>(null)
  const [firstId, setFirstId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<SnapTarget | null>(null)
  const [busy, setBusy] = useState(false)
  const sol = result?.solution
  const status = SKETCH_STATUS[sol?.status ?? 'not-regenerated']
  const sides = Math.round(Number(sidesText)) || DEFAULT_DRAW_OPTIONS.sides
  const tool: DrawTool | null = mode === 'select' ? null : mode
  const selected = vs.selection.filter((s) => s.kind === 'sketch-entity').map((s) => s.id)

  const reset = () => {
    setPending(null)
    setFirstId(null)
    setCursor(null)
  }
  const chooseMode = (m: Mode) => {
    setMode(m)
    reset()
  }

  const place = async (target: SnapTarget, step: number) => {
    if (!tool || busy) return
    if (!pending) {
      setPending(target)
      if (tool === 'line') setFirstId(target.id ?? null)
      return
    }
    const out = commandsFor(tool, sketch.id, pending, { ...target }, { ...options, sides }, step)
    if ('error' in out) {
      useToasts.getState().push({ tone: 'warning', title: 'Nothing drawn', body: out.error })
      return
    }
    setBusy(true)
    try {
      const r = await run(out.commands, out.label)
      if (!r?.ok) return
      if (tool === 'line') {
        const created = r.results[0].result as { start: string; end: string }
        const first = firstId ?? created.start
        // Clicking the first point of the chain closes the shape and ends it; otherwise the chain continues from the new end.
        if (created.end === first) reset()
        else {
          setFirstId(first)
          setPending({ point: target.point, kind: created.end === 'origin' ? 'origin' : 'point', id: created.end })
        }
      } else reset()
    } finally {
      setBusy(false)
    }
  }
  const cancel = () => {
    if (pending) reset()
    else chooseMode('select')
  }

  return (
    <div className="cadm-sketch-stage" data-help-id="cad-modeler.sketch.draw">
      <div className="cadm-draw-bar" role="toolbar" aria-label="Sketch drawing tools">
        <SegmentedControl<Mode>
          label="Drawing tool"
          size="sm"
          value={mode}
          onChange={chooseMode}
          options={[{ value: 'select', label: 'Select' }, ...DRAW_TOOLS.map((t) => ({ value: t.value as Mode, label: t.label }))]}
        />
        {mode === 'polygon' && <TextField className="cadm-draw-sides" aria-label="Polygon sides" label="Sides" value={sidesText} onChange={setSidesText} />}
        {tool && (
          <>
            <Checkbox isSelected={options.dimensions} onChange={(v) => setOptions((o) => ({ ...o, dimensions: v }))}>
              Dimension new shapes
            </Checkbox>
            {tool === 'line' && (
              <Checkbox isSelected={options.infer} onChange={(v) => setOptions((o) => ({ ...o, infer: v }))}>
                Make near-horizontal and vertical lines exact
              </Checkbox>
            )}
            <Button size="sm" variant="outlined" icon="close" onPress={cancel}>
              {pending ? 'Cancel shape' : 'Stop drawing'}
            </Button>
          </>
        )}
        <Badge tone={status.tone} icon={sol?.status === 'fully-constrained' ? 'locked' : 'unlocked'}>
          {status.label}
          {sol ? `, ${sol.dof} DOF` : ''}
        </Badge>
      </div>
      <p className="cadm-hint cadm-draw-hint" role="status" aria-live="polite" data-testid="draw-hint">
        {tool ? hint(tool, pending ? 1 : 0, tool === 'line' && !!firstId) : 'Choose a drawing tool to draw by clicking or tapping, or select sketch entities to constrain them. The Edit tab has forms for exact values.'}
        {tool && cursor ? ` Cursor ${cursor.point[0]}, ${cursor.point[1]} mm${cursor.kind === 'grid' ? '' : cursor.kind === 'origin' ? ' (origin)' : ` (point ${cursor.id})`}.` : ''}
      </p>
      <Sketcher
        sketch={sketch}
        result={result}
        selected={selected}
        onToggle={(id) => {
          const has = vs.selection.some((s) => s.kind === 'sketch-entity' && s.id === id)
          update({ selection: has ? vs.selection.filter((s) => !(s.kind === 'sketch-entity' && s.id === id)) : [...vs.selection.filter((s) => s.kind === 'sketch-entity'), { kind: 'sketch-entity', id, sketchId: sketch.id }] })
        }}
        draw={tool ? { tool, pending, sides, cursor, onCursor: setCursor, onPlace: place, onCancel: cancel } : null}
      />
    </div>
  )
}
