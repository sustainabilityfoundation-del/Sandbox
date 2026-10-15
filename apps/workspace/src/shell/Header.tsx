import { useState } from 'react'
import type { DemoRepository } from '@ews/model-service'
import { clearSession } from '../platform/session'
import { useWorkspaceStore } from '../platform/store'
import { Button, Checkbox, Dialog, Icon, IconButton, Notice, PopoverButton, Select, StatusBadge, cx } from '@ews/design-system'
import { PLANS, useEntitlements } from '../platform/entitlements'
import { GlobalSearch } from './GlobalSearch'
import type { ViewportMode } from './layout/viewport'
import { DisplaySettings, WindowsMenu } from './ShellParts'
import { BaselinesMenu } from './Baselines'
import { ServicesMenu } from './ServicesMenu'
import { HelpMenu } from '../help/HelpMenu'
import { SettingsButton } from '../settings/SettingsButton'

/** Repository connection and save state, with demo controls. */
function RepositoryStatus({ repository, compact = false }: { repository: DemoRepository; compact?: boolean }) {
  const pending = useWorkspaceStore((s) => s.pendingWrites)
  const lastError = useWorkspaceStore((s) => s.lastWriteError)
  const dismissWriteError = useWorkspaceStore((s) => s.dismissWriteError)
  const [offline, setOffline] = useState(repository.offline)
  const [resetting, setResetting] = useState(false)
  const status = offline ? 'save-failed' : pending > 0 ? 'saving' : lastError ? 'save-failed' : 'saved'
  const label = offline ? 'Offline (simulated)' : pending > 0 ? 'Saving…' : lastError ? 'Last save failed' : 'Saved'

  return (
    <PopoverButton
      label={`${repository.info.label}: ${label}`}
      title={repository.info.label}
      text={
        <span className="ws-repo-pill flex items-center gap-2" data-state={status}>
          <Icon name="repository" size={18} />
          {!compact && <span className="ws-repo-name whitespace-nowrap font-medium">{repository.info.label}</span>}
          <span className={cx('ws-repo-dot size-2 rounded-full', `is-${status}`)} aria-hidden="true" />
          <span className={compact ? 'sr-only' : 'whitespace-nowrap text-ui-xs'}>{label}</span>
        </span>
      }
      triggerClassName="border border-header-line bg-header-input text-header-fg"
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

/** Configuration, scenario and revision; inline on wide headers, in a popover on phones. */
function ContextFields({ stacked = false }: { stacked?: boolean }) {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const setConfiguration = useWorkspaceStore((s) => s.setConfiguration)
  const setScenario = useWorkspaceStore((s) => s.setScenario)
  const { project, configurations, scenarios } = model.snapshot
  return (
    <div className={stacked ? 'flex flex-col gap-3' : 'ws-header-context'} aria-label="Shared context" role="group">
      <div className="ws-ctx ws-ctx-project">
        <span className="ws-ctx-label">Project</span>
        <span className="ws-ctx-value">
          <span className="font-mono">{project.id}</span> <span className="ws-ctx-project-name">{project.name}</span>
        </span>
      </div>
      <Select
        label={stacked ? 'Configuration' : undefined}
        ariaLabel="Configuration"
        size={stacked ? 'md' : 'sm'}
        className={stacked ? undefined : 'ws-ctx-select'}
        value={context.configurationId}
        onChange={setConfiguration}
        options={configurations.map((c) => ({ id: c.id, label: `${c.id} · ${c.name}`, textValue: `${c.id} ${c.name}` }))}
      />
      <Select
        label={stacked ? 'Scenario' : undefined}
        ariaLabel="Scenario"
        size={stacked ? 'md' : 'sm'}
        className={stacked ? undefined : 'ws-ctx-select'}
        value={context.scenarioId}
        onChange={setScenario}
        options={scenarios.map((s) => ({ id: s.id, label: s.name }))}
      />
      <div className="ws-ctx">
        <span className="ws-ctx-label">Model rev</span>
        <span className="ws-ctx-value font-mono" data-testid={stacked ? undefined : 'model-revision'}>
          {model.revision}
        </span>
      </div>
    </div>
  )
}

/** Phone header: configuration, active object and revision stay visible; tap for the context controls. */
function ContextChip() {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const selected = context.selectedIds.map((id) => model.get(id)).filter(Boolean)
  const summary =
    selected.length === 0 ? 'No selection' : selected.length === 1 ? `${selected[0]!.id} ${selected[0]!.name}` : `${selected.length} objects`
  return (
    <PopoverButton
      label={`Context: ${context.configurationId}, ${summary}. Change configuration or scenario`}
      title="Context"
      placement="bottom start"
      triggerClassName="min-w-0 max-w-[58vw] border border-header-line bg-header-input text-header-fg"
      text={
        <span className="flex min-w-0 items-center gap-1.5 text-ui-sm" data-testid="context-chip">
          <span className="flex-none whitespace-nowrap font-mono">{context.configurationId}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{summary}</span>
          <span className="flex-none font-mono text-header-fg-2" data-testid="model-revision">
            r{model.revision}
          </span>
        </span>
      }
    >
      <ContextFields stacked />
    </PopoverButton>
  )
}

/** Demo subscription switcher. The real subscription would come from the account service. */
function SubscriptionMenu({ compact }: { compact: boolean }) {
  const plan = useEntitlements((s) => s.plan)
  const setPlan = useEntitlements((s) => s.setPlan)
  return (
    <PopoverButton
      label={`Subscription: ${plan.name} (demo)`}
      title="Subscription (demo)"
      icon="subscription"
      text={compact ? undefined : <span className="whitespace-nowrap text-ui-sm">{plan.name}</span>}
      triggerClassName="ws-subscription-button"
    >
      <div className="flex max-w-80 flex-col gap-3 text-ui-sm">
        <Select
          label="Subscription (demo)"
          value={plan.id}
          onChange={setPlan}
          options={PLANS.map((p) => ({ id: p.id, label: p.name, description: p.description }))}
        />
        <p className="m-0 text-fg-2">
          Tools outside the subscription are shown locked. Their data is never deleted; it stays visible in the product tree and
          inspector and becomes editable again when access returns. Open windows update immediately.
        </p>
        <Notice tone="warning" title="Prototype only">
          This check runs in the browser. In production, entitlements and permissions are enforced by the backend on every
          operation and file access.
        </Notice>
      </div>
    </PopoverButton>
  )
}

export function Header({ repository, mode, onOpenPalette }: { repository: DemoRepository; mode: ViewportMode; onOpenPalette?: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const phone = mode === 'phone'

  return (
    <header className="ws-header" data-mode={mode}>
      <div className="ws-brand">
        <span className="ws-brand-mark" aria-hidden="true">
          <Icon name="workspace" size={20} />
        </span>
        <span className="ws-brand-name">Engineering Workspace</span>
      </div>
      {phone ? <ContextChip /> : <ContextFields />}
      <div className="ws-header-right">
        {phone ? (
          <IconButton label="Search objects and outputs" icon="search" onPress={() => setSearchOpen(true)} />
        ) : (
          <GlobalSearch />
        )}
        {onOpenPalette && !phone && (
          <Button variant="quiet" icon="command" onPress={onOpenPalette} aria-label="Tools and commands (Ctrl+K)" className="ws-palette-button">
            <span className="ws-palette-text">Commands</span>
            <kbd className="ws-kbd">Ctrl K</kbd>
          </Button>
        )}
        {!phone && <BaselinesMenu compact={mode !== 'desktop'} />}
        <SubscriptionMenu compact={phone || mode === 'tablet'} />
        <ServicesMenu compact={phone || mode !== 'desktop'} />
        {!phone && <WindowsMenu />}
        <DisplaySettings mode={mode} />
        <RepositoryStatus repository={repository} compact={phone || mode === 'tablet'} />
        <SettingsButton />
        <HelpMenu />
      </div>
      <Dialog title="Search" isOpen={searchOpen} onOpenChange={setSearchOpen}>
        {(close) => <GlobalSearch autoFocus onDone={close} />}
      </Dialog>
    </header>
  )
}
