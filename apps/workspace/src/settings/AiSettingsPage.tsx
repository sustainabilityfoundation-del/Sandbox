import { useEffect, useState } from 'react'
import { Badge, Button, Dialog, Notice, Select, Spinner, StatusBadge, TextField } from '@ews/design-system'
import type { SettingDefinition } from '@ews/platform-sdk'
import { auditRecords, chooseModel, connectApiKey, disconnect, listModels, previewRequest, startSignIn, testConnection, useAiConnection, type AuditRecord, type ProviderInfo } from '../assistant/connection'
import { captureContext, useConversation } from '../assistant/conversation'
import { availableOperations } from '../assistant/toolSpecs'
import { formatTime } from '@ews/platform-sdk/react'
import { DefinitionList, openHelp } from './SettingsCentre'
import { loadSettings, useSettingsState } from './store'

/**
 * Settings → AI and reasoning: connect the external AI service with your own account, choose the model,
 * and decide what the AI is given (per module, per operation class, data sharing, limits), with an audit
 * of recent calls. Everything here is enforced by the server; this page only edits and shows it.
 */
export function AiSettingsPage({ definitions }: { definitions: SettingDefinition[] }) {
  const { status, error, refresh } = useAiConnection()
  const settingsStatus = useSettingsState((s) => s.status)
  const settingsError = useSettingsState((s) => s.error)
  const canEditProject = useSettingsState((s) => s.canEditProject)
  useEffect(() => {
    void refresh()
    if (useSettingsState.getState().status !== 'ready') void loadSettings()
  }, [refresh])
  const userDefs = definitions.filter((d) => d.scope === 'user' && d.type !== 'secret-reference')
  const projectDefs = definitions.filter((d) => d.scope === 'project')
  const groupOf = (prefix: string) => userDefs.filter((d) => d.id.startsWith(prefix))

  return (
    <div className="ws-settings-body" data-testid="settings-ai">
      <header>
        <h2 className="ws-settings-title">AI and reasoning</h2>
        <p className="ws-settings-intro">
          Connect your own AI account and decide what the assistant may see and do. Changes are only ever prepared as previews; applying them always needs you.{' '}
          <Button size="sm" variant="text" icon="help" onPress={() => openHelp('ai.connect')}>
            How connecting works
          </Button>
        </p>
      </header>
      {status === 'unavailable' && (
        <Notice tone="warning" title="AI connection not available">
          {error}
        </Notice>
      )}
      {status === 'loading' && <Spinner label="Loading the AI connection" />}
      {status === 'ready' && <ConnectionSection />}
      {settingsStatus === 'unavailable' ? (
        <Notice tone="warning" title="Access settings not available">
          {settingsError} Without the settings service the defaults apply on the server.
        </Notice>
      ) : (
        <>
          <section className="ws-settings-group" aria-label="What the AI may access" data-help-id="ai.policy">
            <h3 className="ws-settings-h">What the AI may access</h3>
            <p className="ws-setting-help">Per module: off, read only, or read and propose changes. Modules outside your subscription are never offered, whatever you choose here.</p>
            <ModuleEntitlements />
            <DefinitionList definitions={groupOf('ai.access.')} groupHeadings={false} />
          </section>
          <section className="ws-settings-group" aria-label="Operation classes" data-help-id="ai.policy">
            <h3 className="ws-settings-h">Operation classes</h3>
            <DefinitionList definitions={groupOf('ai.operations.')} groupHeadings={false} />
          </section>
          <section className="ws-settings-group" aria-label="Data sharing" data-help-id="ai.privacy">
            <h3 className="ws-settings-h">Data sharing</h3>
            <p className="ws-setting-help">Only the context and model information a request needs is sent. Anything else the model must ask for through the allowed operations.</p>
            <DefinitionList definitions={groupOf('ai.sharing.')} groupHeadings={false} />
            <SendPreview />
          </section>
          <section className="ws-settings-group" aria-label="Limits" data-help-id="ai.policy">
            <h3 className="ws-settings-h">Limits</h3>
            <DefinitionList definitions={groupOf('ai.limits.')} groupHeadings={false} />
          </section>
          <section className="ws-settings-group" aria-label="Audit" data-help-id="ai.privacy">
            <h3 className="ws-settings-h">Audit</h3>
            <DefinitionList definitions={groupOf('ai.audit.')} groupHeadings={false} />
            <AuditView />
          </section>
          <section className="ws-settings-group" aria-label="Project limits" data-help-id="ai.policy">
            <h3 className="ws-settings-h">Project limits</h3>
            <p className="ws-setting-help">
              {canEditProject
                ? 'As administrator you set the upper limits for everyone in this project. People can only narrow them.'
                : 'Set by a project administrator. Your own choices above can only be narrower.'}
            </p>
            <details className="ws-settings-details">
              <summary>{canEditProject ? 'Edit project limits' : 'Show project limits'}</summary>
              <DefinitionList definitions={projectDefs} readOnly={!canEditProject} />
            </details>
          </section>
        </>
      )}
    </div>
  )
}

