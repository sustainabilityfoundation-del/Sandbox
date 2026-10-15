import type { CadEngine, MeshData, RegenerationResult } from '@ews/cad-core'
import { EmptyState, IconButton, Spinner } from '@ews/design-system'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ViewPreset } from '../viewState'

export interface ViewportSelection {
  bodyId: string
  face?: string
}

interface Props {
  engine: CadEngine
  regen: RegenerationResult | undefined
  selected: ViewportSelection[]
  showEdges: boolean
  viewRequest: { kind: ViewPreset; seq: number } | null
  onPick: (pick: { bodyId: string; face: string } | null) => void
  onView: (kind: ViewPreset) => void
  onToggleEdges: () => void
}

interface BodyView {
  bodyId: string
  key: string
  mesh: THREE.Mesh
  edges: THREE.LineSegments
  faceNames: string[]
  ranges: MeshData['faceRanges']
}

const DIRECTIONS: Record<Exclude<ViewPreset, 'fit'>, THREE.Vector3> = {
  iso: new THREE.Vector3(1, -1, 0.8).normalize(),
  front: new THREE.Vector3(0, -1, 0),
  top: new THREE.Vector3(0, 0, 1),
  right: new THREE.Vector3(1, 0, 0),
}

/** Colours come from design tokens on the viewport element (both themes). */
function tokens(el: HTMLElement) {
  const s = getComputedStyle(el)
  const read = (name: string, fallbackVar: string) => (s.getPropertyValue(name).trim() || s.getPropertyValue(fallbackVar).trim() || 'gray')
  return {
    body: read('--ws-diagram-part-1', '--ws-surface-3'),
    selected: read('--ws-accent', '--ws-focus'),
    edge: read('--ws-diagram-stroke', '--ws-text-2'),
  }
}

/**
 * Interactive 3D viewport (brief §8): orbit, pan, zoom and fit with the pointer or the keyboard,
 * face picking and highlighting. Geometry is tessellated in the kernel worker; this component only
 * renders it (WebGL through three.js).
 */
