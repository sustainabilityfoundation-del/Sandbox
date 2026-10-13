import { useEffect, useRef } from 'react'
import { EXAMPLE_PROMPTS } from '../../assistant/DemoAssistantService'
import { useConversation, type ChatMessage, type ToolStep } from '../../assistant/conversation'
import type { CapturedMessageContext } from '../../assistant/types'
import { Button } from '../../sdk/controls'
import { useWorkspaceStore } from '../../sdk/store'
import { instanceId, isInstanceAlive } from '../../session/windowSession'
import { Icons, iconForType } from '../../sdk/icons'
import { formatTime } from '../../sdk/ui'
import { ChangeCard } from './ChangeCard'
import { MessageText, Reference } from './MessageText'

function LiveContextChips() {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const attach = useConversation((s) => s.attachSelection)
  const setAttach = useConversation((s) => s.setAttachSelection)
  const configuration = model.snapshot.configurations.find((c) => c.id === context.configurationId)
  const selection = context.selectedIds.map((id) => model.get(id)).filter((o) => !!o)

  return (
    <div className="as-context" aria-label="Context sent with the next message">
      <span className="as-chip" title="Project">
        <span className="as-chip-k">Project</span> {context.projectId}
      </span>
      <span className="as-chip" title="Configuration">
        <span className="as-chip-k">Config</span> {context.configurationId}
        {configuration ? ` · ${configuration.name}` : ''}
      </span>
      <span className="as-chip" title="Scenario">
        <span className="as-chip-k">Scenario</span> {model.nameOf(context.scenarioId)}
      </span>
      <span className="as-chip" title="Model revision">
        <span className="as-chip-k">Rev</span> {model.revision}
      </span>
      <label className={`as-chip as-chip-attach${attach ? ' is-on' : ''}`} title="Attach the current selection to the next message">
        <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
        <span className="as-chip-k">Selection</span>
        {selection.length ? selection.map((o) => o!.id).join(', ') : 'none'}
      </label>
    </div>
  )
}

function CapturedChips({ context }: { context: CapturedMessageContext }) {
  return (
    <div className="as-captured" title={`Context captured at ${formatTime(context.capturedAt)}`}>
      <span>{context.configurationId}</span>
      <span>{context.scenarioName}</span>
      <span>rev {context.modelRevision}</span>
      {context.attachedSelection ? (
        context.selection.length ? (
          context.selection.map((s) => {
            const Icon = iconForType(s.type)
            return (
              <span key={s.id}>
                <Icon width={11} height={11} /> {s.id}
              </span>
            )
          })
        ) : (
          <span>no selection</span>
        )
      ) : (
        <span>selection not attached</span>
      )}
    </div>
  )
}

function StepList({ steps }: { steps: ToolStep[] }) {
  if (!steps.length) return null
  return (
    <ol className="as-steps" aria-label="Operations">
      {steps.map((s) => (
        <li key={s.id} className={`is-${s.status}`}>
          {s.status === 'running' ? (
            <span className="ws-spinner ws-spinner-small" aria-hidden="true" />
          ) : s.status === 'done' ? (
            <span className="as-step-icon" aria-hidden="true">
              ✓
            </span>
          ) : (
            <Icons.alert width={12} height={12} />
          )}
          <span className="as-step-name">{s.name}</span>
          <span>{s.summary}</span>
        </li>
      ))}
    </ol>
  )
}

