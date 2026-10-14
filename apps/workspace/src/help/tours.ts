import type { HelpTutorial } from '@ews/platform-sdk'
import { useToasts } from '@ews/design-system'
import { useWorkspaceStore } from '../platform/store'
import { getTool } from '../platform/registry'

/**
 * Guided tours with Driver.js (MIT), loaded only when a tour starts. Tutorials are data in the
 * module's help manifest; steps name controls by help ID (`data-help-id`), so tours survive layout
 * changes. A step whose control is not on screen is shown as a centred note, never skipped silently.
 */
export async function startTutorial(tutorial: HelpTutorial & { moduleId: string }): Promise<void> {
  if (getTool(tutorial.moduleId)) {
    const access = useWorkspaceStore.getState().activateTool(tutorial.moduleId)
    if (!access.ok) {
      useToasts.getState().push({ tone: 'warning', title: 'Tutorial not available', body: access.reason })
      return
    }
  }
  const [{ driver }] = await Promise.all([import('driver.js'), import('driver.js/dist/driver.css')])
  const tour = driver({
    showProgress: true,
    allowClose: true,
    popoverClass: 'ws-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: tutorial.steps.map((step) => ({
      // A selector is resolved when the step is shown (earlier steps may open the panel that holds
      // the control); when the control is not there, Driver.js centres the note instead.
      element: step.control ? `[data-help-id="${CSS.escape(step.control)}"]` : undefined,
      popover: { title: step.title, description: step.text },
    })),
  })
  // Let the activated tool render before the first step looks for its control.
  requestAnimationFrame(() => tour.drive())
}
