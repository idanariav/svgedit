// @ts-check
/**
 * Document model: SVG/XML text -> persistent tree (see `node.js`).
 *
 * Uses `saxes` (strict XML, pure JS, no DOM) with namespace processing off, so a qualified name is kept as written
 * and an undeclared prefix (older drawings used `se:` without declaring it) parses instead of failing.
 * Lossless at the infoset level: element and attribute order, text, CDATA, comments, PIs, the declaration and the
 * doctype are all kept. Entity spelling (`&#x27;` vs `'`), quote style and the spacing inside a tag are not, since
 * the parser reports decoded values; `serialize.js` writes one canonical spelling.
 * @module model/parse
 * @license MIT
 */
import { SaxesParser } from 'saxes'
import { cdata, comment, decl, doctype, element, pi, text } from './node.ts'

/** @typedef {import('./node.ts').ModelNode} ModelNode */
/** @typedef {import('./node.ts').ModelElement} ModelElement */
/** @typedef {import('./node.ts').ModelMisc} ModelMisc */
/** @typedef {import('./node.ts').ModelDocument} ModelDocument */

/** Thrown for text that is not well-formed XML; `line` / `column` are 1-based. */
export class SvgParseError extends Error {
  /**
   * @param {string} message
   * @param {number} line
   * @param {number} column
   */
  constructor (message, line, column) {
    super(message)
    this.name = 'SvgParseError'
    this.line = line
    this.column = column
  }
}

/**
 * @typedef {object} Open
 * @property {string} name
 * @property {{name: string, value: string}[]} attrs
 * @property {ModelNode[]} children
 */

/**
 * @param {string} source SVG / XML text
 * @returns {ModelDocument}
 * @throws {SvgParseError} when `source` is not well-formed, or has no root element
 */
export const parseSvg = (source) => {
  const parser = new SaxesParser({ xmlns: false, position: true, fileName: 'drawing.svg' })
  /** @type {ModelMisc[]} */
  const prolog = []
  /** @type {(import('./node.ts').ModelComment | import('./node.ts').ModelPI)[]} */
  const epilog = []
  /** @type {Open[]} */
  const stack = []
  /** @type {ModelElement | null} */
  let root = null
  /** @type {SvgParseError | null} */
  let failure = null

  /** @param {ModelNode} node */
  const addChild = (node) => {
    const top = stack[stack.length - 1]
    // saxes may split one run of character data into several events
    const last = top.children[top.children.length - 1]
    if (node.kind === 'text' && last?.kind === 'text') top.children[top.children.length - 1] = text(last.value + node.value)
    else top.children.push(node)
  }
  /** @param {import('./node.ts').ModelComment | import('./node.ts').ModelPI} node */
  const addMisc = (node) => {
    if (stack.length) addChild(node)
    else (root ? epilog : prolog).push(node)
  }

  parser.on('error', (err) => {
    failure ??= new SvgParseError(err.message.replace(/^drawing\.svg:\d+:\d+:\s*/, ''), parser.line, parser.column)
  })
  parser.on('xmldecl', (d) => {
    prolog.push(decl(d.version ?? '1.0', d.encoding, d.standalone))
  })
  parser.on('doctype', (d) => { prolog.push(doctype(d)) })
  parser.on('processinginstruction', (p) => { addMisc(pi(p.target, p.body)) })
  parser.on('comment', (c) => { addMisc(comment(c)) })
  parser.on('opentag', (tag) => {
    const attrs = Object.entries(/** @type {Record<string, string>} */ (tag.attributes)).map(([name, value]) => ({ name, value }))
    stack.push({ name: tag.name, attrs, children: [] })
  })
  parser.on('text', (t) => {
    if (stack.length) addChild(text(t))
  })
  parser.on('cdata', (t) => { if (stack.length) addChild(cdata(t)) })
  parser.on('closetag', () => {
    const open = stack.pop()
    if (!open) return
    const el = element(open.name, open.attrs, open.children)
    if (stack.length) addChild(el)
    else root = el
  })

  parser.write(source).close()
  if (failure) throw failure
  if (!root) throw new SvgParseError('no root element', parser.line, parser.column)
  return { prolog, root, epilog }
}
