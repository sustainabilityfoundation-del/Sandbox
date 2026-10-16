import { useEffect, useState } from 'react'
import type { DemoRepository } from '@ews/model-service'
import { create } from 'zustand'
import { useWorkspaceStore } from '../platform/store'
import { AppIcon, Avatar, Button, Dialog, Icon, IconButton, Notice, PopoverButton, Select, cx } from '@ews/design-system'
import { PLANS, canOpenTool, useEntitlements } from '../platform/entitlements'
import { openToolOrExplain } from '../platform/api'
import { isDemoTool } from '../platform/demoTools'
import { getTools } from '../platform/registry'
import { serviceSettings } from '../platform/services'
import { GlobalSearch } from './GlobalSearch'
import type { ViewportMode } from './layout/viewport'
import { showDockTab } from './layout/presets'
import { DisplaySettings, WindowsMenu } from './ShellParts'
import { BaselinesMenu } from './Baselines'
import { ServicesMenu } from './ServicesMenu'
import { SaveStatus } from './StatusBar'
import { HelpMenu } from '../help/HelpMenu'
import { ProjectSwitcher } from '../projects/ProjectHome'
import { useCurrentProject } from '../projects/bootstrap'
import { SettingsButton } from '../settings/SettingsButton'
import { useSettingsCentre } from '../settings/SettingsCentre'

