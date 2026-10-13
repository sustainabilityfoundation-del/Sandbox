import { GizmoHelper, GizmoViewport, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRef } from 'react'
import { NeutralToneMapping } from 'three'
import { usePrefersDark } from '../hooks/usePrefersDark'
import { useViewerStore } from '../state/viewerStore'
import { CameraRig } from './CameraRig'
import { Lighting } from './Lighting'
import { ModelGrid } from './ModelGrid'
import { CLICK_TOLERANCE, ModelView } from './ModelView'

/** The 3D canvas: camera, controls, lighting and the current model. */
export function Viewport() {
  const model = useViewerStore((s) => s.model)
  const showGrid = useViewerStore((s) => s.showGrid)
  const select = useViewerStore((s) => s.select)
  const dark = usePrefersDark()
  const pointerDown = useRef({ x: 0, y: 0 })

  return (
    <div
      className="viewport-canvas"
      onPointerDown={(e) => {
        pointerDown.current = { x: e.clientX, y: e.clientY }
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ fov: 35, near: 0.01, far: 1000, position: [3, 3, 3] }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping
        }}
        onPointerMissed={(e) => {
          const moved = Math.hypot(e.clientX - pointerDown.current.x, e.clientY - pointerDown.current.y)
          if (moved <= CLICK_TOLERANCE) select(null)
        }}
      >
        <Lighting />
        {model && <ModelView key={model.id} model={model} />}
        {model && <CameraRig model={model} />}
        {model && showGrid && <ModelGrid bounds={model.bounds} dark={dark} />}
        <OrbitControls makeDefault enableDamping dampingFactor={0.15} />
        {model && (
          <GizmoHelper alignment="bottom-right" margin={[64, 84]}>
            <GizmoViewport
              axisColors={['#d9534f', '#4caf50', '#3b82f6']}
              labelColor="#ffffff"
              axisHeadScale={0.9}
            />
          </GizmoHelper>
        )}
      </Canvas>
    </div>
  )
}
