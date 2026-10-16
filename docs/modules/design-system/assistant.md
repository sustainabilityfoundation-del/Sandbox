# AI Assistant panel (presentation)

Status: implemented (Focused Canvas phase 5). Owner of the presentation: ui-ux-design-system agent
(`apps/workspace/src/shell/assistant/**`). Owner of the logic: AI connection agent (`apps/workspace/src/assistant/**`:
conversation store, executor, proposals, Apply, policy, connection). User help: `ai.overview`.

## 1. Structure

| Part | Component | Notes |
| --- | --- | --- |
| Placement | the **AI Assistant** tab of `RightPanel` (right column, shared with the Inspector, `shell/ShellParts.tsx`) or the bottom panel's **AI Assistant** tab (`shell/BottomDock.tsx`), detached window (`App.tsx`) | One instance at a time; `showAssistant()` opens it wherever it is docked. The right header shows the connected provider and model as the service reports them (`service.info`), or **Demo** |
| Tabs | `AssistantPanel` (`Chat`, `Context`, `Tools`) | Panels stay mounted; the conversation scroll and draft survive tab and dock changes (draft in the conversation store) |
| Conversation | `Message`, `StepList`, `Inspected`, `ChangeCard`, `MessageText`, `ReopenedProposals` | User bubbles right (account initials), assistant replies left (assistant mark), events and change cards aligned with replies. References are chips that select the object (`ObjectRef`) |
| Banner | `ConnectionLine` | Demo or connected account, "Model changes are only made when you choose Apply", capability coverage; New conversation and Export transcript |
| Composer | `as-composer-box` | Rounded box: message (Enter sends, Shift+Enter new line), **+** menu (`ComposerActions`), attach (disabled), voice (`VoiceButton`, flagged off), Stop, Send |
| Model selector | `ModelSelector` (`shell/assistant/AssistantChrome.tsx`) | Uses `listModels` and `chooseModel` from `assistant/connection.ts`; with the demo assistant it opens Settings → AI and reasoning |
| Context tab | `ContextView` | What `captureContext` sends with the next message, with the Attach-selection switch |
| Tools tab | `ToolsView` | `assistantContributions()` by module, with subscription state; link to the coverage dialog |

States: empty conversation (introduction), thinking and running an operation (`.as-thinking` with a spinner),
running in another window, interrupted, stopped, error (`.as-note.is-error`), clarification needed, change previews
pending, applying, applied, conflict, failed, rejected (change cards).

Hooks kept for committed flows: `.as-root`, `.as-assistant`, `.as-text`, `.as-note`, `.as-thinking`, `.as-event`,
`.as-card[data-proposal-id]`, `.as-input textarea`, `[data-testid="assistant-connection"]`,
`[data-testid="reopened-proposals"]`, `[data-testid="export-transcript"]`, buttons Apply, New conversation and
What can the assistant do?, `[data-dock-tab="assistant"]` (the bottom tab, or the rail entry when docked right; the rail entry selects the AI Assistant tab of the right-hand panel).

## 2. Boundaries

- The panel never executes or writes. Messages go through `useConversation().send`; changes appear as previews and
  are applied only through `applyProposal` (the platform's validated command boundary, authorization and audit).
- Object references navigate through the shared selection (`ObjectRef`, `Reference`), not through a separate path.
- The project, configuration, scenario, revision, active module and selection reach the assistant through the
  existing `captureContext`; the Context tab only displays them.

## 3. Feature flags and integration requirements (`shell/assistant/features.ts`)

All flags are off. Disabled controls stay visible with the reason; nothing simulates the feature.

| Flag | Control | Needed before turning it on |
| --- | --- | --- |
| `attachments` | **+** → Attach a file…, paperclip | The project file hand-off (CR-PM-SDK-4): an SDK service that stores an uploaded file in project storage and returns a stable file reference; the message carries the reference; server-side extraction and the AI access policy decide what reaches a model; audit records the files used |
| `dictation` | Microphone | A provider-neutral speech-to-text endpoint in the assistant service (credentials on the server, usage audited like other model calls), microphone permission handling and a visible recording state; the transcript fills the composer and is sent only by the person |
| `liveVoice` | Microphone (live mode) | A realtime voice session in the assistant service (bidirectional audio, turn-taking, interruption, captions in the conversation) whose operations go through the same proposal and Apply path as typed messages; push-to-talk and stop always available |

When a flag is turned on, replace its explanation with the working control in the same place, add help topics, and
add the capability to `platform/capabilities.ts` and `docs/roadmap.md` with an honest status.

## Owner decision, 16 October 2026: one right-hand panel

"Also, the Inspector panel and the AI assistant panel both expand into their own space on the right. They should be tabbed in the same space so they don't take up so much room"

The assistant is the second tab of the right-hand panel (Inspector first); both stay mounted, so the conversation, previews, drafts and scroll
positions are kept when switching. Details and entry points: [shell.md](shell.md) section 6.
