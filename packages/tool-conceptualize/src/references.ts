import type { ReferencePort } from '@ews/conceptualize-client'

/**
 * Reference ports injected by the host (integration milestone 1, C5): labelled adapters that stand in for
 * the SysML and CAD Modeler read clients until SDK 1.8 (`PlatformServices.sysml` / `.cad`). The Project
 * Management registry port is built from `services.projects` and needs no registration.
 */
const ports: ReferencePort[] = []

export function registerReferencePort(port: ReferencePort): () => void {
  ports.push(port)
  return () => {
    const i = ports.indexOf(port)
    if (i >= 0) ports.splice(i, 1)
  }
}

export const registeredReferencePorts = (): readonly ReferencePort[] => ports
