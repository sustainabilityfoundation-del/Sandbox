// Standalone development harness: this tool alone, on a mock platform host with sample data.
import '@ews/design-system/styles.css'
import { mountHarness } from '@ews/platform-sdk/harness'
import { requirementsTool } from '../src'

mountHarness(requirementsTool)
