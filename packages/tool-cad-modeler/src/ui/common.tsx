import type { CadEngine, CommandCall, EngineState, ExecuteResult, FeatureResult } from '@ews/cad-core'
import { Badge, TextField, useToasts, type Tone } from '@ews/design-system'
import { useEffect, useState } from 'react'
import { useSetting } from '@ews/platform-sdk/react'
import { CAD_SETTING_IDS, measure } from '../settings'

export type Run = (commands: CommandCall[], label?: string) => Promise<ExecuteResult | undefined>

/** Runs commands through the engine (the same transaction path the assistant uses). */
export function makeRun(engine: CadEngine | undefined): Run {
  return async (commands, label) => {
    if (!engine) return undefined
    const r = await engine.execute({ commands, label, source: 'user' })
    if (!r.ok) useToasts.getState().push({ tone: 'danger', title: label ? `${label} failed` : 'Command failed', body: r.error.message })
    return r
  }
}

export const STATUS_TONE: Record<string, Tone> = { ok: 'success', failed: 'danger', blocked: 'warning', suppressed: 'neutral', 'not-regenerated': 'info' }
export const STATUS_LABEL: Record<string, string> = { ok: 'OK', failed: 'Failed', blocked: 'Blocked', suppressed: 'Suppressed', 'not-regenerated': 'Pending' }

export function FeatureStatus({ result }: { result?: FeatureResult }) {
  const status = result?.status ?? 'not-regenerated'
  const warn = !!result?.warnings.length && status === 'ok'
  return (
    <Badge tone={warn ? 'warning' : STATUS_TONE[status]} icon={status === 'ok' ? (warn ? 'warning' : 'success') : status === 'failed' ? 'error' : status === 'blocked' ? 'warning' : status === 'suppressed' ? 'hidden' : 'pending'} title={result?.error?.message ?? result?.warnings.map((w) => w.message).join(' ')}>
      {warn ? 'Warning' : STATUS_LABEL[status]}
    </Badge>
  )
}

export const SKETCH_STATUS: Record<string, { tone: Tone; label: string }> = {
  'fully-constrained': { tone: 'success', label: 'Fully constrained' },
  'under-constrained': { tone: 'info', label: 'Under-constrained' },
  'over-constrained': { tone: 'warning', label: 'Redundant constraints' },
  conflicting: { tone: 'danger', label: 'Conflicting constraints' },
  failed: { tone: 'danger', label: 'Invalid sketch' },
  'not-regenerated': { tone: 'neutral', label: 'Not solved yet' },
}

/** A text field that commits on Enter or blur (expressions, values, names). */
export function CommitField({ label, value, onCommit, unit, ariaLabel, helpId, errorMessage, className }: { label?: string; ariaLabel?: string; value: string; onCommit: (v: string) => void; unit?: string; helpId?: string; errorMessage?: string; className?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft.trim() && draft !== value) onCommit(draft.trim())
    else setDraft(value)
  }
  return (
    <div data-help-id={helpId} className={className}>
      <TextField
        label={label}
        aria-label={ariaLabel}
        value={draft}
        onChange={setDraft}
        onBlur={commit}
        unit={unit}
        errorMessage={errorMessage}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setDraft(value)
        }}
      />
    </div>
  )
}

/** Parses a numeric field; expressions stay strings (the command validates them). */
export function exprValue(text: string): number | string {
  const t = text.trim()
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t
}

export const fmtNum = (v: number | null | undefined, digits = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? v.toExponential(4) : Number(v.toFixed(digits)).toString())

export function regenOf(state: EngineState | undefined, partId: string) {
  return state?.regen?.parts.find((p) => p.partId === partId)
}

/** Measured quantities in the person's display units (setting cad-modeler.units.measurements). Inputs stay in mm. */
export function useMeasure() {
  const units = useSetting<string>(CAD_SETTING_IDS.units)
  const m = measure(units === 'cm' || units === 'm' || units === 'in' ? units : 'mm')
  const show = (q: { value: number; unit: string }, digits: number) => `${fmtNum(q.value, digits)} ${q.unit}`
  return {
    length: (mm: number, digits = 3) => show(m.length(mm), digits),
    lengths: (mm: number[], digits = 3) => { const u = m.length(1).unit; return `${mm.map((x) => fmtNum(m.length(x).value, digits)).join(' × ')} ${u}` },
    area: (mm2: number, digits = 3) => show(m.area(mm2), digits),
    volume: (mm3: number, digits = 3) => show(m.volume(mm3), digits),
    mass: (kg: number, digits = 5) => show(m.mass(kg), digits),
  }
}
