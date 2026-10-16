import { staticTwinDirectory, type TwinDirectory } from '@ews/requirements-service'

/**
 * Development twin directory: the component IDs of the sample actuator twin
 * (packages/model-service seed). Allocation targets are validated against it until the platform
 * offers a twin directory endpoint (integration need, see the progress file).
 * Lives in its own file so server modules (modules.ts) can use it without importing server.ts.
 */
export const SAMPLE_TWIN: TwinDirectory = staticTwinDirectory(
  {
    'PRJ-ACT100': [
      { id: 'ACT-100', type: 'assembly', name: 'Actuator assembly' },
      { id: 'HSG-110', type: 'part', name: 'Housing' },
      { id: 'ROD-120', type: 'part', name: 'Rod' },
      { id: 'MTR-130', type: 'part', name: 'Motor' },
      { id: 'SYS-001', type: 'sysml-element', name: 'ActuatorSystem' },
      { id: 'SYS-002', type: 'sysml-element', name: 'housing' },
      { id: 'SYS-003', type: 'sysml-element', name: 'rod' },
      { id: 'SYS-004', type: 'sysml-element', name: 'motor' },
      { id: 'SYS-005', type: 'sysml-element', name: 'operatingLoad' },
      { id: 'SYS-006', type: 'sysml-element', name: 'extensionTime' },
      { id: 'CAD-110', type: 'cad-representation', name: 'Housing (mock geometry)' },
      { id: 'CAD-120', type: 'cad-representation', name: 'Rod (mock geometry)' },
      { id: 'CAD-130', type: 'cad-representation', name: 'Motor (mock geometry)' },
    ],
  },
  'development directory of the sample actuator twin',
)
