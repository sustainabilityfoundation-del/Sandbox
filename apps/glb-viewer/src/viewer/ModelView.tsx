import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect } from 'react'
import type { Object3D } from 'three'
import { cancelDispose, scheduleDispose } from '../loading/dispose'
import { isMesh } from '../loading/modelInfo'
import type { LoadedModel } from '../loading/types'
import { useViewerStore } from '../state/viewerStore'
import { applyHighlight, setWireframe } from './highlight'

/** Pointer travel (px) beyond which a click is treated as an orbit drag. */
export const CLICK_TOLERANCE = 4

function isShown(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}

/** Renders the loaded scene and applies visibility, display mode and selection. */
export function ModelView({ model }: { model: LoadedModel }) {
  const invalidate = useThree((s) => s.invalidate)
  const selectedId = useViewerStore((s) => s.selectedId)
  const hiddenIds = useViewerStore((s) => s.hiddenIds)
  const wireframe = useViewerStore((s) => s.displayMode === 'wireframe')
  const select = useViewerStore((s) => s.select)

  // Free GPU memory once this model is replaced.
  useEffect(() => {
    cancelDispose(model.scene)
    return () => scheduleDispose(model.scene)
  }, [model.scene])

  useEffect(() => {
    for (const [id, object] of model.objectsById) object.visible = !hiddenIds.has(id)
    invalidate()
  }, [model, hiddenIds, invalidate])

  // Highlight copies are cloned from the originals, so the wireframe flag must
  // be set first; React runs this effect before the highlight effect below.
  useEffect(() => {
    setWireframe(model.scene, wireframe)
    invalidate()
  }, [model, wireframe, invalidate])

  useEffect(() => {
    const target = selectedId ? model.objectsById.get(selectedId) : undefined
    if (!target) return
    const restore = applyHighlight(target)
    invalidate()
    return () => {
      restore()
      invalidate()
    }
  }, [model, selectedId, wireframe, invalidate])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > CLICK_TOLERANCE) return
    // Raycasting does not skip hidden objects, so pick the nearest shown mesh.
    const hit = event.intersections.find(
      (i) => isMesh(i.object) && model.objectsById.has(i.object.uuid) && isShown(i.object),
    )
    select(hit ? hit.object.uuid : null)
  }

  return <primitive object={model.scene} onClick={handleClick} />
}
