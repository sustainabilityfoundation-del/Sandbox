// Standalone development harness: the CAD Modeler alone, on a mock platform host with sample data.
import '@ews/design-system/styles.css'
import { mountHarness } from '@ews/platform-sdk/harness'
import { cadModelerTool } from '../src'

mountHarness(cadModelerTool)