function ModuleEntitlements() {
  const policy = useAiConnection((s) => s.policy)
  const missing = policy?.modules.filter((m) => !m.entitled) ?? []
  if (!missing.length) return null
  return <p className="ws-setting-help">Not in your subscription (never offered): {missing.map((m) => m.label).join(', ')}.</p>
}

// ---- connection ----------------------------------------------------------------------------------

function ConnectionSection() {
  const { providers, connection } = useAiConnection()
  const [providerId, setProviderId] = useState(connection?.provider ?? providers[0]?.id ?? '')
  const provider = providers.find((p) => p.id === (connection?.provider ?? providerId)) ?? providers[0]
  const returned = new URLSearchParams(location.search).get('ai-connect')
  return (
    <section className="ws-settings-group" aria-label="Connection" data-help-id="ai.connect">
      <h3 className="ws-settings-h">Connection</h3>
      {returned === 'failed' && !connection && (
        <Notice tone="warning" title="Sign-in did not complete">
          Nothing was connected. Try again, or connect with an API key.
        </Notice>
      )}
      {connection ? (
        <Connected providers={providers} />
      ) : (
        <>
          {providers.length > 1 && (
            <Select label="Provider" value={provider?.id ?? null} onChange={setProviderId} options={providers.map((p) => ({ id: p.id, label: p.name, description: p.description }))} />
          )}
          {provider ? <ConnectForm provider={provider} /> : <p className="ws-setting-help">No AI provider is registered on this server.</p>}
        </>
      )}
    </section>
  )
}

function ConnectForm({ provider }: { provider: ProviderInfo }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const refresh = useAiConnection((s) => s.refresh)
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => void refresh(), 2500)
    return () => clearInterval(t)
  }, [waiting, refresh])
  return (
    <div className="flex flex-col gap-4" data-testid="ai-connect-form">
      {provider.methods.map((m) =>
        m.kind === 'oauth' ? (
          <div key={m.id} className="ws-settings-card" data-help-id="ai.connect">
            <strong>{m.label}</strong>
            <p className="ws-setting-help">{m.help}</p>
            {m.available ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="filled"
                  isPending={busy === m.id}
                  onPress={async () => {
                    setErr(null)
                    setBusy(m.id)
                    try {
                      await startSignIn(provider.id, m.id)
                      setWaiting(true)
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e))
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  {m.buttonLabel}
                </Button>
                {waiting && <span className="text-ui-sm text-fg-2">Finish signing in in the new tab; this page updates by itself.</span>}
              </div>
            ) : (
              <Notice tone="info" title="Not available here">
                This sign-in works only when the application runs locally on your computer (its server at http://127.0.0.1). Use an API key instead.
              </Notice>
            )}
          </div>
        ) : (
          <form
            key={m.id}
            className="ws-settings-card"
            data-help-id="ai.connect"
            onSubmit={async (e) => {
              e.preventDefault()
              setErr(null)
              setBusy(m.id)
              try {
                await connectApiKey(provider.id, m.id, key)
                setKey('')
              } catch (x) {
                setErr(x instanceof Error ? x.message : String(x))
              } finally {
                setBusy(null)
              }
            }}
          >
            <strong>{m.label}</strong>
            <p className="ws-setting-help">{m.help}</p>
            {m.keyUrl && (
              <a className="ws-help-link text-ui-sm" href={m.keyUrl} target="_blank" rel="noopener noreferrer">
                Create a key ({new URL(m.keyUrl).host})
              </a>
            )}
            <TextField label={m.keyLabel} type="password" autoComplete="off" spellCheck="false" value={key} onChange={setKey} placeholder="Paste the key; it is sent once to this application's server" />
            <Button type="submit" variant="filled" icon="connect" isPending={busy === m.id} isDisabled={!key.trim()}>
              Connect
            </Button>
          </form>
        ),
      )}
      {err && (
        <Notice tone="danger" title="Not connected">
          {err}
        </Notice>
      )}
    </div>
  )
}

