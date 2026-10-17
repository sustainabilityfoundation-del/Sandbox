import { useEffect, useRef } from 'react'
import { Button, ToggleButton } from './Button'
import { EntryView, type CommandBarNumber, type CommandBarSelect, type CommandBarText } from './CommandBar'
import { NumberField } from './Fields'
import { cx } from './cx'

/*
 * CommandSessionStrip: the edit strip while a command is open (a feature edit such as Extrude: a title, numeric
 * fields, Preview, OK and Cancel). Capability-registry.md, Amendment CT-2c: while a session is open the host replaces
 * the ribbon with this strip. Enter in a field is OK, Escape is Cancel. OK can be unavailable with a reason
 * (`okUnavailableReason`): it stays focusable, says why, and does nothing. The host refuses a session for a planned
 * command; the strip has no way to start one.
 */

export type CommandSessionField = CommandBarNumber | CommandBarSelect | CommandBarText

export interface CommandSessionStripProps {
  /** The command being edited, e.g. "Extrude". Names the strip. */
  title: string
  fields: CommandSessionField[]
  /** The Preview toggle; omit when the command has no preview. */
  preview?: { on: boolean; onChange: (on: boolean) => void }
  onOk: () => void
  /** Why OK cannot be pressed now; OK is unavailable while this is set. */
  okUnavailableReason?: string
  onCancel: () => void
  className?: string
}

export function CommandSessionStrip({ title, fields, preview, onOk, okUnavailableReason, onCancel, className }: CommandSessionStripProps) {
  // Enter commits a number field and then presses OK; wait a tick so the host has the committed value in its props.
  const latest = useRef({ onOk, okUnavailableReason, onCancel })
  useEffect(() => {
    latest.current = { onOk, okUnavailableReason, onCancel }
  })
  const okBlocked = okUnavailableReason !== undefined && okUnavailableReason !== ''
  const press = () => {
    if (!latest.current.okUnavailableReason) latest.current.onOk()
  }

  return (
    <div
      role="group"
      aria-label={`${title}: edit`}
      data-command-session={title}
      className={cx('ws-session-strip flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2 border-b border-line bg-surface-2 px-3 py-2', className)}
      // Enter is taken in the capture phase: a field handles (and stops) the key before it could bubble.
      onKeyDownCapture={(e) => {
        const target = e.target as HTMLElement
        if (e.key === 'Enter' && target.tagName === 'INPUT' && !target.closest('[role="listbox"], [role="dialog"]')) setTimeout(press, 0)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          latest.current.onCancel()
        }
      }}
    >
      <span className="flex h-ctl items-center text-15 font-strong text-fg">{title}</span>
      {fields.map((f) =>
        f.type === 'number' ? (
          <NumberField
            key={f.id}
            label={f.label}
            unit={f.unit}
            value={f.value}
            minValue={f.min}
            maxValue={f.max}
            step={f.step}
            isDisabled={f.isDisabled}
            onChange={f.onChange}
          />
        ) : (
          <EntryView key={f.id} entry={f} />
        ),
      )}
      <div className="ml-auto flex items-center gap-2">
        {okBlocked && (
          <span role="status" className="max-w-64 text-ui-xs text-fg-3">
            {okUnavailableReason}
          </span>
        )}
        {preview && (
          <ToggleButton size="md" isSelected={preview.on} onChange={preview.onChange} icon="visibility">
            Preview
          </ToggleButton>
        )}
        <Button
          variant="filled"
          icon="check"
          aria-label={okBlocked ? `OK, unavailable: ${okUnavailableReason}` : 'OK'}
          aria-disabled={okBlocked ? 'true' : undefined}
          className={cx(okBlocked && 'opacity-40')}
          onPress={press}
        >
          OK
        </Button>
        <Button variant="outlined" icon="close" onPress={() => latest.current.onCancel()}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
