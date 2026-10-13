import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DemoAssistantService } from './assistant/DemoAssistantService'
import { RemoteAssistantService } from './assistant/RemoteAssistantService'
import { useConversation } from './assistant/conversation'
import { DemoRepository, browserStorage } from './repository/DemoRepository'
import './tools' // tool registrations
import './workspace.css'

// Swap this for a cloud-backed EngineeringRepository; tools are unaffected.
const repository = new DemoRepository({ storage: browserStorage() })

// The demo assistant by default; a backend endpoint switches to the real integration.
const assistantEndpoint = import.meta.env.VITE_ASSISTANT_ENDPOINT as string | undefined
useConversation
  .getState()
  .configure(assistantEndpoint ? new RemoteAssistantService(assistantEndpoint) : new DemoAssistantService())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
)
