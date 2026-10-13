// Generates two synthetic demo models. Neither is a SolidWorks export, but both
// mimic the structure of one (nested sub-assemblies, instance names, names with
// spaces, PBR materials).
//   public/models/sample.glb    bracket assembly for the standalone viewer
//   public/models/actuator.glb  ACT-100 actuator for the engineering workspace
//
// Usage: npm run generate:sample
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  TorusGeometry,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

// GLTFExporter's binary path relies on the browser FileReader.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`
      this.onloadend?.()
    })
  }
}

const steel = new MeshStandardMaterial({ name: 'Plain Carbon Steel', color: 0x8e949b, metalness: 0.9, roughness: 0.35 })
const aluminium = new MeshStandardMaterial({ name: 'Aluminium 6061', color: 0xc9cdd2, metalness: 0.8, roughness: 0.3 })
const anodised = new MeshStandardMaterial({ name: 'Blue Anodised', color: 0x2f5fa8, metalness: 0.6, roughness: 0.4 })
const rubber = new MeshStandardMaterial({ name: 'Black Rubber', color: 0x1d1f22, metalness: 0, roughness: 0.9 })

const mm = (v) => v / 1000 // SolidWorks GLB export writes metres

function mesh(name, geometry, material, [x, y, z] = [0, 0, 0]) {
  const m = new Mesh(geometry, material)
  m.name = name
  m.position.set(x, y, z)
  return m
}

function group(name, children, [x, y, z] = [0, 0, 0]) {
  const g = new Group()
  g.name = name
  g.position.set(x, y, z)
  g.add(...children)
  return g
}

function bolt(index, position) {
  const head = mesh('Hex Head', new CylinderGeometry(mm(6.5), mm(6.5), mm(5), 6), steel, [0, mm(2.5), 0])
  const shank = mesh('Shank', new CylinderGeometry(mm(4), mm(4), mm(30), 24), steel, [0, mm(-15), 0])
  return group(`M8 Hex Bolt-${index}`, [head, shank], position)
}

const basePlate = mesh('Base Plate-1', new BoxGeometry(mm(200), mm(12), mm(120)), aluminium, [0, mm(6), 0])

const upright = mesh('Upright-1', new BoxGeometry(mm(12), mm(140), mm(120)), aluminium, [mm(-60), mm(82), 0])

// One body with two appearances, exported as a single mesh with two primitives:
// a diagonal brace between upright and base, and a welded foot pad.
const gussetGeometry = mergeGeometries(
  [
    new BoxGeometry(mm(60), mm(8), mm(10)).rotateZ(-Math.PI / 4),
    new BoxGeometry(mm(18), mm(4), mm(14)).translate(mm(19), mm(-19), 0),
  ],
  true,
)
const gusset = mesh('Gusset-1', gussetGeometry, [anodised, steel], [mm(-33), mm(33), mm(-50)])

const shaft = mesh('Shaft Ø20-1', new CylinderGeometry(mm(10), mm(10), mm(180), 48).rotateX(Math.PI / 2), steel, [
  mm(-30),
  mm(120),
  mm(10),
])
const bearing = group('Bearing Housing-1', [
  mesh('Housing', new CylinderGeometry(mm(22), mm(22), mm(24), 48).rotateZ(Math.PI / 2), anodised),
  mesh('Seal', new TorusGeometry(mm(14), mm(2.5), 16, 48).rotateY(Math.PI / 2), rubber, [mm(12.5), 0, 0]),
], [mm(-40), mm(120), mm(10)])

const fasteners = group('Fasteners', [
  bolt(1, [mm(70), mm(17), mm(40)]),
  bolt(2, [mm(70), mm(17), mm(-40)]),
  bolt(3, [mm(20), mm(17), mm(40)]),
  bolt(4, [mm(20), mm(17), mm(-40)]),
])

const shaftAssembly = group('Shaft Sub-Assembly-1', [shaft, bearing])
const root = group('Bracket Assembly', [basePlate, upright, gusset, shaftAssembly, fasteners])

const scene = new Scene()
scene.name = 'Bracket Assembly'
scene.add(root)

async function writeGlb(scene, fileName) {
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true })
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/models', fileName)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, Buffer.from(glb))
  console.log(`Wrote ${out} (${glb.byteLength} bytes)`)
}

await writeGlb(scene, 'sample.glb')

// ---------------------------------------------------------------------------
// actuator.glb: the ACT-100 linear actuator used by the engineering workspace.
// Node names start with the digital-twin object IDs ("ROD-120 Rod"), which is
// how the workspace's 3D Model Viewer links nodes to shared model objects.
// Stroke axis is +X; dimensions follow the sample digital twin.
// ---------------------------------------------------------------------------
const housingPaint = new MeshStandardMaterial({ name: 'Housing Grey', color: 0xb8c0c9, metalness: 0.5, roughness: 0.45 })
const chrome = new MeshStandardMaterial({ name: 'Hard Chrome', color: 0xd9dde2, metalness: 1, roughness: 0.15 })
const motorBlack = new MeshStandardMaterial({ name: 'Motor Black', color: 0x2b3038, metalness: 0.3, roughness: 0.6 })
const xAxis = (geometry) => geometry.rotateZ(-Math.PI / 2)

const housing = group('HSG-110 Housing', [
  mesh('Tube', xAxis(new CylinderGeometry(mm(30), mm(30), mm(420), 48)), housingPaint, [mm(210), 0, 0]),
  mesh('Front Cap', xAxis(new CylinderGeometry(mm(33), mm(33), mm(20), 48)), housingPaint, [mm(430), 0, 0]),
  mesh('Gearbox Cover', new BoxGeometry(mm(45), mm(150), mm(70)), housingPaint, [mm(-22), mm(45), 0]),
  mesh('Rear Clevis', new BoxGeometry(mm(40), mm(36), mm(30)), steel, [mm(-60), 0, 0]),
])

const rod = group('ROD-120 Rod', [
  mesh('Rod Body', xAxis(new CylinderGeometry(mm(12.5), mm(12.5), mm(300), 32)), chrome, [mm(590), 0, 0]),
  mesh('Rod End Eye', new TorusGeometry(mm(15), mm(6), 16, 40), steel, [mm(760), 0, 0]),
])

const motor = group('MTR-130 Motor', [
  mesh('Motor Body', xAxis(new CylinderGeometry(mm(32), mm(32), mm(200), 40)), motorBlack, [mm(100), mm(85), 0]),
  mesh('Connector', new BoxGeometry(mm(30), mm(16), mm(24)), motorBlack, [mm(140), mm(125), 0]),
])

const actuator = new Scene()
actuator.name = 'ACT-100 Actuator assembly'
actuator.add(group('ACT-100 Actuator assembly', [housing, rod, motor]))
await writeGlb(actuator, 'actuator.glb')
