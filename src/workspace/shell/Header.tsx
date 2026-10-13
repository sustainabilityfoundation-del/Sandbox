import { useEffect, useRef, useState } from 'react'
import type { DemoRepository } from '../repository/DemoRepository'
import { clearSession } from '../sdk/session'
import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { GlobalSearch } from './GlobalSearch'
import type { ViewportMode } from './layout/viewport'
import { Dialog, Menu } from './primitives'
import { DisplayMenu, WindowsMenu } from './ShellParts'

function RepositoryStatus({ repository, compact = false }: { repository: DemoRepository; compact?: boolean }) {
  const pending = useWorkspaceStore((s) => s.pendingWrites)
  const lastError = useWorkspaceStore((s) => s.lastWriteError)
  const dismissWriteError = useWorkspaceStore((s) => s.dismissWriteError)
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(repository.offline)
  const [resetting, setResetting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const state = offline ? 'offline' : pending > 0 ? 'saving' : lastError ? 'error' : 'synced'
  const label = { offline: 'Offline (simulated)', saving: 'Saving…', error: 'Last save failed', synced: 'Synced' }[state]

  return (
    <div className="ws-repo" ref={ref}>
      <button
        type="button"
        className={`ws-repo-pill is-${state}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={repository.info.description}
      >
        <Icons.database width={14} height={14} />
        <span className={compact ? 'sr-only' : 'ws-repo-name'}>{repository.info.label}</span>
        <span className="ws-repo-dot" aria-hidden="true" />
        <span className={compact ? 'sr-only' : undefined}>{label}</span>
      </button>
      {open && (
        <div className="ws-popover ws-repo-menu" role="dialog" aria-label="Repository">
          <strong>{repository.info.label}</strong>
          <p className="ws-muted">{repository.info.description} No real backend or authentication is involved.</p>
          {lastError && (
            <div className="ws-repo-error">
              {lastError}{' '}
              <button type="button" className="ws-link" onClick={dismissWriteError}>
                Dismiss
              </button>
            </div>
          )}
          <label className="ws-check">
            <input
              type="checkbox"
              checked={offline}
              onChange={(e) => {
                repository.offline = e.target.checked
                setOffline(e.target.checked)
              }}
            />
            Simulate repository outage
          </label>
          <button
            type="button"
            className="ws-button ws-button-small"
            disabled={resetting}
            onClick={async () => {
              setResetting(true)
              await repository.reset()
              clearSession()
              window.location.reload()
            }}
          >
            Reset demo data
          </button>
        </div>
      )}
    </div>
  )
}

/** Configuration, scenario and revision controls; shown inline on wide headers and in a menu on phones. */
function ContextFields({ stacked = false }: { stacked?: boolean }) {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const setConfiguration = useWorkspaceStore((s) => s.setConfiguration)
  const setScenario = useWorkspaceStore((s) => s.setScenario)
  const { project, configurations, scenarios } = model.snapshot
  return (
    <div className={stacked ? 'ws-ctx-stack' : 'ws-header-context'} aria-label="Shared context">
      <div className="ws-ctx ws-ctx-project">
        <span className="ws-ctx-label">Project</span>
        <span className="ws-ctx-value">
          <span className="ws-mono">{project.id}</span> <span className="ws-ctx-project-name">{project.name}</span>
        </span>
      </div>
      <label className="ws-ctx">
        <span className="ws-ctx-label">Configuration</span>
        <select value={context.configurationId} onChange={(e) => setConfiguration(e.target.value)}>
          {configurations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} · {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="ws-ctx">
        <span className="ws-ctx-label">Scenario</span>
        <select value={context.scenarioId} onChange={(e) => setScenario(e.target.value)}>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="ws-ctx">
        <span className="ws-ctx-label">Model rev</span>
        <span className="ws-ctx-value ws-mono" data-testid={stacked ? undefined : 'model-revision'}>
          {model.revision}
        </span>
      </div>
    </div>
  )
}

/** Phone header: keeps the configuration and active object visible; tapping opens the context controls. */
function ContextChip() {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const selected = context.selectedIds.map((id) => model.get(id)).filter(Boolean)
  const text = (
    <span className="ws-ctx-chip" data-testid="context-chip">
      <span className="ws-mono">{context.configurationId}</span>
      <span aria-hidden="true">·</span>
      <span className="truncate">
        {selected.length === 0 ? 'No selection' : selected.length === 1 ? `${selected[0]!.id} ${selected[0]!.name}` : `${selected.length} objects`}
      </span>
      <span className="ws-mono ws-ctx-chip-rev" data-testid="model-revision">
        r{model.revision}
      </span>
    </span>
  )
  return (
    <Menu label="Configuration, scenario and selection" text={text} tone="header" align="start" className="min-w-0">
      {() => <ContextFields stacked />}
    </Menu>
  )
}

export function Header({ repository, mode }: { repository: DemoRepository; mode: ViewportMode }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const phone = mode === 'phone'

  return (
    <header className="ws-header" data-mode={mode}>
      <div className="ws-brand">
        <span className="ws-brand-mark" aria-hidden="true">
          <Icons.cube width={16} height={16} />
        </span>
        <span className="ws-brand-name">Engineering Workspace</span>
      </div>
      {phone ? <ContextChip /> : <ContextFields />}
      <div className="ws-header-right">
        {phone ? (
          <button type="button" className="ws-header-icon" aria-label="Search" title="Search" onClick={() => setSearchOpen(true)}>
            <Icons.search width={17} height={17} aria-hidden="true" />
          </button>
        ) : (
          <GlobalSearch />
        )}
        {!phone && <WindowsMenu />}
        <DisplayMenu mode={mode} />
        <RepositoryStatus repository={repository} compact={phone} />
      </div>
      {searchOpen && (
        <Dialog title="Search" onClose={() => setSearchOpen(false)}>
          <div className="ws-search-sheet">
            <GlobalSearch autoFocus onDone={() => setSearchOpen(false)} />
          </div>
        </Dialog>
      )}
    </header>
  )
}
