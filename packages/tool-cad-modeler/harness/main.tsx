// Standalone development harness: the CAD Modeler alone, on a mock platform host with sample data.
// Document storage: ?store=local (default, explicit in-browser store, lost on reload), ?store=api
// (the CAD service through the dev proxy, `npm run dev:api` with API_PORT), ?store=files (files only).
import '@ews/design-system/styles.css'
import { mountHarness } from '@ews/platform-sdk/harness'
import { createCadModelerTool } from '../src'

const store = new URLSearchParams(location.search).get('store')
const mode = store === 'api' ? 'api' : store === 'files' ? 'files' : 'local'
mountHarness(createCadModelerTool({ mode, baseUrl: '/api/cad/v1', devUser: new URLSearchParams(location.search).get('user') ?? 'eli' }))
