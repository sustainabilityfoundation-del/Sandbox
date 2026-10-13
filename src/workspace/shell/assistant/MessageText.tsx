import { Fragment, type ReactNode } from 'react'
import type { OutputRecord } from '../../domain/types'
import { useWorkspaceStore } from '../../sdk/store'
import { Icons } from '../../sdk/icons'
import { ObjectRef } from '../../sdk/ui'

/** Selects an output's component and reveals the output in the inspector. */
export function showOutput(output: OutputRecord) {
  const ws = useWorkspaceStore.getState()
  const target = output.objectIds.find((id) => ws.model?.get(id)?.type !== 'procedure') ?? output.objectIds[0]
  ws.select(target ? [target] : [])
  ws.setLayout({ inspectorOpen: true })
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector(`.ws-inspector [data-output-id="${output.id}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      el?.classList.add('is-flash')
      setTimeout(() => el?.classList.remove('is-flash'), 1400)
    }),
  )
}

/** A reference to an object, scenario or saved output, rendered as a clickable chip. */
export function Reference({ id }: { id: string }) {
  const model = useWorkspaceStore((s) => s.model)!
  const output = useWorkspaceStore((s) => s.outputs.find((o) => o.id === id))
  const setScenario = useWorkspaceStore((s) => s.setScenario)
  const activeScenario = useWorkspaceStore((s) => s.context.scenarioId)

  const object = model.get(id)
  if (object) return <ObjectRef object={object} />
  const scenario = model.scenario(id)
  if (scenario) {
    return (
      <button
        type="button"
        className={`ws-objref${activeScenario === id ? ' is-selected' : ''}`}
        onClick={() => setScenario(id)}
        title={`Make ${scenario.name} the active scenario`}
      >
        <Icons.scenario width={13} height={13} />
        <span className="ws-mono">{id}</span>
        <span>{scenario.name}</span>
      </button>
    )
  }
  if (output) {
    return (
      <button type="button" className="ws-objref" onClick={() => showOutput(output)} title={`Show ${id} in the inspector`}>
        <Icons.save width={13} height={13} />
        <span className="ws-mono">{id}</span>
      </button>
    )
  }
  return <span className="ws-mono">{id}</span>
}

/** Renders [[ID]] references and **bold** inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\[\[[A-Za-z0-9-]+\]\]|\*\*[^*]+\*\*)/g).map((part, i) => {
    const ref = /^\[\[([A-Za-z0-9-]+)\]\]$/.exec(part)
    if (ref) return <Reference key={i} id={ref[1]} />
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    if (bold) return <strong key={i}>{bold[1]}</strong>
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Minimal formatting for assistant text: paragraphs, "- " bullets, bold and references. */
export function MessageText({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2))
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p-${blocks.length}`}>{inline(line)}</p>)
  }
  flush()
  return <div className="as-text">{blocks}</div>
}
