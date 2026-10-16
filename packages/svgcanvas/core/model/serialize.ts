/**
 * Document model: persistent tree -> SVG/XML text (see `node.ts`, `parse.js`).
 *
 * One canonical spelling, the editor's own (`toXml` escaping, `<x/>` for an empty element, attributes in the order the
 * tree holds them), so a file the editor saved parses and serializes back to the same bytes.
 * - `format: 'preserve'` (default) writes the tree as it is, whitespace text included: nothing is added or lost.
 * - `format: 'indent'` is the editor's save layout (`svgToString`): one space per level, one child per line,
 *   whitespace-only text dropped and the rest trimmed. It changes the whitespace text of mixed content, so it is for
 *   output files, not for round-tripping foreign documents.
 * @module model/serialize
 * @license MIT
 */
import { toXml } from '../encoding-utils.ts'

import type { ModelNode, ModelElement, ModelDocument, ModelMisc } from './node.ts'

export interface SerializeOptions { format?: 'preserve' | 'indent' }

/** Attribute values keep their tabs and line breaks as character references (a raw one is normalised to a space on parse). */
const attrValue = (v: string) => toXml(v).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')
const attrs = (el: ModelElement) => el.attrs.map((a) => ` ${a.name}="${attrValue(a.value)}"`).join('')

/** A node that is not an element. */
const leaf = (node: ModelNode | ModelMisc): string => {
  switch (node.kind) {
    case 'text': return toXml(node.value)
    case 'cdata': return `<![CDATA[${node.value}]]>`
    case 'comment': return `<!--${node.value}-->`
    case 'pi': return node.value ? `<?${node.target} ${node.value}?>` : `<?${node.target}?>`
    default: return ''
  }
}

const preserve = (el: ModelElement): string => {
  if (!el.children.length) return `<${el.name}${attrs(el)}/>`
  return `<${el.name}${attrs(el)}>${el.children.map((c) => (c.kind === 'element' ? preserve(c) : leaf(c))).join('')}</${el.name}>`
}

const indented = (el: ModelElement, depth: number): string => {
  const pad = ' '.repeat(depth)
  if (!el.children.length) return `${pad}<${el.name}${attrs(el)}/>`
  let out = `${pad}<${el.name}${attrs(el)}>`
  let inline = false
  for (const child of el.children) {
    if (child.kind === 'element') out += `\n${indented(child, depth + 1)}`
    else if (child.kind === 'text') {
      const t = child.value.trim()
      if (t) { out += toXml(t); inline = true }
    } else out += `\n${' '.repeat(depth + 1)}${leaf(child)}`
  }
  return out + (inline ? '' : `\n${pad}`) + `</${el.name}>`
}

const misc = (node: ModelMisc): string => {
  if (node.kind === 'decl') {
    const enc = node.encoding === undefined ? '' : ` encoding="${node.encoding}"`
    const sa = node.standalone === undefined ? '' : ` standalone="${node.standalone}"`
    return `<?xml version="${node.version}"${enc}${sa}?>`
  }
  if (node.kind === 'doctype') return `<!DOCTYPE${node.value}>`
  return leaf(node)
}

export const serializeSvg = (doc: ModelDocument, options: SerializeOptions = {}): string => {
  const body = options.format === 'indent' ? indented(doc.root, 0) : preserve(doc.root)
  return [...doc.prolog.map(misc), body, ...doc.epilog.map(misc)].join('\n')
}

/** Serialize one subtree (an element or any other node), without the document wrapper. */
export const serializeNode = (node: ModelNode, options: SerializeOptions = {}): string => {
  if (node.kind !== 'element') return leaf(node)
  return options.format === 'indent' ? indented(node, 0) : preserve(node)
}