function Inspected({ steps }: { steps: ToolStep[] }) {
  const items = steps.flatMap((s) => s.inspected.map((i) => ({ ...i, tool: s.name })))
  if (!items.length) return null
  return (
    <details className="as-inspected">
      <summary>
        Model information inspected ({items.length} item{items.length === 1 ? '' : 's'})
      </summary>
      <ul>
        {items.map((item, i) => (
          <li key={i}>
            <Reference id={item.id} /> <span className="ws-muted">{item.detail}</span>{' '}
            <span className="as-step-name">via {item.tool}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function Message({ message, focused }: { message: ChatMessage; focused: boolean }) {
  const send = useConversation((s) => s.send)
  const running = useConversation((s) => s.running !== null)
  const serviceName = useConversation((s) => s.service?.info.name ?? 'Assistant')

  if (message.role === 'user') {
    return (
      <div className={`as-msg as-user${focused ? ' is-focused' : ''}`} data-message-id={message.id}>
        <div className="as-msg-head">
          <strong>You</strong>
          <span className="ws-muted">
            {message.id} · {formatTime(message.at)}
          </span>
        </div>
        <div className="as-user-text">{message.text}</div>
        <CapturedChips context={message.context} />
      </div>
    )
  }
  if (message.role === 'event') {
    return (
      <div className={`as-event is-${message.tone}${focused ? ' is-focused' : ''}`} data-message-id={message.id}>
        <span>{message.text}</span>
        {message.cardProposalId && <ChangeCard proposalId={message.cardProposalId} />}
      </div>
    )
  }

  const busy = message.status === 'thinking' || message.status === 'running-tool'
  // Replies are executed only by the window that sent them.
  const foreign = !!message.owner && message.owner !== instanceId
  return (
    <div className={`as-msg as-assistant${focused ? ' is-focused' : ''}`} data-message-id={message.id}>
      <div className="as-msg-head">
        <strong>{serviceName}</strong>
        <span className="ws-muted">
          {message.id} · {formatTime(message.at)}
        </span>
        {message.clarification && <span className="as-tag">Needs clarification</span>}
      </div>
      <StepList steps={message.steps} />
      {busy && foreign && (
        <div className="as-note">
          {isInstanceAlive(message.owner!)
            ? 'Running in another workspace window. The result appears here when it finishes.'
            : 'Interrupted: the window that was running this reply was closed or reloaded. Ask again to continue.'}
        </div>
      )}
      {busy && !foreign && (
        <div className="as-thinking">
          <span className="ws-spinner ws-spinner-small" aria-hidden="true" />
          {message.status === 'thinking' ? 'Working…' : 'Running operation…'}
        </div>
      )}
      {message.text && <MessageText text={message.text} />}
      {message.proposalIds.map((id) => (
        <ChangeCard key={id} proposalId={id} />
      ))}
      {message.status === 'stopped' && <div className="as-note">{message.note}</div>}
      {message.status === 'error' && <div className="as-note is-error">Error: {message.error}</div>}
      <Inspected steps={message.steps} />
      {message.suggestions.length > 0 && (
        <div className="as-suggestions">
          {message.suggestions.map((s) => (
            <button key={s} type="button" className="as-suggestion" disabled={running} onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The ChatGPT panel: conversation with the (replaceable) assistant service. */
export function AssistantPanel() {
  const messages = useConversation((s) => s.messages)
  const running = useConversation((s) => s.running !== null)
  const send = useConversation((s) => s.send)
  const stop = useConversation((s) => s.stop)
  const clear = useConversation((s) => s.clear)
  const info = useConversation((s) => s.service?.info)
  const focusId = useConversation((s) => s.focusMessageId)
  const focusMessage = useConversation((s) => s.focusMessage)
  const draft = useConversation((s) => s.draft)
  const setDraft = useConversation((s) => s.setDraft)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Keep the latest message in view.
  useEffect(() => {
    const list = listRef.current
    if (list && !focusId) list.scrollTop = list.scrollHeight
  }, [messages, focusId])

  // Reveal a message referenced from Activity.
  useEffect(() => {
    if (!focusId) return
    const el = listRef.current?.querySelector(`[data-message-id="${focusId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const timer = setTimeout(() => focusMessage(null), 2000)
    return () => clearTimeout(timer)
  }, [focusId, focusMessage])

  const submit = (text = draft) => {
    if (!text.trim() || running) return
    setDraft('')
    void send(text)
  }

  return (
    <div className="as-root">
      <div className="as-conversation">
        <div className="as-banner" role="note">
          {messages.length > 0 && (
            <button type="button" className="ws-link" onClick={clear} disabled={running}>
              New conversation
            </button>
          )}
          <strong>{info?.name ?? 'Assistant'}</strong>
          {info?.kind === 'demo' ? ' (scripted responses, not connected to ChatGPT).' : '.'} Model changes are only made when
          you choose Apply.
        </div>
        <div className="as-messages" ref={listRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="as-empty">
              <p>
                Ask about the engineering model, request a change, or run the illustrative analysis. The assistant uses the
                same repository and validation as the tools, by stable object ID.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} focused={m.id === focusId} />
          ))}
        </div>
      </div>
      <div className="as-composer">
        <LiveContextChips />
        <textarea
          ref={inputRef}
          className="as-input"
          rows={3}
          placeholder="Ask about the model… (Enter to send, Shift+Enter for a new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label="Message"
        />
        <div className="as-actions">
          {running ? (
            <Button onClick={stop}>
              <span className="as-stop" aria-hidden="true" /> Stop
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => submit()} disabled={running || !draft.trim()}>
            Send
          </Button>
        </div>
        <div className="as-examples">
          <span className="ws-muted">Try:</span>
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} type="button" className="as-suggestion" disabled={running} onClick={() => submit(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
