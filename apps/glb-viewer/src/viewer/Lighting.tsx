import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PMREMGenerator, Vector3, type DirectionalLight } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import type { OrbitLike } from './cameraMath'

const up = new Vector3()
const right = new Vector3()

/**
 * Neutral studio lighting for inspecting parts: a procedurally generated room
 * environment (no downloaded HDR files) for reflections on metallic
 * appearances, soft hemisphere fill, and a key light that follows the camera
 * so the visible side of the model is always lit.
 */
export function Lighting() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null
  const keyLight = useRef<DirectionalLight>(null)

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)
    room.dispose()
    pmrem.dispose()
    scene.environment = target.texture
    scene.environmentIntensity = 0.6
    return () => {
      scene.environment = null
      target.dispose()
    }
  }, [gl, scene])

  useFrame(() => {
    const light = keyLight.current
    if (!light || !controls) return
    const distance = camera.position.distanceTo(controls.target)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    light.position
      .copy(camera.position)
      .addScaledVector(up, distance * 0.5)
      .addScaledVector(right, distance * 0.3)
    light.target.position.copy(controls.target)
    light.target.updateMatrixWorld()
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#8a8f96', 0.8]} />
      <directionalLight ref={keyLight} intensity={1.8} />
    </>
  )
}
