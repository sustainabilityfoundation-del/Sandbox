import { useToasts } from '@ews/design-system'
import type { ToolApi } from '@ews/platform-sdk'
import { cadSession } from './session'
import type { CadModelerViewState } from './viewState'

const fail = (title: string, e: unknown) => useToasts.getState().push({ tone: 'danger', title, body: e instanceof Error ? e.message : String(e) })

/** Opens a native file chosen by the user (a file picker created on demand, no visible input). */
export function chooseFile(api: ToolApi<CadModelerViewState>) {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.ewscad,.json,.step,.stp,.iges,.igs,.stl,.3mf,.sldprt,.ipt,.catpart,.prt,.x_t,.jt,.3dm,.fcstd,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const d = await cadSession.openText(await file.text(), file.name)
      api.updateViewState({ documentId: d.id, editing: null, selection: [], tab: 'model', viewRequest: { kind: 'fit', seq: Date.now() } })
      useToasts.getState().push({ tone: 'success', title: `Opened ${file.name}`, body: `Version ${d.engine.document.version}, regenerated from the native model.` })
    } catch (e) {
      fail(`Cannot open ${file.name}`, e)
    }
  }
  input.click()
}

