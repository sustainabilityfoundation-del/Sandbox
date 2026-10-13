import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DemoAssistantService } from './assistant/DemoAssistantService'
import { RemoteAssistantService } from './assistant/RemoteAssistantService'
import { useConversation } from './assistant/conversation'
import { DemoRepository, browserStorage } from './repository/DemoRepository'
import { startWindowSync } from './session/sync'
import { initPreferences } from './theme/preferences'
import './tools' // tool registrations
import './theme/index.css'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
)
