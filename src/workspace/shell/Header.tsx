import { useEffect, useRef, useState } from 'react'
import type { DemoRepository } from '../repository/DemoRepository'
import { clearSession } from '../sdk/session'
import { useWorkspaceStore } from '../sdk/store'
import { Icons } from '../sdk/icons'
import { GlobalSearch } from './GlobalSearch'

function RepositoryStatus({ repository }: { repository: DemoRepository }) {
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
        <span className="ws-repo-name">{repository.info.label}</span>
        <span className="ws-repo-dot" aria-hidden="true" />
        <span>{label}</span>
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

export function Header({ repository }: { repository: DemoRepository }) {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const setConfiguration = useWorkspaceStore((s) => s.setConfiguration)
  const setScenario = useWorkspaceStore((s) => s.setScenario)
  const { project, configurations, scenarios } = model.snapshot

  return (
    <header className="ws-header">
      <div className="ws-brand">
        <span className="ws-brand-mark" aria-hidden="true">
          <Icons.cube width={16} height={16} />
        </span>
        <span>Engineering Workspace</span>
      </div>
      <div className="ws-header-context" aria-label="Shared context">
        <div className="ws-ctx">
          <span className="ws-ctx-label">Project</span>
          <span className="ws-ctx-value">
            <span className="ws-mono">{project.id}</span> {project.name}
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
          <span className="ws-ctx-value ws-mono" data-testid="model-revision">
            {model.revision}
          </span>
        </div>
      </div>
      <div className="ws-header-right">
        <GlobalSearch />
        <RepositoryStatus repository={repository} />
      </div>
    </header>
  )
}
