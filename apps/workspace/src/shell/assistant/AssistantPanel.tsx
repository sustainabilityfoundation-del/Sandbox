import { useEffect, useRef } from 'react'
import { EXAMPLE_PROMPTS } from '../../assistant/DemoAssistantService'
import { useCoverageDialog } from '../CoverageDialog'
import { useConversation, type ChatMessage, type ToolStep } from '../../assistant/conversation'
import type { CapturedMessageContext } from '../../assistant/types'
import { useWorkspaceStore } from '../../platform/store'
import { instanceId, isInstanceAlive } from '../../session/windowSession'
import { iconForType } from '@ews/platform-sdk/react'
import { formatTime } from '@ews/platform-sdk/react'
import { AppIcon, Avatar, Button, Checkbox, Icon, IconButton, Spinner, Tab, TabList, TabPanel, Tabs, TextField } from '@ews/design-system'
import { create } from 'zustand'
import { serviceSettings } from '../../platform/services'
import { ComposerActions, ContextView, ModelSelector, ToolsView, VoiceButton } from './AssistantChrome'
import { ASSISTANT_FEATURES, UNAVAILABLE } from './features'
import { ChangeCard } from './ChangeCard'
import { MessageText, Reference } from './MessageText'
import { useAiConnection } from '../../assistant/connection'
import { useSettingsCentre } from '../../settings/SettingsCentre'
import { downloadTranscript } from '../../assistant/transcript'

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
      <Checkbox isSelected={attach} onChange={setAttach} className={`as-chip as-chip-attach${attach ? ' is-on' : ''}`}>
        <span className="as-chip-k">Attach selection</span> {selection.length ? selection.map((o) => o!.id).join(', ') : 'none'}
      </Checkbox>
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
            return (
              <span key={s.id}>
                <AppIcon name={iconForType(s.type)} size={12} /> {s.id}
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
            <Spinner size={14} label="Running" />
          ) : s.status === 'done' ? (
            <Icon name="check" size={16} label="Done" className="as-step-icon" />
          ) : (
            <Icon name="error" size={16} label="Failed" />
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
            <Reference id={item.id} /> <span className="text-fg-3">{item.detail}</span>{' '}
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
      <div className="as-row is-user">
      <div className={`as-msg as-user${focused ? ' is-focused' : ''}`} data-message-id={message.id}>
        <div className="as-msg-head">
          <strong>You</strong>
          <span className="text-fg-3">
            {message.id} · {formatTime(message.at)}
          </span>
        </div>
        <div className="as-user-text">{message.text}</div>
        <CapturedChips context={message.context} />
      </div>
      <Avatar name={serviceSettings.devUser} size={26} className="as-avatar-user" />
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
    <div className="as-row">
    <span className="as-avatar" aria-hidden="true">
      <AppIcon name="assistant" size={16} />
    </span>
    <div className={`as-msg as-assistant${focused ? ' is-focused' : ''}`} data-message-id={message.id}>
      <div className="as-msg-head">
        <strong>{serviceName}</strong>
        <span className="text-fg-3">
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
          <Spinner size={16} />
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
            <Button key={s} size="sm" variant="outlined" className="as-suggestion" isDisabled={running} onPress={() => void send(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
    </div>
    </div>
  )
}

/**
 * Which assistant answers: the connected account (provider, model; "Using ChatGPT plan" for Sign in with
 * ChatGPT) or the labelled demo. Connecting happens in Settings → AI and reasoning, not here.
 */
function ConnectionLine() {
  const info = useConversation((s) => s.service?.info)
  const connection = useAiConnection((s) => s.connection)
  const providers = useAiConnection((s) => s.providers)
  const openAi = () => useSettingsCentre.getState().show('ai')
  if (info?.kind === 'remote') {
    const usage = providers.find((p) => p.id === connection?.provider)?.methods.find((m) => m.id === connection?.method)
    return (
      <span data-testid="assistant-connection" data-assistant-kind="remote">
        <strong>{info.name}</strong>
        {info.model ? ` · ${info.model}` : ''} (your connected account).{' '}
        {info.method === 'chatgpt' && (
          <>
            <span className="as-tag">Using ChatGPT plan</span>{' '}
            {usage?.kind === 'oauth' && usage.manageUsageUrl && (
              <a className="ws-help-link" href={usage.manageUsageUrl} target="_blank" rel="noopener noreferrer">
                Manage usage
              </a>
            )}{' '}
          </>
        )}
        <Button size="sm" variant="text" icon="settings" onPress={openAi}>
          AI settings
        </Button>{' '}
      </span>
    )
  }
  return (
    <span data-testid="assistant-connection" data-assistant-kind="demo">
      <strong>{info?.name ?? 'Assistant'}</strong> (scripted demo responses, not connected to an AI model).{' '}
      {connection && connection.status !== 'active' && <span className="as-tag">Connection needs attention</span>}{' '}
      <Button size="sm" variant="text" icon="connect" onPress={openAi}>
        Connect your account
      </Button>{' '}
    </span>
  )
}

/** Open proposals saved in the assistant service by earlier sessions, which no message here shows (C9). */
function ReopenedProposals() {
  const reopened = useConversation((s) => s.reopenedIds)
  const messages = useConversation((s) => s.messages)
  const proposals = useConversation((s) => s.proposals)
  const shown = new Set(messages.flatMap((m) => (m.role === 'assistant' ? m.proposalIds : m.role === 'event' && m.cardProposalId ? [m.cardProposalId] : [])))
  const open = reopened.filter((id) => !shown.has(id) && proposals[id])
  if (!open.length) return null
  return (
    <section className="as-reopened" aria-label="Proposals from earlier sessions" data-testid="reopened-proposals">
      <div className="as-note">
        Proposals from earlier sessions in this project, saved by the assistant service. Nothing has been applied.{' '}
        <Button size="sm" variant="text" icon="close" onPress={() => useConversation.getState().dismissReopened()} data-testid="dismiss-reopened">
          Dismiss all
        </Button>
      </div>
      {open.map((id) => (
        <ChangeCard key={id} proposalId={id} />
      ))}
    </section>
  )
}

/**
 * The AI Assistant panel (presentation only): Chat, Context and Tools tabs, conversational messages, a rounded
 * composer with the plus menu, attachments and voice (feature-flagged, see ./features.ts), send and stop, and the
 * model selector. Conversation logic, proposals and Apply live in apps/workspace/src/assistant.
 */
export function AssistantPanel() {
  const messages = useConversation((s) => s.messages)
  const running = useConversation((s) => s.running !== null)
  const send = useConversation((s) => s.send)
  const stop = useConversation((s) => s.stop)
  const clear = useConversation((s) => s.clear)
  const focusId = useConversation((s) => s.focusMessageId)
  const focusMessage = useConversation((s) => s.focusMessage)
  const draft = useConversation((s) => s.draft)
  const setDraft = useConversation((s) => s.setDraft)
  const tab = useAssistantTab((s) => s.tab)
  const setTab = useAssistantTab((s) => s.setTab)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

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
    <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as AssistantTab)} className="as-root">
      <TabList aria-label="Assistant views" className="as-tabs">
        <Tab id="chat">Chat</Tab>
        <Tab id="context">Context</Tab>
        <Tab id="tools">Tools</Tab>
      </TabList>
      <TabPanel id="chat" shouldForceMount className="as-chat">
        <div className="as-conversation">
          <div className="as-banner" role="note">
            <div className="as-banner-text">
              <ConnectionLine />
              Model changes are only made when you choose Apply.{' '}
              <Button size="sm" variant="text" onPress={() => useCoverageDialog.getState().setOpen(true)}>
                What can the assistant do?
              </Button>
            </div>
            {messages.length > 0 && (
              <div className="as-banner-actions">
                <Button size="sm" variant="text" icon="add" onPress={clear} isDisabled={running}>
                  New conversation
                </Button>
                <Button size="sm" variant="text" icon="save" onPress={downloadTranscript} isDisabled={running} data-testid="export-transcript">
                  Export transcript
                </Button>
              </div>
            )}
          </div>
          <div className="as-messages" ref={listRef} aria-live="polite">
            {messages.length === 0 && (
              <div className="as-empty">
                <span className="as-avatar" aria-hidden="true">
                  <AppIcon name="assistant" size={16} />
                </span>
                <p>
                  Ask about requirements, the SysML model or CAD dimensions, or request a change. The assistant uses the
                  same repository and validation as the tools, by stable object ID.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <Message key={m.id} message={m} focused={m.id === focusId} />
            ))}
            <ReopenedProposals />
          </div>
        </div>
        <div className="as-composer">
          <div className="as-composer-box">
            <TextField
              ref={inputRef}
              aria-label="Message"
              multiline
              rows={2}
              className="as-input"
              placeholder="Ask anything about your model… (Enter to send, Shift+Enter for a new line)"
              value={draft}
              onChange={setDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <div className="as-composer-bar">
              <ComposerActions />
              <span className="as-attach" title={ASSISTANT_FEATURES.attachments ? undefined : UNAVAILABLE.attachments}>
                <IconButton
                  label={ASSISTANT_FEATURES.attachments ? 'Attach a file' : 'Attach a file (not available yet)'}
                  icon="attach"
                  size="sm"
                  isDisabled={!ASSISTANT_FEATURES.attachments}
                />
              </span>
              <span className="flex-1" />
              <VoiceButton />
              {running && <IconButton label="Stop" icon="stop" size="sm" variant="outlined" onPress={stop} className="as-stop" />}
              <IconButton label="Send" icon="send" variant="filled" onPress={() => submit()} isDisabled={running || !draft.trim()} className="as-send" />
            </div>
          </div>
          <div className="as-composer-meta">
            <ModelSelector />
            <LiveContextChips />
          </div>
          <div className="as-examples">
            <span className="text-fg-3">Try:</span>
            {EXAMPLE_PROMPTS.map((p) => (
              <Button key={p} size="sm" variant="outlined" className="as-suggestion" isDisabled={running} onPress={() => submit(p)}>
                {p}
              </Button>
            ))}
          </div>
        </div>
      </TabPanel>
      <TabPanel id="context" shouldForceMount className="as-side-panel">
        <ContextView />
      </TabPanel>
      <TabPanel id="tools" className="as-side-panel">
        <ToolsView />
      </TabPanel>
    </Tabs>
  )
}

type AssistantTab = 'chat' | 'context' | 'tools'

/** The assistant panel's tab (shared by the right and bottom placements). */
const useAssistantTab = create<{ tab: AssistantTab; setTab: (tab: AssistantTab) => void }>()((set) => ({
  tab: 'chat',
  setTab: (tab) => set({ tab }),
}))