/** Project, configuration and scenario; inline on wide headers, in a popover on phones. */
function ContextFields({ stacked = false }: { stacked?: boolean }) {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const setConfiguration = useWorkspaceStore((s) => s.setConfiguration)
  const setScenario = useWorkspaceStore((s) => s.setScenario)
  const { project, configurations, scenarios } = model.snapshot
  const opened = useCurrentProject((s) => s.opened)
  return (
    <div className={stacked ? 'flex flex-col gap-3' : 'ws-header-context'} aria-label="Shared context" role="group">
      <div className="ws-ctx ws-ctx-project">
        {stacked && <span className="ws-ctx-label">Project</span>}
        <span className="ws-ctx-value">
          {/* Project switcher and Project Home entry (CR-PM-WS-1); the twin's own project label without Project Management. */}
          {opened ? (
            <ProjectSwitcher />
          ) : (
            <span className="ws-project-static" title={`${project.id} ${project.name}`}>
              <AppIcon name="project" size={16} />
              <span className="font-mono">{project.id}</span> <span className="ws-ctx-project-name">{project.name}</span>
            </span>
          )}
        </span>
      </div>
      <Select
        label={stacked ? 'Configuration' : undefined}
        ariaLabel="Configuration"
        size={stacked ? 'md' : 'sm'}
        className={stacked ? undefined : 'ws-ctx-select ws-ctx-config'}
        value={context.configurationId}
        onChange={setConfiguration}
        options={configurations.map((c) => ({ id: c.id, label: `${c.id} · ${c.name}`, textValue: `${c.id} ${c.name}` }))}
      />
      <Select
        label={stacked ? 'Scenario' : undefined}
        ariaLabel="Scenario"
        size={stacked ? 'md' : 'sm'}
        className={stacked ? undefined : 'ws-ctx-select ws-ctx-scenario'}
        value={context.scenarioId}
        onChange={setScenario}
        options={scenarios.map((s) => ({ id: s.id, label: s.name }))}
      />
      {stacked && (
        <div className="ws-ctx">
          <span className="ws-ctx-label">Model rev</span>
          <span className="ws-ctx-value font-mono">{model.revision}</span>
        </div>
      )}
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

/**
 * Module navigation in the header (wide screens; the navigation rail always has it). Built from the tool registry
 * and the subscription, so a newly installed or entitled module appears without shell changes.
 */
function ModuleNav() {
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  useEntitlements((s) => s.plan.id)
  return (
    <nav className="ws-module-nav" aria-label="Modules (header)">
      <div className="ws-module-nav-inner">
      {getTools().map((tool) => {
        const active = tool.id === activeToolId
        const allowed = canOpenTool(tool.id)
        return (
          <Button
            key={tool.id}
            variant="quiet"
            size="sm"
            aria-current={active ? 'page' : undefined}
            aria-label={`${tool.name}${isDemoTool(tool.id) ? ' (demo)' : ''}${allowed ? '' : ' (not in your subscription)'}`}
            onPress={() => openToolOrExplain(tool.id)}
            className={cx('ws-module-link', active && 'is-active')}
          >
            <AppIcon name={tool.icon} size={16} />
            <span>{tool.name}</span>
            {!allowed && <AppIcon name="locked" size={12} />}
          </Button>
        )
      })}
      </div>
    </nav>
  )
}

/** Notifications: new Activity entries since the panel was last opened in this window. */
const useSeenActivity = create<{ seen: string | null; markSeen: (id: string | null) => void }>()((set) => ({
  seen: null,
  markSeen: (seen) => set({ seen }),
}))

function Notifications() {
  const activity = useWorkspaceStore((s) => s.activity)
  const seen = useSeenActivity((s) => s.seen)
  const markSeen = useSeenActivity((s) => s.markSeen)
  // Everything loaded at start-up counts as seen.
  useEffect(() => {
    if (seen === null && activity.length) markSeen(activity[0]!.id)
  }, [seen, activity, markSeen])
  const index = seen ? activity.findIndex((a) => a.id === seen) : 0
  const fresh = index < 0 ? activity.length : index
  return (
    <span className="relative inline-flex">
      <IconButton
        label={fresh ? `Notifications: ${fresh} new activity entr${fresh === 1 ? 'y' : 'ies'}` : 'Notifications: no new activity'}
        icon="notifications"
        onPress={() => {
          markSeen(activity[0]?.id ?? null)
          showDockTab('activity')
        }}
      />
      {fresh > 0 && (
        <span className="ws-nav-badge ws-header-badge" aria-hidden="true">
          {fresh > 9 ? '9+' : fresh}
        </span>
      )}
    </span>
  )
}

/** Demo subscription switcher. The real subscription would come from the account service. */
function SubscriptionMenu({ compact }: { compact: boolean }) {
  const plan = useEntitlements((s) => s.plan)
  const setPlan = useEntitlements((s) => s.setPlan)
  return (
    <span data-help-id="platform.header.subscription">
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
    </span>
  )
}

/** The development identity the backend sees (there is no real sign-in yet). */
function Account() {
  const user = serviceSettings.devUser
  return (
    <PopoverButton
      label={`Account: ${user} (development identity)`}
      title="Account"
      text={<Avatar name={user} size={26} />}
      triggerClassName="ws-account-button"
    >
      <div className="flex flex-col gap-3 text-ui-sm">
        <div className="flex items-center gap-3">
          <Avatar name={user} size={36} />
          <div>
            <strong className="block font-medium">{user}</strong>
            <span className="text-fg-3">Development identity</span>
          </div>
        </div>
        <p className="m-0 text-fg-2">
          Requests to the backend are sent as this development user (Requirements service menu). There is no real sign-in or
          account service yet.
        </p>
        <Button size="sm" icon="settings" onPress={() => useSettingsCentre.getState().show()} className="self-start">
          Settings…
        </Button>
      </div>
    </PopoverButton>
  )
}

/**
 * Global application header (brief §4 A): a compact dark-slate bar with identity, project, configuration and
 * scenario, module navigation (wide screens), search and commands, notifications, baselines, subscription and
 * services, windows, display, settings, help and the account.
 */
export function Header({ repository, mode, onOpenPalette }: { repository: DemoRepository; mode: ViewportMode; onOpenPalette?: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const phone = mode === 'phone'

  return (
    <header className="ws-header ws-shell-scope" data-mode={mode}>
      <div className="ws-brand">
        <span className="ws-brand-mark" aria-hidden="true">
          <Icon name="workspace" size={20} />
        </span>
        <span className="ws-brand-name">Engineering Workspace</span>
      </div>
      {phone ? <ContextChip /> : <ContextFields />}
      {!phone && (
        <span data-help-id="platform.header.baselines" className="inline-flex">
          <BaselinesMenu compact />
        </span>
      )}
      {mode === 'desktop' && <ModuleNav />}
      <div className="ws-header-right">
        {phone ? (
          <IconButton label="Search objects and outputs" icon="search" onPress={() => setSearchOpen(true)} />
        ) : (
          <div className="ws-header-search">
            <GlobalSearch />
          </div>
        )}
        {onOpenPalette && !phone && (
          <IconButton label="Tools and commands" icon="command" shortcut="Control+K" onPress={onOpenPalette} className="ws-palette-button" />
        )}
        {!phone && <Notifications />}
        {phone && <SaveStatus repository={repository} compact />}
        <SubscriptionMenu compact={phone || mode !== 'desktop'} />
        <span data-help-id="platform.header.services" className="inline-flex">
          <ServicesMenu compact={phone || mode !== 'desktop'} />
        </span>
        {!phone && <WindowsMenu />}
        <DisplaySettings mode={mode} />
        <SettingsButton />
        <HelpMenu />
        {!phone && <Account />}
      </div>
      <Dialog title="Search" isOpen={searchOpen} onOpenChange={setSearchOpen}>
        {(close) => <GlobalSearch autoFocus onDone={close} />}
      </Dialog>
    </header>
  )
}
