// npm run cad:bench — regeneration benchmarks on the in-process OCCT kernel (Node).
// Full build, upstream parameter change (everything rebuilds) and a downstream edit (one sketch).
import { CadEngine, createDocument } from '@ews/cad-core'
import { BENCHMARK_MODELS } from '../src/benchmarks'
import { createNodeKernel } from '../src/node'

const kernel = await createNodeKernel()
const rows: string[] = []
for (const model of BENCHMARK_MODELS) {
  const engine = new CadEngine({ kernel, document: createDocument({ documentId: model.name }) })
  const t0 = performance.now()
  const built = await engine.execute({ commands: model.commands })
  const full = performance.now() - t0
  if (!built.ok) throw new Error(built.error.message)
  const part = engine.document.parts[0]
  const volume = engine.regeneration!.parts[0].bodies[0].analysis.volume
  const t1 = performance.now()
  await engine.execute({ commands: [{ command: 'set_parameter', input: { partId: part.id, name: model.upstreamParameter.name, expression: model.upstreamParameter.value } }] })
  const upstream = performance.now() - t1
  const rebuiltUp = engine.regeneration!.parts[0].rebuilt.length
  const sketches = part.features.filter((f) => f.type === 'sketch')
  const last = sketches.at(-1)!
  const circle = last.type === 'sketch' ? last.entities.find((e) => e.type === 'circle')!.id : ''
  const t2 = performance.now()
  await engine.execute({ commands: [model.downstreamEdit({ lastSketch: last.id, lastCircle: circle })] })
  const downstream = performance.now() - t2
  const rebuiltDown = engine.regeneration!.parts[0].rebuilt.length
  rows.push(`| ${model.name} | ${part.features.length} | ${full.toFixed(0)} | ${upstream.toFixed(0)} (${rebuiltUp} rebuilt) | ${downstream.toFixed(0)} (${rebuiltDown} rebuilt) | ${((Math.abs(volume - model.expectedVolume) / model.expectedVolume) * 100).toExponential(1)} % |`)
  await engine.dispose()
}
console.log('| Model | Features | Full build ms | Upstream change ms | Downstream edit ms | Volume error |')
console.log('| --- | --- | --- | --- | --- | --- |')
console.log(rows.join('\n'))
await kernel.dispose()
