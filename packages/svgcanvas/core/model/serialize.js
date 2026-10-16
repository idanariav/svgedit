// @ts-check
/**
 * Document model: persistent tree -> SVG/XML text (see `node.js`, `parse.js`).
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

/** @typedef {import('./node.ts').ModelNode} ModelNode */
/** @typedef {import('./node.ts').ModelElement} ModelElement */
/** @typedef {import('./node.ts').ModelDocument} ModelDocument */
/** @typedef {import('./node.ts').ModelMisc} ModelMisc */
/** @typedef {{format?: 'preserve' | 'indent'}} SerializeOptions */

/** Attribute values keep their tabs and line breaks as character references (a raw one is normalised to a space on parse). */
const attrValue = (/** @type {string} */ v) => toXml(v).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')
const attrs = (/** @type {ModelElement} */ el) => el.attrs.map((a) => ` ${a.name}="${attrValue(a.value)}"`).join('')

/**
 * @param {ModelNode} node
 * @returns {string} a node that is not an element
 */
const leaf = (node) => {
  switch (node.kind) {
    case 'text': return toXml(node.value)
    case 'cdata': return `<![CDATA[${node.value}]]>`
    case 'comment': return `<!--${node.value}-->`
    case 'pi': return node.value ? `<?${node.target} ${node.value}?>` : `<?${node.target}?>`
    default: return ''
  }
}

/**
 * @param {ModelElement} el
 * @returns {string}
 */
const preserve = (el) => {
  if (!el.children.length) return `<${el.name}${attrs(el)}/>`
  return `<${el.name}${attrs(el)}>${el.children.map((c) => (c.kind === 'element' ? preserve(c) : leaf(c))).join('')}</${el.name}>`
}

/**
 * @param {ModelElement} el
 * @param {number} depth
 * @returns {string}
 */
const indented = (el, depth) => {
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

/**
 * @param {ModelMisc} node
 * @returns {string}
 */
const misc = (node) => {
  if (node.kind === 'decl') {
    const enc = node.encoding === undefined ? '' : ` encoding="${node.encoding}"`
    const sa = node.standalone === undefined ? '' : ` standalone="${node.standalone}"`
    return `<?xml version="${node.version}"${enc}${sa}?>`
  }
  if (node.kind === 'doctype') return `<!DOCTYPE${node.value}>`
  return leaf(node)
}

/**
 * @param {ModelDocument} doc
 * @param {SerializeOptions} [options]
 * @returns {string}
 */
export const serializeSvg = (doc, options = {}) => {
  const body = options.format === 'indent' ? indented(doc.root, 0) : preserve(doc.root)
  return [...doc.prolog.map(misc), body, ...doc.epilog.map(misc)].join('\n')
}

/**
 * Serialize one subtree (an element or any other node), without the document wrapper.
 * @param {ModelNode} node
 * @param {SerializeOptions} [options]
 * @returns {string}
 */
export const serializeNode = (node, options = {}) => {
  if (node.kind !== 'element') return leaf(node)
  return options.format === 'indent' ? indented(node, 0) : preserve(node)
}
