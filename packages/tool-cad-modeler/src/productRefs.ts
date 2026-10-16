import type { PlatformServices } from '@ews/platform-sdk'

/**
 * Validation of `product` references (Project Management product elements; ADR-0026, CR-PM-CAD-1,
 * milestone C3/C5) through the platform's ProjectsService (`resolve`).
 * - Without the service (demo mode, or a host without Project Management) the reference is stored
 *   as typed and marked unverified. It is never refused for that reason.
 * - With the service, unknown or unavailable elements are refused, and a valid one is stored with
 *   its title (label) and current version (revision).
 */

export type ProductCheck =
  | { status: 'verified'; target: { module: 'product'; kind: 'product-element'; id: string; revision?: number; label: string } }
  | { status: 'unverified'; target: { module: 'product'; kind: 'product-element'; id: string }; reason: string }
  | { status: 'refused'; message: string }

export async function checkProductReference(services: Pick<PlatformServices, 'projects'> | undefined, projectId: string, id: string): Promise<ProductCheck> {
  const trimmed = id.trim()
  if (!trimmed) return { status: 'refused', message: 'Enter the product element ID.' }
  const projects = services?.projects
  if (!projects) return { status: 'unverified', target: { module: 'product', kind: 'product-element', id: trimmed }, reason: 'Project Management is not connected in this window, so the ID is stored as typed and not checked.' }
  let found
  try {
    found = await projects.resolve(projectId, [{ module: 'product', kind: 'product-element', id: trimmed }])
  } catch (e) {
    return { status: 'refused', message: `Project Management could not check ${trimmed}: ${e instanceof Error ? e.message : String(e)}` }
  }
  const hit = found.find((a) => a.ref.module === 'product' && a.ref.id === trimmed)
  if (!hit) return { status: 'refused', message: `${trimmed} is not a product element of project ${projectId}.` }
  if (hit.availability !== 'available') return { status: 'refused', message: `${hit.key} ${hit.title} is ${hit.availability.replace(/-/g, ' ')}.` }
  if (hit.category !== 'product-element') return { status: 'refused', message: `${hit.key} is a ${hit.category}, not a product element.` }
  const revision = typeof hit.version.value === 'number' ? hit.version.value : undefined
  return { status: 'verified', target: { module: 'product', kind: 'product-element', id: trimmed, ...(revision !== undefined ? { revision } : {}), label: `${hit.key} ${hit.title}` } }
}