export function Viewport({ engine, regen, selected, showEdges, viewRequest, onPick, onView, onToggleEdges }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    group: THREE.Group
    bodies: Map<string, BodyView>
    materials: { body: THREE.MeshStandardMaterial; selected: THREE.MeshStandardMaterial; edge: THREE.LineBasicMaterial }
    render: () => void
    fitted: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [meshing, setMeshing] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  // ---- set-up and tear-down ------------------------------------------------------------------
  useEffect(() => {
    const el = host.current
    if (!el) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    } catch (e) {
      setError(`The 3D view needs WebGL, which is not available here (${e instanceof Error ? e.message : String(e)}). Modelling, queries and exports still work.`)
      return
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.className = 'cadm-canvas'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    el.prepend(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000)
    camera.up.set(0, 0, 1)
    camera.position.set(200, -200, 160)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = false
    controls.screenSpacePanning = true
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(1, -2, 3)
    camera.add(key)
    scene.add(camera)
    const group = new THREE.Group()
    scene.add(group)
    const c = tokens(el)
    const materials = {
      body: new THREE.MeshStandardMaterial({ color: new THREE.Color(c.body), metalness: 0.1, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      selected: new THREE.MeshStandardMaterial({ color: new THREE.Color(c.selected), metalness: 0.1, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
      edge: new THREE.LineBasicMaterial({ color: new THREE.Color(c.edge) }),
    }
    let frame = 0
    const render = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        renderer.render(scene, camera)
      })
    }
    controls.addEventListener('change', render)
    const resize = () => {
      const w = Math.max(1, el.clientWidth)
      const h = Math.max(1, el.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    // Theme changes: re-read the tokens.
    const mo = new MutationObserver(() => {
      const t = tokens(el)
      materials.body.color.set(t.body)
      materials.selected.color.set(t.selected)
      materials.edge.color.set(t.edge)
      render()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    ctx.current = { renderer, scene, camera, controls, group, bodies: new Map(), materials, render, fitted: false }
    return () => {
      ro.disconnect()
      mo.disconnect()
      cancelAnimationFrame(frame)
      controls.dispose()
      for (const b of ctx.current?.bodies.values() ?? []) {
        b.mesh.geometry.dispose()
        b.edges.geometry.dispose()
      }
      Object.values(materials).forEach((m) => m.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      ctx.current = null
    }
  }, [])

  // ---- bodies: mesh in the kernel worker, render here ------------------------------------------
  useEffect(() => {
    const c = ctx.current
    if (!c) return
    let cancelled = false
    const bodies = regen?.parts.flatMap((p) => p.bodies) ?? []
    const wanted = new Map(bodies.map((b) => [b.bodyId, b]))
    for (const [id, view] of c.bodies) {
      if (!wanted.has(id) || wanted.get(id)!.key !== view.key) {
        c.group.remove(view.mesh, view.edges)
        view.mesh.geometry.dispose()
        view.edges.geometry.dispose()
        c.bodies.delete(id)
      }
    }
    const missing = bodies.filter((b) => !c.bodies.has(b.bodyId))
    if (!missing.length) {
      c.render()
      return
    }
    setMeshing(true)
    Promise.all(
      missing.map(async (b) => {
        const m = await engine.mesh(b.bodyId)
        return { b, m }
      }),
    )
      .then((results) => {
        if (cancelled || !ctx.current) return
        for (const { b, m } of results) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
          geometry.setIndex(new THREE.BufferAttribute(m.indices, 1))
          for (const r of m.faceRanges) geometry.addGroup(r.start, r.count, 0)
          const mesh = new THREE.Mesh(geometry, [c.materials.body, c.materials.selected])
          mesh.userData.bodyId = b.bodyId
          const eg = new THREE.BufferGeometry()
          eg.setAttribute('position', new THREE.BufferAttribute(m.edgePositions, 3))
          const edges = new THREE.LineSegments(eg, c.materials.edge)
          edges.visible = showEdges
          c.group.add(mesh, edges)
          c.bodies.set(b.bodyId, { bodyId: b.bodyId, key: b.key, mesh, edges, faceNames: b.analysis.faces.map((f) => f.name), ranges: m.faceRanges })
        }
        if (!c.fitted) {
          fit(c)
          c.fitted = true
        }
        highlight()
        c.render()
      })
      .catch((e) => !cancelled && setError(`Tessellation failed: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => !cancelled && setMeshing(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regen, engine])

  // ---- selection highlight ---------------------------------------------------------------------
  const highlight = () => {
    const c = ctx.current
    if (!c) return
    for (const view of c.bodies.values()) {
      const geometry = view.mesh.geometry
      geometry.groups.forEach((g, i) => {
        const range = view.ranges[i]
        const name = view.faceNames[range.face]
        const on = selected.some((s) => s.bodyId === view.bodyId && (s.face === undefined || s.face === name))
        g.materialIndex = on ? 1 : 0
      })
    }
    c.render()
  }
  useEffect(highlight)

  useEffect(() => {
    const c = ctx.current
    if (!c) return
    for (const v of c.bodies.values()) v.edges.visible = showEdges
    c.render()
  }, [showEdges])

  // ---- camera ---------------------------------------------------------------------------------
  function fit(c: NonNullable<typeof ctx.current>, direction?: THREE.Vector3) {
    const box = new THREE.Box3().setFromObject(c.group)
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50))
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const dir = direction ?? c.camera.position.clone().sub(c.controls.target).normalize()
    const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(c.camera.fov / 2))) * 1.15
    c.controls.target.copy(sphere.center)
    c.camera.position.copy(sphere.center.clone().add(dir.multiplyScalar(dist)))
    c.camera.near = Math.max(0.01, dist / 1000)
    c.camera.far = dist * 100
    c.camera.updateProjectionMatrix()
    c.controls.update()
    c.render()
  }

  useEffect(() => {
    const c = ctx.current
    if (!c || !viewRequest) return
    fit(c, viewRequest.kind === 'fit' ? undefined : DIRECTIONS[viewRequest.kind].clone())
  }, [viewRequest])

  const orbit = (azimuth: number, elevation: number) => {
    const c = ctx.current
    if (!c) return
    const offset = c.camera.position.clone().sub(c.controls.target)
    const s = new THREE.Spherical().setFromVector3(new THREE.Vector3(offset.x, offset.z, -offset.y))
    s.theta += azimuth
    s.phi = Math.min(Math.PI - 0.05, Math.max(0.05, s.phi - elevation))
    const v = new THREE.Vector3().setFromSpherical(s)
    c.camera.position.copy(c.controls.target.clone().add(new THREE.Vector3(v.x, -v.z, v.y)))
    c.controls.update()
  }
  const zoom = (factor: number) => {
    const c = ctx.current
    if (!c) return
    const offset = c.camera.position.clone().sub(c.controls.target).multiplyScalar(factor)
    c.camera.position.copy(c.controls.target.clone().add(offset))
    c.controls.update()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.PI / 12
    const handled: Record<string, () => void> = {
      ArrowLeft: () => orbit(-step, 0),
      ArrowRight: () => orbit(step, 0),
      ArrowUp: () => orbit(0, step),
      ArrowDown: () => orbit(0, -step),
      '+': () => zoom(0.8),
      '=': () => zoom(0.8),
      '-': () => zoom(1.25),
      f: () => onView('fit'),
      F: () => onView('fit'),
      Escape: () => onPick(null),
    }
    const fn = handled[e.key]
    if (fn) {
      e.preventDefault()
      fn()
    }
  }

  // ---- picking (click without drag) -----------------------------------------------------------
  const down = useRef<{ x: number; y: number } | null>(null)
  const pick = (clientX: number, clientY: number) => {
    const c = ctx.current
    if (!c) return
    const rect = c.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, c.camera)
    const hit = ray.intersectObjects([...c.bodies.values()].map((b) => b.mesh), false)[0]
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null) {
      setPicked(null)
      onPick(null)
      return
    }
    const view = c.bodies.get(hit.object.userData.bodyId as string)!
    const offset = hit.faceIndex * 3
    const range = view.ranges.find((r) => offset >= r.start && offset < r.start + r.count)
    const face = range ? view.faceNames[range.face] : undefined
    if (face) {
      setPicked(face)
      onPick({ bodyId: view.bodyId, face })
    }
  }

  return (
    <div className="cadm-viewport" data-help-id="cad-modeler.viewport">
      <div
        ref={host}
        className="cadm-viewport-host"
        tabIndex={0}
        role="application"
        aria-roledescription="3D viewport"
        aria-label="3D model view. Arrow keys orbit, plus and minus zoom, F fits, Escape clears the selection. Pick faces with the pointer or from the Inspect tab."
        onKeyDown={onKeyDown}
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const d = down.current
          down.current = null
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) pick(e.clientX, e.clientY)
        }}
      />
      {error && (
        <div className="cadm-viewport-message">
          <EmptyState icon="warning" title="3D view unavailable">
            {error}
          </EmptyState>
        </div>
      )}
      <div className="cadm-view-tools" role="toolbar" aria-label="View">
        <IconButton label="Isometric view" icon="cad-representation" size="sm" variant="tonal" onPress={() => onView('iso')} />
        <IconButton label="Front view (look along +Y)" icon="panel-bottom" size="sm" variant="tonal" onPress={() => onView('front')} />
        <IconButton label="Top view (look along −Z)" icon="panel-left" size="sm" variant="tonal" onPress={() => onView('top')} />
        <IconButton label="Right view (look along −X)" icon="panel-right" size="sm" variant="tonal" onPress={() => onView('right')} />
        <IconButton label="Zoom in" icon="zoom-in" size="sm" variant="tonal" onPress={() => zoom(0.8)} />
        <IconButton label="Zoom out" icon="zoom-out" size="sm" variant="tonal" onPress={() => zoom(1.25)} />
        <IconButton label={showEdges ? 'Hide edges' : 'Show edges'} icon={showEdges ? 'visibility' : 'hidden'} size="sm" variant="tonal" onPress={onToggleEdges} />
      </div>
      <div className="cadm-viewport-status" aria-live="polite">
        {meshing && <Spinner size={14} label="Tessellating" />}
        {picked && <span className="cadm-mono">{picked}</span>}
      </div>
    </div>
  )
}
