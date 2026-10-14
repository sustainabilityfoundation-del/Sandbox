// Standalone development harness: this tool alone, on a mock platform host with sample data.
// Requirements come from the Requirements API (default, `npm run dev:api`) or, only when chosen
// with ?mode=demo, from the explicit in-browser demo adapter. An API failure never switches mode.
import '@ews/design-system/styles.css'
import { Badge, Select } from '@ews/design-system'
import { mountHarness } from '@ews/platform-sdk/harness'
import { createDemoRequirementsService, createHttpRequirementsService } from '@ews/requirements-client'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { requirementsTool } from '../src'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') === 'demo' ? 'demo' : 'api'
const user = params.get('user') ?? 'eli'
const USERS = ['ada', 'rui', 'eli', 'rho', 'nia']

const requirements =
  mode === 'demo' ? createDemoRequirementsService({ latencyMs: 80 }) : createHttpRequirementsService({ baseUrl: '/api/requirements/v1', devUser: user, onStreamStatus: (_p, s, e) => window.dispatchEvent(new CustomEvent('req-stream', { detail: { s, e } })) })

function ServiceBar() {
  const [stream, setStream] = useState<string>('connecting')
  const [health, setHealth] = useState<string>('checking')
  useEffect(() => {
    const on = (e: Event) => setStream((e as CustomEvent).detail.s)
    window.addEventListener('req-stream', on)
    if (mode === 'api') fetch('/api/health').then((r) => setHealth(r.ok ? 'API reachable' : `API ${r.status}`), () => setHealth('API not reachable — start it with npm run dev:api'))
    return () => window.removeEventListener('req-stream', on)
  }, [])
  const go = (next: { mode?: string; user?: string }) => {
    const p = new URLSearchParams(location.search)
    if (next.mode) p.set('mode', next.mode)
    if (next.user) p.set('user', next.user)
    location.search = p.toString()
  }
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-3 px-3 py-1 text-ui-sm text-fg" role="group" aria-label="Requirements service (harness)">
      <strong>Requirements service</strong>
      <Select ariaLabel="Service mode" size="sm" value={mode} onChange={(m) => go({ mode: m })} options={[{ id: 'api', label: 'API (PostgreSQL)' }, { id: 'demo', label: 'Demo (in browser)' }]} />
      {mode === 'api' && (
        <>
          <Select ariaLabel="Development user" size="sm" value={user} onChange={(u) => go({ user: u })} options={USERS.map((u) => ({ id: u, label: `X-Dev-User: ${u}` }))} />
          <Badge tone={health === 'API reachable' ? 'success' : 'danger'}>{health}</Badge>
          <Badge tone={stream === 'open' ? 'success' : 'warning'}>events: {stream}</Badge>
        </>
      )}
      {mode === 'demo' && <Badge tone="warning">Demo data, chosen explicitly</Badge>}
    </div>
  )
}

createRoot(document.getElementById('service-bar')!).render(<ServiceBar />)
mountHarness(requirementsTool, document.getElementById('root')!, { services: { requirements } })
