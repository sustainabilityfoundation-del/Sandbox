import { useEffect, useState } from 'react'
import { AppIcon, Badge, Button, Checkbox, Icon, IconButton, MenuButton, MenuItem, MenuSection, Select } from '@ews/design-system'
import { assistantContributions, contributorIncluded } from '../../assistant/contributions'
import { chooseModel, listModels, useAiConnection } from '../../assistant/connection'
import { useConversation } from '../../assistant/conversation'
import { downloadTranscript } from '../../assistant/transcript'
import { getTool } from '../../platform/registry'
import { useWorkspaceStore } from '../../platform/store'
import { useSettingsCentre } from '../../settings/SettingsCentre'
import { useCoverageDialog } from '../CoverageDialog'
import { ASSISTANT_FEATURES, UNAVAILABLE } from './features'

/**
 * Model and provider selector over the existing connection API (listModels / chooseModel). With the demo
 * assistant there is no model to choose: the control says so and opens the AI settings to connect.
 */
export function ModelSelector() {
  const info = useConversation((s) => s.service?.info)
  const connection = useAiConnection((s) => s.connection)
  const [models, setModels] = useState<{ id: string; label: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const remote = info?.kind === 'remote'

  useEffect(() => {
    if (!remote) return
    let live = true
    listModels().then(
      (r) => live && setModels(r.models),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    )
    return () => {
      live = false
    }
  }, [remote, connection?.id])

  if (!remote) {
    return (
      <Button size="sm" variant="quiet" icon="assistant" className="as-model" onPress={() => useSettingsCentre.getState().show('ai')} aria-label="Demo assistant (scripted, no AI model). Connect an AI account">
        Demo assistant
        <Icon name="chevron-down" size={14} />
      </Button>
    )
  }
  const current = info?.model ?? connection?.model ?? ''
  if (!models || error) {
    return (
      <span className="as-model as-model-static" title={error ? `Models could not be listed: ${error}` : 'Loading models…'}>
        <AppIcon name="assistant" size={14} /> {info?.name} · {current}
      </span>
    )
  }
  return (
    <Select
      ariaLabel={`Model (${info?.name})`}
      size="sm"
      className="as-model"
      value={current}
      onChange={(id) => void chooseModel(id).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
      options={(models.some((m) => m.id === current) ? models : [{ id: current, label: current }, ...models]).map((m) => ({ id: m.id, label: `${info?.name} · ${m.label}`, textValue: m.label }))}
    />
  )
}

/** The plus button: attachments (disabled until the file hand-off exists) and conversation actions. */
export function ComposerActions() {
  const attach = useConversation((s) => s.attachSelection)
  const setAttach = useConversation((s) => s.setAttachSelection)
  const clear = useConversation((s) => s.clear)
  const running = useConversation((s) => s.running !== null)
  const hasMessages = useConversation((s) => s.messages.length > 0)
  return (
    <MenuButton
      label="Add context or attachments"
      icon="add"
      placement="top start"
      className="as-plus"
      onAction={(key) => {
        if (key === 'selection') setAttach(!attach)
        else if (key === 'new') clear()
        else if (key === 'export') downloadTranscript()
        else if (key === 'coverage') useCoverageDialog.getState().setOpen(true)
      }}
      menuProps={{ disabledKeys: [...(ASSISTANT_FEATURES.attachments ? [] : ['file']), ...(!hasMessages || running ? ['new', 'export'] : [])] }}
    >
      <MenuSection title="Attach">
        <MenuItem id="file" icon="attach" description={ASSISTANT_FEATURES.attachments ? 'A file from the project' : UNAVAILABLE.attachments}>
          Attach a file…
        </MenuItem>
        <MenuItem id="selection" icon="select" trailing={attach ? <Icon name="check" size={16} className="text-accent" /> : undefined} description="Send the selected objects' IDs with the next messages">
          Attach the current selection
        </MenuItem>
      </MenuSection>
      <MenuSection title="Conversation">
        <MenuItem id="new" icon="add">
          New conversation
        </MenuItem>
        <MenuItem id="export" icon="save">
          Export transcript
        </MenuItem>
        <MenuItem id="coverage" icon="info">
          What can the assistant do?
        </MenuItem>
      </MenuSection>
    </MenuButton>
  )
}

/** Microphone: dictation and live voice exist in the architecture, feature-flagged off with an explanation. */
export function VoiceButton() {
  const available = ASSISTANT_FEATURES.dictation || ASSISTANT_FEATURES.liveVoice
  return (
    <span className="as-voice" title={available ? undefined : `${UNAVAILABLE.dictation} ${UNAVAILABLE.liveVoice}`}>
      <IconButton label={available ? 'Voice input' : 'Voice input (not available yet)'} icon="microphone" size="sm" isDisabled={!available} />
    </span>
  )
}

/** Context tab: exactly what is sent with the next message (the executor captures the same snapshot). */
export function ContextView() {
  const model = useWorkspaceStore((s) => s.model)!
  const context = useWorkspaceStore((s) => s.context)
  const activeToolId = useWorkspaceStore((s) => s.activeToolId)
  const openToolIds = useWorkspaceStore((s) => s.openToolIds)
  const attach = useConversation((s) => s.attachSelection)
  const setAttach = useConversation((s) => s.setAttachSelection)
  const configuration = model.snapshot.configurations.find((c) => c.id === context.configurationId)
  const selection = context.selectedIds.map((id) => model.get(id)).filter((o) => !!o)
  const rows: [string, string][] = [
    ['Project', context.projectId],
    ['Configuration', `${context.configurationId}${configuration ? ` · ${configuration.name}` : ''}`],
    ['Scenario', model.nameOf(context.scenarioId)],
    ['Model revision', String(model.revision)],
    ['Active module', getTool(activeToolId)?.name ?? 'None'],
    ['Open modules', openToolIds.map((id) => getTool(id)?.name ?? id).join(', ') || 'None'],
  ]
  return (
    <div className="as-pane" data-testid="assistant-context">
      <p className="as-pane-intro">
        Captured when you send a message; later changes to the selection or configuration do not redirect a reply in
        progress. What reaches a connected model also depends on the data-sharing policy in Settings → AI and reasoning.
      </p>
      <dl className="as-kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={k === 'Project' || k === 'Model revision' ? 'font-mono' : undefined}>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Selection</dt>
          <dd>
            {selection.length ? selection.map((o) => <span key={o!.id} className="font-mono">{o!.id} </span>) : 'None'}
            <Checkbox isSelected={attach} onChange={setAttach} className="mt-1">
              Attach the selection
            </Checkbox>
          </dd>
        </div>
      </dl>
    </div>
  )
}

/** Tools tab: the operations the assistant may call, from the registered contributions and the subscription. */
export function ToolsView() {
  useWorkspaceStore((s) => s.openToolIds)
  const contributors = assistantContributions()
  return (
    <div className="as-pane" data-testid="assistant-tools">
      <p className="as-pane-intro">
        The assistant acts only through these registered operations and the platform's own (read, search, propose
        changes). Changes are previews until you choose Apply.{' '}
        <Button size="sm" variant="text" onPress={() => useCoverageDialog.getState().setOpen(true)}>
          Full capability coverage
        </Button>
      </p>
      {contributors.map((c) => {
        const included = contributorIncluded(c)
        return (
          <section key={c.id} className="as-tools-group">
            <h3>
              {c.name} <span className="text-fg-3">({c.assistant.actions.length})</span>
              {!included && (
                <Badge tone="neutral" icon="locked">
                  Not in your subscription
                </Badge>
              )}
            </h3>
            <ul>
              {c.assistant.actions.map((a) => (
                <li key={a.name} title={a.description}>
                  <span className="as-step-name">{a.name}</span> {a.label}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
