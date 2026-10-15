/**
 * Validation prototype R1, mechanical actuator: prints the scenario walkthrough.
 * Run from the repository root: npx tsx packages/design-reasoning-core/scripts/demo.ts
 */
import { sampleModel } from '@ews/platform-sdk/testing'
import { runActuatorScenario } from '../src/prototype/actuatorScenario'

const t = await runActuatorScenario(sampleModel())
console.log('Design reasoning validation prototype (R1): mechanical actuator ACT-100')
console.log(`Knowledge source: ${t.knowledge.mode === 'test-adapter' ? 'TEST ADAPTER of the proposed Conceptualize contract (in memory)' : 'Conceptualize API'}; twin: client-attested snapshot of the sample twin; requirements: test fixture of REQ-001.\n`)
for (const s of t.steps) {
  console.log(`${s.n}. ${s.title}`)
  for (const l of s.lines) console.log(`   ${l}`)
}
const run = t.engine.store.runs.get(t.ids.run)!
console.log(`\nRun ${run.id.slice(0, 8)}: ${run.status}; ${run.used.toolCalls} tool calls, ${t.engine.store.manifests.length} context manifests, ${run.used.drafts} drafts (${t.drafts.filter((d) => d.status === 'applied').length} applied by a person).`)
