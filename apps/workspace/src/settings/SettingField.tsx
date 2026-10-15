import { useEffect, useState } from 'react'
import { Badge, Checkbox, Select, TextField } from '@ews/design-system'
import { checkSettingValue, type SettingDefinition, type SettingValue } from '@ews/platform-sdk'

/**
 * One setting rendered from its definition with design-system controls. Validation here is a convenience
 * (the same `checkSettingValue` the server runs); the server's answer is authoritative.
 */
export function SettingField({
  definition: d,
  value,
  onChange,
  isDisabled,
  ceilingNote,
  error,
}: {
  definition: SettingDefinition
  value: SettingValue
  onChange: (value: SettingValue) => void
  isDisabled?: boolean
  /** Shown when a project limit narrows the choice. */
  ceilingNote?: string
  error?: string
}) {
  const help = (
    <>
      {d.description}
      {ceilingNote && <span className="block text-warning">{ceilingNote}</span>}
    </>
  )
  const common = { 'data-help-id': d.helpId, 'data-setting-id': d.id }

  if (d.type === 'boolean') {
    return (
      <div className="ws-setting" {...common}>
        <Checkbox isSelected={value === true} onChange={(v) => onChange(v)} isDisabled={isDisabled}>
          {d.label}
        </Checkbox>
        <p className="ws-setting-help">{help}</p>
        {error && <p className="ws-setting-error">{error}</p>}
      </div>
    )
  }
  if (d.type === 'enum') {
    return (
      <div className="ws-setting" {...common}>
        <Select label={d.label} description={help} value={String(value ?? d.default)} onChange={(v) => onChange(v)} isDisabled={isDisabled} options={d.options.map((o) => ({ id: o.value, label: o.label, description: o.description }))} />
        {error && <p className="ws-setting-error">{error}</p>}
      </div>
    )
  }
  if (d.type === 'number') return <NumberSetting d={d} value={value} onChange={onChange} isDisabled={isDisabled} help={help} error={error} common={common} />
  if (d.type === 'string') {
    return (
      <div className="ws-setting" {...common}>
        <TextField label={d.label} description={help} value={String(value ?? '')} onChange={(v) => onChange(v)} isDisabled={isDisabled} errorMessage={error} />
      </div>
    )
  }
  return (
    <div className="ws-setting" {...common}>
      <span className="ws-setting-label">{d.label}</span>
      <Badge tone={value ? 'success' : 'neutral'}>{value ? 'Set' : 'Not set'}</Badge>
      <p className="ws-setting-help">{help}</p>
    </div>
  )
}

function NumberSetting({ d, value, onChange, isDisabled, help, error, common }: { d: Extract<SettingDefinition, { type: 'number' }>; value: SettingValue; onChange: (v: SettingValue) => void; isDisabled?: boolean; help: React.ReactNode; error?: string; common: Record<string, unknown> }) {
  const [text, setText] = useState(String(value ?? d.default))
  const [local, setLocal] = useState<string | undefined>()
  useEffect(() => setText(String(value ?? d.default)), [value, d.default])
  const commit = () => {
    const n = Number(text.trim())
    const problem = text.trim() === '' ? `${d.label} is required.` : checkSettingValue(d, n)
    setLocal(problem ?? undefined)
    if (!problem && n !== value) onChange(n)
  }
  return (
    <div className="ws-setting" {...common}>
      <TextField
        label={`${d.label} (${d.min}–${d.max}${d.unit ? ` ${d.unit}` : ''})`}
        description={help}
        value={text}
        onChange={setText}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        inputMode={d.integer ? 'numeric' : 'decimal'}
        unit={d.unit}
        isDisabled={isDisabled}
        errorMessage={local ?? error}
        inputClassName="max-w-32"
      />
    </div>
  )
}
