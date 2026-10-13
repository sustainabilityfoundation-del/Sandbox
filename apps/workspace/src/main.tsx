import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DemoAssistantService } from './assistant/DemoAssistantService'
import { RemoteAssistantService } from './assistant/RemoteAssistantService'
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

// The demo assistant by default; a backend endpoint switches to the real integration.
const assistantEndpoint = import.meta.env.VITE_ASSISTANT_ENDPOINT as string | undefined
useConversation
  .getState()
  .configure(assistantEndpoint ? new RemoteAssistantService(assistantEndpoint) : new DemoAssistantService())

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
