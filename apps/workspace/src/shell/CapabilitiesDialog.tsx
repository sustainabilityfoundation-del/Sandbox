import { Badge, Dialog, type Tone } from '@ews/design-system'
import { create } from 'zustand'
import { CAPABILITIES, type CapabilityStatus } from '../platform/capabilities'

export const useCapabilitiesDialog = create<{ isOpen: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
}))

const STATUS: Record<CapabilityStatus, { label: string; tone: Tone }> = {
  implemented: { label: 'Implemented', tone: 'success' },
  experimental: { label: 'Experimental', tone: 'warning' },
  planned: { label: 'Planned, not available', tone: 'neutral' },
}

/** Implemented, experimental and planned capabilities, labelled honestly. */
export function CapabilitiesDialog() {
  const isOpen = useCapabilitiesDialog((s) => s.isOpen)
  const setOpen = useCapabilitiesDialog((s) => s.setOpen)
  return (
    <Dialog title="About this platform" isOpen={isOpen} onOpenChange={setOpen} size="lg">
      <p className="m-0 mb-3 text-fg-2">
        A prototype of an engineering development platform. Planned domains are on the roadmap only and are not available as tools.
        See docs/roadmap.md in the repository.
      </p>
      {(['implemented', 'experimental', 'planned'] as const).map((status) => (
        <section key={status} className="mb-4">
          <h3 className="m-0 mb-2 text-ui-sm font-medium">{STATUS[status].label}</h3>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {CAPABILITIES.filter((c) => c.status === status).map((c) => (
              <li key={c.name} className="flex flex-wrap items-baseline gap-x-2" data-capability-status={status}>
                <Badge tone={STATUS[status].tone}>{c.name}</Badge>
                <span className="text-ui-sm text-fg-2">{c.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Dialog>
  )
}