const WELCOME_KEY = 'ews.ai.plan-welcome'

function Connected({ providers }: { providers: ProviderInfo[] }) {
  const connection = useAiConnection((s) => s.connection)!
  const provider = providers.find((p) => p.id === connection.provider)
  const method = provider?.methods.find((m) => m.id === connection.method)
  const [models, setModels] = useState<{ id: string; label: string }[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [welcome, setWelcome] = useState(false)
  const usingPlan = connection.method === 'chatgpt'
  useEffect(() => {
    if (connection.status !== 'active') return
    void listModels()
      .then((r) => setModels(r.models))
      .catch((e) => setMessage({ tone: 'danger', text: e.message }))
    if (usingPlan) {
      try {
        if (localStorage.getItem(WELCOME_KEY) !== connection.id) setWelcome(true)
      } catch {
        setWelcome(true)
      }
    }
  }, [connection.id, connection.status, usingPlan])
  const run = async (name: string, f: () => Promise<string | void>) => {
    setBusy(name)
    setMessage(null)
    try {
      const text = await f()
      if (text) setMessage({ tone: 'success', text })
    } catch (e) {
      setMessage({ tone: 'danger', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="ws-settings-card" data-testid="ai-connected">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={connection.status === 'active' ? 'saved' : 'save-failed'} label={connection.status === 'active' ? 'Connected' : connection.status === 'needs-sign-in' ? 'Sign in again' : 'Plan usage not enabled'} />
        <strong data-testid="ai-connected-account">
          {provider?.name ?? connection.provider}: {connection.account}
        </strong>
        {usingPlan && <Badge tone="info">Using ChatGPT plan</Badge>}
      </div>
      <p className="ws-setting-help">
        {usingPlan ? 'Eligible usage in this app uses your ChatGPT plan; it is separate from this application’s own subscription.' : 'Usage is billed to your provider API account (separate from a ChatGPT Plus or Pro subscription).'} Connected {formatTime(connection.connectedAt)}. The credential is stored encrypted on the server and is never shown again.
      </p>
      {connection.status !== 'active' && (
        <Notice tone="warning" title={connection.status === 'needs-sign-in' ? 'Your sign-in expired' : 'ChatGPT plan usage is not enabled'}>
          {connection.status === 'needs-sign-in' ? 'Sign in again to keep using your account.' : 'Sign in again and allow ChatGPT plan usage, or disconnect and connect an API key.'}{' '}
          {method?.kind === 'oauth' && (
            <Button size="sm" variant="tonal" onPress={() => void run('signin', () => startSignIn(connection.provider, connection.method))}>
              {method.buttonLabel}
            </Button>
          )}
        </Notice>
      )}
      {connection.status === 'active' && (
        <Select
          label="Model"
          description={`Default: ${provider?.defaultModel ?? 'provider default'}. The list comes from your account.`}
          value={connection.model}
          isDisabled={!models || busy !== null}
          onChange={(m) => void run('model', async () => (await chooseModel(m), `Model set to ${m}.`))}
          options={(models ?? [{ id: connection.model, label: connection.model }]).map((m) => ({ id: m.id, label: m.label }))}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outlined" icon="sync" isPending={busy === 'test'} isDisabled={connection.status !== 'active'} onPress={() => void run('test', async () => { const r = await testConnection(); return `Connection works (${r.latencyMs} ms, ${r.models} models available).` })}>
          Test connection
        </Button>
        {usingPlan && method?.kind === 'oauth' && method.manageUsageUrl && (
          <a className="ws-help-link self-center text-ui-sm" href={method.manageUsageUrl} target="_blank" rel="noopener noreferrer">
            Manage usage
          </a>
        )}
        <Button size="sm" variant="outlined" icon="unlink" isPending={busy === 'disconnect'} onPress={() => void run('disconnect', async () => { const r = await disconnect(); return r.revoked === false ? 'Disconnected here. Revocation at the provider was not confirmed; you can also disconnect the app in your provider account settings.' : 'Disconnected. The credential was deleted from the server.' })}>
          Disconnect
        </Button>
      </div>
      {message && (
        <Notice tone={message.tone} title={message.tone === 'danger' ? 'Problem' : 'Done'}>
          {message.text}
        </Notice>
      )}
      <Dialog title="You're using your ChatGPT plan" isOpen={welcome} onOpenChange={(o) => !o && setWelcome(false)} size="sm" footer={(close) => (
        <Button variant="filled" onPress={() => {
          try {
            localStorage.setItem(WELCOME_KEY, connection.id)
          } catch {
            /* shown again next time */
          }
          close()
        }}>
          Got it
        </Button>
      )}>
        <p className="m-0">Eligible usage in this app uses your ChatGPT plan. You can review it under Manage usage in your ChatGPT settings.</p>
      </Dialog>
    </div>
  )
}

// ---- what is sent ----------------------------------------------------------------------------------

function SendPreview() {
  const connection = useAiConnection((s) => s.connection)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewRequest>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const show = async () => {
    setBusy(true)
    setErr(null)
    try {
      const conversation = useConversation.getState()
      const history = conversation.messages.flatMap((m): { role: 'user' | 'assistant'; text: string }[] => (m.role === 'user' ? [{ role: 'user' as const, text: m.text }] : m.role === 'assistant' && m.text ? [{ role: 'assistant' as const, text: m.text }] : [])).slice(-20)
      setPreview(await previewRequest({ history, turn: { text: '(your next message)', context: captureContext(conversation.attachSelection), toolResults: [] }, tools: availableOperations() }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const turn = preview?.messages.filter((m) => m.type === 'message').at(-1)
  return (
    <div className="flex flex-col gap-2" data-testid="ai-send-preview">
      <Button size="sm" variant="tonal" icon="visibility" isPending={busy} onPress={() => void show()} className="self-start">
        Preview what is sent with each request
      </Button>
      {err && <Notice tone="warning" title="Preview not available">{err}</Notice>}
      {preview && (
        <div className="ws-settings-card">
          <p className="ws-setting-help">
            To {preview.provider ?? (connection ? connection.provider : 'no provider (not connected)')}{preview.model ? `, model ${preview.model}` : ''}: the instructions below, {preview.messages.filter((m) => m.type === 'message').length - 1} earlier message(s) of this conversation, your message with this context, and {preview.tools.length} operation definitions. Nothing else; the model reads more only through the allowed operations.
          </p>
          <h4 className="ws-settings-h4">Context sent with your message</h4>
          <pre className="ws-settings-pre" data-testid="ai-preview-context">{turn?.text?.split('Context (data): ')[1] ?? ''}</pre>
          <h4 className="ws-settings-h4">Operations offered ({preview.tools.length})</h4>
          <p className="ws-setting-help ws-settings-mono">{preview.tools.join(', ') || 'none'}</p>
          {preview.removedTools.length > 0 && (
            <>
              <h4 className="ws-settings-h4">Not offered ({preview.removedTools.length})</h4>
              <ul className="ws-help-list text-ui-sm">
                {preview.removedTools.map((t) => (
                  <li key={t.name}>
                    <span className="ws-settings-mono">{t.name}</span>: {t.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <details>
            <summary className="text-ui-sm">Instructions sent to the model</summary>
            <pre className="ws-settings-pre">{preview.instructions}</pre>
          </details>
        </div>
      )}
    </div>
  )
}

// ---- audit -------------------------------------------------------------------------------------------

function AuditView() {
  const [records, setRecords] = useState<AuditRecord[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const load = () =>
    void auditRecords()
      .then(setRecords)
      .catch((e) => setErr(e.message))
  useEffect(load, [])
  return (
    <div className="flex flex-col gap-2" data-testid="ai-audit">
      <div className="flex items-center gap-2">
        <span className="text-ui-sm text-fg-2">Recent AI calls (yours). No credentials are recorded; prompts only when the option above is on.</span>
        <Button size="sm" variant="text" icon="sync" onPress={load}>
          Refresh
        </Button>
      </div>
      {err && <Notice tone="warning" title="Audit not available">{err}</Notice>}
      {records && !records.length && <p className="ws-setting-help">No AI calls yet.</p>}
      {records && records.length > 0 && (
        <div className="ws-help-table-wrap">
          <table className="ws-help-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Model</th>
                <th scope="col">Operations</th>
                <th scope="col">Tokens in / out</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{formatTime(r.at)}</td>
                  <td>
                    {r.provider} {r.model}
                  </td>
                  <td>
                    {r.toolsCalled.join(', ') || '—'}
                    {r.toolsRefused.length > 0 && <span className="block text-warning">refused: {r.toolsRefused.join(', ')}</span>}
                  </td>
                  <td>
                    {r.inputTokens ?? '—'} / {r.outputTokens ?? '—'}
                  </td>
                  <td>{r.outcome === 'error' ? `error (${r.errorCode})` : r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
