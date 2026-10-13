import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import type { PerspectiveCamera } from 'three'
import type { LoadedModel } from '../loading/types'
import { useViewerStore } from '../state/viewerStore'
import { VIEW_DIRECTIONS, currentDirection, frameBox, visibleBounds, type OrbitLike } from './cameraMath'

/** Fits the camera on load and executes toolbar view commands. */
export function CameraRig({ model }: { model: LoadedModel }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const invalidate = useThree((s) => s.invalidate)
  const viewCommand = useViewerStore((s) => s.viewCommand)

  useEffect(() => {
    if (!controls) return
    frameBox(camera, controls, model.bounds, VIEW_DIRECTIONS.iso)
    invalidate()
  }, [model, camera, controls, invalidate])

  useEffect(() => {
    if (!controls || !viewCommand) return
    const box = visibleBounds(model.scene)
    // If everything is hidden, frame the whole model rather than doing nothing.
    const target = box.isEmpty() ? model.bounds : box

    switch (viewCommand.kind) {
      case 'fit':
        frameBox(camera, controls, target, currentDirection(camera, controls))
        break
      case 'reset':
        frameBox(camera, controls, model.bounds, VIEW_DIRECTIONS.iso)
        break
      default:
        frameBox(camera, controls, target, VIEW_DIRECTIONS[viewCommand.kind])
    }
    invalidate()
    // Only react to new commands, not to camera/controls identity changes.
  }, [viewCommand])

  return null
}
