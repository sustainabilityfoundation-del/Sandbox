import { DOMParser, type Document, type Element, type Node } from '@xmldom/xmldom'

/**
 * Secure XML parsing for exchange files.
 *
 * - Any DOCTYPE (and therefore any entity declaration, internal or external) is refused before
 *   parsing: ReqIF does not use DTDs, and refusing them rules out XXE and entity expansion
 *   ("billion laughs"). Processing instructions other than the XML declaration are ignored.
 * - The parser never fetches anything (no external resolution exists in @xmldom/xmldom).
 * - Input size is limited.
 */
export const MAX_XML_BYTES = 100 * 1024 * 1024

export class ReqIFParseError extends Error {
  constructor(message: string, readonly code: 'doctype' | 'too-large' | 'malformed' | 'not-reqif') {
    super(message)
    this.name = 'ReqIFParseError'
  }
}

export function decodeXml(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_XML_BYTES) throw new ReqIFParseError(`The file is larger than ${MAX_XML_BYTES / 1024 / 1024} MB.`, 'too-large')
  // UTF-16 with BOM is allowed by XML; ReqIF files are in practice UTF-8.
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '')
}

export function parseXmlSecurely(text: string): Document {
  if (text.length > MAX_XML_BYTES) throw new ReqIFParseError('The document is too large.', 'too-large')
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new ReqIFParseError('The file contains a DOCTYPE or entity declaration. These are refused for security (no DTDs or entities are processed).', 'doctype')
  }
  const errors: string[] = []
  let doc: Document | undefined
  try {
    doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') errors.push(msg)
    },
  }).parseFromString(text, 'text/xml')
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  if (errors.length || !doc?.documentElement) throw new ReqIFParseError(`The XML is not well-formed: ${errors[0] ?? 'no root element'}`, 'malformed')
  return doc!
}

export const ELEMENT_NODE = 1
export const TEXT_NODE = 3
export const CDATA_NODE = 4

export function children(el: Element | null | undefined, localName?: string): Element[] {
  if (!el) return []
  const out: Element[] = []
  for (let n: Node | null = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === ELEMENT_NODE && (!localName || (n as Element).localName === localName)) out.push(n as Element)
  }
  return out
}

export const child = (el: Element | null | undefined, localName: string): Element | undefined => children(el, localName)[0]

/** Follows a path of child element names. */
export function path(el: Element | null | undefined, ...names: string[]): Element | undefined {
  let cur: Element | undefined = el ?? undefined
  for (const n of names) cur = child(cur, n)
  return cur
}

export function text(el: Element | null | undefined): string {
  return el?.textContent ?? ''
}

export function attr(el: Element, name: string): string | undefined {
  return el.hasAttribute(name) ? el.getAttribute(name)! : undefined
}

export function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;')
}

/** Characters not allowed in XML 1.0 are dropped on export. */
export function xmlSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
}

export type { Document, Element, Node }
