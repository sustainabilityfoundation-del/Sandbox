import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DemoRepository, browserStorage } from './repository/DemoRepository'
import './tools' // tool registrations
import './workspace.css'

// Swap this for a cloud-backed EngineeringRepository; tools are unaffected.
const repository = new DemoRepository({ storage: browserStorage() })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
)
