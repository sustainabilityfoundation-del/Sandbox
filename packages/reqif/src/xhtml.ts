import { XMLSerializer } from '@xmldom/xmldom'
import { ELEMENT_NODE, TEXT_NODE, CDATA_NODE, escapeAttr, escapeText, parseXmlSecurely, type Element, type Node } from './xml'
import { XHTML_NAMESPACE, type XhtmlValue } from './model'

/**
 * XHTML sanitising for ReqIF rich text. Only elements of the XHTML modules that ReqIF's driver
 * schema includes (text, hypertext, list, edit, presentation, object, table) are kept, with a
 * small attribute allow-list. Scripts, styles, event handlers, forms, frames and non-http(s)
 * links are removed and reported. Object (attachment) references are collected so callers can
 * resolve them inside the exchange package only.
 */

const ALLOWED = new Set([
  'div', 'p', 'br', 'span', 'abbr', 'acronym', 'address', 'blockquote', 'cite', 'code', 'dfn', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'kbd', 'pre', 'q', 'samp', 'strong', 'var', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'ins', 'del', 'b', 'big', 'hr', 'i', 'small', 'sub', 'sup',
  'tt', 'object', 'param', 'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'col', 'colgroup',
])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'form', 'input', 'button', 'select', 'textarea', 'embed', 'applet', 'link', 'meta', 'head', 'title', 'svg', 'math'])
const ATTRS: Record<string, string[]> = {
  '*': ['title', 'lang', 'dir'],
  a: ['href', 'name'],
  object: ['data', 'type', 'name', 'width', 'height'],
  param: ['name', 'value'],
  td: ['colspan', 'rowspan', 'align', 'valign'],
  th: ['colspan', 'rowspan', 'align', 'valign', 'scope'],
  col: ['span', 'width'],
  colgroup: ['span', 'width'],
  table: ['summary', 'width', 'border'],
  ol: ['start'],
  q: ['cite'],
  blockquote: ['cite'],
}

export interface SanitizeResult {
  /** Markup without namespace prefixes. */
  markup: string
  plain: string
  objects: { data: string; type?: string; name?: string }[]
  removed: string[]
}

const BLOCK = new Set(['div', 'p', 'br', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'dt', 'dd', 'hr', 'table'])

/** Sanitises child nodes of an XHTML container element (e.g. THE-VALUE). */
export function sanitizeXhtmlChildren(container: Element, rewriteObjectData?: (data: string) => string | null): SanitizeResult {
  const removed = new Set<string>()
  const objects: SanitizeResult['objects'] = []
  let plain = ''
  const walk = (node: Node): string => {
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) {
      const t = node.nodeValue ?? ''
      plain += t
      return escapeText(t)
    }
    if (node.nodeType !== ELEMENT_NODE) return ''
    const el = node as Element
    const name = (el.localName ?? '').toLowerCase()
    const ns = el.namespaceURI
    if (DROP_WITH_CONTENT.has(name)) {
      removed.add(`<${name}> element and its content`)
      return ''
    }
    let inner = ''
    for (let c = el.firstChild; c; c = c.nextSibling) inner += walk(c)
    if (BLOCK.has(name)) plain += '\n'
    if (!ALLOWED.has(name) || (ns && ns !== XHTML_NAMESPACE)) {
      removed.add(ns && ns !== XHTML_NAMESPACE ? `element <${name}> in namespace ${ns}` : `<${name}> element (content kept)`)
      return inner
    }
    const allowed = [...(ATTRS['*'] ?? []), ...(ATTRS[name] ?? [])]
    const attrs: string[] = []
    for (let i = 0; i < el.attributes.length; i++) {
      const a = el.attributes.item(i)!
      const an = (a.localName ?? a.name).toLowerCase()
      if (a.name === 'xmlns' || a.name.startsWith('xmlns:')) continue
      if (!allowed.includes(an)) {
        removed.add(an.startsWith('on') ? `event handler attribute ${an}` : `attribute ${an} on <${name}>`)
        continue
      }
      let v = a.value
      if (name === 'a' && an === 'href' && !/^(https?:\/\/|mailto:|#)/i.test(v.trim())) {
        removed.add(`link target “${v.slice(0, 60)}” (only http, https, mailto and in-page links are kept)`)
        continue
      }
      if (name === 'object' && an === 'data') {
        objects.push({ data: v, type: el.getAttribute('type') ?? undefined, name: el.getAttribute('name') ?? undefined })
        if (rewriteObjectData) {
          const r = rewriteObjectData(v)
          if (r === null) {
            removed.add(`object reference “${v.slice(0, 80)}” (not resolvable inside the package)`)
            continue
          }
          v = r
        }
      }
      attrs.push(` ${an}="${escapeAttr(v)}"`)
    }
    return name === 'br' || name === 'hr' || name === 'col' || name === 'param' ? `<${name}${attrs.join('')}/>` : `<${name}${attrs.join('')}>${inner}</${name}>`
  }
  let markup = ''
  for (let c = container.firstChild; c; c = c.nextSibling) markup += walk(c)
  return { markup: markup.trim(), plain: plain.replace(/[ \t]*\n[ \t\n]*/g, '\n').replace(/[ \t]+/g, ' ').trim(), objects, removed: [...removed] }
}

