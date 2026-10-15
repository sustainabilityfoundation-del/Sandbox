import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { RemoteAssistantService } from './assistant/RemoteAssistantService'
import { startAssistantConnection } from './assistant/connection'
import { loadSettings, useSettingsState } from './settings/store'
import { currentProjectId } from './projects/currentProject'
import { useConversation } from './assistant/conversation'
import { DemoRepository, browserStorage } from '@ews/model-service'
import { startWindowSync } from './session/sync'
import { initPreferences, onPreferencesSaved } from '@ews/design-system/preferences'
import { PlatformHostProvider } from '@ews/platform-sdk/react'
import { workspaceHost } from './platform/api'
import { onPlanSaved } from './platform/entitlements'
import { broadcast } from './session/windowSession'
import './platform/tools' // tool registrations
import '@ews/design-system/styles.css'
import './styles.css'

// Theme and density first, so the first paint already uses them.
initPreferences()

// Swap this for a cloud-backed EngineeringRepository; tools are unaffected.
const repository = new DemoRepository({ storage: browserStorage() })

// Settings (SDK 1.6): values from the settings service, defaults until they load. Project-scoped values belong
// to the window's project (CR-PM-WS-1, C13).
useSettingsState.setState({ projectId: currentProjectId })
void loadSettings()

// The labelled demo assistant until the person connects an AI account (Settings → AI and reasoning); then
// the backend's provider-neutral assistant service. VITE_ASSISTANT_ENDPOINT forces a fixed endpoint.
const assistantEndpoint = import.meta.env.VITE_ASSISTANT_ENDPOINT as string | undefined
if (assistantEndpoint) useConversation.getState().configure(new RemoteAssistantService(assistantEndpoint))
else startAssistantConnection()

// Connect this window to the other workspace windows (main and detached).
startWindowSync()
onPreferencesSaved(() => broadcast({ type: 'preferences' }))
onPlanSaved(() => broadcast({ type: 'entitlements' }))

// Development-only component showcase (/workspace/?showcase); excluded from production builds.
const Showcase = import.meta.env.DEV && new URLSearchParams(location.search).has('showcase') ? lazy(() => import('./showcase/Showcase')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {Showcase ? (
      <Suspense>
        <Showcase />
      </Suspense>
    ) : (
      <PlatformHostProvider host={workspaceHost}>
        <App repository={repository} />
      </PlatformHostProvider>
    )}
  </StrictMode>,
)
