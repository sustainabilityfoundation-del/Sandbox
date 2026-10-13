import { Box3, Sphere, Vector3, type Object3D, type PerspectiveCamera } from 'three'
import { isMesh } from '../loading/modelInfo'
import type { ViewDirection } from '../state/viewerStore'

/** The subset of OrbitControls the camera rig relies on. */
export interface OrbitLike {
  target: Vector3
  minDistance: number
  maxDistance: number
  update: () => void
}

/**
 * Directions from the model towards the camera, in glTF's Y-up frame (which
 * SolidWorks' GLB export also uses). Top and bottom get a tiny Z component so
 * the orbit azimuth stays well defined and "front" ends up at the bottom of
 * the screen, matching SolidWorks' top view.
 */
export const VIEW_DIRECTIONS: Record<ViewDirection, Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
  top: new Vector3(0, 1, 1e-4).normalize(),
  bottom: new Vector3(0, -1, 1e-4).normalize(),
  iso: new Vector3(1, 1, 1).normalize(),
}

/** Bounds of the visible meshes only, so fitting ignores hidden components. */
export function visibleBounds(root: Object3D): Box3 {
  root.updateWorldMatrix(true, true)
  const box = new Box3()
  const meshBox = new Box3()
  root.traverseVisible((object) => {
    if (!isMesh(object)) return
    const geometry = object.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (!geometry.boundingBox) return
    meshBox.copy(geometry.boundingBox).applyMatrix4(object.matrixWorld)
    box.union(meshBox)
  })
  return box
}

/** Places the camera along `direction` so the whole box fits the viewport. */
export function frameBox(
  camera: PerspectiveCamera,
  controls: OrbitLike,
  box: Box3,
  direction: Vector3,
): void {
  if (box.isEmpty()) return
  const sphere = box.getBoundingSphere(new Sphere())
  const radius = Math.max(sphere.radius, 1e-6)

  const verticalFov = (camera.fov * Math.PI) / 180
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.05

  camera.up.set(0, 1, 0)
  camera.position.copy(sphere.center).addScaledVector(direction.clone().normalize(), distance)
  camera.near = radius * 0.002
  camera.far = distance + radius * 200
  camera.updateProjectionMatrix()

  controls.target.copy(sphere.center)
  controls.minDistance = radius * 0.01
  controls.maxDistance = radius * 50
  camera.lookAt(sphere.center)
  controls.update()
}

/** The current viewing direction, used to fit without rotating the view. */
export function currentDirection(camera: PerspectiveCamera, controls: OrbitLike): Vector3 {
  const direction = camera.position.clone().sub(controls.target)
  return direction.lengthSq() > 0 ? direction.normalize() : VIEW_DIRECTIONS.iso.clone()
}
