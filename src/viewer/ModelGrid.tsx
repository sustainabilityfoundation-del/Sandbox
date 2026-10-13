import { Grid } from '@react-three/drei'
import { useMemo } from 'react'
import { Vector3, type Box3 } from 'three'

/** Rounds to 1, 2 or 5 × 10ⁿ so grid spacing reads as a sensible unit. */
function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  const fraction = value / base
  return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * base
}

/** A floor grid just under the model, scaled to its size. */
export function ModelGrid({ bounds, dark }: { bounds: Box3; dark: boolean }) {
  const layout = useMemo(() => {
    const size = bounds.getSize(new Vector3())
    const center = bounds.getCenter(new Vector3())
    const extent = Math.max(size.x, size.y, size.z, 1e-6)
    const cell = niceStep(extent / 10)
    return {
      cell,
      position: [center.x, bounds.min.y - extent * 0.002, center.z] as const,
      fade: extent * 6,
    }
  }, [bounds])

  return (
    <Grid
      position={layout.position}
      cellSize={layout.cell}
      sectionSize={layout.cell * 10}
      cellThickness={0.6}
      sectionThickness={1}
      cellColor={dark ? '#3a4048' : '#c5cad1'}
      sectionColor={dark ? '#535b66' : '#9aa2ad'}
      fadeDistance={layout.fade}
      fadeStrength={1.5}
      infiniteGrid
      followCamera={false}
      raycast={() => null}
    />
  )
}
