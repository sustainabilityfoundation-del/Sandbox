import { create } from 'zustand'
import { disposeObject3D } from '../loading/dispose'
import { ModelLoadError, describeLoadError, type UserFacingError } from '../loading/errors'
import { loadModelFromFile, loadModelFromUrl } from '../loading/loadModel'
import type { LoadedModel } from '../loading/types'

export type ViewDirection = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso'
export type ViewCommandKind = ViewDirection | 'fit' | 'reset'
export type DisplayMode = 'solid' | 'wireframe'
export type LoadStatus = 'idle' | 'loading' | 'ready'

/** A one-shot camera request; `seq` makes repeated identical requests distinct. */
export interface ViewCommand {
  kind: ViewCommandKind
  seq: number
}

export const SAMPLE_MODEL_URL = `${import.meta.env.BASE_URL}models/sample.glb`

interface ViewerState {
  status: LoadStatus
  loadingName: string | null
  error: UserFacingError | null
  model: LoadedModel | null
  selectedId: string | null
  hiddenIds: ReadonlySet<string>
  displayMode: DisplayMode
  showGrid: boolean
  sidebarOpen: boolean
  viewCommand: ViewCommand | null

  openFile: (file: File) => Promise<void>
  openSample: () => Promise<void>
  openUrl: (url: string, fileName: string) => Promise<void>
  dismissError: () => void
  select: (id: string | null) => void
  toggleHidden: (id: string) => void
  showAll: () => void
  setDisplayMode: (mode: DisplayMode) => void
  toggleGrid: () => void
  setSidebarOpen: (open: boolean) => void
  requestView: (kind: ViewCommandKind) => void
}

export const NARROW_LAYOUT = '(max-width: 760px)'
let latestLoad = 0
let viewSeq = 0

export const useViewerStore = create<ViewerState>()((set, get) => {
  /** Runs a load, ignoring results from loads that have since been superseded. */
  async function runLoad(name: string, load: () => Promise<LoadedModel>) {
    const token = ++latestLoad
    set({ status: 'loading', loadingName: name, error: null })
    try {
      const model = await load()
      if (token !== latestLoad) {
        disposeObject3D(model.scene) // never rendered, safe to free now
        return
      }
      // The previous model is disposed by ModelView when it unmounts.
      set({
        model,
        status: 'ready',
        loadingName: null,
        selectedId: null,
        hiddenIds: new Set(),
        viewCommand: null,
      })
    } catch (err) {
      if (token !== latestLoad) return
      if (!(err instanceof ModelLoadError)) console.error(err) // expected rejections aren't bugs
      set({
        status: get().model ? 'ready' : 'idle',
        loadingName: null,
        error: describeLoadError(err, name),
      })
    }
  }

  return {
    status: 'idle',
    loadingName: null,
    error: null,
    model: null,
    selectedId: null,
    hiddenIds: new Set(),
    displayMode: 'solid',
    showGrid: true,
    sidebarOpen: typeof window === 'undefined' || !window.matchMedia(NARROW_LAYOUT).matches,
    viewCommand: null,

    openFile: (file) => runLoad(file.name, () => loadModelFromFile(file)),
    openSample: () => runLoad('sample.glb', () => loadModelFromUrl(SAMPLE_MODEL_URL, 'sample.glb')),
    openUrl: (url, fileName) => runLoad(fileName, () => loadModelFromUrl(url, fileName)),
    dismissError: () => set({ error: null }),

    select: (id) => set({ selectedId: id }),

    toggleHidden: (id) =>
      set((state) => {
        const hiddenIds = new Set(state.hiddenIds)
        if (!hiddenIds.delete(id)) hiddenIds.add(id)
        return { hiddenIds }
      }),

    showAll: () => set({ hiddenIds: new Set() }),
    setDisplayMode: (displayMode) => set({ displayMode }),
    toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    requestView: (kind) => set({ viewCommand: { kind, seq: ++viewSeq } }),
  }
})