export function xhtmlValueFrom(theValue: Element, originalValue: Element | undefined, isSimplified: boolean | undefined, rewriteObjectData?: (data: string) => string | null): XhtmlValue {
  const s = sanitizeXhtmlChildren(theValue, rewriteObjectData)
  const serializer = new XMLSerializer()
  let raw = ''
  for (let c = theValue.firstChild; c; c = c.nextSibling) raw += serializer.serializeToString(c)
  let originalRaw: string | undefined
  if (originalValue) {
    originalRaw = ''
    for (let c = originalValue.firstChild; c; c = c.nextSibling) originalRaw += serializer.serializeToString(c)
  }
  return { sanitized: s.markup, plain: s.plain, raw: raw.trim(), isSimplified, originalRaw, objects: s.objects, removed: s.removed }
}

/** Sanitises an XHTML fragment given as a string (e.g. stored markup before export). */
export function sanitizeXhtmlString(markup: string): SanitizeResult {
  const doc = parseXmlSecurely(`<div xmlns="${XHTML_NAMESPACE}">${markup}</div>`)
  return sanitizeXhtmlChildren(doc.documentElement!)
}

/** Wraps sanitised markup (or plain text) as ReqIF XHTML content with the xhtml: prefix. */
export function toReqifXhtml(markupOrNull: string | null, plainFallback: string): string {
  if (!markupOrNull) {
    const paragraphs = plainFallback.split(/\n{2,}/).map((p) => escapeText(p).replace(/\n/g, '<xhtml:br/>'))
    return `<xhtml:div>${paragraphs.map((p) => `<xhtml:p>${p}</xhtml:p>`).join('')}</xhtml:div>`
  }
  // Re-sanitise and add the prefix to every element name.
  const s = sanitizeXhtmlString(markupOrNull)
  const prefixed = s.markup.replace(/<(\/?)([a-z][a-z0-9]*)/g, '<$1xhtml:$2')
  return /^<xhtml:(div|p)\b/.test(prefixed) && countTopLevel(s.markup) === 1 ? prefixed : `<xhtml:div>${prefixed}</xhtml:div>`
}

function countTopLevel(markup: string): number {
  const doc = parseXmlSecurely(`<div xmlns="${XHTML_NAMESPACE}">${markup}</div>`)
  let n = 0
  for (let c = doc.documentElement!.firstChild; c; c = c.nextSibling) if (c.nodeType === ELEMENT_NODE || (c.nodeValue ?? '').trim()) n++
  return n
}
