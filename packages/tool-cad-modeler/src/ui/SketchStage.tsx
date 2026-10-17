import type { CadEngine, SketchFeature, SketchResult } from '@ews/cad-core'
import { Badge, Button, SegmentedControl, TextField, useToasts } from '@ews/design-system'
import { useRef, useState } from 'react'
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
  const options: DrawOptions = { ...DEFAULT_DRAW_OPTIONS, ...vs.drawOptions }
  const [sidesText, setSidesText] = useState(String(DEFAULT_DRAW_OPTIONS.sides))
  const [pending, setPendingState] = useState<SnapTarget | null>(null)
  const [firstId, setFirstIdState] = useState<string | null>(null)
  const [cursor, setCursor] = useState<SnapTarget | null>(null)
  // Placements run one after the other (a command may still be regenerating when the next tap arrives),
  // against the latest gesture state, which the refs hold.
  const pendingRef = useRef<SnapTarget | null>(null)
  const firstRef = useRef<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const setPending = (t: SnapTarget | null) => {
    pendingRef.current = t
    setPendingState(t)
  }
  const setFirstId = (id: string | null) => {
    firstRef.current = id
    setFirstIdState(id)
  }
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

  const placeNow = async (target: SnapTarget, step: number) => {
    if (!tool) return
    const first = pendingRef.current
    if (!first) {
      setPending(target)
      if (tool === 'line') setFirstId(target.id ?? null)
      return
    }
    const out = commandsFor(tool, sketch.id, first, { ...target }, { ...options, sides }, step)
    if ('error' in out) {
      useToasts.getState().push({ tone: 'warning', title: 'Nothing drawn', body: out.error })
      return
    }
    const r = await run(out.commands, out.label)
    if (!r?.ok) return
    if (tool === 'line') {
      const created = r.results[0].result as { start: string; end: string }
      const chainStart = firstRef.current ?? created.start
      // Clicking the first point of the chain closes the shape and ends it; otherwise the chain continues from the new end.
      if (created.end === chainStart) reset()
      else {
        setFirstId(chainStart)
        setPending({ point: target.point, kind: created.end === 'origin' ? 'origin' : 'point', id: created.end })
      }
    } else reset()
  }
  const place = (target: SnapTarget, step: number) => {
    queue.current = queue.current.then(() => placeNow(target, step)).catch(() => undefined)
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
