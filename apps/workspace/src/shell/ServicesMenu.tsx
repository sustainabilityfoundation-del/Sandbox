import { Badge, Notice, PopoverButton, Select } from '@ews/design-system'
import { useEffect, useState } from 'react'
import { DEV_USERS, checkApiHealth, saveServiceSettings, serviceSettings, useServiceStatus, type RequirementsMode } from '../platform/services'

/**
 * Requirements service connection: API (PostgreSQL backend) or explicit demo
 * data, and the development identity sent to the backend. Changing either
 * reloads all windows.
 */
export function ServicesMenu({ compact }: { compact: boolean }) {
  const { requirementsMode: mode, devUser } = serviceSettings
  const stream = useServiceStatus((s) => s.stream)
  const [health, setHealth] = useState<'checking' | 'ok' | 'down'>(mode === 'api' ? 'checking' : 'ok')
  useEffect(() => {
    if (mode !== 'api') return
    let alive = true
    void checkApiHealth().then((ok) => alive && setHealth(ok ? 'ok' : 'down'))
    return () => {
      alive = false
    }
  }, [mode])

  const state = mode === 'demo' ? 'demo' : health === 'down' ? 'down' : health === 'checking' ? 'checking' : 'ok'
  const summary = mode === 'demo' ? 'Demo data' : state === 'down' ? 'API not reachable' : `API as ${devUser}`
  return (
    <PopoverButton
      label={`Requirements service: ${summary}`}
      title="Requirements service"
      icon="requirements"
      // Normal operation is icon-only to save header space; demo mode and outages are always spelled out.
      text={compact || state === 'ok' || state === 'checking' ? undefined : <span className="whitespace-nowrap text-ui-sm">{summary}</span>}
      triggerClassName="ws-subscription-button"
    >
      <div className="flex max-w-80 flex-col gap-3 text-ui-sm" data-testid="services-menu" data-service-state={state}>
        <Select
          label="Requirements data"
          value={mode}
          onChange={(m) => saveServiceSettings({ ...serviceSettings, requirementsMode: m as RequirementsMode })}
          options={[
            { id: 'api', label: 'API (PostgreSQL)', description: 'Default. Start it with npm run dev:api.' },
            { id: 'demo', label: 'Demo (in this browser)', description: 'Sample data only; nothing reaches the backend.' },
          ]}
        />
        {mode === 'api' && (
          <>
            <Select
              label="Development user"
              value={devUser}
              onChange={(u) => saveServiceSettings({ ...serviceSettings, devUser: u })}
              options={DEV_USERS.map((u) => ({ id: u.id, label: u.label }))}
            />
            <div className="flex flex-wrap gap-2">
              <Badge tone={state === 'ok' ? 'success' : state === 'down' ? 'danger' : 'neutral'}>
                {state === 'ok' ? 'API reachable' : state === 'down' ? 'API not reachable' : 'Checking API…'}
              </Badge>
              <Badge tone={stream === 'open' ? 'success' : stream === 'idle' ? 'neutral' : 'warning'}>Updates: {stream}</Badge>
            </div>
            {state === 'down' && (
              <Notice tone="danger" title="Requirements unavailable">
                The workspace does not switch to demo data on its own. Start the backend with npm run dev:api, or choose Demo explicitly.
              </Notice>
            )}
            <p className="m-0 text-fg-3">
              Development identities only. The backend enforces roles and subscriptions; production uses single sign-on instead.
            </p>
          </>
        )}
        {mode === 'demo' && (
          <Notice tone="warning" title="Demo data">
            Requirements come from sample data in this browser, chosen explicitly. Changes are not saved to the backend.
          </Notice>
        )}
      </div>
    </PopoverButton>
  )
}
