// Standalone harness: the System Model alone, on a mock platform host.
// Default: local mode (the repository runs in this browser, persisted in localStorage, seeded with
// the actuator example). ?mode=api&user=eli uses the SysML API (proxied /api). Never switches silently.
import '@ews/design-system/styles.css'
import { Badge, Button, Select } from '@ews/design-system'
import { mountHarness } from '@ews/platform-sdk/harness'
import { createHttpSysmlClient, createLocalSysmlClient } from '@ews/sysml-client'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createSysmlModelerTool } from '../src'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') === 'api' ? 'api' : 'local'
const user = params.get('user') ?? 'eli'
const USERS = ['ada', 'rui', 'eli', 'rho', 'nia']
const local = mode === 'local' ? createLocalSysmlClient({ seed: true, storage: window.localStorage, storageKey: 'ews.harness.sysml-modeler.local.v1' }) : undefined
const client = local ?? createHttpSysmlClient({ baseUrl: '/api/sysml/v1', devUser: user })
const tool = createSysmlModelerTool({ client })

function ServiceBar() {
  const [health, setHealth] = useState(mode === 'api' ? 'checking' : 'local')
  useEffect(() => {
    if (mode === 'api') fetch('/api/health').then((r) => setHealth(r.ok ? 'API reachable' : `API ${r.status}`), () => setHealth('API not reachable: start it with npm run dev:api'))
  }, [])
  const go = (next: { mode?: string; user?: string }) => {
    const p = new URLSearchParams(location.search)
    if (next.mode) p.set('mode', next.mode)
    if (next.user) p.set('user', next.user)
    location.search = p.toString()
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-3 px-3 py-1 text-ui-sm text-fg" role="group" aria-label="SysML service (harness)">
      <strong>SysML service</strong>
      <Select ariaLabel="Service mode" size="sm" value={mode} onChange={(m) => go({ mode: m })} options={[{ id: 'local', label: 'Local (this browser)' }, { id: 'api', label: 'API (PostgreSQL)' }]} />
      {mode === 'api' ? (
        <>
          <Select ariaLabel="Development user" size="sm" value={user} onChange={(u) => go({ user: u })} options={USERS.map((u) => ({ id: u, label: `X-Dev-User: ${u}` }))} />
          <Badge tone={health === 'API reachable' ? 'success' : 'danger'}>{health}</Badge>
        </>
      ) : (
        <>
          <Badge tone="warning">Local repository, chosen explicitly; no access control</Badge>
          <Button size="sm" variant="text" icon="reset" onPress={() => (local?.reset(), location.reload())}>
            Reset local data
          </Button>
        </>
      )}
    </div>
  )
}

createRoot(document.getElementById('service-bar')!).render(<ServiceBar />)
mountHarness(tool, document.getElementById('root')!)
