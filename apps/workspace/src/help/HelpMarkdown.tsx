import { Fragment, type ReactNode } from 'react'

/**
 * Renders help Markdown as React elements (never as HTML): headings, paragraphs, bullet and numbered
 * lists, tables, inline code, bold, italics and links. `help:<id>` links navigate inside the Help
 * Centre; same-origin and https links open in a new tab. Anything else stays plain text.
 */
export function HelpMarkdown({ source, onNavigate }: { source: string; onNavigate: (helpId: string) => void }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  const inline = (text: string) => <Inline text={text} onNavigate={onNavigate} />
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4)
      const Tag = (`h${level}`) as 'h2' | 'h3' | 'h4'
      blocks.push(<Tag key={i} className="ws-help-h">{inline(heading[2])}</Tag>)
      i++
      continue
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      blocks.push(
        <div key={i} className="ws-help-table-wrap">
          <table className="ws-help-table">
            <thead>
              <tr>{head.map((c, k) => <th key={k} scope="col">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }
    const listItem = /^(\s*)([-*]|\d+\.)\s+(.*)$/
    if (listItem.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && (listItem.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = listItem.exec(lines[i])
        if (m) items.push(m[3])
        else items[items.length - 1] += ` ${lines[i].trim()}`
        i++
      }
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={i} className="ws-help-list">
          {items.map((t, k) => <li key={k}>{inline(t)}</li>)}
        </List>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*\||\s*([-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim())
    blocks.push(<p key={i} className="ws-help-p">{inline(para.join(' '))}</p>)
  }
  return <div className="ws-help-md">{blocks}</div>
}

function Inline({ text, onNavigate }: { text: string; onNavigate: (helpId: string) => void }) {
  const parts: ReactNode[] = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    const key = m.index
    if (token.startsWith('`')) parts.push(<code key={key} className="ws-help-code">{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)!
      if (href.startsWith('help:')) {
        parts.push(
          <a key={key} href={`#help:${href.slice(5)}`} className="ws-help-link" onClick={(e) => (e.preventDefault(), onNavigate(href.slice(5)))}>
            {label}
          </a>,
        )
      } else if (href.startsWith('/') || href.startsWith('https://')) {
        parts.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" className="ws-help-link">{label}</a>)
      } else parts.push(label)
    }
    last = m.index! + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <Fragment>{parts}</Fragment>
}
