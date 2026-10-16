import { useState } from 'react'
import type { DemoRepository } from '@ews/model-service'
import { displayId } from '@ews/model-service'
import { Button, Checkbox, Icon, PopoverButton, StatusBadge, StatusBarItem, StatusBarSeparator, cx } from '@ews/design-system'
import { useConversation } from '../assistant/conversation'
import { clearSession } from '../platform/session'
import { getTool } from '../platform/registry'
import { useWorkspaceStore } from '../platform/store'
import { showDockTab } from './layout/presets'
import { useValidationSummary } from './ValidationPanel'

/** Save and synchronisation state of the repository, with the demo repository's controls in its popover. */
export function SaveStatus({ repository, compact = false }: { repository: DemoRepository; compact?: boolean }) {
  const pending = useWorkspaceStore((s) => s.pendingWrites)
  const lastError = useWorkspaceStore((s) => s.lastWriteError)
  const dismissWriteError = useWorkspaceStore((s) => s.dismissWriteError)
  const [offline, setOffline] = useState(repository.offline)
  const [resetting, setResetting] = useState(false)
  const status = offline ? 'save-failed' : pending > 0 ? 'saving' : lastError ? 'save-failed' : 'saved'
  const label = offline ? 'Offline (simulated)' : pending > 0 ? 'Saving…' : lastError ? 'Last save failed' : 'Saved'
  const icon = offline ? 'offline' : pending > 0 ? 'sync' : lastError ? 'error' : 'saved'

  return (
    <PopoverButton
      label={`${repository.info.label}: ${label}`}
      title={repository.info.label}
      placement="top start"
      text={
        <span className="ws-repo-pill flex items-center gap-1.5" data-state={status}>
          <span className={cx('ws-repo-dot size-2 rounded-full', `is-${status}`)} aria-hidden="true" />
          <Icon name={icon} size={14} className={pending > 0 ? 'ws-spin' : undefined} />
          <span className={compact ? 'sr-only' : 'whitespace-nowrap'}>{label}</span>
        </span>
      }
      triggerClassName={compact ? undefined : 'ws-status-trigger'}
    >
      <div className="flex flex-col gap-3 text-ui-sm">
        <StatusBadge status={status} label={label} />
        <p className="m-0 text-fg-2">{repository.info.description} No real backend or authentication is involved.</p>
        {lastError && (
          <div className="flex items-start gap-2 rounded-field bg-error-soft p-2 text-error">
            <span className="flex-1">{lastError}</span>
            <Button size="sm" variant="text" onPress={dismissWriteError}>
              Dismiss
            </Button>
          </div>
        )}
        <Checkbox
          isSelected={offline}
          onChange={(value) => {
            repository.offline = value
            setOffline(value)
          }}
        >
          Simulate repository outage
        </Checkbox>
        <Button
          size="sm"
          variant="outlined"
          icon="reset"
          isPending={resetting}
          onPress={async () => {
            setResetting(true)
            await repository.reset()
            clearSession()
            window.location.reload()
          }}
        >
          Reset demo data
        </Button>
      </div>
    </PopoverButton>
  )
}

/**
 * Bottom status bar (brief §4 G): save state, configuration, model revision, validation, background work, active
 * module and selection. Every item pairs an icon with text, so nothing depends on colour alone.
 */
export function StatusBar({ repository }: { repository: DemoRepository }) {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const pending = useWorkspaceStore((s) => s.pendingWrites)
  const running = useConversation((s) => s.running !== null)
  const { stale, writeError } = useValidationSummary()
  const configuration = model.snapshot.configurations.find((c) => c.id === context.configurationId)
  const selected = context.selectedIds.map((id) => model.get(id)).filter((o) => !!o)
  const tool = getTool(activeToolId)
  const issues = stale.length + (writeError ? 1 : 0)
  const background = running ? 'Assistant working' : pending > 0 ? `Saving ${pending} change${pending === 1 ? '' : 's'}` : 'Idle'

  return (
    <footer className="ws-statusbar" aria-label="Status bar" data-help-id="platform.statusbar">
      <SaveStatus repository={repository} />
      <StatusBarSeparator />
      <StatusBarItem icon="branch" label={`Configuration ${context.configurationId}${configuration ? ` ${configuration.name}` : ''}`}>
        {context.configurationId}
        <span className="ws-status-extra">{configuration ? ` · ${configuration.name}` : ''}</span>
      </StatusBarItem>
      <StatusBarItem icon="history" label={`Model revision ${model.revision}`}>
        Rev <span className="font-mono" data-testid="model-revision">{model.revision}</span>
      </StatusBarItem>
      <StatusBarSeparator />
      <StatusBarItem
        icon={issues ? 'warning' : 'success'}
        tone={issues ? 'warning' : 'success'}
        onPress={() => showDockTab('validation')}
        label={issues ? `${issues} validation issue${issues === 1 ? '' : 's'}: open the Validation panel` : 'No validation issues: open the Validation panel'}
        testId="status-validation"
      >
        {issues ? `${issues} issue${issues === 1 ? '' : 's'}` : 'No issues'}
      </StatusBarItem>
      <StatusBarItem icon={running || pending > 0 ? 'spinner' : 'check'} spin={running || pending > 0} tone={running || pending > 0 ? 'info' : 'neutral'} label={`Background work: ${background}`}>
        {background}
      </StatusBarItem>
      <span className="flex-1" />
      {tool && (
        <StatusBarItem icon={tool.icon} label={`Active module ${tool.name} ${tool.version}`} className="ws-status-extra">
          {tool.name} <span className="text-fg-3">v{tool.version}</span>
        </StatusBarItem>
      )}
      <StatusBarSeparator />
      <StatusBarItem icon="select" label={`Selection: ${selected.length === 0 ? 'none' : selected.map((o) => `${displayId(o!)} ${o!.name}`).join(', ')}`} className="ws-status-selection">
        {selected.length === 0 ? 'No selection' : selected.length === 1 ? (
          <>
            <span className="font-mono">{displayId(selected[0]!)}</span> {selected[0]!.name}
          </>
        ) : (
          `${selected.length} objects`
        )}
      </StatusBarItem>
    </footer>
  )
}
